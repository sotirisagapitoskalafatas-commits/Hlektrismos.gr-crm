// Stage 1 emergency database hardening: end-to-end LOCAL verification (PGlite). This is NOT staging or production.
//
// The database is rebuilt by replaying the REAL supabase/migrations/ chain (helpers/replay-migrations.mjs), then:
//   1. BEFORE: the exploits from the Phase A audit are reproduced against the real policies and functions.
//   2. The whole Stage 1 sequence is applied in order, twice (idempotency):
//        phase1/16 -> phase1/01 -> phase1/17 -> phase4/19 -> phase1/18 -> phase1/19
//      Each file was previously tested only on its own; this proves they compose.
//   3. AFTER: each exploit is denied, and the legitimate flows (website intake, Admin/Back Office work, staff
//      document access, service-role administration) keep working.
// Credential values in the fixture are placeholders; assertion messages never print column values.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { replayMigrations, requireApplied, identity, attempt, readRepo } from './helpers/replay-migrations.mjs';

const STAGE1 = [
  'supabase/staged-migrations/phase1/16_storage_docs_lockdown.sql',
  'supabase/staged-migrations/phase1/01_rls_hardening.sql',
  'supabase/staged-migrations/phase1/17_anon_restrictive_lockdown.sql',
  'supabase/staged-migrations/phase4/19_staff_only_legacy_tables.sql',
  'supabase/staged-migrations/phase1/18_live_api_privilege_hardening.sql',
  'supabase/staged-migrations/phase1/19_stage1_gap_fixes.sql',
];

// The two application categories (no third role is introduced):
//   Admin / Back Office -> profiles.role 'admin' (and the legacy 'back_office' role during the compatibility period)
//   Sales Agent         -> profiles.role 'inside_sales' / 'field_sales'
const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const OFFICE = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const MANAGER = 'aaaaaaaa-0000-4000-8000-0000000000b2';
const AGENT_A = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const AGENT_B = 'aaaaaaaa-0000-4000-8000-0000000000c2';
const INACTIVE = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const PLACEHOLDER_TOKEN = 'placeholder-not-a-real-token';

let db; let as; let run;
const roleOf = async (id) => (await db.query('select role, is_active from public.profiles where id = $1', [id])).rows[0];
const jwtRoleOf = async (id) => (await db.query("select raw_app_meta_data->>'role' r from auth.users where id = $1", [id])).rows[0].r;
const count = async (sql, params) => { const r = await run(sql, params); return r.ok ? r.rows.length : -1; };
const docs = async (bucket) => (await run('select name from storage.objects where bucket_id = $1 order by name', [bucket]));

before(async () => {
  const replay = await replayMigrations();
  db = replay.db;
  as = identity(db);
  run = (sql, params) => attempt(db, sql, params);
  // 20260810185405 references hlektrismos_leads before it exists, so it cannot replay in filename order. It only
  // loosens ai_agents/lead_sources policies (not in Stage 1 scope); without it the fixture is stricter there, not looser.
  assert.deepEqual(replay.skipped.map((s) => s.file), ['20260810185405_fix_dashboard_rls_nullable_user_id.sql']);
  requireApplied(replay.applied, [
    '20260818140000_fix_crm_users_rls', '20260818160000_create_integrations_table', '20260818170000_create_crm_emails_table',
    '20260818200000_create_crm_settings_table', '20260820000004_fix_storage_anon_policies', '20260810190238_add_bill_upload_columns_and_storage',
    '20260821030000_production_readiness', '20260822120000_sales_agents_and_commissions', '20260908180000_crm_base_tables',
    '20260909120000_p0_foundation_and_security', '20260910103000_crm_os_phase11_org_team_role_model',
    '20260911040000_b2b_scraper_and_provider_catalog', '20261001000000_security_signup_lockdown', '20261001000100_age_gate_public_leads',
  ]);

  await as(null);
  for (const [id, role, active] of [[ADMIN, 'admin', true], [OFFICE, 'back_office', true], [MANAGER, 'manager', true], [AGENT_A, 'inside_sales', true],
    [AGENT_B, 'field_sales', true], [INACTIVE, 'inside_sales', false]]) {
    await db.query("insert into auth.users (id, email) values ($1::uuid, $1::text || '@example.test') on conflict do nothing", [id]);
    await db.query(`insert into public.profiles (id, full_name, role, is_active) values ($1::uuid, 'Test ' || $2::text, $2::text, $3::boolean)
      on conflict (id) do update set role = excluded.role, is_active = excluded.is_active`, [id, role, active]);
  }
  await db.query("update public.crm_integrations set config = jsonb_build_object('token', $1::text)", [PLACEHOLDER_TOKEN]);
  await db.query(`insert into public.crm_settings (setting_key, setting_value, category) values
    ('serpapi_api_key', jsonb_build_object('value', $1::text), 'integrations'), ('ui_theme', '"light"', 'general')
    on conflict (setting_key) do update set setting_value = excluded.setting_value`, [PLACEHOLDER_TOKEN]);
  await db.exec(`
    insert into public.crm_users (id, role, full_name) values ('${AGENT_A}', 'sales', 'Agent A') on conflict do nothing;
    insert into public.sales_agents (full_name, email, agent_type) values ('Agent A', 'a@example.test', 'employee');
    with c as (insert into public.hlektrismos_customers (full_name, phone, active_provider, active_program)
      values ('Test Customer', '2100000000', 'Provider', 'Program') returning id)
    insert into public.customer_documents (customer_id, document_type, file_name, file_path)
      select id, 'gov_id', 'id-front.jpg', 'leads/L1/id-front.jpg' from c;
    insert into storage.objects (bucket_id, name) values
      ('hlektrismos_docs', 'contact-forms/bill.pdf'), ('hlektrismos_docs', 'leads/L1/id-front.jpg'), ('energy-bills', 'bills/old.pdf');
  `);
});

