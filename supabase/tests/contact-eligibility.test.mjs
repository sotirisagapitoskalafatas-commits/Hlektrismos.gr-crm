// LOCAL verification only (PGlite) of supabase/staged-migrations/phase3/09_contact_eligibility.sql.
// NOT staging or production verification.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSync } from 'esbuild';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const keysJs = buildSync({ entryPoints: [fileURLToPath(new URL('../functions/_shared/contact-keys.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const keys = await import('data:text/javascript;base64,' + Buffer.from(keysJs.outputFiles[0].text).toString('base64'));

const db = new PGlite();
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const MANAGER = 'aaaaaaaa-0000-4000-8000-000000000002';
const INSIDE = 'aaaaaaaa-0000-4000-8000-000000000003';
const FIELD = 'aaaaaaaa-0000-4000-8000-000000000004';
const BO = 'aaaaaaaa-0000-4000-8000-000000000005';
const GONE = 'aaaaaaaa-0000-4000-8000-000000000009';
const LEAD = 'bbbbbbbb-0000-4000-8000-000000000001';

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  await db.exec(uid ? 'set role authenticated' : 'set role anon');
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }
const facts = async (phone, email) => (await db.query('select public.contact_facts($1, $2) as f', [phone, email])).rows[0].f;

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean default true);
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid, action text not null, details jsonb, created_at timestamptz default now());
    create table public.email_suppressions (email text primary key check (email = lower(btrim(email))), reason text not null default 'unsubscribe', source text, created_at timestamptz not null default now());
    create table public.b2b_prospects (id uuid primary key default gen_random_uuid(), company_name text, phone_key text, phone_screening text not null default 'not_checked');
    grant usage on schema public to anon, authenticated, service_role;
    insert into public.profiles values ('${ADMIN}','Admin','admin',true),('${MANAGER}','Μάνος','manager',true),('${INSIDE}','Ελένη','inside_sales',true),
      ('${FIELD}','Γιάννης','field_sales',true),('${BO}','Κατερίνα','back_office',true),('${GONE}','Πρώην','inside_sales',false);
    insert into public.b2b_prospects (company_name, phone_key) values ('Ξενοδοχείο Ακτή', '2101234567');
  `);
  const sql = read('../staged-migrations/phase3/09_contact_eligibility.sql');
  await db.exec(sql);
  await db.exec(sql); // idempotent re-apply
});

test('normalisation is identical in SQL and in the shared TypeScript module', async () => {
  await su();
  for (const p of ['+30 210 123 4567', '00302101234567', '210-123-4567', '6910000010', '', null, '12']) {
    const r = (await db.query('select public.contact_phone_key($1) as k', [p])).rows[0].k;
    assert.equal(r, keys.phoneKey(p), `phone ${p}`);
  }
  for (const e of ['  Maria@Example.GR ', 'not-provided@hlektrismos.local', '@x.gr', 'plain', '', null]) {
    const r = (await db.query('select public.contact_email_key($1) as k', [e])).rows[0].k;
    assert.equal(r, keys.emailKey(e), `email ${e}`);
  }
});

test('anyone on staff records «δεν θέλει επικοινωνία»; it follows the person and suppresses marketing email', async () => {
  await as(INSIDE);
  const n = await run(`select public.record_contact_objection('+30 210 123 4567', 'Maria@Example.gr', 'marketing', null, 'Ζήτησε να μην την ξαναπάρουμε', 'customer_request', '${LEAD}', null) as n`);
  assert.equal(n.ok, true, n.err);
  assert.equal(n.rows[0].n, 2, 'one row for the phone, one for the email');
  const noReason = await run(`select public.record_contact_objection('2101234567', null, 'marketing', null, ' ')`);
  assert.ok(!noReason.ok && /reason is required/.test(noReason.err));
  const badChannel = await run(`select public.record_contact_objection('2101234567', null, 'marketing', array['fax'], 'λάθος')`);
  assert.ok(!badChannel.ok && /invalid channels/.test(badChannel.err));
  const nothing = await run(`select public.record_contact_objection(null, 'x@y.gr', 'marketing', array['sms'], 'μόνο sms χωρίς τηλέφωνο')`);
  assert.ok(!nothing.ok && /no phone or email/.test(nothing.err), 'an SMS objection needs a phone number');

  // Same person under another record, number written differently: the field agent sees the «no» before calling.
  await as(FIELD);
  const f = await facts('00302101234567', null);
  assert.equal(f.has_phone, true);
  assert.equal(f.objections.length, 1);
  assert.equal(f.objections[0].scope, 'marketing');
  await su();
  assert.equal((await db.query('select count(distinct batch_id)::int as n from public.contact_objections')).rows[0].n, 1, 'phone + email rows share one batch');
  await as(FIELD);
  assert.ok(!('address_key' in f.objections[0]), 'facts never echo the address');
  assert.equal((await facts(null, 'maria@example.gr')).email_suppressed, true);

  await su();
  assert.equal((await db.query("select count(*)::int as n from public.email_suppressions where email = 'maria@example.gr'")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int as n from public.activity_log where action = 'contact_objection' and entity_id = $1", [LEAD])).rows[0].n, 1);
});

test('direct table access: no writes for anyone on staff; reads only for Admin; nothing for anon or legacy roles', async () => {
  await as(ADMIN);
  const w = await run(`insert into public.contact_consents (address_kind, address_key, channel, status) values ('phone','2109999999','sms','withdrawn')`);
  assert.ok(!w.ok, 'even admin writes only through the functions');
  assert.ok(!(await run(`update public.contact_objections set lifted_at = now(), lifted_by = '${ADMIN}', lifted_reason = 'παράκαμψη'`)).ok, 'no direct lift');
  await as(ADMIN);
  assert.equal((await run('select * from public.contact_objections')).rows.length, 2);
  await as(INSIDE);
  assert.equal((await run('select * from public.contact_objections')).rows.length, 0, 'agents use contact_facts, not the raw table');
  await as(GONE);
  assert.ok(!(await run(`select public.contact_facts('2101234567', null)`)).ok, 'inactive account is refused');
  for (const legacy of [MANAGER, BO]) {
    await as(legacy);
    assert.equal((await run('select * from public.contact_objections')).rows.length, 0, 'a legacy role reads nothing');
    assert.ok(!(await run(`select public.contact_facts('2101234567', null)`)).ok, 'a legacy role is refused');
    assert.ok(!(await run(`select public.record_contact_consent('6910000099', null, 'sms', 'consent', 'Έντυπο 1', now())`)).ok, 'a legacy role records no consent');
    assert.ok(!(await run(`select public.record_contact_objection('6910000099', null, 'marketing', null, 'δοκιμή')`)).ok, 'a legacy role is not staff here');
  }
  await as(null);
  assert.ok(!(await run(`select public.contact_facts('2101234567', null)`)).ok, 'anon cannot read facts');
  assert.ok(!(await run('select * from public.contact_objections')).ok, 'anon cannot read the table');
});

test('consent: needs Admin AND evidence; withdrawal is open to all staff', async () => {
  await as(FIELD);
  const denied = await run(`select public.record_contact_consent('6910000010', null, 'sms', 'consent', 'Έντυπο 0042', now() - interval '1 day')`);
  assert.ok(!denied.ok && /not allowed/.test(denied.err));
  await as(ADMIN);
  const noEvidence = await run(`select public.record_contact_consent('6910000010', null, 'sms', 'consent', '', now())`);
  assert.ok(!noEvidence.ok && /evidence is required/.test(noEvidence.err));
  const future = await run(`select public.record_contact_consent('6910000010', null, 'sms', 'consent', 'Έντυπο 0042', now() + interval '2 days')`);
  assert.ok(!future.ok && /future/.test(future.err));
  const weak = await run(`select public.record_contact_consent('6910000010', null, 'sms', 'other', 'Έντυπο 0042', now())`);
  assert.ok(!weak.ok && /invalid basis/.test(weak.err));
  const ok = await run(`select public.record_contact_consent('+30 691 000 0010', null, 'sms', 'consent', 'Έντυπο 0042', now() - interval '1 day', 'v1') as id`);
  assert.equal(ok.ok, true, ok.err);
  assert.equal((await facts('6910000010', null)).consents.sms.status, 'granted');

  await as(INSIDE);
  const wd = await run(`select public.withdraw_contact_consent('6910000010', null, 'sms', 'Είπε «σταματήστε τα μηνύματα»')`);
  assert.equal(wd.ok, true, wd.err);
  const fc = (await facts('6910000010', null)).consents.sms;
  assert.equal(fc.status, 'withdrawn');
  assert.equal(fc.evidence_ref, 'Έντυπο 0042', 'the original evidence stays on record');
  const wdEmail = await run(`select public.withdraw_contact_consent(null, 'Nikos@Example.gr', 'email', 'Απεγγραφή τηλεφωνικά')`);
  assert.equal(wdEmail.ok, true, wdEmail.err);
  assert.equal((await facts(null, 'nikos@example.gr')).email_suppressed, true, 'withdrawn email consent also suppresses');
});

test('Article 11 screening: Admin records it, latest wins, B2B prospects are flagged', async () => {
  await as(INSIDE);
  assert.ok(!(await run(`select public.record_article11_screening('2101234567', 'not_listed', 'Μητρώο Άρθρου 11')`)).ok, 'agents cannot record screenings');
  await as(ADMIN);
  const old = await run(`select public.record_article11_screening('2101234567', 'not_listed', 'Μητρώο Άρθρου 11 — λίστα παρόχου', 'αρχείο 2026-10', now() - interval '3 days')`);
  assert.equal(old.ok, true, old.err);
  await su();
  assert.equal((await db.query("select phone_screening from public.b2b_prospects")).rows[0].phone_screening, 'clear');
  await as(ADMIN);
  await run(`select public.record_article11_screening('+30 210 1234567', 'listed', 'Μητρώο Άρθρου 11', null, now() - interval '1 hour')`);
  const a = (await facts('2101234567', null)).article11;
  assert.equal(a.result, 'listed', 'the latest screening wins');
  await su();
  assert.equal((await db.query("select phone_screening from public.b2b_prospects")).rows[0].phone_screening, 'opted_out');
  await as(ADMIN);
  const bad = await run(`select public.record_article11_screening('2101234567', 'listed', 'Μητρώο', null, now() - interval '2 years')`);
  assert.ok(!bad.ok && /invalid screening date/.test(bad.err));
  assert.ok(!(await run(`select public.record_article11_screening('2101234567', 'maybe', 'Μητρώο')`)).ok);
});

test('only an admin lifts an objection, with a reason; the facts update immediately', async () => {
  await su();
  const id = (await db.query("select id from public.contact_objections where address_kind = 'phone' and lifted_at is null")).rows[0].id;
  await as(MANAGER);
  assert.ok(!(await run('select public.lift_contact_objection($1, $2)', [id, 'νέα συγκατάθεση'])).ok, 'manager cannot lift');
  await as(ADMIN);
  assert.ok(!(await run('select public.lift_contact_objection($1, $2)', [id, ''])).ok, 'reason required');
  const ok = await run('select public.lift_contact_objection($1, $2) as done', [id, 'Νέα έγγραφη συγκατάθεση 12/11, αρ. 0042']);
  assert.equal(ok.rows[0].done, true);
  assert.equal((await facts('2101234567', null)).objections.length, 0);
  assert.equal((await facts(null, 'maria@example.gr')).objections.length, 0, 'the email row of the same «no» is lifted too');
  assert.equal((await facts(null, 'maria@example.gr')).email_suppressed, false, 'the suppression it created is removed');
  assert.equal((await facts(null, 'nikos@example.gr')).email_suppressed, true, 'a suppression from a consent withdrawal stays');
  assert.equal((await run('select public.lift_contact_objection($1, $2) as done', [id, 'ξανά'])).rows[0].done, false, 'already lifted');
});

test('a spoken refusal: service_role only, one row however often it is delivered, marketing on every channel, and no transcript stored', async () => {
  const CALL = 'cccccccc-0000-4000-8000-000000000001';
  const LEAD = 'dddddddd-0000-4000-8000-000000000001';
  const call = (phone, email = null) => db.query('select public.record_spoken_objection($1, $2, $3, $4) r', [phone, email, LEAD, CALL]);
  for (const who of [INSIDE, ADMIN]) {
    await as(who);
    assert.ok(!(await run(`select public.record_spoken_objection('6910000077', null, null, null)`)).ok, 'no signed-in person may call it');
  }
  await as(null);
  assert.ok(!(await run(`select public.record_spoken_objection('6910000077', null, null, null)`)).ok, 'nor anon');
  await su();
  await db.exec('set role service_role');
  assert.equal((await call('+30 691 000 0077')).rows[0].r, true);
  assert.equal((await call('6910000077')).rows[0].r, false, 'a repeat changes nothing');
  await assert.rejects(() => call('not a number'), /no phone number or email/);
  assert.equal((await call('6910000077', 'Spoken@Example.gr')).rows[0].r, true, 'the email is added; the phone is not repeated');
  assert.equal((await call('6910000077', 'spoken@example.gr')).rows[0].r, false);
  await su();
  const rows = (await db.query("select * from public.contact_objections where address_key = '6910000077'")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scope, 'marketing');
  assert.equal(rows[0].channels, null, 'every channel');
  assert.equal(rows[0].source, 'customer_request');
  assert.equal(rows[0].lead_id, LEAD);
  assert.equal((await db.query("select count(*)::int n from public.contact_objections where address_key = 'spoken@example.gr'")).rows[0].n, 1);
  assert.equal((await db.query("select reason from public.email_suppressions where email = 'spoken@example.gr'")).rows[0].reason, 'objection');
  const log = (await db.query("select details from public.activity_log where action = 'contact_objection' order by created_at desc limit 1")).rows[0].details;
  assert.equal(log.voice_call, CALL);
});
