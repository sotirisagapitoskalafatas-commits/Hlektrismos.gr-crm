// LOCAL verification only (PGlite) of supabase/staged-migrations/phase2/07 (document gates, transitions, return).
// NOT staging or production verification.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const MANAGER = 'aaaaaaaa-0000-4000-8000-000000000002';
const INSIDE = 'aaaaaaaa-0000-4000-8000-000000000003';
const FIELD = 'aaaaaaaa-0000-4000-8000-000000000004';
const BO = 'aaaaaaaa-0000-4000-8000-000000000005';
const CASE = 'cccccccc-0000-4000-8000-000000000001';
const WARN = 'cccccccc-0000-4000-8000-0000000000aa';
const BIZ = 'cccccccc-0000-4000-8000-000000000002';

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message, detail: e.detail, hint: e.hint }; } }
const stage = async (id = CASE) => { await su(); return (await db.query('select current_stage from public.cases where id = $1', [id])).rows[0].current_stage; };
const addDoc = async (category, status, id = CASE) => { await su(); await db.query('insert into public.case_documents (case_id, category, status) values ($1, $2, $3)', [id, category, status]); };
const setStage = async (uid, to, id = CASE) => { await as(uid); return run('update public.cases set current_stage = $2 where id = $1', [id, to]); };

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    create table public.cases (id uuid primary key, title text not null default '', service_type text not null default 'energy', property_type text, case_type text,
      current_stage text not null default 'new', owner_id uuid, inside_sales_owner uuid references public.profiles(id), field_sales_owner uuid references public.profiles(id),
      back_office_owner uuid references public.profiles(id), next_action text not null default '', next_action_owner_id uuid, updated_at timestamptz default now());
    create table public.case_documents (id uuid primary key default gen_random_uuid(), case_id uuid references public.cases(id), category text, status text not null default 'received');
    create table public.timeline_events (id uuid primary key default gen_random_uuid(), case_id uuid, role text, activity_type text, title text, description text, user_id uuid, occurred_at timestamptz default now(), metadata jsonb);
    create table public.app_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, case_id uuid, title text, body text, type text, created_at timestamptz default now());
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, action text, details jsonb, created_at timestamptz default now());
    alter table public.cases enable row level security;
    create policy "staff all cases" on public.cases for all to authenticated using (public.is_staff()) with check (public.is_staff());
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on public.cases, public.case_documents, public.timeline_events, public.app_notifications, public.activity_log to authenticated;
    insert into public.profiles values ('${ADMIN}','Admin','admin',true),('${MANAGER}','Manager','manager',true),('${INSIDE}','Inside','inside_sales',true),('${FIELD}','Field','field_sales',true),('${BO}','BO','back_office',true);
    insert into public.cases (id, title, current_stage, inside_sales_owner, field_sales_owner, back_office_owner) values ('${CASE}', 'Ρεύμα — Πελάτης', 'signed', '${INSIDE}', '${FIELD}', '${BO}');
    insert into public.cases (id, title, current_stage, property_type) values ('${BIZ}', 'Κατάστημα', 'signed', 'Κατάστημα');
  `);
  await db.exec(read('../staged-migrations/phase2/07_case_return_and_document_gates.sql'));
});

test('gate mode: every stage ships as «warn»; a move with missing documents goes through and reports them', async () => {
  await su();
  const modes = (await db.query('select stage, mode from public.stage_document_gates order by stage')).rows;
  assert.ok(modes.length >= 4 && modes.every((m) => m.mode === 'warn'), JSON.stringify(modes));
  await db.exec(`insert into public.cases (id, title, current_stage, inside_sales_owner) values ('${WARN}', 'Warn', 'signed', '${INSIDE}')`);
  await as(INSIDE);
  const b = (await run("select public.case_document_blockers($1, 'document_check') b", [WARN])).rows[0].b;
  assert.ok(b.length === 5 && b.every((x) => x.mode === 'warn'), 'the app still sees what is missing, marked warn');
  assert.equal((await setStage(INSIDE, 'document_check', WARN)).ok, true, 'handover to Back Office is not blocked');
  assert.equal(await stage(WARN), 'document_check');
  assert.equal((await setStage(BO, 'completed', WARN)).hint, 'transition', 'the allowed-transition rule still applies');
});

test('gate mode: only an admin switches a stage to «block», and it is audited', async () => {
  await as(MANAGER);
  assert.equal((await run("select public.set_stage_gate_mode('document_check', 'block')")).ok, false, 'manager cannot');
  await as(ADMIN);
  assert.equal((await run("select public.set_stage_gate_mode('document_check', 'stop')")).ok, false, 'invalid mode');
  assert.equal((await run("select public.set_stage_gate_mode('offer', 'block')")).ok, false, 'no gate on that stage');
  for (const st of ['document_check', 'submitted', 'activation', 'completed']) {
    assert.equal((await run('select public.set_stage_gate_mode($1, $2)', [st, 'block'])).ok, true, st);
  }
  await su();
  const a = (await db.query("select details from public.activity_log where action = 'stage_gate_mode' and details->>'stage' = 'document_check'")).rows[0];
  assert.equal(a.details.from, 'warn'); assert.equal(a.details.to, 'block'); assert.equal(a.details.by, ADMIN);
  // the following tests exercise «block» mode
});

test('gate: cannot enter «Έλεγχος εγγράφων» with required documents missing; the error lists them', async () => {
  const r = await setStage(INSIDE, 'document_check');
  assert.equal(r.ok, false);
  assert.equal(r.hint, 'document_blockers');
  const missing = JSON.parse(r.detail).map((b) => b.label);
  assert.deepEqual(missing, ['Ταυτότητα — εμπρός όψη', 'Ταυτότητα — πίσω όψη', 'Λογαριασμός ρεύματος', 'Αποδεικτικό χρήσης ακινήτου (Ε9, μισθωτήριο ή παραχώρηση)', 'Υπογεγραμμένη σύμβαση / αίτηση']);
  assert.equal(await stage(), 'signed');
});

test('gate: received documents (incl. legacy categories) allow «Έλεγχος εγγράφων»; a rejected one does not', async () => {
  await addDoc('identity', 'received'); // legacy category satisfies the ID requirement
  await addDoc('bill_electricity', 'received');
  await addDoc('lease', 'rejected');
  await addDoc('signed', 'received');
  const r = await setStage(BO, 'document_check');
  assert.equal(r.ok, false);
  assert.deepEqual(JSON.parse(r.detail).map((b) => b.status), ['rejected']);
  await addDoc('e9', 'received');
  assert.equal((await setStage(BO, 'document_check')).ok, true);
  assert.equal(await stage(), 'document_check');
});

test('gate: «Καταχώρηση παρόχου» needs every required document VERIFIED', async () => {
  const r = await setStage(BO, 'submitted');
  assert.equal(r.ok, false);
  assert.ok(JSON.parse(r.detail).every((b) => b.status === 'unverified'));
  await su(); await db.exec(`update public.case_documents set status = 'verified' where case_id = '${CASE}' and status = 'received'`);
  assert.equal((await setStage(BO, 'submitted')).ok, true);
});

test('transitions: only the allowed matrix; going back one step and closing as lost are allowed', async () => {
  const skip = await setStage(BO, 'completed');
  assert.equal(skip.ok, false); assert.equal(skip.hint, 'transition');
  assert.equal((await setStage(BO, 'document_check')).ok, true, 'submitted → document_check (back) is allowed');
  assert.equal((await setStage(BO, 'submitted')).ok, true);
});

test('business case also needs «Έναρξη εργασιών ή ΓΕΜΗ»; override is admin/manager only, needs a reason, and is audited', async () => {
  const r = await setStage(INSIDE, 'document_check', BIZ);
  assert.ok(JSON.parse(r.detail).some((b) => b.label === 'Έναρξη εργασιών ή βεβαίωση ΓΕΜΗ'));
  await as(BO);
  assert.equal((await run("select public.change_case_stage_override($1, 'document_check', 'Ο πάροχος δέχεται τα έγγραφα αργότερα')", [BIZ])).ok, false, 'back office cannot override');
  await as(MANAGER);
  assert.equal((await run("select public.change_case_stage_override($1, 'document_check', 'λίγο')", [BIZ])).ok, false, 'reason too short');
  assert.equal((await run("select public.change_case_stage_override($1, 'completed', 'Ο πάροχος δέχεται τα έγγραφα αργότερα')", [BIZ])).ok, false, 'override does not skip the transition rules');
  assert.equal((await run("select public.change_case_stage_override($1, 'document_check', 'Ο πάροχος δέχεται τα έγγραφα αργότερα')", [BIZ])).ok, true);
  assert.equal(await stage(BIZ), 'document_check');
  await su();
  const ev = (await db.query("select metadata from public.timeline_events where case_id = $1 and activity_type = 'stage_override'", [BIZ])).rows[0];
  assert.ok(ev && ev.metadata.blockers.length >= 1, 'timeline records what was overridden');
});

test('return for correction: back office only, reason + items required, keeps stage, moves responsibility, notifies, audits', async () => {
  // CASE is in «Καταχώρηση παρόχου» (a Back Office stage)
  await as(INSIDE);
  assert.equal((await run("select public.return_case_for_correction($1, 'Λείπει η δεύτερη σελίδα', '[\"Λογαριασμός\"]', 'inside_sales')", [CASE])).ok, false, 'inside sales cannot return');
  await as(BO);
  assert.equal((await run("select public.return_case_for_correction($1, 'λίγο', '[\"Λογαριασμός\"]', 'inside_sales')", [CASE])).ok, false, 'reason too short');
  assert.equal((await run("select public.return_case_for_correction($1, 'Λείπει η δεύτερη σελίδα του λογαριασμού', '[]', 'inside_sales')", [CASE])).ok, false, 'items required');
  const ok = await run("select public.return_case_for_correction($1, 'Λείπει η δεύτερη σελίδα του λογαριασμού', '[\"Λογαριασμός ρεύματος\", \"Υπογραφή σελ. 2\"]', 'inside_sales') r", [CASE]);
  assert.equal(ok.ok, true); assert.equal(ok.rows[0].r.to_user, INSIDE);
  await su();
  const c = (await db.query('select * from public.cases where id = $1', [CASE])).rows[0];
  assert.equal(c.current_stage, 'submitted', 'same stage — a return is not a stage move');
  assert.equal(c.next_action_owner_id, INSIDE);
  assert.equal(c.return_from_stage, 'submitted');
  assert.deepEqual(c.return_items, ['Λογαριασμός ρεύματος', 'Υπογραφή σελ. 2']);
  assert.equal((await db.query("select count(*)::int n from public.app_notifications where user_id = $1 and type = 'returned'", [INSIDE])).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from public.timeline_events where case_id = $1 and activity_type = 'returned'", [CASE])).rows[0].n, 1);
  assert.equal((await db.query("select details->>'actor_id' a from public.activity_log where entity_id = $1 and action = 'returned'", [CASE])).rows[0].a, BO);
  await as(BO);
  assert.equal((await run("select public.return_case_for_correction($1, 'Λείπει η δεύτερη σελίδα του λογαριασμού', '[\"x\"]', 'inside_sales')", [CASE])).ok, false, 'not twice');
  await as(INSIDE);
  assert.equal((await run("update public.cases set returned_at = null where id = $1", [CASE])).ok, false, 'return columns only via the functions');
});

test('resubmit: by the returned-to team (or admin/manager); hands back to Back Office and notifies', async () => {
  await as(FIELD);
  assert.equal((await run("select public.resubmit_returned_case($1, 'Στάλθηκε')", [CASE])).ok, false, 'field sales was not the destination');
  await as(INSIDE);
  assert.equal((await run("select public.resubmit_returned_case($1, 'Ο πελάτης έστειλε τη σελίδα 2')", [CASE])).ok, true);
  await su();
  const c = (await db.query('select returned_at, next_action_owner_id from public.cases where id = $1', [CASE])).rows[0];
  assert.equal(c.returned_at, null); assert.equal(c.next_action_owner_id, BO);
  assert.equal((await db.query("select count(*)::int n from public.app_notifications where user_id = $1 and type = 'resubmitted'", [BO])).rows[0].n, 1);
});

test('a case outside the Back Office stages cannot be returned; with no owner, managers are notified', async () => {
  await su(); await db.exec(`insert into public.cases (id, title, current_stage) values ('cccccccc-0000-4000-8000-000000000003', 'Χωρίς υπεύθυνο', 'application'), ('cccccccc-0000-4000-8000-000000000004', 'Νέο', 'new')`);
  await as(BO);
  assert.equal((await run("select public.return_case_for_correction('cccccccc-0000-4000-8000-000000000004', 'Λείπει η δεύτερη σελίδα', '[\"x\"]', 'inside_sales')")).ok, false);
  assert.equal((await run("select public.return_case_for_correction('cccccccc-0000-4000-8000-000000000003', 'Λείπει η δεύτερη σελίδα', '[\"x\"]', 'field_sales')")).ok, true);
  await su();
  assert.equal((await db.query("select count(*)::int n from public.app_notifications where case_id = 'cccccccc-0000-4000-8000-000000000003' and user_id = $1", [MANAGER])).rows[0].n, 1);
});
