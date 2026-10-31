// LOCAL verification only (embedded Postgres via PGlite) — NOT staging or production evidence.
// Reproduces the ordered rollout state for crm_integrations: original table (permissive policy, broad grants) →
// phase1/01 → phase1/18 → phase2/05 → phase6/21 → phase6/22, then checks every account category.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const U = {
  admin: 'aaaaaaaa-0000-4000-8000-000000000001',
  fieldSales: 'aaaaaaaa-0000-4000-8000-000000000003',
  inactiveSales: 'aaaaaaaa-0000-4000-8000-000000000004',
  backOffice: 'aaaaaaaa-0000-4000-8000-000000000005',
  manager: 'aaaaaaaa-0000-4000-8000-000000000006',
};

async function as(role, uid = null) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (role) await db.exec(`set role ${role}`);
}
async function can(sql) { try { const r = await db.query(sql); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }
const seen = async (sql) => { const r = await can(sql); return r.ok ? r.rows.length : 0; };
const opts = async () => { await as(null); return (await db.query("select reloptions from pg_class where oid='public.crm_integrations_status'::regclass")).rows[0].reloptions ?? []; };

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('role', true), ''), 'none') $$;
    create table public.profiles (
      id uuid primary key references auth.users(id), full_name text not null default '', role text not null default 'inside_sales',
      phone text, avatar_url text, timezone text, language text, availability_status text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      is_active boolean not null default true, organization_id uuid,
      constraint profiles_role_check check (role in ('admin','manager','inside_sales','field_sales','back_office')));
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    create function public.crm_current_organization_id() returns uuid language sql stable as $$ select null::uuid $$;
    alter table public.profiles enable row level security;
    create policy "profiles read own or staff" on public.profiles for select to authenticated using (auth.uid() = id or public.is_staff());
    create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
    create table public.hlektrismos_leads (id uuid primary key default gen_random_uuid(), assigned_to uuid, consent boolean, age_confirmed boolean);
    create table public.crm_settings (setting_key text primary key, setting_value jsonb, category text, description text, updated_at timestamptz default now());
    alter table public.crm_settings enable row level security;
    create policy "crm_settings_admin_all" on public.crm_settings for all using (public.is_role('admin') or public.is_role('manager')) with check (public.is_role('admin') or public.is_role('manager'));
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  `);
  await db.exec(read('../migrations/20260818160000_create_integrations_table.sql'));
  await db.exec(`
    insert into auth.users (id, email) values ${Object.values(U).map((id, i) => `('${id}','u${i}@example.invalid')`).join(',')};
    insert into public.profiles (id, full_name, role, is_active) values
      ('${U.admin}','Admin','admin',true),('${U.fieldSales}','Agent','field_sales',true),('${U.inactiveSales}','Inactive agent','field_sales',false),
      ('${U.backOffice}','Legacy BO','back_office',true),('${U.manager}','Legacy manager','manager',true);
    update public.crm_integrations set config = '{"token":"SECRET-PLACEHOLDER"}'::jsonb where id = 'gmail';
    grant all on all tables in schema public to anon, authenticated, service_role;
  `);
});

const ORDER = [
  '../staged-migrations/phase1/01_rls_hardening.sql',
  '../staged-migrations/phase1/18_live_api_privilege_hardening.sql',
  '../staged-migrations/phase2/05_staff_admin_and_role_preview.sql',
  '../staged-migrations/phase6/21_two_role_model.sql',
  '../staged-migrations/phase6/22_crm_integrations_status_invoker.sql',
];

test('BEFORE phase6/22 the view is owner-rights: any staff member reads it through the table-owner bypass (the finding)', async () => {
  await as(null);
  for (const f of ORDER.slice(0, 4)) await db.exec(read(f));
  assert.ok(!(await opts()).includes('security_invoker=true'));
  await as('authenticated', U.fieldSales);
  assert.equal(await seen('select * from public.crm_integrations_status'), 8, 'a Sales Agent sees the status through the bypass');
});

test('apply phase6/22 twice (idempotent); the view is security_invoker', async () => {
  await as(null);
  for (let i = 0; i < 2; i++) await db.exec(read(ORDER[4]));
  assert.ok((await opts()).includes('security_invoker=true'));
});

test('AFTER: only the active admin sees integration status; config is never exposed', async () => {
  await as('authenticated', U.admin);
  const a = await can('select * from public.crm_integrations_status');
  assert.equal(a.rows.length, 8);
  assert.deepEqual(Object.keys(a.rows[0]).sort(), ['connected', 'id', 'name', 'updated_at']);
  assert.ok(!JSON.stringify(a.rows).includes('SECRET-PLACEHOLDER'));
});

test('AFTER: active Sales Agent, inactive agent, legacy back_office, legacy manager and anonymous see nothing', async () => {
  for (const [name, uid] of Object.entries(U)) {
    if (name === 'admin') continue;
    await as('authenticated', uid);
    assert.equal(await seen('select * from public.crm_integrations_status'), 0, `${name}: status view`);
    assert.equal(await seen('select config from public.crm_integrations'), 0, `${name}: table config`);
    const w = await can("update public.crm_integrations set connected = true returning id");
    assert.ok(!w.ok || w.rows.length === 0, `${name} must not update`);
  }
  await as('anon');
  assert.equal(await seen('select * from public.crm_integrations_status'), 0);
  assert.equal(await seen('select config from public.crm_integrations'), 0);
});

test('no SECURITY DEFINER function was added by phase6/22', async () => {
  await as(null);
  const r = await db.query("select proname from pg_proc where pronamespace='public'::regnamespace and proname like 'crm_integrations_status%'");
  assert.equal(r.rows.length, 0);
});

test('rollback is safe: it keeps security_invoker = true and the confidentiality results are unchanged (idempotent)', async () => {
  await as(null);
  for (let i = 0; i < 2; i++) await db.exec(read('../../docs/ops/rollback_phase6_22_crm_integrations_status_invoker.sql'));
  assert.ok((await opts()).includes('security_invoker=true'));
  await as('authenticated', U.fieldSales);
  assert.equal(await seen('select * from public.crm_integrations_status'), 0);
  await as('authenticated', U.admin);
  assert.equal(await seen('select * from public.crm_integrations_status'), 8);
});
