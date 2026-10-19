-- STAGED ONLY — DO NOT APPLY TO STAGING OR PRODUCTION from this PR without a separate owner-approved change window.
-- Phase 1 / 18: close confirmed anonymous table/RPC access and profile self-promotion paths found in the
-- read-only production audit on 2026-10-19. No rows are deleted or rewritten.
--
-- Preserves intentional public intake:
--   * public.insert_website_lead(text,jsonb) remains executable by anon/authenticated.
--   * anon may INSERT into public.leads only with age_confirmed=true and consent when source='website'.
--   * anon may INSERT into public.hlektrismos_leads only with consent=true and age_confirmed=true.
--   * public tariff catalogue reads remain available through market_tariffs_view.
--
-- This is a focused hotfix, not a claim that the whole CRM is secure. Agent-specific record isolation and
-- file-to-owner authorization require a separate, ownership-aware migration and negative tests.
-- Rollback (emergency only; re-opens the findings): docs/ops/rollback_phase1_18_live_api_privilege_hardening.sql.

-- 1. Revoke PUBLIC/anon privileges on private CRM tables, then restore intended authenticated access.
-- CRM users is intentionally SELECT-only through the data API: role changes/provisioning use trusted admin paths.
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
    'work_items', 'assignments', 'customer_meters'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all privileges on table public.%I from public, anon, authenticated', t);

      if t = 'profiles' then
        execute 'grant select on table public.profiles to authenticated';
        execute 'grant update (full_name, phone, avatar_url, timezone, language, updated_at) on table public.profiles to authenticated';
      elsif t = 'crm_users' then
        execute 'grant select on table public.crm_users to authenticated';
      elsif t = 'crm_integrations' then
        execute 'grant select, insert, update, delete on table public.crm_integrations to authenticated';
      elsif t = 'crm_settings' then
        execute 'grant select, insert, update, delete on table public.crm_settings to authenticated';
      else
        execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
      end if;

      execute format('grant all privileges on table public.%I to service_role', t);
    end if;
  end loop;
end $$;

-- 2. Defense in depth: an anon-specific RESTRICTIVE policy is AND-ed with every legacy permissive policy.
-- That means old policies written TO public USING (true) cannot restore anonymous access.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'crm_users', 'customer_documents', 'sales_agents',
    'agent_provider_commissions', 'customer_agent_attribution', 'customer_commissions_ledger',
    'supply_points', 'customer_meters', 'entity_documents', 'crm_tasks', 'crm_integrations',
    'crm_emails', 'crm_settings', 'lead_notes', 'campaigns', 'campaign_sends', 'voice_calls',
    'contact_consent', 'consent_records', 'email_suppressions', 'customers', 'cases',
    'customer_supply_points', 'case_documents', 'case_visits', 'case_signatures',
    'case_offers', 'follow_ups', 'timeline_events', 'app_notifications', 'calendar_events',
    'chat_messages', 'chat_threads', 'agent_conversations', 'agent_memory', 'agent_reports',
    'ai_agents', 'powerfor_leads', 'notification_log', 'business_events', 'work_items', 'assignments'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'anon private rows deny (phase1/18)', t);
      execute format(
        'create policy %I on public.%I as restrictive for all to anon using (false) with check (false)',
        'anon private rows deny (phase1/18)', t
      );
    end if;
  end loop;
end $$;

