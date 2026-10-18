-- Rollback of supabase/staged-migrations/phase4/18_sales_own_records_scope.sql: sales see all CRM records again.
do $$
declare t text;
begin
  foreach t in array array['leads','cases','customers','follow_ups','case_documents','timeline_events','case_visits','customer_supply_points','activity_log'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'sales own records (restrictive)', t);
    end if;
  end loop;
end $$;
drop function if exists public.sales_scope_status();
drop function if exists public.sales_owns_entity(text, uuid);
drop function if exists public.sales_owns_customer(uuid);
drop function if exists public.sales_owns_case(uuid);
drop function if exists public.sales_owns_lead(uuid);
drop function if exists public.is_sales_agent();
