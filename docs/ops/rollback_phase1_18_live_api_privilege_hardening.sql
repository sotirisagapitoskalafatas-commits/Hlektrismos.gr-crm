-- EMERGENCY ROLLBACK ONLY for phase1/18_live_api_privilege_hardening.sql.
-- This intentionally restores the prior, vulnerable grants/policies and must not be used as routine cleanup.
-- Re-run the read-only security audit immediately afterward and obtain owner approval before restoring service this way.

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'crm_users', 'customer_documents', 'sales_agents',
    'agent_provider_commissions', 'customer_agent_attribution', 'customer_commissions_ledger',
    'supply_points', 'customer_meters', 'entity_documents', 'crm_tasks', 'crm_integrations',
    'crm_emails', 'crm_settings', 'lead_notes', 'campaigns', 'campaign_sends', 'voice_calls',
    'contact_consent', 'consent_records', 'email_suppressions', 'leads', 'hlektrismos_leads',
    'customers', 'cases', 'customer_supply_points', 'case_documents', 'case_visits',
    'case_signatures', 'case_offers', 'follow_ups', 'timeline_events', 'app_notifications',
    'calendar_events', 'chat_messages', 'chat_threads', 'agent_conversations', 'agent_memory',
    'agent_reports', 'ai_agents', 'powerfor_leads', 'notification_log', 'business_events',
    'work_items', 'assignments'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'anon private rows deny (phase1/18)', t);
      execute format('revoke all privileges on table public.%I from public, anon, authenticated', t);
      execute format('grant all privileges on table public.%I to public, anon, authenticated', t);
      execute format('grant all privileges on table public.%I to service_role', t);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.leads') is not null then
    drop policy if exists "anon leads read deny (phase1/18)" on public.leads;
    drop policy if exists "anon leads update deny (phase1/18)" on public.leads;
    drop policy if exists "anon leads delete deny (phase1/18)" on public.leads;
    drop policy if exists "anon leads intake requirements (phase1/18)" on public.leads;
  end if;
  if to_regclass('public.hlektrismos_leads') is not null then
    drop policy if exists "anon hlektrismos leads read deny (phase1/18)" on public.hlektrismos_leads;
    drop policy if exists "anon hlektrismos leads update deny (phase1/18)" on public.hlektrismos_leads;
    drop policy if exists "anon hlektrismos leads delete deny (phase1/18)" on public.hlektrismos_leads;
    drop policy if exists "anon hlektrismos leads intake requirements (phase1/18)" on public.hlektrismos_leads;
  end if;
  if to_regclass('public.crm_integrations') is not null then
    drop policy if exists "phase1/18 office integrations only" on public.crm_integrations;
  end if;
  if to_regclass('public.crm_settings') is not null then
    drop policy if exists "phase1/18 office settings only" on public.crm_settings;
  end if;
end $$;

do $$
begin
  if to_regclass('public.profiles') is not null then
    drop trigger if exists profiles_guard_privileged on public.profiles;
    drop policy if exists "profiles update own" on public.profiles;
    create policy "profiles update own" on public.profiles for update to authenticated
      using (auth.uid() = id) with check (auth.uid() = id);
    grant all privileges on table public.profiles to public, anon, authenticated;
    grant all privileges on table public.profiles to service_role;
  end if;
end $$;
drop function if exists public.profiles_guard_privileged();

-- Restore the previous function bodies and public execute grants only if these functions existed before the hotfix.
create or replace function public.reassign_lead(lead_id uuid, new_agent_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.hlektrismos_leads
  set assigned_to = new_agent_id, assigned_at = now(), assigned_by = auth.uid()
  where id = reassign_lead.lead_id;
end;
$$;
grant execute on function public.reassign_lead(uuid, uuid) to public, anon, authenticated, service_role;

create or replace function public.upsert_supply_point(
  p_entity_id uuid, p_entity_type text, p_supply_number text,
  p_provider_name text default null, p_program_name text default null,
  p_sales_agent_id uuid default null, p_estimated_commission numeric default 0.00,
  p_monthly_cost numeric default null
)
returns uuid
language plpgsql
security definer
as $$
declare v_id uuid;
begin
  insert into public.supply_points (
    entity_id, entity_type, supply_number, provider_name, program_name,
    sales_agent_id, estimated_commission, monthly_cost
  ) values (
    p_entity_id, p_entity_type, p_supply_number, p_provider_name, p_program_name,
    p_sales_agent_id, p_estimated_commission, p_monthly_cost
  )
  on conflict (supply_number) do update set
    entity_id = excluded.entity_id,
    entity_type = excluded.entity_type,
    provider_name = coalesce(excluded.provider_name, public.supply_points.provider_name),
    program_name = coalesce(excluded.program_name, public.supply_points.program_name),
    sales_agent_id = coalesce(excluded.sales_agent_id, public.supply_points.sales_agent_id),
    estimated_commission = excluded.estimated_commission,
    monthly_cost = excluded.monthly_cost,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.upsert_supply_point(uuid, text, text, text, text, uuid, numeric, numeric) to public, anon, authenticated, service_role;

do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.crm_grant_role(uuid,text,boolean)',
    'public.crm_revoke_role(uuid,text)',
    'public.crm_set_primary_role(uuid,text)',
    'public.set_user_role(uuid,text)',
    'public.convert_lead_to_customer(uuid)',
    'public.upsert_scraped_b2b_leads(jsonb)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('grant execute on function %s to public, anon, authenticated, service_role', to_regprocedure(sig));
    end if;
  end loop;

  foreach sig in array array[
    'public.bump_case_stage_entered()',
    'public.calculate_agent_commission()',
    'public.customer_supply_points_audit()',
    'public.distribute_leads_equally()',
    'public.handle_new_user()',
    'public.leads_move_supply_points()'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('grant execute on function %s to public, anon, authenticated, service_role', to_regprocedure(sig));
    end if;
  end loop;

  if to_regprocedure('public.convert_lead_to_case(uuid)') is not null then
    grant execute on function public.convert_lead_to_case(uuid) to public, anon, authenticated, service_role;
  end if;
  if to_regprocedure('public.check_dnc_status(text)') is not null then
    grant execute on function public.check_dnc_status(text) to public, anon, authenticated, service_role;
  end if;
  if to_regprocedure('public.get_agent_lead_counts()') is not null then
    grant execute on function public.get_agent_lead_counts() to public, anon, authenticated, service_role;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relname='market_tariffs_view' and c.relkind='v'
  ) then
    alter view public.market_tariffs_view set (security_invoker = false);
  end if;
end $$;

-- Restore previously mutable search paths for functions that this migration pinned.
-- This is intentionally a regression to the old risk and should only be done if the owner accepts it.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prosecdef
      and exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg = 'search_path=pg_catalog, public, pg_temp'
      )
  loop
    execute format('alter function %s reset search_path', f.signature);
  end loop;
end $$;
