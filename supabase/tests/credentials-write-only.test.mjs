// The real phase6/27 (write-only credentials, validated permission overrides) on embedded Postgres (PGlite), on top of the repository's base migrations, the core
// release files and phase6/25. LOCAL only: real Supabase Auth, PostgREST and Storage are not involved.
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


const M627 = '../staged-migrations/phase6/27_credentials_write_only.sql', R627 = '../../docs/ops/rollback_phase6_27_credentials_write_only.sql';
const VALUE = 'sk-live-THIS-VALUE-MUST-NEVER-REACH-A-BROWSER';
const keysAs = async (uid) => { await as(uid); const r = await run('select setting_key from public.crm_settings order by 1'); await su(); return r.ok ? r.rows.map((x) => x.setting_key) : null; };

test('setup: phase6/25, then the credentials and settings the production CRM holds', async () => {
  await su();
  await db.exec(read(M625));
  await db.exec(`insert into public.crm_settings (setting_key, setting_value) values ('SERPAPI_API_KEY', '"${VALUE}"'), ('RESEND_API_KEY', '"re_abc"'), ('TWILIO_AUTH_TOKEN', '""'),
    ('VAPI_API_KEY', '"v"'), ('role_permissions', '{}'), ('theme', '"navy"'), ('arrival_prompt_radius_m', '75') on conflict (setting_key) do update set setting_value = excluded.setting_value`);
});

test('BEFORE phase6/27 the Admin session reads the raw credentials (the finding)', async () => {
  const seen = await keysAs(ADMIN);
  assert.ok(seen.includes('SERPAPI_API_KEY') && seen.includes('RESEND_API_KEY'));
  await as(ADMIN);
  assert.equal((await one("select setting_value::text v from public.crm_settings where setting_key = 'SERPAPI_API_KEY'"))[0].v.includes('THIS-VALUE'), true);
  await su();
});

test('apply phase6/27 twice (idempotent)', async () => {
  await su();
  await db.exec(read(M627)); await db.exec(read(M627));
});

test('AFTER: no browser session reads a credential row, not even the Admin; ordinary settings still work', async () => {
  const admin = await keysAs(ADMIN);
  for (const k of ['SERPAPI_API_KEY', 'RESEND_API_KEY', 'TWILIO_AUTH_TOKEN', 'VAPI_API_KEY']) assert.ok(!admin.includes(k), k);
  assert.ok(admin.includes('theme') && admin.includes('arrival_prompt_radius_m') && admin.includes('role_permissions'));
  assert.deepEqual(await keysAs(FIELD), [], 'a Sales Agent reads no setting');
  await as(ADMIN);
  assert.equal((await run("select 1 from public.crm_settings where setting_key = 'SERPAPI_API_KEY'")).rows.length, 0);
  await su();
});

test('AFTER: direct table writes cannot touch a credential or the permission model, even for the Admin; ordinary settings can be written', async () => {
  await as(ADMIN);
  const upd = async (sql) => { const r = await run(sql); return r.ok ? r.rows.length : 'refused'; };
  assert.equal(await upd("update public.crm_settings set setting_value = '\"x\"' where setting_key = 'RESEND_API_KEY' returning 1"), 0);
  assert.equal(await upd("update public.crm_settings set setting_value = '{\"sales_agent\":[\"pii.export\"]}' where setting_key = 'role_permissions' returning 1"), 0);
  assert.equal(await upd("insert into public.crm_settings (setting_key, setting_value) values ('NEW_API_KEY', '\"x\"') returning 1"), 'refused');
  assert.equal(await upd("insert into public.crm_settings (setting_key, setting_value) values ('role_permissions', '{}') on conflict (setting_key) do update set setting_value = excluded.setting_value returning 1"), 'refused');
  assert.equal(await upd("update public.crm_settings set setting_value = '100' where setting_key = 'arrival_prompt_radius_m' returning 1"), 1);
  await as(FIELD);
  assert.equal(await upd("update public.crm_settings set setting_value = '1' where setting_key = 'arrival_prompt_radius_m' returning 1"), 0, 'a Sales Agent changes nothing');
  await su();
  assert.ok((await one("select setting_value::text v from public.crm_settings where setting_key = 'RESEND_API_KEY'"))[0].v.includes('re_abc'), 'the stored credential is untouched');
  assert.equal((await one("select setting_value::text v from public.crm_settings where setting_key = 'role_permissions'"))[0].v, '{}');
});

test('crm_credential_status tells the Admin what is configured, and never the value', async () => {
  await as(ADMIN);
  const rows = (await one('select setting_key, configured from public.crm_credential_status()'));
  const by = Object.fromEntries(rows.map((r) => [r.setting_key, r.configured]));
  assert.equal(by.SERPAPI_API_KEY, true); assert.equal(by.TWILIO_AUTH_TOKEN, false, 'an empty value is not configured');
  assert.ok(!JSON.stringify(rows).includes('THIS-VALUE'));
  assert.ok(!('theme' in by), 'only credential settings are listed');
  await as(FIELD); assert.equal((await run('select * from public.crm_credential_status()')).ok, false);
  await db.exec('reset role'); await db.exec('set role anon'); assert.equal((await run('select * from public.crm_credential_status()')).ok, false);
  await su();
});