// ---------------------------------------------------------------------------------------------------------------
test('BEFORE: set_user_role is callable by an anonymous visitor (NULL guard) and grants any JWT role', async () => {
  await as('anon');
  const r = await run('select public.set_user_role($1, $2)', [AGENT_A, 'admin']);
  assert.equal(r.ok, true, 'anon call succeeds');
  await as(null);
  assert.equal(await jwtRoleOf(AGENT_A), 'admin', 'raw_app_meta_data.role rewritten');
  await db.query("update auth.users set raw_app_meta_data = '{}'::jsonb where id = $1", [AGENT_A]);
});

test('BEFORE: a Sales Agent can make themselves admin; an inactive account can re-activate itself', async () => {
  await as(AGENT_A);
  assert.equal((await run("update public.profiles set role = 'admin' where id = $1", [AGENT_A])).n, 1);
  await as(INACTIVE);
  assert.equal((await run('update public.profiles set is_active = true where id = $1', [INACTIVE])).n, 1);
  await as(null);
  assert.equal((await roleOf(AGENT_A)).role, 'admin');
  assert.equal((await roleOf(INACTIVE)).is_active, true);
  await db.query("update public.profiles set role = 'inside_sales' where id = $1", [AGENT_A]);
  await db.query('update public.profiles set is_active = false where id = $1', [INACTIVE]);
});

test('BEFORE: anonymous visitors read integration tokens and staff tables; Sales Agents read integration tokens', async () => {
  await as('anon');
  assert.ok((await count('select config from public.crm_integrations')) > 0, 'anon reads crm_integrations.config');
  assert.ok((await count('select id from public.sales_agents')) > 0, 'anon reads sales_agents');
  assert.ok((await count('select id from public.customer_documents')) > 0, 'anon reads customer_documents');
  assert.equal((await run("update public.sales_agents set notes = 'changed by anon'")).n, 1, 'anon modifies sales_agents');
  // crm_users is NOT reproducible: its "Admins can manage" policy reads crm_users itself, so an anon query fails
  // with infinite recursion instead of returning rows. It is still covered by the AFTER checks.
  await as(AGENT_A);
  assert.ok((await count('select config from public.crm_integrations')) > 0, 'sales agent reads integration tokens');
});

test('BEFORE: anonymous visitors list customer documents and upload anywhere; inactive accounts read and delete files', async () => {
  await as('anon');
  assert.equal((await docs('hlektrismos_docs')).rows.length, 2, 'anon lists customer documents');
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', 'leads/L1/planted.pdf')")).ok, true);
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('energy-bills', 'planted.pdf')")).ok, true, 'anon uploads energy bills');
  await as(INACTIVE);
  assert.equal((await docs('energy-bills')).rows.length, 2, 'inactive account lists energy bills');
  assert.equal((await run("delete from storage.objects where name in ('leads/L1/planted.pdf', 'planted.pdf')")).n, 2, 'inactive account deletes');
});

