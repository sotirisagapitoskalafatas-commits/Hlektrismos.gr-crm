-- ROLLBACK for staged phase1/17. Tested locally (PGlite): supabase/tests/anon-restrictive-lockdown.test.mjs.
-- Removes only the restrictive policies that file added (the tables' own policies were never touched) and resets the function setting.
do $$
declare t text;
begin
  foreach t in array array[
    'agent_provider_commissions', 'customer_agent_attribution', 'customer_commissions_ledger', 'customer_documents', 'sales_agents',
    'supply_points', 'customer_meters', 'entity_documents', 'crm_users', 'crm_tasks', 'crm_integrations', 'crm_emails'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'anon never (restrictive)', t);
    end if;
  end loop;
end $$;
do $$
begin
  if to_regprocedure('public.create_crm_user(text,text,text,text,text)') is not null then
    execute 'alter function public.create_crm_user(text,text,text,text,text) reset search_path';
  end if;
end $$;
