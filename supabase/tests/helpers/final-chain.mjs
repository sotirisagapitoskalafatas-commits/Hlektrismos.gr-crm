// LOCAL test helper: builds the database in its FINAL intended state (two roles) exactly like supabase/tests/final-state-role-isolation.test.mjs, and then
// the phase7 files (Field Visits and Energy Applications) on top. Same chain, same order as docs/ops/APPLY_ORDER.md, plus two files that phase7 needs and
// that gate leaves out: phase4/10 (step 12, check-in review flag) and phase4/12 (step 14, default Back Office assignee).
// It is embedded Postgres (PGlite) with stand-ins for Auth, Storage and PostgREST: never staging, never Production.
import { replayMigrations, applyStaged, STAGE1_FILES, identity, attempt } from './replay-migrations.mjs';

export const ALREADY_LIVE = ['phase1/20_crm_integrations_emergency_hotfix', 'phase1/03_drop_exec_sql', 'phase5/17_customer_supply_points', 'phase5/18_lead_supply_points'];
export const ROLLOUT = ['phase1/21b_function_rate_limits', 'phase1/21c_lead_webhook_idempotency', ...STAGE1_FILES, 'phase2/05_staff_admin_and_role_preview', 'phase6/21_two_role_model',
  'phase1/02_outreach_decisions_audit', 'phase2/06_trash_leads_customers', 'phase2/07a_document_checklist_and_return', 'phase2/07b_case_stage_guard_and_set_stage',
  'phase4/10_field_checkin_manual_flag', 'phase4/12_default_backoffice_assignee', 'phase4/14_follow_up_kind',
  'phase3/08_b2b_prospects_review_distribution', 'phase3/09_contact_eligibility', 'phase3/10_offer_lifecycle', 'phase3/11_contact_service_requests', 'phase4/18_sales_own_records_scope', 'phase4/21_sales_isolation_completion'];
export const FINAL = ['phase6/25_exact_two_roles', 'phase6/26_single_active_admin', 'phase6/27_credentials_write_only'];
export const PHASE7 = ['phase7/01_standalone_field_visits', 'phase7/02_energy_applications'];

export const U = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ADMIN = U(1), A = U(2), B = U(3), NEWBIE = U(9);

/** @param {{ phase7?: string[] }} [opts] the phase7 files to apply (default: all that exist in the repository) */
export async function buildFinalDb({ phase7 = PHASE7 } = {}) {
  const { db } = await replayMigrations();
  const as = identity(db); const run = (sql, p) => attempt(db, sql, p);
  const one = async (sql, p) => (await db.query(sql, p)).rows;
  const su = () => as(null);
  const ids = {};
  await db.exec(`alter table auth.users add column if not exists last_sign_in_at timestamptz, add column if not exists email_confirmed_at timestamptz, add column if not exists invited_at timestamptz,
    add column if not exists banned_until timestamptz, add column if not exists is_sso_user boolean, add column if not exists deleted_at timestamptz, add column if not exists updated_at timestamptz;
    create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid);`);
  await applyStaged(db, [...ALREADY_LIVE, ...ROLLOUT]);
  await su();
  for (const [id, role, email] of [[ADMIN, 'admin', 'office@example.invalid'], [A, 'inside_sales', 'agent.a@example.invalid'], [B, 'field_sales', 'agent.b@example.invalid'], [NEWBIE, 'inside_sales', 'newbie@example.invalid']]) {
    await db.query('insert into auth.users (id, email, email_confirmed_at, last_sign_in_at) values ($1::uuid, $2, now(), now())', [id, email]);
    await db.query(`insert into public.profiles (id, full_name, role, is_active) values ($1::uuid, $2, $3, $4)
      on conflict (id) do update set role = excluded.role, is_active = excluded.is_active, full_name = excluded.full_name`, [id, email.split('@')[0], role, id !== NEWBIE]);
  }
  await db.query('insert into auth.identities (user_id) values ($1::uuid)', [ADMIN]);
  const ins = async (sql, p) => (await db.query(sql, p)).rows[0].id;
  const lead = (owner, phone, name) => ins(`insert into public.leads (client_name, client_contact, email, phone, source, status, age_confirmed, assigned_to_user_id, created_by_user_id)
    values ($3, 'x@example.test', 'x@example.test', $2, 'inside_sales', 'new', true, $1::uuid, $1::uuid) returning id`, [owner, phone, name]);
  ids.LA = await lead(A, '6911111111', 'Lead A'); ids.LB = await lead(B, '6922222222', 'Lead B');
  ids.CuA = await ins("insert into public.customers (full_name, phone, created_by) values ('Cust A', '2101111111', $1::uuid) returning id", [A]);
  ids.CuB = await ins("insert into public.customers (full_name, phone, created_by) values ('Cust B', '2102222222', $1::uuid) returning id", [B]);
  const kase = (owner, cust, ld) => ins(`insert into public.cases (title, owner_id, created_by, customer_id, lead_id, current_stage, status, lat, lng)
    values ('Case', $1::uuid, $1::uuid, $2::uuid, $3::uuid, 'document_check', 'open', 37.9838, 23.7275) returning id`, [owner, cust, ld]);
  ids.CA = await kase(A, ids.CuA, ids.LA); ids.CB = await kase(B, ids.CuB, ids.LB);
  const sp = (cust, ld, addr, num) => ins(`insert into public.customer_supply_points (customer_id, lead_id, usage, property_address, supply_number, created_by)
    values ($1::uuid, $2::uuid, 'residential', $3, $4, $5::uuid) returning id`, [cust, ld, addr, num, cust ? (cust === ids.CuA ? A : B) : A]);
  ids.SPA = await sp(ids.CuA, null, 'Σόλωνος 5, Αθήνα', '12345678901');
  ids.SPB = await sp(ids.CuB, null, 'Ερμού 9, Αθήνα', '10987654321');
  for (const f of FINAL) await applyStaged(db, [f]);
  await applyStaged(db, phase7);
  return { db, as, run, one, su, ids };
}