test('crm_set_credential: the Admin sets and clears a credential; everyone else, and every non-credential key, is refused; nothing returns a value', async () => {
  await as(ADMIN);
  const set = await run("select public.crm_set_credential('INFOBIP_API_KEY', 'new-infobip-secret') r");
  assert.ok(set.ok, set.err); assert.ok(!set.rows[0].r, 'returns nothing');
  assert.equal((await one("select configured from public.crm_credential_status() where setting_key = 'INFOBIP_API_KEY'"))[0].configured, true);
  for (const bad of ["role_permissions", "theme", "x", "bad key", "KEY; drop table x"]) assert.equal((await run("select public.crm_set_credential($1, 'v')", [bad])).ok, false, bad);
  assert.equal((await run("select public.crm_set_credential('RESEND_API_KEY', $1)", ['y'.repeat(4001)])).ok, false, 'too long');
  assert.ok((await run("select public.crm_set_credential('INFOBIP_API_KEY', '')")).ok);
  assert.equal((await one("select configured from public.crm_credential_status() where setting_key = 'INFOBIP_API_KEY'"))[0].configured, false, 'cleared');
  await as(FIELD); assert.equal((await run("select public.crm_set_credential('RESEND_API_KEY', 'attack')")).ok, false);
  await db.exec('reset role'); await db.exec('set role anon'); assert.equal((await run("select public.crm_set_credential('RESEND_API_KEY', 'attack')")).ok, false);
  await su();
  assert.ok((await one("select setting_value::text v from public.crm_settings where setting_key = 'RESEND_API_KEY'"))[0].v.includes('re_abc'));
});

test('the server side still reads the value (Edge Functions use the service role), and the audit keeps the key name, never the value', async () => {
  await su();
  await db.exec("set role service_role");
  assert.ok((await one("select setting_value::text v from public.crm_settings where setting_key = 'SERPAPI_API_KEY'"))[0].v.includes('THIS-VALUE'));
  await su();
  await as(ADMIN); await run("select public.crm_set_credential('VAPI_API_KEY', 'rotated-vapi-value')"); await su();
  const audit = await one("select actor_id, note, coalesce(after::text, '') a from public.staff_admin_audit where action = 'credential_set' order by created_at");
  assert.ok(audit.length >= 2 && audit.every((r) => r.actor_id === ADMIN));
  assert.ok(audit.some((r) => r.note === 'VAPI_API_KEY'));
  assert.ok(!JSON.stringify(audit).includes('rotated-vapi-value') && !JSON.stringify(audit).includes('new-infobip-secret'));
});

test('crm_set_role_permissions: only the Admin, only the Sales Agent type, only known capabilities', async () => {
  await as(ADMIN);
  assert.ok((await run(`select public.crm_set_role_permissions('{"sales_agent": ["crm.read.assigned", "case.update.sales"]}'::jsonb)`)).ok);
  assert.equal((await one("select setting_value::text v from public.crm_settings where setting_key = 'role_permissions'"))[0].v.replace(/\s/g, ''), '{"sales_agent":["crm.read.assigned","case.update.sales"]}');
  for (const bad of ['{"admin": []}', '{"manager": ["crm.read.all"]}', '{"field_sales": []}', '{"sales_agent": ["root.access"]}', '{"sales_agent": "pii.export"}', '[]', '"x"', 'null']) {
    assert.equal((await run('select public.crm_set_role_permissions($1::jsonb)', [bad])).ok, false, bad);
  }
  await as(FIELD); assert.equal((await run(`select public.crm_set_role_permissions('{"sales_agent": ["pii.export"]}'::jsonb)`)).ok, false);
  await su();
  assert.ok((await one("select setting_value::text v from public.crm_settings where setting_key = 'role_permissions'"))[0].v.includes('crm.read.assigned'), 'the valid value survived every refused attempt');
  assert.equal((await one("select count(*)::int n from public.staff_admin_audit where action = 'role_permissions_set'"))[0].n, 1);
});

test('the capability list in the function equals the one the Edge Functions use', () => {
  const sql = read(M627); const ts = readFileSync(path('../functions/_shared/permissions.ts'), 'utf8');
  const fromTs = [...ts.slice(ts.indexOf('export const CAPABILITIES'), ts.indexOf('] as const')).matchAll(/"([a-z.]+)"/g)].map((m) => m[1]).sort();
  const start = sql.indexOf('v_known text[] := array[') + 'v_known text[] := array['.length;
  const block = sql.slice(start, sql.indexOf('];', start));
  const fromSql = [...block.matchAll(/'([a-z.]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(fromSql, fromTs);
});

test('rollback restores the previous Admin access, removes the functions, and the migration applies again', async () => {
  await su();
  await db.exec(read(R627));
  assert.ok((await keysAs(ADMIN)).includes('SERPAPI_API_KEY'));
  assert.equal((await one("select count(*)::int n from pg_proc where proname in ('crm_credential_status', 'crm_set_credential', 'crm_set_role_permissions')"))[0].n, 0);
  await db.exec(read(M627));
  assert.ok(!(await keysAs(ADMIN)).includes('SERPAPI_API_KEY'));
});
