-- EMERGENCY ROLLBACK for supabase/staged-migrations/phase4/21_sales_isolation_completion.sql.
-- Re-opens the Stage 2A findings (Sales Agents reach each other's data). Use only to restore service, then fix forward.
-- Order matters: restore the original RPCs first, then drop guards and policies.

-- E. Put the five original SECURITY DEFINER functions back in public (replacing the wrappers).
do $$
declare
  sig text;
begin
  foreach sig in array array['convert_lead_to_case(uuid)', 'route_lead_to_backoffice(uuid)', 'set_case_exception(uuid,text,text)',
                             'case_document_blockers(uuid,text)', 'field_sales_metrics(uuid,integer)'] loop
    if to_regprocedure('private.' || sig) is not null then
      if to_regprocedure('public.' || sig) is not null then execute format('drop function public.%s', sig); end if;
      execute format('alter function private.%s set schema public', sig);
      execute format('revoke all on function public.%s from public, anon', sig);
      execute format('grant execute on function public.%s to authenticated, service_role', sig);
    end if;
  end loop;
end $$;
drop function if exists public.sales_assert_can_act(text, uuid);

-- D. Files.
drop policy if exists "sales own files read (restrictive)" on storage.objects;
drop policy if exists "sales own files change (restrictive)" on storage.objects;
drop policy if exists "sales own files delete (restrictive)" on storage.objects;
drop policy if exists "sales own files upload (restrictive)" on storage.objects;
drop function if exists public.sales_can_read_object(text, text);
drop function if exists public.sales_can_write_object(text, text);

-- C. Document verification guard.
drop trigger if exists case_documents_verification_guard on public.case_documents;
drop function if exists public.case_documents_verification_guard();

-- B. Protected fields guard.
drop trigger if exists sales_protected_fields_guard on public.leads;
drop trigger if exists sales_protected_fields_guard on public.cases;
drop trigger if exists sales_protected_fields_guard on public.customers;
drop function if exists public.sales_protected_fields_guard();

-- A. Restrictive row policies added by phase4/21 (the phase4/18 ones on leads, cases, customers, follow_ups,
-- case_documents, timeline_events, case_visits, customer_supply_points and activity_log are left in place).
do $$
declare
  t text;
begin
  foreach t in array array['case_offers', 'case_signatures', 'consent_records', 'field_checkins', 'business_events', 'work_items',
    'contact_consents', 'contact_objections', 'outreach_decisions', 'lead_notes', 'voice_calls', 'crm_emails', 'crm_documents',
    'crm_tasks', 'calendar_events', 'campaign_sends', 'contact_consent', 'customer_documents', 'customer_meters',
    'customer_agent_attribution', 'customer_commissions_ledger', 'entity_documents', 'supply_points', 'hlektrismos_leads',
    'hlektrismos_customers'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'sales own records (restrictive)', t);
    end if;
  end loop;
end $$;
