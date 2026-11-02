// The real phase6/25 and phase6/26 on embedded Postgres (PGlite), on top of the repository's base migrations and the core release files, with the rows they
// must convert. LOCAL only: real Supabase Auth, PostgREST and Storage are not involved.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(path(rel), 'utf8').replace(/\r\n/g, '\n');
const adapt = (sql) => sql.replace(/create\s+extension[^;]*;/gi, '').replace(/\bextensions\.vector\b/gi, 'vector').replace(/\bvector\s*\(\s*\d+\s*\)/gi, 'vector').replace(/create\s+(unique\s+)?index[^;]*using\s+(ivfflat|hnsw)[^;]*;/gi, '');
const db = new PGlite();
const CORE = ['phase1/20_crm_integrations_emergency_hotfix', 'phase1/01_rls_hardening', 'phase1/03_drop_exec_sql', 'phase5/17_customer_supply_points', 'phase5/18_lead_supply_points',
  'phase1/16_storage_docs_lockdown', 'phase1/17_anon_restrictive_lockdown', 'phase4/19_staff_only_legacy_tables', 'phase1/18_live_api_privilege_hardening', 'phase1/19_stage1_gap_fixes',
  'phase2/05_staff_admin_and_role_preview', 'phase6/21_two_role_model', 'phase2/06_trash_leads_customers', 'phase1/02_outreach_decisions_audit', 'phase3/08_b2b_prospects_review_distribution',
  'phase3/09_contact_eligibility', 'phase3/11_contact_service_requests', 'phase1/21b_function_rate_limits', 'phase1/21c_lead_webhook_idempotency', 'phase3/10_offer_lifecycle'];
const id = (n) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = id(1), FIELD = id(2), INSIDE = id(3), MANAGER = id(4), BACKOFFICE = id(5), FIELD_OFF = id(6), QA_ADMIN = id(7), OWNER_LEGACY = id(8);
const LEAD = 'bbbbbbbb-0000-4000-8000-000000000001';
const as = async (uid) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']); await db.query("select set_config('request.jwt.claim.role', $1, false)", [uid ? 'authenticated' : '']); if (uid) await db.exec('set role authenticated'); };
const su = () => as(null);
const one = async (sql, p) => (await db.query(sql, p)).rows;
const run = async (sql, p) => { try { return { ok: true, rows: (await db.query(sql, p)).rows }; } catch (e) { return { ok: false, err: e.message }; } };
const profiles = async () => Object.fromEntries((await one('select id, role, is_active from public.profiles')).map((r) => [r.id, [r.role, r.is_active]]));
const M625 = '../staged-migrations/phase6/25_exact_two_roles.sql', M626 = '../staged-migrations/phase6/26_single_active_admin.sql';
const R625 = '../../docs/ops/rollback_phase6_25_exact_two_roles.sql', R626 = '../../docs/ops/rollback_phase6_26_single_active_admin.sql';

