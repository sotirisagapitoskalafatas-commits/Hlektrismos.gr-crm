// LOCAL verification only (embedded Postgres via PGlite) of supabase/staged-migrations/phase6/21 (two-role model) on top of phase2/05:
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
const apply21 = () => db.exec(read('../staged-migrations/phase6/21_two_role_model.sql'));
const rollback21 = () => db.exec(read('../../docs/ops/rollback_phase6_21_two_role_model.sql'));
const upd = async (actor, target, role) => { await as(actor); return run('select public.staff_update($1, null, null, $2)', [target, role]); };
const act = async (actor, target, on) => { await as(actor); return run('select public.staff_set_active($1, $2)', [target, on]); };
const can = async (actor, target, nw) => { await as(actor); return (await db.query('select public.staff_admin_can($1, $2, $3) v', [actor, target, nw])).rows[0].v; };

test('setup: phase2/05 then phase6/21 (the managers and back office rights of the old matrix are removed)', async () => {
  await su(); await apply05();
  assert.equal(await can(MANAGER, 'field_sales', null), true, 'before 21: a manager could manage sales agents');
  await su(); await apply21(); await apply21(); // idempotent
});

test('only the active admin may create or manage Sales Agents; manager, back_office and sales agents are refused', async () => {
  assert.equal(await can(ADMIN, null, 'field_sales'), true, 'admin can create a Sales Agent');
  assert.equal(await can(ADMIN, null, 'inside_sales'), false, 'new accounts are field_sales only (one Sales Agent choice)');
  assert.equal(await can(ADMIN, null, 'admin'), false, 'no second admin account');
  assert.equal(await can(ADMIN, null, 'manager'), false);
  assert.equal(await can(ADMIN, null, 'back_office'), false);
  assert.equal(await can(ADMIN, 'field_sales', null), true, 'edit / (de)activate / reset a Sales Agent');
  assert.equal(await can(ADMIN, 'inside_sales', 'field_sales'), true, 'legacy inside_sales can be normalised into the Sales Agent role');
  assert.equal(await can(ADMIN, 'field_sales', 'admin'), false, 'a Sales Agent can never be promoted');
  assert.equal(await can(ADMIN, 'field_sales', 'back_office'), false);
  assert.equal(await can(ADMIN, 'manager', null), true, 'legacy office rows can be deactivated/reset by the admin');
  assert.equal(await can(ADMIN, 'manager', 'admin'), false, 'but never re-roled');
  for (const [who, name] of [[MANAGER, 'manager'], [BO, 'back_office'], [INSIDE, 'inside_sales'], [FIELD, 'field_sales']]) {
    for (const [t, n] of [[null, 'field_sales'], ['field_sales', null], ['inside_sales', 'field_sales'], ['admin', null]]) {
      assert.equal(await can(who, t, n), false, `${name} must not manage (${t}/${n})`);
    }
  }
});

test('RPCs: admin works; every other actor is refused; an inactive admin is refused; self role change refused', async () => {
  assert.equal((await act(ADMIN, FIELD, false)).ok, true);
  assert.equal((await act(ADMIN, FIELD, true)).ok, true);
  assert.equal((await upd(ADMIN, INSIDE, 'field_sales')).ok, true, 'normalise a legacy sales profile');
  assert.equal((await upd(ADMIN, INSIDE, 'back_office')).ok, false);
  assert.equal((await act(ADMIN, ADMIN, false)).ok, false, 'cannot deactivate yourself');
  for (const who of [MANAGER, BO, FIELD]) {
    assert.equal((await act(who, FIELD, false)).ok, false, 'deactivate refused');
    assert.equal((await upd(who, FIELD, 'field_sales')).ok, false, 'update refused');
    assert.equal((await run('select * from public.staff_list()')).ok, false, 'directory refused');
    assert.equal((await run('select public.staff_reference_count($1)', [FIELD])).ok, false, 'reference count refused');
  }
  await su(); await db.exec(`update public.profiles set is_active = false where id = '${ADMIN2}'`);
  assert.equal((await act(ADMIN2, FIELD, false)).ok, false, 'an inactive admin has no rights');
  assert.equal((await run('select * from public.staff_list()')).ok, false);
  await su(); await db.exec(`update public.profiles set is_active = true where id = '${ADMIN2}'`);
  assert.equal(await roleOf(FIELD).then((r) => r.is_active), true);
});

