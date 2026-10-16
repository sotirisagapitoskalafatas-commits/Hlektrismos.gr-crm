// LOCAL verification only (PGlite): the Back Office «Ενεργοποίηση» / «Ολοκλήρωση» buttons (src/lib/stage-jump.ts) against the
// transition guard of supabase/staged-migrations/phase2/07. NOT staging or production verification.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSync } from 'esbuild';

// Migrations may be checked out with CRLF line endings on Windows.
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const js = buildSync({
  stdin: { contents: "export { checkJump } from './stage-jump'; export { STAGE_TRANSITIONS, STAGES } from './roles'; export { parseStageError, stageErrorText } from './case-return';",
    resolveDir: fileURLToPath(new URL('../../src/lib/', import.meta.url)), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const J = await import('data:text/javascript;base64,' + Buffer.from(js.outputFiles[0].text).toString('base64'));
const db = new PGlite();
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const BO = 'aaaaaaaa-0000-4000-8000-000000000005';

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message, detail: e.detail, hint: e.hint }; } }
let n = 0;
const newCase = async (stage) => {
  await su();
  const id = `cccccccc-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  await db.query('insert into public.cases (id, title, current_stage) values ($1, $2, $3)', [id, 'Ρεύμα — Πελάτης', stage]);
  return id;
};
const stageOf = async (id) => { await su(); return (await db.query('select current_stage from public.cases where id = $1', [id])).rows[0].current_stage; };
// The same write the app sends for these buttons (changeStage in src/lib/api.ts), as a Back Office user.
const press = async (id, target) => {
  await as(BO);
  return run(`update public.cases set current_stage = $2${target === 'completed' ? ", status = 'completed', activation_status = 'active'" : ''} where id = $1`, [id, target]);
};
// What the button does: it writes only when checkJump allows it; otherwise it shows the message and writes nothing.
const click = async (id, target) => {
  const j = J.checkJump(await stageOf(id), target);
  if (!j.allowed) return { wrote: false, message: j.message };
  const r = await press(id, target);
  return { wrote: true, ok: r.ok, message: r.ok ? null : J.stageErrorText(J.parseStageError({ message: r.err, details: r.detail, hint: r.hint })) };
};

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
      current_stage text not null default 'new', status text not null default 'open', activation_status text, owner_id uuid,
      inside_sales_owner uuid, field_sales_owner uuid, back_office_owner uuid, next_action text not null default '', next_action_owner_id uuid, updated_at timestamptz default now());
    create table public.case_documents (id uuid primary key default gen_random_uuid(), case_id uuid references public.cases(id), category text, status text not null default 'received');
    create table public.timeline_events (id uuid primary key default gen_random_uuid(), case_id uuid, role text, activity_type text, title text, description text, user_id uuid, occurred_at timestamptz default now(), metadata jsonb);
    create table public.app_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, case_id uuid, title text, body text, type text, created_at timestamptz default now());
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, action text, details jsonb, created_at timestamptz default now());
    alter table public.cases enable row level security;
    create policy "staff all cases" on public.cases for all to authenticated using (public.is_staff()) with check (public.is_staff());
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on public.cases, public.case_documents, public.timeline_events, public.app_notifications, public.activity_log to authenticated;
    insert into public.profiles values ('${ADMIN}','Admin','admin',true),('${BO}','BO','back_office',true);
  `);
  await db.exec(read('../staged-migrations/phase2/07_case_return_and_document_gates.sql'));
});

test('the app list of allowed moves (STAGE_TRANSITIONS) is exactly the database list (case_stage_transitions)', async () => {
  await su();
  const inDb = (await db.query('select from_stage, to_stage from public.case_stage_transitions')).rows.map((r) => `${r.from_stage}→${r.to_stage}`).sort();
  const inApp = Object.entries(J.STAGE_TRANSITIONS).flatMap(([from, to]) => to.map((t) => `${from}→${t}`)).sort();
  assert.deepEqual(inApp, inDb);
});

test('every stage × both buttons: the app writes only when the 07 guard accepts the move, otherwise it shows a Greek message', async () => {
  for (const { id: stage } of J.STAGES) {
    for (const target of ['activation', 'completed']) {
      if (stage === target) continue; // the button is not shown on its own stage
      const j = J.checkJump(stage, target);
      const id = await newCase(stage);
      const r = await press(id, target);
      assert.equal(r.ok, j.allowed, `${stage} → ${target}: app and database must agree`);
      if (j.allowed) assert.equal(await stageOf(id), target);
      else {
        assert.equal(r.hint, 'transition', `${stage} → ${target} is refused as a transition`);
        assert.equal(await stageOf(id), stage);
        assert.match(j.message, /[Α-Ωα-ωά-ώ]{3}/, 'a Greek message');
      }
    }
  }
});

test('allowed move works: «Καταχώρηση παρόχου» → «Ενεργοποίηση» → «Ολοκλήρωση»', async () => {
  const id = await newCase('submitted');
  assert.deepEqual(await click(id, 'activation'), { wrote: true, ok: true, message: null });
  assert.equal(await stageOf(id), 'activation');
  assert.deepEqual(await click(id, 'completed'), { wrote: true, ok: true, message: null });
  await su();
  assert.deepEqual((await db.query('select current_stage, status, activation_status from public.cases where id = $1', [id])).rows[0],
    { current_stage: 'completed', status: 'completed', activation_status: 'active' });
});

test('impossible jump: nothing is written and the message says where the move comes from and what to do next', async () => {
  const id = await newCase('document_check');
  assert.deepEqual(await click(id, 'activation'), { wrote: false,
    message: '«Ενεργοποίηση» γίνεται μόνο από «Καταχώρηση παρόχου». Το case είναι στο «Έλεγχος εγγράφων» — επόμενο βήμα: «Καταχώρηση παρόχου».' });
  assert.equal(await stageOf(id), 'document_check');
  const far = await click(await newCase('signed'), 'completed');
  assert.equal(far.wrote, false);
  assert.match(far.message, /^«Ολοκληρώθηκε» γίνεται μόνο από «Ενεργοποίηση»\. .*επόμενο βήμα: «Έλεγχος εγγράφων» \(χρειάζονται πρώτα 3 βήματα\)\.$/);
  assert.match((await click(await newCase('completed'), 'activation')).message, /έχει ολοκληρωθεί/);
  assert.match((await click(await newCase('lost'), 'activation')).message, /Ανοίξτε το ξανά/);
  // after the suggested step the button works
  assert.equal((await press(id, 'submitted')).ok, true);
  assert.deepEqual(await click(id, 'activation'), { wrote: true, ok: true, message: null });
});

test('a database refusal of an allowed move (gate set to «block») is shown, not swallowed', async () => {
  await as(ADMIN);
  assert.equal((await run("select public.set_stage_gate_mode('activation', 'block')")).ok, true);
  const id = await newCase('submitted');
  const r = await click(id, 'activation');
  assert.equal(r.wrote, true); assert.equal(r.ok, false);
  assert.match(r.message, /^Δεν επιτρέπεται η μετάβαση: Ταυτότητα — εμπρός όψη \(λείπει\)/);
  assert.equal(await stageOf(id), 'submitted');
  await as(ADMIN);
  await run("select public.set_stage_gate_mode('activation', 'warn')");
});
