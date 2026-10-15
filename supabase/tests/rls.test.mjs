// LOCAL verification only (embedded Postgres via PGlite). This proves the staged SQL behaves as designed against
// the repo's real original migrations. It is NOT staging or production verification.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const MANAGER = 'aaaaaaaa-0000-4000-8000-000000000002';
const AGENT = 'aaaaaaaa-0000-4000-8000-000000000003';
const INACTIVE = 'aaaaaaaa-0000-4000-8000-000000000004';
const LEAD = 'bbbbbbbb-0000-4000-8000-000000000001';

async function as(role, uid = null) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (role) await db.exec(`set role ${role}`);
}
async function can(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, role text not null, is_active boolean default true);
    -- final production definitions (migration 20261001000000 / 20260909120000)
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    create table public.hlektrismos_leads (id uuid primary key);
    grant usage on schema public to anon, authenticated;
    -- Supabase default privileges: tables created later also get broad grants (RLS is then the barrier)
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  // The REAL original migrations that created the permissive policies
  await db.exec(read('../migrations/20260818160000_create_integrations_table.sql'));
  await db.exec(read('../migrations/20260818170000_create_crm_emails_table.sql'));
  await db.exec(`
    insert into auth.users values ('${ADMIN}'),('${MANAGER}'),('${AGENT}'),('${INACTIVE}');
    insert into public.profiles values ('${ADMIN}','admin',true),('${MANAGER}','manager',true),('${AGENT}','inside_sales',true),('${INACTIVE}','inside_sales',false);
    insert into public.hlektrismos_leads values ('${LEAD}');
    insert into public.crm_emails (id, from_email, to_email, subject, body, lead_id) values ('m1','cust@example.com','info@hlektrismos.gr','Hello','private body','${LEAD}');
    update public.crm_integrations set config = '{"token":"SECRET-PLACEHOLDER"}'::jsonb where id = 'gmail';
    -- Supabase grants table privileges broadly by default; RLS is then the only barrier.
    grant all on all tables in schema public to anon, authenticated;
  `);
});

test('BEFORE hardening (reproduces the source finding): anon can read emails and read/write integrations', async () => {
  await as('anon');
  assert.equal((await can('select body from public.crm_emails')).rows.length, 1, 'anon reads crm_emails');
  assert.equal((await can('select config from public.crm_integrations')).rows.length, 8, 'anon reads integrations incl. config');
  const w = await can("update public.crm_integrations set connected = true where id = 'sms'");
  assert.equal(w.ok, true, 'anon writes integrations');
});

test('apply staged SQL 01 + 02 (and re-apply: idempotent)', async () => {
  await as(null);
  for (let i = 0; i < 2; i++) {
    await db.exec(read('../staged-migrations/phase1/01_rls_hardening.sql'));
    await db.exec(read('../staged-migrations/phase1/02_outreach_decisions_audit.sql'));
  }
  await db.exec('grant select on public.crm_integrations_status to authenticated');
});

test('AFTER: anonymous role is fully locked out', async () => {
  await as('anon');
  for (const t of ['crm_emails', 'crm_integrations', 'crm_integrations_status', 'outreach_decisions']) {
    const r = await can(`select * from public.${t}`);
    assert.ok(!r.ok || r.rows.length === 0, `anon must not read ${t}`);
  }
  const w = await can("update public.crm_integrations set connected = true");
  assert.ok(!w.ok, 'anon must not write integrations');
});

test('AFTER: integrations (with config) are admin-only; others see status without secrets', async () => {
  await as('authenticated', AGENT);
  assert.equal((await can('select * from public.crm_integrations')).rows.length, 0, 'agent sees no integration rows');
  assert.equal((await can("update public.crm_integrations set connected = true where id = 'sms' returning id")).rows.length, 0, 'agent cannot update');
  const st = await can('select * from public.crm_integrations_status');
  assert.equal(st.rows.length, 8);
  assert.ok(!('config' in st.rows[0]), 'status view exposes no config column');

  await as('authenticated', ADMIN);
  assert.equal((await can('select config from public.crm_integrations')).rows.length, 8, 'admin reads integrations');
  assert.equal((await can("update public.crm_integrations set connected = true where id = 'sms' returning id")).rows.length, 1, 'admin updates');
});

test('AFTER: inactive staff cannot read emails; active staff can (interim rule)', async () => {
  await as('authenticated', INACTIVE);
  assert.equal((await can('select * from public.crm_emails')).rows.length, 0);
  await as('authenticated', AGENT);
  assert.equal((await can('select * from public.crm_emails')).rows.length, 1);
});

// Per-channel consent evidence moved to phase3/09 (keyed by phone/email): see supabase/tests/contact-eligibility.test.mjs.

test('outreach_decisions is append-only and not writable by staff', async () => {
  await as('service_role'); // service role has BYPASSRLS in Supabase; emulate by writing as the owner
  await as(null);
  await db.exec(`insert into public.outreach_decisions (lead_id, channel, purpose, allowed, reasons) values ('${LEAD}','email','promotional',false,'{NO_CHANNEL_PERMISSION}')`);
  const upd = await can("update public.outreach_decisions set allowed = true");
  assert.ok(!upd.ok && /append-only/.test(upd.err), 'owner update blocked by trigger');
  const del = await can('delete from public.outreach_decisions');
  assert.ok(!del.ok, 'delete blocked');
  await as('authenticated', MANAGER);
  assert.equal((await can('select * from public.outreach_decisions')).rows.length, 1, 'manager can read audit');
  assert.ok(!(await can(`insert into public.outreach_decisions (lead_id, channel, purpose, allowed) values ('${LEAD}','email','x',true)`)).ok, 'staff cannot insert');
  await as('authenticated', AGENT);
  assert.equal((await can('select * from public.outreach_decisions')).rows.length, 0, 'agent cannot read audit');
});

test('staged SQL 03 removes a hand-made exec_sql RPC (all overloads) and anon cannot run it before', async () => {
  await as(null);
  await db.exec(`create function public.exec_sql(sql text) returns void language plpgsql security definer as $$ begin execute sql; end $$;
                 grant execute on function public.exec_sql(text) to anon, authenticated;`);
  await as('anon');
  assert.equal((await can("select public.exec_sql('select 1')")).ok, true, 'reproduces: anon can execute arbitrary SQL');
  await as(null);
  await db.exec(read('../staged-migrations/phase1/03_drop_exec_sql.sql'));
  const r = await can("select to_regprocedure('public.exec_sql(text)') as f");
  assert.equal(r.rows[0].f, null);
});
