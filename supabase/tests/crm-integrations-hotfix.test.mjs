// LOCAL verification only (embedded Postgres via PGlite). Reproduces the production state found in the read-only audit
// (permissive public policy USING true, broad anon/authenticated grants) and proves phase1/20 fixes it.
// This is NOT staging or production evidence.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const U = {
  admin: 'aaaaaaaa-0000-4000-8000-000000000001',
  inactiveAdmin: 'aaaaaaaa-0000-4000-8000-000000000002',
  fieldSales: 'aaaaaaaa-0000-4000-8000-000000000003',
  insideSales: 'aaaaaaaa-0000-4000-8000-000000000004',
  manager: 'aaaaaaaa-0000-4000-8000-000000000005',
  backOffice: 'aaaaaaaa-0000-4000-8000-000000000006',
  inactiveSales: 'aaaaaaaa-0000-4000-8000-000000000007',
};

async function as(role, uid = null) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (role) await db.exec(`set role ${role}`);
}
async function can(sql) { try { const r = await db.query(sql); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }
const readable = async (sql) => { const r = await can(sql); return r.ok ? r.rows.length : 0; };

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, role text not null, is_active boolean default true);
    -- production definitions: is_role does not look at is_active, is_staff does
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  await db.exec(read('../migrations/20260818160000_create_integrations_table.sql'));
  await db.exec(`
    insert into auth.users select unnest(array['${Object.values(U).join("','")}'])::uuid;
    insert into public.profiles values
      ('${U.admin}','admin',true),('${U.inactiveAdmin}','admin',false),('${U.fieldSales}','field_sales',true),
      ('${U.insideSales}','inside_sales',true),('${U.manager}','manager',true),('${U.backOffice}','back_office',true),
      ('${U.inactiveSales}','field_sales',false);
    update public.crm_integrations set config = '{"token":"SECRET-PLACEHOLDER"}'::jsonb where id = 'gmail';
    grant all on all tables in schema public to anon, authenticated, service_role;
  `);
});

test('BEFORE: reproduces the production finding (anon reads config and writes)', async () => {
  await as('anon');
  assert.equal(await readable('select config from public.crm_integrations'), 8);
  assert.equal((await can("update public.crm_integrations set connected = true where id = 'sms' returning id")).rows.length, 1);
  await as('authenticated', U.fieldSales);
  assert.equal(await readable('select config from public.crm_integrations'), 8, 'a Sales Agent could read tokens');
  await db.exec('reset role');
  await db.exec("update public.crm_integrations set connected = false where id = 'sms'");
});

test('apply phase1/20 twice (idempotent)', async () => {
  await as(null);
  for (let i = 0; i < 2; i++) await db.exec(read('../staged-migrations/phase1/20_crm_integrations_emergency_hotfix.sql'));
  const pol = (await db.query("select policyname, permissive, roles from pg_policies where tablename='crm_integrations' order by 1")).rows;
  assert.deepEqual(pol.map((p) => p.policyname), ['admin manage crm_integrations', 'phase1/20 anon denied']);
  assert.ok(!pol.some((p) => String(p.roles).includes('public')), 'no permissive policy left for public');
});

test('AFTER: anonymous cannot read or write, and has no table privileges', async () => {
  await as('anon');
  assert.equal(await readable('select * from public.crm_integrations'), 0);
  assert.equal(await readable('select config from public.crm_integrations'), 0);
  const w = await can("update public.crm_integrations set connected = true returning id");
  assert.ok(!w.ok || w.rows.length === 0);
  assert.ok(!(await can("insert into public.crm_integrations (id,name) values ('x','x')")).ok);
  await as(null);
  const priv = (await db.query("select count(*)::int n from information_schema.role_table_grants where table_name='crm_integrations' and grantee='anon'")).rows[0].n;
  assert.equal(priv, 0);
});

test('AFTER: no other account can read config or write — Sales Agents, legacy roles, inactive accounts', async () => {
  for (const [name, uid] of Object.entries(U)) {
    if (name === 'admin') continue;
    await as('authenticated', uid);
    assert.equal(await readable('select config from public.crm_integrations'), 0, `${name} must not read config`);
    const w = await can("update public.crm_integrations set connected = true returning id");
    assert.ok(!w.ok || w.rows.length === 0, `${name} must not update`);
    const i = await can("insert into public.crm_integrations (id,name) values ('evil','evil') returning id");
    assert.ok(!i.ok, `${name} must not insert`);
    const d = await can("delete from public.crm_integrations returning id");
    assert.ok(!d.ok || d.rows.length === 0, `${name} must not delete`);
  }
});

test('AFTER: the active admin keeps full management (positive control)', async () => {
  await as('authenticated', U.admin);
  assert.equal(await readable('select config from public.crm_integrations'), 8);
  assert.equal((await can("update public.crm_integrations set connected = true where id = 'sms' returning id")).rows.length, 1);
  assert.equal((await can("insert into public.crm_integrations (id,name) values ('new','New') returning id")).rows.length, 1);
  assert.equal((await can("delete from public.crm_integrations where id = 'new' returning id")).rows.length, 1);
});

test('AFTER: service_role (Edge Functions) is unchanged', async () => {
  await as('service_role');
  assert.equal(await readable('select config from public.crm_integrations'), 8);
  assert.equal((await can("update public.crm_integrations set connected = false where id = 'sms' returning id")).rows.length, 1);
});

test('compatible with the later rollout policy (phase1/18 restrictive policy admits back_office, still denied)', async () => {
  await as(null);
  await db.exec(`create policy "phase1/18 office integrations only" on public.crm_integrations as restrictive for all to authenticated
    using (public.is_role('admin') or public.is_role('back_office')) with check (public.is_role('admin') or public.is_role('back_office'))`);
  await as('authenticated', U.backOffice);
  assert.equal(await readable('select config from public.crm_integrations'), 0);
  await as('authenticated', U.admin);
  assert.equal(await readable('select config from public.crm_integrations'), 8);
});