-- 3. The two lead tables have intentional public intake, so deny anonymous reads/updates/deletes separately
-- and constrain anon INSERT with the existing age/consent model. Do not change signed-in staff policies here.
do $$
begin
  if to_regclass('public.leads') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='leads' and column_name='age_confirmed'
    ) or not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='leads' and column_name='gdpr_consent'
    ) or not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='leads' and column_name='source'
    ) then
      raise exception 'phase1/18 prerequisite failed: public.leads age/consent/source columns are required';
    end if;

    grant insert on table public.leads to anon;
    drop policy if exists "anon leads read deny (phase1/18)" on public.leads;
    create policy "anon leads read deny (phase1/18)" on public.leads as restrictive for select to anon using (false);
    drop policy if exists "anon leads update deny (phase1/18)" on public.leads;
    create policy "anon leads update deny (phase1/18)" on public.leads as restrictive for update to anon using (false) with check (false);
    drop policy if exists "anon leads delete deny (phase1/18)" on public.leads;
    create policy "anon leads delete deny (phase1/18)" on public.leads as restrictive for delete to anon using (false);
    drop policy if exists "anon leads intake requirements (phase1/18)" on public.leads;
    create policy "anon leads intake requirements (phase1/18)" on public.leads as restrictive for insert to anon
      with check (
        age_confirmed is true
        and (source is distinct from 'website' or gdpr_consent is true)
      );
  end if;

  if to_regclass('public.hlektrismos_leads') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='hlektrismos_leads' and column_name='age_confirmed'
    ) or not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='hlektrismos_leads' and column_name='consent'
    ) then
      raise exception 'phase1/18 prerequisite failed: public.hlektrismos_leads age/consent columns are required';
    end if;

    grant insert on table public.hlektrismos_leads to anon;
    drop policy if exists "anon hlektrismos leads read deny (phase1/18)" on public.hlektrismos_leads;
    create policy "anon hlektrismos leads read deny (phase1/18)" on public.hlektrismos_leads as restrictive for select to anon using (false);
    drop policy if exists "anon hlektrismos leads update deny (phase1/18)" on public.hlektrismos_leads;
    create policy "anon hlektrismos leads update deny (phase1/18)" on public.hlektrismos_leads as restrictive for update to anon using (false) with check (false);
    drop policy if exists "anon hlektrismos leads delete deny (phase1/18)" on public.hlektrismos_leads;
    create policy "anon hlektrismos leads delete deny (phase1/18)" on public.hlektrismos_leads as restrictive for delete to anon using (false);
    drop policy if exists "anon hlektrismos leads intake requirements (phase1/18)" on public.hlektrismos_leads;
    create policy "anon hlektrismos leads intake requirements (phase1/18)" on public.hlektrismos_leads as restrictive for insert to anon
      with check (consent is true and age_confirmed is true);
  end if;
end $$;

-- 4. Restore the profile role/status guard. UPDATE policies are permissive by default and OR together;
-- the trigger blocks direct API mutation even if a future policy is accidentally too broad.
create or replace function public.profiles_guard_privileged()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if coalesce(new.role, 'inside_sales') <> 'inside_sales' or coalesce(new.is_active, true) then
        raise exception 'profiles: new profiles must start inactive as inside_sales; use staff administration'
          using errcode = '42501';
      end if;
    elsif new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.id is distinct from old.id then
      raise exception 'profiles: role/status can only be changed through staff administration'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.profiles') is not null then
    drop trigger if exists profiles_guard_privileged on public.profiles;
    create trigger profiles_guard_privileged before insert or update on public.profiles
      for each row execute function public.profiles_guard_privileged();

    drop policy if exists "profiles update own" on public.profiles;
    create policy "profiles update own" on public.profiles for update to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id and role = (select p.role from public.profiles p where p.id = auth.uid()));
  end if;
end $$;

-- 5. Sensitive settings are office-only, including the legacy back_office role during the compatibility period.
-- The public/anon denial above remains in force for both tables.
do $$
begin
  if to_regclass('public.crm_integrations') is not null then
    drop policy if exists "phase1/18 office integrations only" on public.crm_integrations;
    create policy "phase1/18 office integrations only" on public.crm_integrations as restrictive for all to authenticated
      using (public.is_role('admin') or public.is_role('back_office'))
      with check (public.is_role('admin') or public.is_role('back_office'));
  end if;
  if to_regclass('public.crm_settings') is not null then
    drop policy if exists "phase1/18 office settings only" on public.crm_settings;
    create policy "phase1/18 office settings only" on public.crm_settings as restrictive for all to authenticated
      using (public.is_role('admin') or public.is_role('back_office'))
      with check (public.is_role('admin') or public.is_role('back_office'));
  end if;
end $$;

