// The real phase3/11 SQL on embedded Postgres (PGlite). LOCAL only. Proves the authorization-before-existence order of withdraw_service_request and who may record or withdraw.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001', OWNER = 'aaaaaaaa-0000-4000-8000-000000000002', OTHER = 'aaaaaaaa-0000-4000-8000-000000000003', LEGACY = 'aaaaaaaa-0000-4000-8000-000000000004';
const LEAD = 'bbbbbbbb-0000-4000-8000-000000000001';
const as = async (uid) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']); if (uid) await db.exec('set role authenticated'); };
const run = async (sql, p) => { try { return { ok: true, rows: (await db.query(sql, p)).rows }; } catch (e) { return { ok: false, err: e.message, code: e.code }; } };
let reqId;

before(async () => {
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated, service_role;
    create table public.profiles (id uuid primary key, role text not null, is_active boolean not null default true);
    create table public.hlektrismos_leads (id uuid primary key, assigned_to uuid);
    create function public.contact_role() returns text language sql stable security definer set search_path = public
      as $$ select p.role from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('admin', 'inside_sales', 'field_sales') $$;
    create table public.contact_log_calls (action text, lead uuid);
    create function public.contact_log(p_action text, p_lead uuid, p_customer uuid, p_details jsonb) returns void language sql as $$ insert into public.contact_log_calls values (p_action, p_lead) $$;
    insert into public.profiles values ('${ADMIN}', 'admin'), ('${OWNER}', 'field_sales'), ('${OTHER}', 'field_sales'), ('${LEGACY}', 'manager');
    insert into public.hlektrismos_leads values ('${LEAD}', '${OWNER}');
    grant select on public.hlektrismos_leads, public.profiles to authenticated; grant all on public.contact_log_calls to authenticated;`);
  for (let i = 0; i < 2; i++) await db.exec(read('../staged-migrations/phase3/11_contact_service_requests.sql'));
  await as(OWNER);
  const r = await run(`select public.record_service_request($1, 'quote', array['email'], 'Φόρμα 0042', now() - interval '1 day', now() + interval '30 days') id`, [LEAD]);
  assert.ok(r.ok, r.err);
  reqId = r.rows[0].id;
});

test('who may record a request: the assigned agent and the Admin; another agent, a legacy role and anonymous may not', async () => {
  const rec = async (uid) => { await as(uid); return run(`select public.record_service_request($1, 'quote', array['email'], 'Φόρμα 0042', now() - interval '1 day', now() + interval '30 days')`, [LEAD]); };
  assert.ok((await rec(ADMIN)).ok);
  for (const uid of [OTHER, LEGACY, null]) assert.ok(!(await rec(uid)).ok, String(uid));
});

test('evidence and expiry are enforced: no evidence, a future evidence date, an expiry in the past or beyond 90 days are refused', async () => {
  await as(OWNER);
  const call = (ev, at, exp) => run(`select public.record_service_request($1, 'quote', array['email'], $2, ${at}, ${exp})`, [LEAD, ev]);
  assert.ok(!(await call('', 'now()', "now() + interval '1 day'")).ok);
  assert.ok(!(await call('Φόρμα 0042', "now() + interval '2 days'", "now() + interval '5 days'")).ok);
  assert.ok(!(await call('Φόρμα 0042', "now() - interval '1 day'", "now() - interval '1 hour'")).ok);
  assert.ok(!(await call('Φόρμα 0042', "now() - interval '1 day'", "now() + interval '200 days'")).ok);
});

test('withdraw: an agent who does not own the lead gets the SAME refusal for a real id and a made-up id, so existence cannot be probed', async () => {
  const real = (await as(OTHER), await run('select public.withdraw_service_request($1)', [reqId]));
  const fake = (await as(OTHER), await run('select public.withdraw_service_request($1)', ['cccccccc-0000-4000-8000-0000000000ff']));
  assert.equal(real.ok, false); assert.equal(fake.ok, false);
  assert.equal(real.code, '42501'); assert.equal(fake.code, '42501');
  assert.equal(real.err, fake.err);
  for (const uid of [LEGACY, null]) { await as(uid); const r = await run('select public.withdraw_service_request($1)', [reqId]); assert.equal(r.ok, false, String(uid)); }
  await as(null); assert.equal((await db.query('select count(*)::int n from public.contact_service_requests where withdrawn_at is not null')).rows[0].n, 0, 'nothing was withdrawn');
});

test('withdraw: the owner of the lead and the Admin can; a second withdrawal answers false; the withdrawal is logged', async () => {
  await as(OWNER);
  assert.equal((await run('select public.withdraw_service_request($1) r', [reqId])).rows[0].r, true);
  assert.equal((await run('select public.withdraw_service_request($1) r', [reqId])).rows[0].r, false);
  await as(ADMIN);
  const other = (await run(`select public.record_service_request($1, 'callback', array['sms'], 'Τηλ. 0007', now() - interval '1 day', now() + interval '3 days') id`, [LEAD])).rows[0].id;
  assert.equal((await run('select public.withdraw_service_request($1) r', [other])).rows[0].r, true);
  assert.equal((await run('select public.withdraw_service_request($1) r', ['cccccccc-0000-4000-8000-0000000000ff'])).rows[0].r, false, 'Admin: a missing id is simply false');
  await as(null);
  assert.ok((await db.query("select count(*)::int n from public.contact_log_calls where action = 'contact_service_request_withdrawn'")).rows[0].n >= 2);
});

test('no direct writes for anyone; anon cannot reach the functions', async () => {
  for (const uid of [ADMIN, OWNER]) { await as(uid); assert.ok(!(await run(`insert into public.contact_service_requests (lead_id, request_type, channels, evidence_ref, evidence_at, expires_at, recorded_by) values ('${LEAD}', 'quote', array['email'], 'abc', now(), now() + interval '1 day', '${uid}')`)).ok); }
  await db.exec('reset role'); await db.exec('set role anon');
  assert.ok(!(await run('select public.withdraw_service_request($1)', [reqId])).ok);
});

test('rollback_phase3_11 removes the table and both functions, and the migration can be applied again', async () => {
  await db.exec('reset role');
  await db.exec(read('../../docs/ops/rollback_phase3_11_contact_service_requests.sql'));
  const left = (await db.query(`select (select count(*)::int from pg_proc where proname in ('record_service_request', 'withdraw_service_request')) f, (select count(*)::int from pg_class where relname = 'contact_service_requests') t`)).rows[0];
  assert.deepEqual(left, { f: 0, t: 0 });
  await db.exec(read('../staged-migrations/phase3/11_contact_service_requests.sql'));
  assert.equal((await db.query("select count(*)::int n from pg_class where relname = 'contact_service_requests'")).rows[0].n, 1);
});