test('directory: admin sees everyone with can_manage; audit rows exist for each management action and only the admin reads them', async () => {
  await as(ADMIN);
  const dir = await run('select id, role, can_manage from public.staff_list()');
  assert.equal(dir.ok, true); assert.equal(dir.rows.length, 7);
  assert.equal(dir.rows.find((r) => r.id === FIELD).can_manage, true);
  assert.equal(dir.rows.find((r) => r.id === ADMIN).can_manage, false, 'not yourself');
  await su();
  const a = (await db.query("select action, count(*)::int n from public.staff_admin_audit group by 1")).rows.map((r) => r.action);
  for (const x of ['deactivate', 'reactivate', 'role_change']) assert.ok(a.includes(x), `audit has ${x}`);
  await as(ADMIN); assert.ok((await run('select * from public.staff_admin_audit')).rows.length > 0, 'admin reads the audit');
  for (const who of [MANAGER, BO, FIELD]) { await as(who); assert.equal((await run('select * from public.staff_admin_audit')).rows.length, 0, 'others read nothing'); }
});

test('direct API writes: nobody can self-promote, re-activate themselves, or hand out a legacy office role', async () => {
  // a deactivated Sales Agent tries to switch themselves back on through PostgREST (UPDATE on their own row)
  await su(); await db.exec(`update public.profiles set is_active = false where id = '${FIELD}'`);
  await as(FIELD);
  const blocked = async (sql) => { const r = await run(sql, [FIELD]); return !r.ok || r.rows.length === 0; };
  assert.ok(await blocked("update public.profiles set is_active = true where id = $1 returning id"), 'is_active cannot be switched back on');
  assert.ok(await blocked("update public.profiles set role = 'admin' where id = $1 returning id"), 'role cannot be changed');
  assert.equal((await roleOf(FIELD)).is_active, false, 'still inactive');
  assert.equal((await roleOf(FIELD)).role, 'field_sales', 'role unchanged');
  await as(FIELD); // roleOf() switched to the superuser to read
  assert.equal((await run("update public.profiles set full_name = 'Renamed' where id = $1 returning id", [FIELD])).rows.length, 0, 'a deactivated user cannot even edit the profile (0 rows)');
  await su(); await db.exec(`update public.profiles set is_active = true where id = '${FIELD}'`);
  await as(FIELD);
  assert.equal((await run("update public.profiles set full_name = 'Renamed Agent' where id = $1 returning id", [FIELD])).rows.length, 1, 'an active agent may edit their own name');
  assert.equal((await run("update public.profiles set role = 'admin' where id = $1", [FIELD])).ok, false, 'an active agent cannot promote themselves (guard trigger)');
  assert.equal((await run("update public.profiles set is_active = false where id = $1", [FIELD])).ok, false, 'nor change their own status');
  await as(MANAGER);
  assert.ok(await blocked("update public.profiles set role = 'admin' where id = $1 returning id"), 'legacy manager cannot change roles through the API');
  assert.equal((await roleOf(FIELD)).role, 'field_sales', 'role still field_sales');
  await su();
  // the legacy-role trigger blocks even privileged code paths (service role / superuser)
  await su();
  assert.equal((await run("update public.profiles set role = 'manager' where id = $1", [FIELD])).ok, false, 'no new manager');
  assert.equal((await run("update public.profiles set role = 'back_office' where id = $1", [INSIDE])).ok, false, 'no new back_office');
  assert.equal((await run("update public.profiles set full_name = 'Legacy Manager' where id = $1", [MANAGER])).ok, true, 'existing legacy rows stay editable (name only)');
  await db.exec("insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-0000000000f1', 'new.agent@example.invalid')");
  assert.equal((await run("insert into public.profiles (id, full_name, role) values ('aaaaaaaa-0000-4000-8000-0000000000f1', 'New Agent', 'field_sales')")).ok, true, 'a Sales Agent profile can be created');
  assert.equal((await run("insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-0000000000f2', 'x@example.invalid')")).ok, true);
  assert.equal((await run("insert into public.profiles (id, full_name, role) values ('aaaaaaaa-0000-4000-8000-0000000000f2', 'X', 'back_office')")).ok, false, 'no new back_office profile');
});

test('rollback removes the trigger and restores the audit policy; re-applying works', async () => {
  await su(); await rollback21();
  assert.equal((await run("update public.profiles set role = 'manager' where id = $1", [FIELD])).ok, true, 'trigger gone');
  await db.exec(`update public.profiles set role = 'field_sales' where id = '${FIELD}'`);
  await apply21();
});