-- 6. Replace the unauthenticated lead reassignment RPC with a guarded implementation.
-- Only office roles can reassign; the requested destination must be an active Sales Agent.
create or replace function public.reassign_lead(lead_id uuid, new_agent_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null
       or not public.is_staff()
       or not (public.is_role('admin') or public.is_role('back_office')) then
      raise exception 'reassign_lead: office permission required' using errcode = '42501';
    end if;
  end if;

  if not (
    exists (
      select 1 from public.profiles p
      where p.id = new_agent_id and coalesce(p.is_active, true)
        and p.role in ('inside_sales', 'field_sales')
    )
    or exists (
      select 1 from public.crm_users cu
      where cu.id = new_agent_id and cu.role::text = 'sales' and coalesce(cu.is_active, true)
    )
  ) then
    raise exception 'reassign_lead: target must be an active Sales Agent' using errcode = '22023';
  end if;

  update public.hlektrismos_leads
  set assigned_to = new_agent_id, assigned_at = now(), assigned_by = auth.uid()
  where id = reassign_lead.lead_id;

  if not found then
    raise exception 'reassign_lead: lead not found' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.reassign_lead(uuid, uuid) from public, anon;
grant execute on function public.reassign_lead(uuid, uuid) to authenticated, service_role;

-- 7. Protect the legacy supply-point upsert: it cannot be called anonymously or used to hijack an
-- existing 11-digit supply point and move it to a different entity. Sales users use the newer customer
-- supply-point flow; this legacy RPC is limited to office/service operations.
create or replace function public.upsert_supply_point(
  p_entity_id uuid,
  p_entity_type text,
  p_supply_number text,
  p_provider_name text default null,
  p_program_name text default null,
  p_sales_agent_id uuid default null,
  p_estimated_commission numeric default 0.00,
  p_monthly_cost numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null
       or not public.is_staff()
       or not (public.is_role('admin') or public.is_role('back_office')) then
      raise exception 'upsert_supply_point: office permission required' using errcode = '42501';
    end if;
  end if;

  if p_entity_type not in ('lead', 'customer') then
    raise exception 'upsert_supply_point: entity_type must be lead or customer' using errcode = '22023';
  end if;
  if p_supply_number is null or btrim(p_supply_number) = '' then
    raise exception 'upsert_supply_point: supply number is required' using errcode = '22023';
  end if;

  insert into public.supply_points (
    entity_id, entity_type, supply_number, provider_name, program_name,
    sales_agent_id, estimated_commission, monthly_cost
  ) values (
    p_entity_id, p_entity_type, btrim(p_supply_number), p_provider_name, p_program_name,
    p_sales_agent_id, coalesce(p_estimated_commission, 0.00), p_monthly_cost
  )
  on conflict (supply_number) do update set
    provider_name = coalesce(excluded.provider_name, public.supply_points.provider_name),
    program_name = coalesce(excluded.program_name, public.supply_points.program_name),
    sales_agent_id = coalesce(excluded.sales_agent_id, public.supply_points.sales_agent_id),
    estimated_commission = excluded.estimated_commission,
    monthly_cost = excluded.monthly_cost,
    updated_at = now()
  where public.supply_points.entity_id = excluded.entity_id
    and public.supply_points.entity_type = excluded.entity_type
  returning id into v_id;

  if v_id is null then
    raise exception 'upsert_supply_point: supply number is already linked to another entity; Back Office review required'
      using errcode = '23505';
  end if;
  return v_id;
end;
$$;
revoke all on function public.upsert_supply_point(uuid, text, text, text, text, uuid, numeric, numeric) from public, anon;
grant execute on function public.upsert_supply_point(uuid, text, text, text, text, uuid, numeric, numeric) to authenticated, service_role;

-- 8. Generic multi-role RPCs are not available through the browser API. User and role administration must go
-- through the authenticated Admin/Back Office endpoint and audited staff functions, not direct role RPC calls.
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
      execute format('revoke all on function %s from public, anon, authenticated', to_regprocedure(sig));
      execute format('grant execute on function %s to service_role', to_regprocedure(sig));
    end if;
  end loop;

  -- Read-only/legacy RPCs which still have app uses may be called by authenticated staff only.
  if to_regprocedure('public.convert_lead_to_case(uuid)') is not null then
    revoke all on function public.convert_lead_to_case(uuid) from public, anon;
    grant execute on function public.convert_lead_to_case(uuid) to authenticated, service_role;
  end if;
  if to_regprocedure('public.check_dnc_status(text)') is not null then
    revoke all on function public.check_dnc_status(text) from public, anon;
    grant execute on function public.check_dnc_status(text) to authenticated, service_role;
  end if;
  if to_regprocedure('public.get_agent_lead_counts()') is not null then
    revoke all on function public.get_agent_lead_counts() from public, anon;
    grant execute on function public.get_agent_lead_counts() to authenticated, service_role;
  end if;

  -- Trigger functions run as part of their table triggers; they need not be callable as RPC endpoints.
  foreach sig in array array[
    'public.bump_case_stage_entered()',
    'public.calculate_agent_commission()',
    'public.customer_supply_points_audit()',
    'public.distribute_leads_equally()',
    'public.handle_new_user()',
    'public.leads_move_supply_points()'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', to_regprocedure(sig));
      execute format('grant execute on function %s to service_role', to_regprocedure(sig));
    end if;
  end loop;
end $$;

-- 9. Restrict the SECURITY DEFINER RPCs observed callable by anon in the live audit.
-- Public access is retained only for the explicit website-intake and tariff-price endpoints.
-- This is an explicit allowlist rather than changing grants for every SECURITY DEFINER function,
-- to avoid accidentally disabling unknown public integrations or changing unrelated function grants.
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.bump_case_stage_entered()',
    'public.calculate_agent_commission()',
    'public.check_dnc_status(text)',
    'public.convert_lead_to_case(uuid)',
    'public.convert_lead_to_customer(uuid)',
    'public.crm_can_view_team(uuid)',
    'public.crm_can_view_territory(uuid)',
    'public.crm_current_organization_id()',
    'public.crm_grant_role(uuid,text,boolean)',
    'public.crm_has_role(text)',
    'public.crm_revoke_role(uuid,text)',
    'public.crm_set_primary_role(uuid,text)',
    'public.customer_supply_points_audit()',
    'public.distribute_leads_equally()',
    'public.get_agent_lead_counts()',
    'public.handle_new_user()',
    'public.insert_website_lead(text,jsonb)',
    'public.is_role(text)',
    'public.is_staff()',
    'public.leads_move_supply_points()',
    'public.reassign_lead(uuid,uuid)',
    'public.set_user_role(uuid,text)',
    'public.upsert_scraped_b2b_leads(jsonb)',
    'public.upsert_supply_point(uuid,text,text,text,text,uuid,numeric,numeric)',
    'public.get_active_tariff_prices(text)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('revoke execute on function %s from public, anon', to_regprocedure(sig));
    end if;
  end loop;

  -- Internal helpers and staff workflows remain callable by authenticated users.
  foreach sig in array array[
    'public.check_dnc_status(text)',
    'public.convert_lead_to_case(uuid)',
    'public.crm_can_view_team(uuid)',
    'public.crm_can_view_territory(uuid)',
    'public.crm_current_organization_id()',
    'public.crm_has_role(text)',
    'public.get_agent_lead_counts()',
    'public.is_role(text)',
    'public.is_staff()',
    'public.reassign_lead(uuid,uuid)',
    'public.upsert_supply_point(uuid,text,text,text,text,uuid,numeric,numeric)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('grant execute on function %s to authenticated, service_role', to_regprocedure(sig));
    end if;
  end loop;

  -- Role administration, legacy conversion, scraper writes and trigger functions stay service-only.
  foreach sig in array array[
    'public.bump_case_stage_entered()',
    'public.calculate_agent_commission()',
    'public.convert_lead_to_customer(uuid)',
    'public.crm_grant_role(uuid,text,boolean)',
    'public.crm_revoke_role(uuid,text)',
    'public.crm_set_primary_role(uuid,text)',
    'public.customer_supply_points_audit()',
    'public.distribute_leads_equally()',
    'public.handle_new_user()',
    'public.leads_move_supply_points()',
    'public.set_user_role(uuid,text)',
    'public.upsert_scraped_b2b_leads(jsonb)'
  ] loop
    if to_regprocedure(sig) is not null then
      execute format('revoke execute on function %s from authenticated', to_regprocedure(sig));
      execute format('grant execute on function %s to service_role', to_regprocedure(sig));
    end if;
  end loop;

  if to_regprocedure('public.insert_website_lead(text,jsonb)') is not null then
    grant execute on function public.insert_website_lead(text,jsonb) to anon, authenticated, service_role;
  end if;
  if to_regprocedure('public.get_active_tariff_prices(text)') is not null then
    grant execute on function public.get_active_tariff_prices(text) to anon, authenticated, service_role;
  end if;
end $$;

-- 10. Pin a safe search_path on SECURITY DEFINER functions that still have the mutable default.
-- This only sets function configuration; it does not change their body or return shape.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg like 'search_path=%'
      )
  loop
    execute format('alter function %s set search_path = pg_catalog, public, pg_temp', f.signature);
  end loop;
end $$;

-- 11. Tariffs are public catalogue data. Use invoker permissions/RLS for this view rather than view-owner rights.
-- The underlying tariff tables explicitly allow public SELECT; that behaviour remains unchanged.
do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'market_tariffs_view' and c.relkind = 'v'
  ) then
    alter view public.market_tariffs_view set (security_invoker = true);
  end if;
end $$;

comment on function public.profiles_guard_privileged() is
  'Phase 1/18: direct anon/authenticated API writes cannot change profile role, active status or id; account administration uses trusted audited paths.';
comment on function public.reassign_lead(uuid, uuid) is
  'Phase 1/18: active office-only lead reassignment; target must be an active Sales Agent.';
comment on function public.upsert_supply_point(uuid, text, text, text, text, uuid, numeric, numeric) is
  'Phase 1/18: office/service-only legacy supply-point upsert; duplicate supply numbers cannot move between entities.';
