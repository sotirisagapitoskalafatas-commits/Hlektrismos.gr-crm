-- READ-ONLY. Run in the Supabase SQL editor of the database you are about to change (staging first, then live). It reads the catalog only: no data, no secrets.
-- Purpose: close the "live reconciliation: pending" item of docs/product/FIELD_VISITS_AND_APPLICATIONS.md. Paste each result block back to Claude.
-- Nothing here writes, so it is safe to run on production.

-- 1. Nullability, defaults and types of every table the Field Visits / Applications work touches.
select table_name, column_name, data_type, is_nullable, left(column_default, 60) as column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('case_visits', 'follow_ups', 'timeline_events', 'case_documents', 'customer_supply_points', 'cases', 'leads', 'customers', 'field_checkins', 'activity_log')
order by table_name, ordinal_position;

-- 2. Constraints (CHECK, FK, UNIQUE) on those tables, including whether they are validated.
select conrelid::regclass as table_name, conname, contype, convalidated, left(pg_get_constraintdef(oid), 200) as definition
from pg_constraint
where conrelid in ('public.case_visits'::regclass, 'public.follow_ups'::regclass, 'public.timeline_events'::regclass, 'public.case_documents'::regclass,
                   'public.customer_supply_points'::regclass, 'public.cases'::regclass, 'public.field_checkins'::regclass)
order by 1, 2;

-- 3. Row-level-security policies of those tables (permissive and restrictive), and whether RLS is on.
select schemaname, tablename, policyname, permissive, roles, cmd, left(coalesce(qual, ''), 160) as using_expr, left(coalesce(with_check, ''), 160) as check_expr
from pg_policies
where schemaname = 'public' and tablename in ('case_visits', 'follow_ups', 'timeline_events', 'case_documents', 'customer_supply_points', 'cases', 'activity_log', 'field_checkins')
order by tablename, policyname;
select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('case_visits', 'follow_ups', 'case_documents', 'customer_supply_points', 'activity_log');

-- 4. Storage: buckets and the policies on storage.objects (the bucket used for case documents is client_documents; it is not created by any repository migration).
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
select policyname, permissive, roles, cmd, left(coalesce(qual, ''), 200) as using_expr, left(coalesce(with_check, ''), 200) as check_expr
from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- 5. Functions the visit workflow relies on, and which version of them is live (look for review_flag / the idempotency branch in the body).
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer,
       position('review_flag' in pg_get_functiondef(p.oid)) > 0 as has_review_flag,
       position('IDEMPOTENT' in pg_get_functiondef(p.oid)) > 0 as has_idempotent_branch
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('field_checkin', 'field_checkout', 'convert_lead_to_case', 'sales_owns_entity', 'sales_owns_case', 'sales_owns_lead', 'is_sales_agent', 'sales_can_read_object', 'sales_can_write_object')
order by p.proname;

-- 6. Which staged migrations are already there (the prerequisites of phase7).
select 'phase4/10 review_flag column' as probe, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'field_checkins' and column_name = 'review_flag') as present
union all select 'phase4/12 default backoffice assignee setting', exists (select 1 from public.crm_settings where setting_key ilike '%backoffice%assignee%')
union all select 'phase4/14 follow_ups.kind', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'follow_ups' and column_name = 'kind')
union all select 'phase4/18 sales own records policy', exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'sales own records (restrictive)' and tablename = 'case_visits')
union all select 'phase4/21 storage restrictive policy', exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'sales own files read (restrictive)')
union all select 'phase5/17 customer_supply_points', to_regclass('public.customer_supply_points') is not null
union all select 'phase5/18 customer_supply_points.lead_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customer_supply_points' and column_name = 'lead_id')
union all select 'phase6/25 exact two roles', exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and pg_get_constraintdef(oid) ilike '%sales_agent%' and pg_get_constraintdef(oid) not ilike '%manager%')
union all select 'phase7/01 case_visits.lead_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'case_visits' and column_name = 'lead_id')
union all select 'phase7/02 energy_applications', to_regclass('public.energy_applications') is not null;

-- 7. Applied migration versions (Supabase keeps this list; compare with supabase/migrations/).
select version, name from supabase_migrations.schema_migrations order by version desc limit 40;
