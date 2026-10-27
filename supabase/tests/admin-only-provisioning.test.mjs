// LOCAL verification only (embedded Postgres via PGlite) of supabase/staged-migrations/phase4/17 on top of phase2/05:
// account provisioning is ADMIN-ONLY. Not staging or production verification.
import test, { before as beforeAll } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const ADMIN2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const MANAGER = 'aaaaaaaa-0000-4000-8000-000000000003';
const INSIDE = 'aaaaaaaa-0000-4000-8000-000000000004';
const BO = 'aaaaaaaa-0000-4000-8000-000000000005';
const BO2 = 'aaaaaaaa-0000-4000-8000-000000000006';
const FIELD = 'aaaaaaaa-0000-4000-8000-000000000007';

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }
const roleOf = async (id) => { await su(); return (await db.query('select role, is_active from public.profiles where id = $1', [id])).rows[0]; };

beforeAll(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (
      id uuid primary key references auth.users(id), full_name text not null default '', role text not null default 'inside_sales',
      phone text, avatar_url text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      is_active boolean not null default true, organization_id uuid,
      constraint profiles_role_check check (role in ('admin','manager','inside_sales','field_sales','back_office')));
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    create function public.crm_current_organization_id() returns uuid language sql stable as $$ select null::uuid $$;
    alter table public.profiles enable row level security;
    -- CURRENT definitions (migration 20260910103000, lines 581-586)
    create policy "profiles read own or staff" on public.profiles for select to authenticated using ((auth.uid() = id) or (public.is_staff() and ((organization_id is null) or (organization_id = public.crm_current_organization_id()))));
    create policy "profiles role managed by admin" on public.profiles for update to authenticated using (public.is_role('admin') and ((organization_id is null) or (organization_id = public.crm_current_organization_id()))) with check (public.is_role('admin') and ((organization_id is null) or (organization_id = public.crm_current_organization_id())));
    create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
    create table public.cases (id uuid primary key default gen_random_uuid(), owner_id uuid references public.profiles(id));
    -- crm_settings as created by 20260911040000
    create table public.crm_settings (setting_key text primary key, setting_value jsonb, category text, description text, updated_at timestamptz default now());
    alter table public.crm_settings enable row level security;
    create policy "crm_settings_admin_all" on public.crm_settings for all using (public.is_role('admin') or public.is_role('manager')) with check (public.is_role('admin') or public.is_role('manager'));
    grant select, insert, update, delete on public.crm_settings to anon, authenticated;
    insert into public.crm_settings values ('SERPAPI_KEY', '"sk-PLACEHOLDER"', 'scraper', null), ('b2b_scraper_config', '{"max_results":20}', 'scraper', null), ('role_permissions', '{}', 'security', null);
    grant usage on schema public to anon, authenticated, service_role;
    grant select, insert, update, delete on public.profiles, public.cases to anon, authenticated;
    insert into auth.users (id, email) values
      ('${ADMIN}','qa.admin@hlektrismos.gr'),('${ADMIN2}','second.admin@example.invalid'),('${MANAGER}','qa.manager@hlektrismos.gr'),
      ('${INSIDE}','qa.insidesales@hlektrismos.gr'),('${BO}','qa.backoffice@hlektrismos.gr'),('${BO2}','bo2@example.invalid'),('${FIELD}','qa.fieldsales@hlektrismos.gr');
    insert into public.profiles (id, full_name, role) values
      ('${ADMIN}','QA Admin','admin'),('${ADMIN2}','Second Admin','admin'),('${MANAGER}','QA Manager','manager'),
      ('${INSIDE}','QA Inside','inside_sales'),('${BO}','QA BO','back_office'),('${BO2}','BO Two','back_office'),('${FIELD}','QA Field','field_sales');
    insert into public.cases (owner_id) values ('${INSIDE}'), ('${INSIDE}');
  `);
});


const apply05 = () => db.exec(read('../staged-migrations/phase2/05_staff_admin_and_role_preview.sql'));
const apply17 = () => db.exec(read('../staged-migrations/phase4/17_admin_only_staff_provisioning.sql'));
const apply20 = () => db.exec(read('../staged-migrations/phase4/20_backoffice_sales_agent_provisioning.sql'));
const rollback17 = () => db.exec(read('../../docs/ops/rollback_phase4_17_admin_only_staff_provisioning.sql'));
const upd = async (actor, target, role) => { await as(actor); return run('select public.staff_update($1, null, null, $2)', [target, role]); };
const act = async (actor, target, on) => { await as(actor); return run('select public.staff_set_active($1, $2)', [target, on]); };
const can = async (actor, target, nw) => { await as(actor); return (await db.query('select public.staff_admin_can($1, $2, $3) v', [actor, target, nw])).rows[0].v; };

test('setup: phase2/05 first (managers and back office could manage ops staff — the behaviour being replaced)', async () => {
  await su(); await apply05();
  assert.equal(await can(MANAGER, 'field_sales', null), true, 'phase2/05 matrix lets a manager manage field sales');
  assert.equal(await can(BO, 'back_office', null), true);
});

test('AFTER phase4/17: only an admin may change roles or (de)activate; everyone else is refused', async () => {
  await su(); await apply17();
  // admin: everything
  assert.equal((await upd(ADMIN, FIELD, 'back_office')).ok, true, 'admin changes a role');
  assert.equal((await upd(ADMIN, FIELD, 'field_sales')).ok, true);
  assert.equal((await act(ADMIN, INSIDE, false)).ok, true, 'admin disables an account');
  assert.equal((await act(ADMIN, INSIDE, true)).ok, true, 'admin re-enables it');
  // manager / back office / sales: nothing, not even their old scope
  for (const [who, name] of [[MANAGER, 'manager'], [BO, 'back_office'], [INSIDE, 'inside_sales'], [FIELD, 'field_sales']]) {
    assert.equal((await upd(who, BO2, 'back_office')).ok, false, `${name} cannot edit back office`);
    assert.equal((await upd(who, FIELD, 'inside_sales')).ok, false, `${name} cannot change a role`);
    assert.equal((await act(who, INSIDE, false)).ok, false, `${name} cannot disable an account`);
  }
  assert.equal((await roleOf(FIELD)).role, 'field_sales');
  assert.equal((await roleOf(INSIDE)).is_active, true);
  // nobody else can edit even their own role through the RPC
  assert.equal((await upd(ADMIN, ADMIN, 'manager')).ok, false, 'admin cannot demote themselves');
});

test('the directory tells the UI who can manage: only admins get can_manage = true; the team stays readable', async () => {
  await as(ADMIN);
  const a = await run('select id, can_manage from public.staff_list()');
  assert.equal(a.ok, true); assert.ok(a.rows.some((r) => r.can_manage === true), 'admin can manage others');
  await as(MANAGER);
  const m = await run('select id, can_manage from public.staff_list()');
  assert.equal(m.ok, true, 'manager still sees the team');
  assert.ok(m.rows.length >= 5 && m.rows.every((r) => r.can_manage === false), 'manager sees them but manages nobody');
  await as(INSIDE);
  assert.equal((await run('select * from public.staff_list()')).ok, false, 'sales has no directory');
});

test('rollback restores the phase2/05 matrix; re-applying 17 is idempotent', async () => {
  await su(); await rollback17();
  assert.equal(await can(MANAGER, 'field_sales', null), true);
  await su(); await apply17(); await apply17();
  assert.equal(await can(MANAGER, 'field_sales', null), false);
  assert.equal(await can(ADMIN, 'manager', 'back_office'), true);
  assert.equal(await can(ADMIN2, null, null), false, 'unknown target role is refused (deny by default)');
});

test('the one-line check used in APPLY_ORDER / STAGING_APPLY_SCRIPT tells the two matrices apart', async () => {
  const CHECK = "select position('a.role = ''manager''' in pg_get_functiondef('public.staff_admin_can(uuid,text,text)'::regprocedure)) = 0 as ok";
  await su(); await rollback17();
  assert.equal((await db.query(CHECK)).rows[0].ok, false, 'phase2/05 matrix: not admin-only');
  await apply17();
  assert.equal((await db.query(CHECK)).rows[0].ok, true, 'phase4/17 matrix: admin-only');
});

test('AFTER phase4/20: office roles can provision Sales Agents, Back Office sees that directory only, and sales remain denied', async () => {
  await su(); await apply20(); await apply20(); // idempotent on top of 17
  assert.equal(await can(BO, 'field_sales', null), true, 'Back Office can create/invite Sales Agents');
  assert.equal(await can(BO, 'inside_sales', 'field_sales'), true, 'Back Office can manage legacy sales profiles');
  assert.equal(await can(BO, 'back_office', null), false, 'Back Office cannot create another office account');
  assert.equal(await can(BO, 'admin', 'manager'), false, 'Back Office cannot change privileged accounts');
  assert.equal(await can(ADMIN, null, 'admin'), false, 'Admin cannot create another office account');
  assert.equal(await can(ADMIN, null, 'back_office'), false, 'Admin cannot create a Back Office account');
  assert.equal(await can(ADMIN, 'field_sales', 'back_office'), false, 'Admin cannot promote a Sales Agent into an office role');
  assert.equal(await can(ADMIN, 'manager', null), true, 'Admin may maintain an existing legacy office account without changing its role');
  assert.equal(await can(MANAGER, 'field_sales', null), true, 'legacy manager maps to the effective office group');
  assert.equal(await can(FIELD, 'inside_sales', null), false, 'Sales cannot provision');

  assert.equal((await upd(BO, FIELD, 'inside_sales')).ok, true, 'Back Office can edit a Sales Agent role');
  assert.equal((await act(BO, FIELD, false)).ok, true, 'Back Office can deactivate a Sales Agent');
  assert.equal((await act(BO, FIELD, true)).ok, true, 'Back Office can reactivate a Sales Agent');
  assert.equal((await upd(BO, FIELD, 'back_office')).ok, false, 'Back Office cannot promote a Sales Agent to office');
  assert.equal((await upd(FIELD, BO2, 'field_sales')).ok, false, 'Sales cannot change other users');

  await as(BO);
  const boList = await run('select id, role, can_manage from public.staff_list()');
  assert.equal(boList.ok, true, 'Back Office can load the managed directory');
  assert.ok(boList.rows.length >= 2);
  assert.ok(boList.rows.every(r => ['inside_sales','field_sales'].includes(r.role)), 'Back Office directory contains Sales Agents only');
  assert.ok(boList.rows.some(r => r.can_manage === true), 'Sales accounts display as manageable');
  await as(MANAGER);
  const managerList = await run('select id, role, can_manage from public.staff_list()');
  assert.equal(managerList.ok, true, 'legacy Manager maps to the Back Office directory');
  assert.ok(managerList.rows.every(r => ['inside_sales','field_sales'].includes(r.role)), 'legacy Manager cannot read extra office account rows');
  await as(FIELD);
  assert.equal((await run('select * from public.staff_list()')).ok, false, 'Sales has no staff directory');
});


test('phase4/20 permission helper cannot be used to probe another user role', async () => {
  await as(FIELD);
  const own = await run('select public.staff_admin_can($1, $2, $3) v', [FIELD, 'field_sales', null]);
  assert.equal(own.ok, true);
  assert.equal(own.rows[0].v, false, 'Sales cannot manage self or create accounts');
  const probe = await run('select public.staff_admin_can($1, $2, $3) v', [ADMIN, 'field_sales', null]);
  assert.equal(probe.ok, true, probe.error);
  assert.equal(probe.rows[0].v, false, 'actor id must match auth.uid()');
});