// ---------------------------------------------------------------------------------------------------------------
test('APPLY: the Stage 1 sequence applies cleanly, in order, and is idempotent (second run)', async () => {
  for (const pass of [1, 2]) {
    for (const file of STAGE1) {
      await as(null);
      let error = null;
      try { await db.exec(readRepo(file)); } catch (e) { error = e.message; }
      assert.equal(error, null, `pass ${pass}: ${file}`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------
test('AFTER: set_user_role is service-role only, in its grants AND its body (even for an admin claim, even if re-granted)', async () => {
  for (const who of ['anon', AGENT_A, ADMIN]) {
    await as(who);
    const r = await run('select public.set_user_role($1, $2)', [AGENT_B, 'admin']);
    assert.equal(r.ok, false, `${who}: denied`);
  }
  await as(null);
  assert.equal(await jwtRoleOf(AGENT_B), null, 'no role written');

  await as('service_role');
  assert.equal((await run('select public.set_user_role($1, $2)', [AGENT_B, 'field_sales'])).ok, true, 'service role (trusted admin path) works');
  await as(null);
  assert.equal(await jwtRoleOf(AGENT_B), 'field_sales');

  // Grants: EXECUTE for service_role only.
  const acl = (await db.query(`select has_function_privilege('anon', 'public.set_user_role(uuid,text)', 'execute') anon,
    has_function_privilege('authenticated', 'public.set_user_role(uuid,text)', 'execute') auth,
    has_function_privilege('service_role', 'public.set_user_role(uuid,text)', 'execute') service`)).rows[0];
  assert.deepEqual(acl, { anon: false, auth: false, service: true });

  // Body: with an accidental re-grant, anon and even an authenticated caller carrying an admin JWT claim are refused.
  await db.exec('grant execute on function public.set_user_role(uuid, text) to anon, authenticated');
  for (const [who, claims] of [['anon', {}], [ADMIN, { app_metadata: { role: 'admin' } }]]) {
    await as(who, claims);
    const again = await run('select public.set_user_role($1, $2)', [AGENT_B, 'admin']);
    assert.equal(again.ok, false, `${who}: body refuses`);
    assert.match(again.error, /service-role only/);
  }
  await as(null);
  assert.equal(await jwtRoleOf(AGENT_B), 'field_sales', 'still unchanged');
  await db.exec('revoke execute on function public.set_user_role(uuid, text) from anon, authenticated');
});

test('AFTER: nobody can change role or active status from the browser; own name/phone stay editable', async () => {
  await as(AGENT_A);
  const promote = await run("update public.profiles set role = 'admin' where id = $1", [AGENT_A]);
  assert.ok(!promote.ok || promote.n === 0, 'agent self-promotion refused');
  assert.equal((await run("update public.profiles set full_name = 'Agent A renamed', phone = '2100000000' where id = $1", [AGENT_A])).n, 1);
  await as(INACTIVE);
  const reactivate = await run('update public.profiles set is_active = true where id = $1', [INACTIVE]);
  assert.ok(!reactivate.ok || reactivate.n === 0, 'inactive self-reactivation refused');
  await as(AGENT_A);
  const other = await run("update public.profiles set full_name = 'x' where id = $1", [AGENT_B]);
  assert.ok(!other.ok || other.n === 0, 'agent cannot edit another profile');
  await as(null);
  assert.equal((await roleOf(AGENT_A)).role, 'inside_sales');
  assert.equal((await roleOf(INACTIVE)).is_active, false);

  // Legitimate administration goes through the service role (admin-users Edge Function).
  await as('service_role');
  assert.equal((await run('update public.profiles set is_active = true where id = $1', [INACTIVE])).n, 1);
  assert.equal((await run('update public.profiles set is_active = false where id = $1', [INACTIVE])).n, 1);
});

test('AFTER: anonymous visitors cannot read or modify any private table', async () => {
  await as('anon');
  for (const t of ['crm_integrations', 'crm_settings', 'crm_users', 'sales_agents', 'customer_documents', 'crm_emails',
    'crm_tasks', 'profiles', 'leads', 'hlektrismos_leads', 'customers', 'cases', 'case_documents', 'agent_provider_commissions',
    'customer_agent_attribution', 'customer_commissions_ledger', 'lead_notes', 'voice_calls', 'campaigns']) {
    const r = await run(`select * from public.${t} limit 1`);
    assert.ok(!r.ok || r.rows.length === 0, `anon read ${t}`);
  }
  for (const sql of ["update public.crm_users set full_name = 'x'", "update public.crm_integrations set connected = true",
    "delete from public.sales_agents", "update public.profiles set role = 'admin'", "delete from public.customer_documents"]) {
    const r = await run(sql);
    assert.ok(!r.ok || r.n === 0, sql);
  }
});

test('AFTER: integration credentials are admin-only; Sales Agents, inactive accounts, manager and back_office get none', async () => {
  for (const who of [AGENT_A, AGENT_B, INACTIVE]) {
    await as(who);
    assert.ok((await count('select config from public.crm_integrations')) <= 0, `${who}: no crm_integrations rows`);
    assert.ok((await count("select setting_value from public.crm_settings where setting_key = 'serpapi_api_key'")) <= 0, `${who}: no credential setting`);
  }
  await as(AGENT_A);
  const status = await run('select * from public.crm_integrations_status');
  assert.equal(status.ok, true, 'sales screens can read the status view');
  assert.ok(status.rows.length > 0 && !('config' in status.rows[0]), 'the status view never exposes config');

  await as(ADMIN);
  assert.ok((await count("select setting_value from public.crm_settings where setting_key = 'serpapi_api_key'")) > 0, 'admin reads settings');
  assert.ok((await count('select config from public.crm_integrations')) > 0, 'admin manages integrations');
  // COORDINATION (reported in the runbook): within «Admin / Back Office», only profiles.role = 'admin' keeps these two
  // tables. 'back_office' had no permissive policy before Stage 1 either (unchanged); 'manager' could read them before
  // and cannot after. Confirm which role the shared office login uses before applying.
  for (const who of [OFFICE, MANAGER]) {
    await as(who);
    assert.ok((await count('select setting_key from public.crm_settings')) <= 0, `${who}: no settings after Stage 1`);
    assert.ok((await count('select config from public.crm_integrations')) <= 0, `${who}: no integrations after Stage 1`);
  }
});

test('AFTER: customer documents (hlektrismos_docs) can be read, replaced and deleted only by the right roles', async () => {
  await as('anon');
  assert.equal((await docs('hlektrismos_docs')).rows.length, 0, 'anon cannot list or download');
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', 'contact-forms/new-bill.pdf')")).ok, true,
    'website form upload (contact-forms/) still works');
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', 'leads/L1/planted.pdf')")).ok, false,
    'anon cannot plant files elsewhere');
  for (const sql of ["update storage.objects set name = 'contact-forms/renamed.pdf' where bucket_id = 'hlektrismos_docs'",
    "delete from storage.objects where bucket_id = 'hlektrismos_docs'"]) {
    const r = await run(sql); assert.ok(!r.ok || r.n === 0, `anon: ${sql}`);
  }

  await as(INACTIVE);
  assert.equal((await docs('hlektrismos_docs')).rows.length, 0, 'inactive account sees nothing');
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', 'leads/L1/x.pdf')")).ok, false);

  await as(AGENT_A);
  assert.ok((await docs('hlektrismos_docs')).rows.length >= 2, 'active staff can open documents');
  for (const sql of ["update storage.objects set metadata = '{}'::jsonb where bucket_id = 'hlektrismos_docs'",
    "delete from storage.objects where bucket_id = 'hlektrismos_docs'"]) {
    const r = await run(sql); assert.ok(!r.ok || r.n === 0, `sales agent cannot replace/delete: ${sql}`);
  }

  await as(ADMIN);
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', 'leads/L1/contract.pdf')")).ok, true,
    'Back Office uploads to a lead folder');
  await as(null);
  assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id = 'hlektrismos_docs'")).rows[0].n, 4, 'no file lost');
});

test('AFTER: energy-bills bucket is read-only for active staff and closed to everyone else', async () => {
  await as('anon');
  assert.equal((await docs('energy-bills')).rows.length, 0);
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('energy-bills', 'x.pdf')")).ok, false, 'anon upload refused');
  await as(INACTIVE);
  assert.equal((await docs('energy-bills')).rows.length, 0);
  await as(AGENT_A);
  assert.equal((await docs('energy-bills')).rows.length, 1, 'staff can still open old bills');
  for (const sql of ["insert into storage.objects (bucket_id, name) values ('energy-bills', 'y.pdf')",
    "update storage.objects set metadata = '{}'::jsonb where bucket_id = 'energy-bills'", "delete from storage.objects where bucket_id = 'energy-bills'"]) {
    const r = await run(sql); assert.ok(!r.ok || r.n === 0, `staff: ${sql}`);
  }
  await as('service_role');
  assert.equal((await docs('energy-bills')).rows.length, 1, 'service role unaffected');
});

test('AFTER: the public website form still creates a lead (and still enforces 18+), but cannot read it back', async () => {
  await as('anon');
  const ok = await run('select public.insert_website_lead($1, $2::jsonb) as id', ['website', JSON.stringify({
    first_name: 'Test', last_name: 'Visitor', phone: '2100000000', email: 'visitor@example.test', property_type: 'Κατοικία',
    service_category: 'energy', gdpr_consent: true, age_confirmed: true,
  })]);
  assert.equal(ok.ok, true, ok.error);
  const minor = await run('select public.insert_website_lead($1, $2::jsonb)', ['website', JSON.stringify({ first_name: 'X', phone: '1', gdpr_consent: true, age_confirmed: false })]);
  assert.equal(minor.ok, false, 'under-18 refused');
  assert.ok((await count("select id from public.leads where email = 'visitor@example.test'")) <= 0, 'anon cannot read leads');
  await as(ADMIN);
  assert.equal(await count("select id from public.leads where email = 'visitor@example.test'"), 1, 'Back Office sees the new lead');
});

test('AFTER: Admin / Back Office keeps its working access to CRM records', async () => {
  await as(ADMIN);
  const lead = await run("insert into public.leads (client_name, client_contact, email, source, status, age_confirmed) values ('Office lead', 'o@example.test', 'o@example.test', 'inside_sales', 'new', true) returning id");
  assert.equal(lead.ok, true, lead.error);
  assert.equal((await run("update public.leads set status = 'contacted' where id = $1", [lead.rows[0].id])).n, 1);
  for (const t of ['leads', 'customers', 'cases', 'profiles', 'case_documents', 'follow_ups']) assert.equal((await run(`select * from public.${t} limit 1`)).ok, true, t);
  assert.ok((await count('select id from public.profiles')) >= 6, 'office lists staff accounts');
  // Not checked: crm_users. Its legacy "Admins can manage" policy queries crm_users itself, so every read fails with
  // infinite recursion for every role, BEFORE and AFTER Stage 1 (pre-existing; only the unused DashboardPage reads it).
});

test('AFTER: a new function is executable by nobody (PUBLIC, anon, authenticated) until a migration grants it', async () => {
  await as(null);
  await db.exec(`
    create table public.zz_future_table (id int primary key);
    create function public.zz_future_fn() returns int language sql as $$ select 1 $$;
    create function public.zz_future_definer() returns int language sql security definer set search_path = public as $$ select 1 $$;
  `);
  const priv = (await db.query(`select
      has_table_privilege('anon', 'public.zz_future_table', 'select') anon_t,
      has_table_privilege('authenticated', 'public.zz_future_table', 'select') auth_t,
      has_function_privilege('anon', 'public.zz_future_fn()', 'execute') anon_f,
      has_function_privilege('authenticated', 'public.zz_future_fn()', 'execute') auth_f,
      has_function_privilege('authenticated', 'public.zz_future_definer()', 'execute') auth_definer,
      has_function_privilege('service_role', 'public.zz_future_fn()', 'execute') service_f`)).rows[0];
  // service_role keeps the Supabase platform's own schema default (this PR adds no grant for it).
  assert.deepEqual(priv, { anon_t: false, auth_t: true, anon_f: false, auth_f: false, auth_definer: false, service_f: true });
  for (const who of ['anon', AGENT_A]) {
    await as(who);
    assert.equal((await run('select public.zz_future_definer()')).ok, false, `${who}: cannot call a new SECURITY DEFINER function`);
  }
  await as(null);
  await db.exec('drop table public.zz_future_table; drop function public.zz_future_fn(); drop function public.zz_future_definer()');
});

test('AFTER: an explicit grant gives EXECUTE to exactly the role named, and nobody else', async () => {
  await as(null);
  await db.exec(`
    create function public.zz_staff_rpc() returns int language sql security definer set search_path = public
      as $$ select case when public.is_staff() then 1 else 0 end $$;
    grant execute on function public.zz_staff_rpc() to authenticated;
  `);
  await as(AGENT_A);
  const ok = await run('select public.zz_staff_rpc() as v');
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.rows[0].v, 1);
  await as('anon');
  assert.equal((await run('select public.zz_staff_rpc()')).ok, false, 'anon still has no EXECUTE');
  await as(null);
  await db.exec('drop function public.zz_staff_rpc()');
});

// Cross-agent isolation (Stage 2A) is verified in stage2a-sales-isolation.test.mjs.