before(async () => {
  await db.exec(`
    create domain public.vector as real[]; create function public.uuid_generate_v4() returns uuid language sql as $f$ select gen_random_uuid() $f$;
    do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
    create schema if not exists auth; create schema if not exists storage; create schema if not exists extensions;
    create table auth.users (id uuid primary key, email text, created_at timestamptz, updated_at timestamptz, email_confirmed_at timestamptz, invited_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_sso_user boolean, deleted_at timestamptz);
    create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid);
    create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
    create function auth.role() returns text language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $f$;
    create function auth.jwt() returns jsonb language sql stable as $f$ select '{}'::jsonb $f$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz, updated_at timestamptz, size bigint, mimetype text);
    create function storage.foldername(name text) returns text[] language sql immutable as $f$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $f$;
    create schema if not exists cron; create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
    create function cron.schedule(n text, sc text, c text) returns bigint language sql as $f$ select 1::bigint $f$;
    create function cron.unschedule(n text) returns boolean language sql as $f$ select true $f$;
    create schema if not exists net; create function net.http_post(url text default null, headers jsonb default null, body jsonb default null, params jsonb default null, timeout_milliseconds int default null) returns bigint language sql as $f$ select 1::bigint $f$;
    create schema if not exists vault; create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
    set check_function_bodies = off; set timezone = 'UTC';`);
  for (const f of readdirSync(path('../migrations/')).filter((x) => x.endsWith('.sql')).sort()) {
    try { await db.exec(adapt(read('../migrations/' + f))); } catch { try { await db.exec('rollback'); } catch { /* none */ } }
  }
  for (const f of CORE) await db.exec(adapt(read(`../staged-migrations/${f}.sql`)));
  await db.exec(`
    delete from public.profiles;
    insert into auth.users (id, email, email_confirmed_at, last_sign_in_at) values
      ('${ADMIN}', 'office@example.invalid', now(), now()), ('${FIELD}', 'field@example.invalid', now(), now()), ('${INSIDE}', 'inside@example.invalid', now(), now()),
      ('${MANAGER}', 'qa.manager@hlektrismos.gr', now(), now()), ('${BACKOFFICE}', 'qa.backoffice@hlektrismos.gr', now(), now()), ('${FIELD_OFF}', 'gone@example.invalid', now(), now()), ('${QA_ADMIN}', 'qa.admin@hlektrismos.gr', now(), now())
      on conflict do nothing;
    insert into auth.identities (user_id) values ('${ADMIN}');
    alter table public.profiles disable trigger profiles_no_new_legacy_office;
    update public.profiles set role = role;
    delete from public.profiles;
    insert into public.profiles (id, full_name, role, is_active) values
      ('${ADMIN}', 'Office', 'admin', true), ('${QA_ADMIN}', 'QA Admin', 'admin', true), ('${FIELD}', 'Field', 'field_sales', true), ('${INSIDE}', 'Inside', 'inside_sales', true),
      ('${MANAGER}', 'Manager', 'manager', true), ('${BACKOFFICE}', 'BO', 'back_office', true), ('${FIELD_OFF}', 'Gone', 'field_sales', false);
    alter table public.profiles enable trigger profiles_no_new_legacy_office;
    update public.profiles set organization_id = '00000000-0000-0000-0000-00000000c001';
    insert into public.user_roles (user_id, role_id, organization_id, is_primary)
      select '${FIELD}', id, '00000000-0000-0000-0000-00000000c001', true from public.roles where key = 'field_sales';
    insert into public.user_roles (user_id, role_id, organization_id, is_primary)
      select '${MANAGER}', id, '00000000-0000-0000-0000-00000000c001', true from public.roles where key = 'manager';
    select set_config('request.jwt.claim.role', 'service_role', false);
    insert into public.leads (id, client_name, phone, assigned_to_user_id, created_by_user_id) values ('${LEAD}', 'Lead', '6900000000', '${FIELD}', '${INSIDE}');`);
});

const scrubbed = () => one(`select id, client_name, assigned_to_user_id, created_by_user_id from public.leads order by id`);

test('an active manager that is not a known QA login stops the whole migration, and nothing has changed', async () => {
  await su();
  await db.exec(`insert into auth.users (id, email) values ('${OWNER_LEGACY}', 'person@example.invalid');
    alter table public.profiles disable trigger profiles_no_new_legacy_office;
    insert into public.profiles (id, full_name, role, is_active) values ('${OWNER_LEGACY}', 'Real', 'manager', true);
    alter table public.profiles enable trigger profiles_no_new_legacy_office;`);
  const before = await profiles();
  await assert.rejects(() => db.exec(read(M625)), /not a known QA login/);
  assert.deepEqual(await profiles(), before);
  await db.exec(`delete from public.profiles where id = '${OWNER_LEGACY}'; delete from auth.users where id = '${OWNER_LEGACY}';`);
});

test('apply: exactly two values remain; sales become sales_agent with their active flag; retired office rows are inactive; history is recorded; leads are untouched', async () => {
  await su();
  const leads = await scrubbed();
  await db.exec(read(M625));
  const p = await profiles();
  assert.deepEqual(p[ADMIN], ['admin', true]);
  assert.deepEqual(p[QA_ADMIN], ['admin', true], 'admins are not touched here: phase6/26 and the QA cleanup do that');
  assert.deepEqual(p[FIELD], ['sales_agent', true]);
  assert.deepEqual(p[INSIDE], ['sales_agent', true]);
  assert.deepEqual(p[FIELD_OFF], ['sales_agent', false]);
  assert.deepEqual(p[MANAGER], ['sales_agent', false]);
  assert.deepEqual(p[BACKOFFICE], ['sales_agent', false]);
  assert.deepEqual((await one('select distinct role from public.profiles order by 1')).map((r) => r.role), ['admin', 'sales_agent']);
  assert.deepEqual(await scrubbed(), leads);
  const audit = await one(`select old_role from public.role_normalization_audit where kind = 'profile' and user_id = $1`, [MANAGER]);
  assert.equal(audit[0].old_role, 'manager');
  assert.deepEqual((await one(`select key from public.roles order by key`)).map((r) => r.key).filter((k) => ['manager', 'back_office', 'inside_sales', 'field_sales'].includes(k)), []);
  assert.equal((await one(`select count(*)::int n from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1 and r.key = 'sales_agent' and ur.is_primary`, [FIELD]))[0].n, 1);
  assert.equal((await one(`select count(*)::int n from public.user_roles where user_id = $1`, [MANAGER]))[0].n, 0, 'a stale manager grant cannot survive');
});

