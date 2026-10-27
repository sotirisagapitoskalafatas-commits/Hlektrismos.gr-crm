// Stage 1 / phase1/19 coordination check: LOCAL verification (PGlite). This is NOT staging or production.
//
// phase1/19 removes the implicit EXECUTE that new functions used to get (PUBLIC/anon/authenticated). Every staged
// file applied AFTER Stage 1 (docs/ops/APPLY_ORDER.md steps 3..23) creates functions under the new defaults. This
// test builds two databases from the real migration chain:
//   control: Stage 1 WITHOUT phase1/19, then every later staged file  (old, implicit defaults)
//   treated: Stage 1 WITH phase1/19,    then every later staged file  (new, explicit-only defaults)
// and compares the EXECUTE privileges of every function the later files create. A function may only lose its
// implicit grant if it is a trigger function (Postgres does not check EXECUTE for the user firing a trigger) or
// is called solely from SECURITY DEFINER functions (which run as the owner). Anything else would break the CRM
// once the later stage is applied, so it must be granted explicitly in its own staged file.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { replayMigrations, identity, attempt, readRepo } from './helpers/replay-migrations.mjs';

const STAGE1 = ['phase1/16_storage_docs_lockdown', 'phase1/01_rls_hardening', 'phase1/17_anon_restrictive_lockdown',
  'phase4/19_staff_only_legacy_tables', 'phase1/18_live_api_privilege_hardening', 'phase1/19_stage1_gap_fixes'];
// APPLY_ORDER.md steps 3 .. 23, in order.
const LATER = ['phase2/05_staff_admin_and_role_preview', 'phase4/17_admin_only_staff_provisioning',
  'phase4/20_backoffice_sales_agent_provisioning', 'phase1/03_drop_exec_sql', 'phase1/02_outreach_decisions_audit',
  'phase1/04_cron_secret_and_pause', 'phase4/15_convert_lead_match_phone_only', 'phase2/06_trash_leads_customers',
  'phase2/07a_document_checklist_and_return', 'phase2/07b_case_stage_guard_and_set_stage', 'phase2/07c_reopen_completed_case',
  'phase4/10_field_checkin_manual_flag', 'phase4/11_customer_names', 'phase4/12_default_backoffice_assignee',
  'phase4/13_case_exception_state', 'phase4/14_follow_up_kind', 'phase3/08_b2b_prospects_review_distribution',
  'phase3/09_contact_eligibility', 'phase5/17_customer_supply_points', 'phase5/18_lead_supply_points',
  'phase4/16_import_legacy_leads', 'phase4/18_sales_own_records_scope', 'phase5/19_field_sales_saved_routes'];

// Non-trigger functions that may lose implicit EXECUTE, each with the SECURITY DEFINER callers that use it.
const DEFINER_ONLY_HELPERS = {
  'customer_match_phone(text)': 'convert_lead_to_case (phase4/15)',
  'b2b_name_key(text)': 'b2b_find_duplicate, b2b_prospects_screen (phase3/08)',
  'b2b_phone_key(text)': 'b2b_find_duplicate, b2b_prospects_screen (phase3/08)',
  'contact_phone_key(text)': 'contact_facts, record_contact_objection/consent, withdraw_contact_consent, record_article11_screening (phase3/09)',
  'contact_email_key(text)': 'contact_facts, record_contact_consent, withdraw_contact_consent (phase3/09)',
};

const FUNCTIONS = `select p.oid::regprocedure::text as sig, p.prorettype = 'trigger'::regtype as is_trigger,
    has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`;

async function build({ withPhase119 }) {
  const { db } = await replayMigrations();
  for (const f of STAGE1) {
    if (!withPhase119 && f === 'phase1/19_stage1_gap_fixes') continue;
    await db.exec(readRepo(`supabase/staged-migrations/${f}.sql`));
  }
  const existing = new Set((await db.query(FUNCTIONS)).rows.map((r) => r.sig));
  const failed = [];
  for (const f of LATER) {
    try { await db.exec(readRepo(`supabase/staged-migrations/${f}.sql`)); } catch (e) {
      failed.push(`${f}: ${e.message}`);
      try { await db.exec('rollback'); } catch { /* not in a transaction */ }
    }
  }
  const created = Object.fromEntries((await db.query(FUNCTIONS)).rows.filter((r) => !existing.has(r.sig)).map((r) => [r.sig, r]));
  return { db, created, failed };
}

