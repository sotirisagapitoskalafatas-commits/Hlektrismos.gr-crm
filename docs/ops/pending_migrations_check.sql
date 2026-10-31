-- READ-ONLY. Which staged migrations are already applied in THIS database? Run it yourself in the Supabase SQL editor
-- (staging or production). It reads the catalog only (no data, no personal information) and changes nothing.
-- One row per staged file; `applied` is a marker check (a table, column, trigger, function or policy the file creates).
-- phase1/04 (cron) is checked separately at the bottom because pg_cron may not be readable for your user.
-- Every function is looked up with to_regprocedure() (NULL when absent), never a ::regprocedure cast or a
-- signature string, so a missing function or signature reports false instead of aborting the whole query.
select f.file, f.applied, f.marker
from (values
  ('phase1/01_rls_hardening',                  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_integrations' and policyname = 'admin manage crm_integrations'), 'policy «admin manage crm_integrations»'),
  ('phase1/02_outreach_decisions_audit',       to_regclass('public.outreach_decisions') is not null, 'table outreach_decisions'),
  ('phase1/03_drop_exec_sql',                  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'exec_sql'), 'no public.exec_sql (true also if it never existed)'),
  ('phase1/16_storage_docs_lockdown',          exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'website uploads contact forms')
                                               and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'hlektrismos_docs_anon_select'), 'storage policies'),
  ('phase1/17_anon_restrictive_lockdown',     exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'anon never (restrictive)'), 'restrictive policy «anon never (restrictive)»'),
  ('phase1/18_live_api_privilege_hardening',   exists (select 1 from pg_trigger where tgname = 'profiles_guard_privileged') and not coalesce(has_function_privilege('anon', to_regprocedure('public.reassign_lead(uuid,uuid)'), 'EXECUTE'), false), 'profiles guard trigger + reassign_lead not anonymous'),
  ('phase1/19_stage1_gap_fixes',               exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'staff reads energy bills') and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public can upload energy bills'), 'energy-bills staff read only (set_user_role / default privileges: see STAGE1_EMERGENCY_DB_HARDENING.md)'),
  ('phase1/20_crm_integrations_emergency_hotfix', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_integrations' and policyname = 'phase1/20 anon denied') and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_integrations' and roles @> array['public']::name[]) and not has_table_privilege('anon', 'public.crm_integrations', 'SELECT'), 'crm_integrations: admin-only, anon denied, no public policy'),
  ('phase1/21b_function_rate_limits',          to_regprocedure('public.consume_rate_limits(jsonb)') is not null and to_regprocedure('public.claim_once(text,integer)') is not null and to_regprocedure('public.release_once(text)') is not null and to_regclass('public.campaign_sends_campaign_lead_unique') is not null and to_regclass('public.communication_log') is not null, 'function consume_rate_limits + unique send claim + communication_log'),
  ('phase1/21c_lead_webhook_idempotency',      to_regprocedure('public.ingest_webhook_lead(text,text,text,jsonb)') is not null, 'function ingest_webhook_lead'),
  ('phase4/19_staff_only_legacy_tables',      exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'staff only (restrictive)'), 'restrictive policy «staff only (restrictive)»'),
  ('phase2/05_staff_admin_and_role_preview',   exists (select 1 from pg_trigger where tgname = 'profiles_guard_privileged'), 'trigger profiles_guard_privileged'),
  ('phase2/06_trash_leads_customers',          exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'leads' and column_name = 'deleted_at'), 'column leads.deleted_at'),
  ('phase2/07a_document_checklist_and_return', to_regprocedure('public.return_case_for_correction(uuid,text,jsonb,text)') is not null, 'function return_case_for_correction'),
  ('phase2/07b_case_stage_guard_and_set_stage', to_regprocedure('public.set_case_stage(uuid,text,text)') is not null, 'function set_case_stage'),
  ('phase2/07c_reopen_completed_case',         to_regprocedure('public.reopen_completed_case(uuid,text,text)') is not null, 'function reopen_completed_case'),
  ('phase4/16_import_legacy_leads',            to_regprocedure('public.import_legacy_leads(boolean)') is not null, 'function import_legacy_leads (the import itself is a separate, deliberate step)'),
  ('phase5/17_customer_supply_points',         to_regclass('public.customer_supply_points') is not null, 'table customer_supply_points'),
  ('phase5/18_lead_supply_points',             exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customer_supply_points' and column_name = 'lead_id'), 'column customer_supply_points.lead_id'),
  ('phase3/08_b2b_prospects_review_distribution', to_regclass('public.b2b_prospects') is not null, 'table b2b_prospects'),
  ('phase3/09_contact_eligibility',            to_regclass('public.contact_objections') is not null, 'table contact_objections'),
  ('phase4/10_field_checkin_manual_flag',      exists (select 1 from pg_proc where proname = 'review_field_checkin'), 'function review_field_checkin'),
  ('phase4/11_customer_names',                 exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'first_name'), 'column customers.first_name'),
  ('phase4/12_default_backoffice_assignee',    exists (select 1 from pg_proc where proname = 'route_lead_to_backoffice'), 'function route_lead_to_backoffice'),
  ('phase4/13_case_exception_state',           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cases' and column_name = 'exception_state'), 'column cases.exception_state'),
  ('phase4/14_follow_up_kind',                 exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'follow_ups' and column_name = 'kind'), 'column follow_ups.kind'),
  ('phase4/15_convert_lead_match_phone_only',  exists (select 1 from pg_proc where proname = 'customer_match_phone'), 'function customer_match_phone'),
  ('phase4/17_admin_only_staff_provisioning',  coalesce(position('a.role = ''manager''' in pg_get_functiondef(to_regprocedure('public.staff_admin_can(uuid,text,text)'))) = 0, false), 'staff_admin_can() has phase4/17 matrix or later; phase4/20 may supersede its body'),
  ('phase4/20_backoffice_sales_agent_provisioning', coalesce(position('a.role in (''manager'', ''back_office'')' in pg_get_functiondef(to_regprocedure('public.staff_admin_can(uuid,text,text)'))) > 0, false), 'Back Office / legacy Manager may manage Sales Agents only'),
  ('phase4/18_sales_own_records_scope',        exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leads' and policyname = 'sales own records (restrictive)'), 'restrictive policy «sales own records (restrictive)» on leads'),
  ('phase4/21_sales_isolation_completion',     to_regprocedure('private.convert_lead_to_case(uuid)') is not null and exists (select 1 from pg_trigger where tgname = 'case_documents_verification_guard') and exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'sales own files read (restrictive)'), 'RPC wrappers + verification guard + sales file policies'),
  ('phase5/19_field_sales_saved_routes',        to_regclass('public.field_sales_routes') is not null and to_regclass('public.field_sales_route_stops') is not null and to_regclass('public.field_sales_duplicate_reviews') is not null and to_regprocedure('public.field_sales_replace_route_stops(uuid,jsonb)') is not null and to_regprocedure('public.field_sales_route_owner_allowed(uuid)') is not null and to_regprocedure('public.field_sales_candidate_duplicate_signal(text,text,text,double precision,double precision)') is not null and to_regprocedure('public.field_sales_duplicate_review_stamp()') is not null and exists (select 1 from pg_trigger where tgname='field_sales_protect_route_history' and not tgisinternal) and exists (select 1 from pg_trigger where tgname='field_sales_duplicate_review_stamp' and not tgisinternal), 'saved routes/stops and duplicate review queue/signal/RPC/guards'),
  ('phase6/20_user_preferences',                 to_regclass('public.user_preferences') is not null and exists (select 1 from storage.buckets where id = 'avatars' and not public), 'user_preferences table and private avatars bucket'),
  ('phase6/21_two_role_model',                   exists (select 1 from pg_trigger where tgname = 'profiles_no_new_legacy_office' and not tgisinternal), 'legacy manager/back_office roles cannot be assigned; admin-only account matrix'),
  ('phase6/22_crm_integrations_status_invoker', coalesce('security_invoker=true' = any (select unnest(reloptions) from pg_class where oid = to_regclass('public.crm_integrations_status')), false), 'view crm_integrations_status security_invoker')
) as f(file, applied, marker)
order by f.file;

-- phase1/04 (run separately; an error here only means pg_cron is not readable for your user):
-- select jobname, schedule, (command like '%x-cron-secret%') as uses_cron_secret from cron.job order by jobname;