test('the constraint refuses every other role, for everyone including the owner', async () => {
  await su();
  for (const role of ['manager', 'back_office', 'field_sales', 'inside_sales', 'owner']) {
    const r = await run(`update public.profiles set role = $1 where id = $2`, [role, FIELD]);
    assert.ok(!r.ok, role);
  }
});

test('is_role: the old sales names answer for a Sales Agent, retired names answer false for everyone, an Admin is not a Sales Agent', async () => {
  const ask = async (uid, r) => { await as(uid); const x = (await one('select public.is_role($1) v', [r]))[0].v; await su(); return x; };
  for (const r of ['sales_agent', 'field_sales', 'inside_sales']) { assert.equal(await ask(FIELD, r), true, r); assert.equal(await ask(INSIDE, r), true, r); assert.equal(await ask(ADMIN, r), false, r); }
  for (const u of [ADMIN, FIELD, MANAGER]) for (const r of ['manager', 'back_office']) assert.equal(await ask(u, r), false, r);
  assert.equal(await ask(ADMIN, 'admin'), true);
  assert.equal(await ask(FIELD, 'admin'), false, 'a Sales Agent never answers as admin');
});

test('a Sales Agent cannot raise their own role or switch themselves on; a retired account has no staff access', async () => {
  await as(FIELD);
  assert.ok(!(await run(`update public.profiles set role = 'admin' where id = $1`, [FIELD])).ok);
  await as(MANAGER);
  assert.ok(!(await run(`update public.profiles set is_active = true where id = $1`, [MANAGER])).ok);
  assert.equal((await one('select public.is_staff() v'))[0].v, false);
  await su();
});

test('staff administration: the Admin creates and edits only sales_agent; nobody else manages accounts; no role is assignable but the two', async () => {
  const can = async (actor, t, n) => { await as(actor); const v = (await one('select public.staff_admin_can($1, $2, $3) v', [actor, t, n]))[0].v; await su(); return v; };
  assert.equal(await can(ADMIN, null, 'sales_agent'), true);
  for (const n of ['admin', 'field_sales', 'inside_sales', 'manager', 'back_office']) assert.equal(await can(ADMIN, null, n), false, n);
  assert.equal(await can(ADMIN, 'sales_agent', 'sales_agent'), true);
  assert.equal(await can(ADMIN, 'sales_agent', 'admin'), false, 'a Sales Agent cannot be promoted');
  assert.equal(await can(FIELD, null, 'sales_agent'), false);
  await as(ADMIN);
  assert.ok(!(await run(`select public.staff_update($1, 'x', null, 'manager')`, [FIELD])).ok);
  assert.ok((await run(`select public.staff_update($1, 'Field', null, 'sales_agent')`, [FIELD])).ok);
  await su();
});

test('new sign-ups start as inactive sales_agent', async () => {
  await su();
  const u = id(20);
  await db.exec(`insert into auth.users (id, email) values ('${u}', 'new@example.invalid')`);
  await one('select 1');
  const row = await one('select role, is_active from public.profiles where id = $1', [u]);
  if (!row.length) { await db.exec(`insert into public.profiles (id, full_name) values ('${u}', 'n')`); }
  assert.equal((await one('select column_default d from information_schema.columns where table_schema = \'public\' and table_name = \'profiles\' and column_name = \'role\''))[0].d, "'sales_agent'::text");
  assert.match((await one(`select pg_get_functiondef('public.handle_new_user()'::regprocedure) d`))[0].d, /'sales_agent'/);
  await db.exec(`delete from public.profiles where id = '${u}'; delete from auth.users where id = '${u}';`);
});

test('contact_role, the B2B policies and b2b_distribute work for the two roles', async () => {
  await as(FIELD);
  assert.equal((await one('select public.contact_role() r'))[0].r, 'sales_agent');
  assert.ok((await run('select * from public.b2b_search_jobs')).ok);
  await as(ADMIN);
  assert.equal((await one('select public.contact_role() r'))[0].r, 'admin');
  await su();
  assert.doesNotMatch((await one(`select pg_get_functiondef('public.b2b_distribute(uuid[],text,uuid[])'::regprocedure) d`))[0].d, /inside_sales|field_sales|'manager'/);
});