let control; let treated;
before(async () => {
  control = await build({ withPhase119: false });
  treated = await build({ withPhase119: true });
});

test('every later staged file still applies after Stage 1 (and without it)', () => {
  assert.deepEqual(control.failed, []);
  assert.deepEqual(treated.failed, []);
  assert.deepEqual(Object.keys(treated.created).sort(), Object.keys(control.created).sort(), 'same functions created');
  assert.ok(Object.keys(treated.created).length >= 60, 'the later files really were applied');
});

test('only trigger functions and SECURITY-DEFINER-only helpers lose their implicit EXECUTE', () => {
  const lost = [];
  for (const [sig, c] of Object.entries(control.created)) {
    const t = treated.created[sig];
    if ((c.auth && !t.auth) || (c.anon && !t.anon)) lost.push({ sig, is_trigger: t.is_trigger });
  }
  const unexpected = lost.filter((f) => !f.is_trigger && !(f.sig.replace(/^public\./, '') in DEFINER_ONLY_HELPERS));
  assert.deepEqual(unexpected, [], 'a function the browser/RLS needs lost EXECUTE: grant it explicitly in its staged file');
  assert.ok(lost.length > 0, 'phase1/19 really changed the defaults');
});

test('explicitly granted functions keep exactly their grants (e.g. the crm_settings policy helper, sales scope helpers)', () => {
  for (const sig of ['crm_setting_is_credential(text)', 'sales_owns_lead(uuid)', 'sales_owns_case(uuid)', 'is_sales_agent()',
    'convert_lead_to_case(uuid)', 'contact_facts(text,text)', 'b2b_review(uuid[],text,text)']) {
    const t = Object.values(treated.created).find((r) => r.sig.replace(/^public\./, '') === sig)
      ?? null;
    if (!t) continue; // pre-existing function redefined by a later file keeps its existing ACL
    assert.equal(t.auth, true, `${sig}: authenticated can execute`);
    assert.equal(t.anon, false, `${sig}: anon cannot execute`);
  }
});

test('behaviour after Stage 1 + later files: a Sales Agent and the office can still use the RLS-protected tables', async () => {
  const { db } = treated;
  const as = identity(db);
  const run = (sql, params) => attempt(db, sql, params);
  const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000e1';
  const MANAGER = 'aaaaaaaa-0000-4000-8000-0000000000e2';
  const AGENT = 'aaaaaaaa-0000-4000-8000-0000000000e3';
  await as(null);
  for (const [id, role] of [[ADMIN, 'admin'], [MANAGER, 'manager'], [AGENT, 'inside_sales']]) {
    await db.query("insert into auth.users (id) values ($1::uuid) on conflict do nothing", [id]);
    await db.query(`insert into public.profiles (id, full_name, role, is_active) values ($1::uuid, 'Test', $2::text, true)
      on conflict (id) do update set role = excluded.role, is_active = true`, [id, role]);
  }
  await db.exec(`insert into public.crm_settings (setting_key, setting_value) values ('zz_api_key', '"placeholder"'), ('zz_layout', '"grid"')
    on conflict (setting_key) do nothing`);

  // crm_settings policy calls crm_setting_is_credential(): no "permission denied for function" for any staff role.
  await as(MANAGER);
  const m = await run('select setting_key from public.crm_settings');
  assert.equal(m.ok, true, m.error);
  await as(AGENT);
  const a = await run('select setting_key from public.crm_settings');
  assert.equal(a.ok, true, a.error);
  // The RLS on leads/cases (phase4/18 helpers) evaluates without permission errors for a Sales Agent.
  for (const t of ['leads', 'cases', 'customers', 'follow_ups', 'case_documents']) {
    const r = await run(`select * from public.${t} limit 1`);
    assert.equal(r.ok, true, `${t}: ${r.error}`);
  }
  // Trigger functions without EXECUTE for the API roles still fire on their DML (here: an office insert/update on leads).
  await as(ADMIN);
  const lead = await run("insert into public.leads (client_name, client_contact, email, source, status, age_confirmed) values ('T', 't@example.test', 't@example.test', 'inside_sales', 'new', true) returning id");
  assert.equal(lead.ok, true, lead.error);
  const upd = await run("update public.leads set status = 'contacted' where id = $1", [lead.rows[0].id]);
  assert.equal(upd.ok, true, upd.error);
});
