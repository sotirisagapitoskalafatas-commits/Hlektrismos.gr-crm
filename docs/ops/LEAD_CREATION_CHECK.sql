-- READ ONLY. Lead-creation check for production. Run it yourself in the Supabase SQL Editor (it does not write anything).
--
-- It is ONE statement, so the editor shows the whole result grid: columns  n | item | finding | meaning.
-- It reads the database catalog and aggregate counts only. It returns no names, phone numbers, e-mails, addresses or documents.
-- A missing table, column or function is reported as a finding, never as an error.
--
-- What it answers (see docs/product/PHASE_ONE_AUDIT_AND_PLAN.md, section 2):
--   1. Does the live `leads` table look like the migrations? In particular, are first_name / client_name / client_contact NOT NULL?
--      (If yes, the CRM form before PR #44 failed on every attempt; if first_name is nullable it failed only when phone AND e-mail were empty.)
--   2. Do the objects the #44 fix and the website / chatbot / webhook paths depend on exist in production?
--   3. Are leads being created at all, from which sources, and since when? Is there anything still going to the legacy table?
--   4. Are there rows that look broken (no first name, no contact, no creator)?
--
-- Send back the result grid (copy as text). Do not add anything else to it.

with
cols as (
  select column_name, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'leads'
),
legacy_cols as (
  select column_name
  from information_schema.columns
  where table_schema = 'public' and table_name = 'hlektrismos_leads'
),
has as (
  select to_regclass('public.leads') is not null                           as leads_ok,
         to_regclass('public.hlektrismos_leads') is not null               as legacy_ok,
         to_regclass('supabase_migrations.schema_migrations') is not null  as mig_ok
)
select n, item, finding, meaning
from (

  select 1 as n, 'leads table' as item,
         case when leads_ok then 'present' else 'MISSING' end as finding,
         'public.leads is the only table the CRM lists. If it is missing, nothing else below applies.' as meaning
  from has

  union all
  select 2, 'identity columns: NOT NULL? default?',
         coalesce((select string_agg(column_name || ' — ' || case is_nullable when 'NO' then 'NOT NULL' else 'nullable' end || coalesce(', default ' || column_default, ''), E'\n' order by column_name)
                   from cols
                   where column_name in ('first_name', 'client_name', 'client_contact', 'full_name', 'phone', 'email', 'created_by_user_id', 'assigned_to_user_id')),
                  'none of these columns exist'),
         'Before #44 the CRM form sent first_name = null and client_contact = null. first_name or client_contact NOT NULL here = that form failed on EVERY attempt. first_name nullable but client_contact NOT NULL = it failed only when phone and e-mail were both empty ("sometimes"). Since #44 the payload is valid either way.'

  union all
  select 3, 'check constraints on leads',
         coalesce((select string_agg(conname || ': ' || pg_get_constraintdef(oid), E'\n' order by conname)
                   from pg_constraint where conrelid = to_regclass('public.leads') and contype = 'c'), 'none'),
         'leads_status_check and leads_source_check list the allowed values. A value the CRM sends that is not listed is refused (23514).'

  union all
  select 4, 'triggers on leads',
         coalesce((select string_agg(tgname, ', ' order by tgname) from pg_trigger where tgrelid = to_regclass('public.leads') and not tgisinternal), 'none'),
         'Expected: leads_provider_product_resolve and leads_public_age_gate (the age gate applies to public-form inserts only).'

  union all
  select 5, 'row level security on leads',
         coalesce((select 'RLS ' || case when c.relrowsecurity then 'ON' else 'OFF' end from pg_class c where c.oid = to_regclass('public.leads')), 'table missing')
         || coalesce(E'\n' || (select string_agg(policyname || ' [' || cmd || '] ' || array_to_string(roles, ','), E'\n' order by policyname)
                               from pg_policies where schemaname = 'public' and tablename = 'leads'), E'\n(no policies)'),
         'An INSERT policy must let signed-in staff create leads. "RLS ON and no policies" means every insert is refused.'

  union all
  select 6, 'functions the lead paths call',
         (select string_agg(f || ': ' || case when exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = f) then 'present' else 'MISSING' end, E'\n' order by f)
          from unnest(array['insert_website_lead', 'convert_lead_to_case', 'get_active_tariff_prices', 'leads_provider_product_resolve', 'enforce_public_lead_age']) as f),
         'insert_website_lead: website form and chatbot callback. convert_lead_to_case: the «Μετατροπή» button. A MISSING function fails silently for the caller.'

  union all
  select 7, 'staged duplicate-matching fix (phase4/15)',
         case when exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'customer_match_phone')
              then 'applied (customer_match_phone exists)' else 'not applied' end,
         'Not applied is expected until you approve it. Until then conversion can join two people who both left the e-mail blank to one customer (finding D1).'

  union all
  select 8, 'migrations recorded as applied',
         case when not mig_ok then 'schema_migrations is not readable here'
              else (xpath('/row/c/text()', query_to_xml($q$ select 'newest ' || coalesce(max(version), '-') || '; lead migrations recorded: ' ||
                        count(*) filter (where version in ('20260908180001', '20260909200000', '20260910000200', '20261001000100'))::text || ' of 4' as c
                        from supabase_migrations.schema_migrations $q$, false, true, '')))[1]::text end,
         'Expected 4 of 4: leads table, lead foundation (constraints and RPCs), provider/product resolve, age gate.'
  from has

  union all
  select 9, 'leads: total and newest',
         case when not leads_ok then 'n/a'
              when not exists (select 1 from cols where column_name = 'created_at') then 'column created_at missing'
              else (xpath('/row/c/text()', query_to_xml($q$ select count(*)::text || ' leads; newest ' || coalesce(max(created_at)::text, '-') as c from public.leads $q$, false, true, '')))[1]::text end,
         'A newest date weeks old while the sales team reports entering leads = creations are being refused or going elsewhere.'
  from has

  union all
  select 10, 'leads per week and source, since 1 September',
         case when not leads_ok then 'n/a'
              when (select count(*) from cols where column_name in ('created_at', 'source')) < 2 then 'column created_at or source missing'
              else (xpath('/row/c/text()', query_to_xml($q$ select coalesce(string_agg(w::text || '  ' || src || '  ' || n::text, E'\n' order by w desc, src), 'no leads since 1 September') as c
                        from (select date_trunc('week', created_at)::date as w, coalesce(source, '?') as src, count(*) as n
                              from public.leads where created_at >= date '2026-09-01' group by 1, 2) t $q$, false, true, '')))[1]::text end,
         'Shows whether manual, website, chatbot and webhook leads all arrive. A source that stops on a date points at the path that broke.'
  from has

  union all
  select 11, 'legacy table hlektrismos_leads (the CRM does not list it)',
         case when not legacy_ok then 'not present'
              when not exists (select 1 from legacy_cols where column_name = 'created_at') then 'present; column created_at missing'
              else (xpath('/row/c/text()', query_to_xml($q$ select count(*)::text || ' rows; newest ' || coalesce(max(created_at)::text, '-') as c from public.hlektrismos_leads $q$, false, true, '')))[1]::text end,
         'Before #44 the chatbot and ad webhooks wrote here, so those requests never appeared in the CRM. Rows newer than the #44 deploy would mean something still writes here.'
  from has

  union all
  select 12, 'rows that look broken',
         case when not leads_ok then 'n/a'
              when (select count(*) from cols where column_name in ('first_name', 'client_contact', 'created_by_user_id', 'assigned_to_user_id')) < 4 then 'some of the columns first_name, client_contact, created_by_user_id, assigned_to_user_id are missing'
              else (xpath('/row/c/text()', query_to_xml($q$ select count(*) filter (where coalesce(btrim(first_name), '') = '')::text || ' without first_name; ' ||
                        count(*) filter (where coalesce(btrim(client_contact), '') = '')::text || ' without client_contact; ' ||
                        count(*) filter (where created_by_user_id is null)::text || ' without creator; ' ||
                        count(*) filter (where assigned_to_user_id is null)::text || ' without assignee' as c from public.leads $q$, false, true, '')))[1]::text end,
         'Counts only. Rows without a creator or assignee are normal for website and chatbot leads.'
  from has

  union all
  select 13, 'statuses in use',
         case when not leads_ok then 'n/a'
              when not exists (select 1 from cols where column_name = 'status') then 'column status missing'
              else (xpath('/row/c/text()', query_to_xml($q$ select coalesce(string_agg(coalesce(status, '?') || ': ' || n::text, ', ' order by n desc), 'no leads') as c
                        from (select status, count(*) as n from public.leads group by status) t $q$, false, true, '')))[1]::text end,
         'A status that is not in the check constraint above would mean the constraint is not the one in the migrations.'
  from has

  union all
  select 14, 'phone numbers that appear on more than one lead',
         case when not leads_ok then 'n/a'
              when not exists (select 1 from cols where column_name = 'phone') then 'column phone missing'
              else (xpath('/row/c/text()', query_to_xml($q$ select count(*)::text || ' phone numbers (the numbers themselves are not shown)' as c
                        from (select phone from public.leads where coalesce(btrim(phone), '') <> '' group by phone having count(*) > 1) t $q$, false, true, '')))[1]::text end,
         'A size estimate for the duplicate problem the approval queue would address. No retry protection exists on lead creation today.'
  from has

  union all
  select 99, 'what to send back',
         'Copy this grid as text and send it back.',
         'It contains structure and counts only: no names, phones, e-mails, addresses or documents.'

) t
order by n;