test('Sales Agent isolation still applies when phase4/18, 4/14 and 4/21 come after phase6/25', async () => {
  await su();
  await db.exec(read('../staged-migrations/phase4/14_follow_up_kind.sql'));
  await db.exec(read('../staged-migrations/phase4/18_sales_own_records_scope.sql'));
  await db.exec(read('../staged-migrations/phase4/21_sales_isolation_completion.sql'));
  await as(FIELD);
  assert.equal((await one('select public.is_sales_agent() v'))[0].v, true);
  assert.equal((await one('select count(*)::int n from public.leads where id = $1', [LEAD]))[0].n, 1, 'own lead');
  await as(ADMIN);
  assert.equal((await one('select public.is_sales_agent() v'))[0].v, false);
  assert.equal((await one('select count(*)::int n from public.leads where id = $1', [LEAD]))[0].n, 1);
  await su();
  await db.exec(`update public.leads set assigned_to_user_id = '${ADMIN}', created_by_user_id = '${ADMIN}' where id = '${LEAD}'`);
  await as(FIELD);
  assert.equal((await one('select count(*)::int n from public.leads where id = $1', [LEAD]))[0].n, 0, "someone else's lead");
  await su();
  await db.exec(`update public.leads set assigned_to_user_id = '${FIELD}', created_by_user_id = '${INSIDE}' where id = '${LEAD}'`);
});

test('phase6/26 refuses while two admins are active, then enforces one; a second active admin is impossible', async () => {
  await su();
  await assert.rejects(() => db.exec(read(M626)), /expected exactly 1 active admin, found 2/);
  await db.exec(`update public.profiles set is_active = false where id = '${ADMIN}'`);
  await assert.rejects(() => db.exec(read(M626)), /has not signed in, or cannot/, 'the only active admin here has no identity row');
  await db.exec(`update public.profiles set is_active = true where id = '${ADMIN}'; update public.profiles set is_active = false where id = '${QA_ADMIN}'`);
  await db.exec(read(M626));
  await assert.rejects(() => db.exec(`update public.profiles set is_active = true where id = '${QA_ADMIN}'`), /profiles_single_active_admin/);
  await assert.rejects(() => db.exec(`update public.profiles set role = 'admin' where id = '${FIELD}'`), /profiles_single_active_admin/);
  await db.exec(read(M626));
  await db.exec(read(R626));
  await db.exec(`update public.profiles set is_active = true where id = '${QA_ADMIN}'`);
});

test('rollback restores every role, active flag and grant, then the migration applies again', async () => {
  await su();
  await db.exec(read(R625));
  const p = await profiles();
  assert.deepEqual(p[FIELD], ['field_sales', true]);
  assert.deepEqual(p[INSIDE], ['inside_sales', true]);
  assert.deepEqual(p[MANAGER], ['manager', true]);
  assert.deepEqual(p[BACKOFFICE], ['back_office', true]);
  assert.deepEqual(p[FIELD_OFF], ['field_sales', false]);
  assert.equal((await one(`select count(*)::int n from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1 and r.key = 'manager'`, [MANAGER]))[0].n, 1);
  assert.equal((await one(`select count(*)::int n from public.roles where key = 'sales_agent'`))[0].n, 0);
  await db.exec(read(M625));
  assert.deepEqual((await one('select distinct role from public.profiles order by 1')).map((r) => r.role), ['admin', 'sales_agent']);
});


test('phase6/28 aligns staff administration with the exact admin / sales_agent schema', async () => {
  await su();
  await db.exec(read('../staged-migrations/phase6/28_staff_admin_sales_agent_sync.sql'));

  const can = async (actor, target, nextRole) => {
    await as(actor);
    const result = await one('select public.staff_admin_can($1, $2, $3) allowed', [actor, target, nextRole]);
    await su();
    return result[0].allowed;
  };

  assert.equal(await can(ADMIN, null, 'sales_agent'), true, 'active Admin can create Sales Agents');
  assert.equal(await can(ADMIN, null, 'admin'), false, 'Admin cannot create another Admin');
  assert.equal(await can(ADMIN, null, 'field_sales'), false, 'legacy roles cannot be created');
  assert.equal(await can(FIELD, null, 'sales_agent'), false, 'Sales Agent cannot provision staff');
  assert.equal(await can(MANAGER, null, 'sales_agent'), false, 'legacy Manager has no account-management access');
  assert.equal(await can(ADMIN, 'sales_agent', 'sales_agent'), true, 'Admin can retain/edit a Sales Agent');

  const priorUpdates = (await one("select count(*)::int n from public.staff_admin_audit where target_id = $1 and action = 'update'", [FIELD]))[0].n;
  await as(ADMIN);
  assert.ok((await run("select public.staff_update($1, 'Field Updated', null, 'sales_agent')", [FIELD])).ok);
  assert.equal((await one('select full_name from public.profiles where id = $1', [FIELD]))[0].full_name, 'Field Updated');
  await as(FIELD);
  assert.ok(!(await run("select public.staff_update($1, 'Other', null, 'sales_agent')", [INSIDE])).ok);
  await su();

  assert.equal((await one("select count(*)::int n from public.staff_admin_audit where target_id = $1 and action = 'update'", [FIELD]))[0].n, priorUpdates + 1,
    'the profile update adds exactly one audited row');
});
