-- READ-ONLY. Which staged migrations are already applied in THIS database? Run it yourself in the Supabase SQL editor
-- (staging or production). It reads the catalog only (no data, no personal information) and changes nothing.
-- One row per staged file; `applied` is a marker check (a table, column, trigger, function or policy the file creates).
-- phase1/04 (cron) is checked separately at the bottom because pg_cron may not be readable for your user.
select f.file, f.applied, f.marker
from (values
  ('phase1/01_rls_hardening',                  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_integrations' and policyname = 'admin manage crm_integrations'), 'policy «admin manage crm_integrations»'),
  ('phase1/02_outreach_decisions_audit',       to_regclass('public.outreach_decisions') is not null, 'table outreach_decisions'),
  ('phase1/03_drop_exec_sql',                  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'exec_sql'), 'no public.exec_sql (true also if it never existed)'),
  ('phase1/16_storage_docs_lockdown',          exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'website uploads contact forms')
                                               and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'hlektrismos_docs_anon_select'), 'storage policies'),
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
  ('phase4/15_convert_lead_match_phone_only',  exists (select 1 from pg_proc where proname = 'customer_match_phone'), 'function customer_match_phone')
) as f(file, applied, marker)
order by f.file;

-- phase1/04 (run separately; an error here only means pg_cron is not readable for your user):
-- select jobname, schedule, (command like '%x-cron-secret%') as uses_cron_secret from cron.job order by jobname;
