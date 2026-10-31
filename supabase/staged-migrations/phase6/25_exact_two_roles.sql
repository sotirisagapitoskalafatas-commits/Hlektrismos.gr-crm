-- STAGED — apply once, as the project owner, in an approved change window, with a fresh backup. NOT yet applied anywhere.
-- Phase 6 / 25: EXACTLY TWO account types, stored and enforced in the database: `admin` and `sales_agent`.
--   • admin       = the one shared Admin / Back Office login (the single active login itself is enforced by phase6/26).
--   • sales_agent = individual accounts. field_sales and inside_sales both become sales_agent; the difference between them is gone.
--   • manager and back_office stop existing as roles. Those rows are QA leftovers: they become INACTIVE sales_agent rows, which grants nothing.
-- One transaction: it applies whole or not at all. No Auth user, lead, customer, case, assignment or audit row is touched. Every changed profile and
-- user_roles row is recorded first in role_normalization_audit, which is what the rollback restores from.
-- The columns inside_sales_owner / field_sales_owner, lead sources and case work teams keep their names: they describe the work on a record, not an account.
-- is_role() keeps ANSWERING for the old names because 40+ applied policies and functions ask is_role('field_sales') and so on: those questions now mean
-- "is this a Sales Agent", and is_role('manager') / is_role('back_office') are always false. Direct comparisons with role literals are replaced below.
-- ORDER: deploy the app and Edge Functions that read sales_agent FIRST (they accept both spellings); code from before this release refuses sales_agent.
-- Later files: phase4/18 and phase5/19 were updated for sales_agent and may be applied before or after this one.
-- Rollback: docs/ops/rollback_phase6_25_exact_two_roles.sql

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_no_new_legacy_office' and not tgisinternal) then
    raise exception 'phase6/25 needs phase6/21 first';
  end if;
  if to_regprocedure('public.contact_role()') is null or to_regprocedure('public.b2b_role()') is null then
    raise exception 'phase6/25 needs phase3/08 and phase3/09 first';
  end if;
  -- These two were written for the old names. If an old version is live, stop: isolation would silently stop applying to sales_agent.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname in ('is_sales_agent', 'field_sales_route_owner_allowed') and pg_get_functiondef(p.oid) not like '%''sales_agent''%') then
    raise exception 'is_sales_agent() or field_sales_route_owner_allowed() is the old version: review phase4/18 and phase5/19 before continuing';
  end if;
  -- An ACTIVE account in a retired office role that is not a known QA login might be a real person: never switch it off silently.
  if exists (
    select 1 from public.profiles p left join auth.users u on u.id = p.id
    where p.role in ('manager', 'back_office') and coalesce(p.is_active, true)
      and lower(coalesce(u.email, '')) <> all (array['demo@hlektrismos.gr', 'qa.admin@hlektrismos.gr', 'qa.backoffice@hlektrismos.gr', 'qa.manager@hlektrismos.gr', 'qa.fieldsales@hlektrismos.gr', 'qa.insidesales@hlektrismos.gr'])) then
    raise exception 'an active manager/back_office account is not a known QA login: review it by hand first';
  end if;
  if not exists (select 1 from public.profiles where role = 'admin' and coalesce(is_active, true)) then
    raise exception 'no active admin: nothing here may run without one';
  end if;
  if exists (select 1 from public.profiles where role not in ('admin', 'manager', 'inside_sales', 'field_sales', 'back_office', 'sales_agent')) then
    raise exception 'unknown role value in profiles: review it by hand first';
  end if;
end $$;

-- 1) the record of what changed
create table if not exists public.role_normalization_audit (
  id bigserial primary key,
  kind text not null check (kind in ('profile', 'user_role')),
  user_id uuid not null,
  old_role text not null,
  new_role text,
  old_is_active boolean,
  new_is_active boolean,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.role_normalization_audit enable row level security;
revoke all on public.role_normalization_audit from public, anon, authenticated;
grant all on public.role_normalization_audit to service_role;

insert into public.role_normalization_audit (kind, user_id, old_role, new_role, old_is_active, new_is_active)
select 'profile', p.id, p.role, 'sales_agent', coalesce(p.is_active, true), case when p.role in ('manager', 'back_office') then false else coalesce(p.is_active, true) end
from public.profiles p where p.role in ('manager', 'back_office', 'inside_sales', 'field_sales');

-- 2) the catalogue and the grants (is_role also reads user_roles, so a stale manager grant must not survive)
insert into public.roles (key, name, description, sort_order) values ('sales_agent', 'Sales Agent', 'Προσωπικά leads και πελάτες, επισκέψεις, διαδρομές, πωλήσεις και προσφορές', 2)
on conflict (key) do update set name = excluded.name, description = excluded.description;

insert into public.role_normalization_audit (kind, user_id, old_role, new_role, detail)
select 'user_role', ur.user_id, ro.key, case when ro.key in ('inside_sales', 'field_sales') then 'sales_agent' end, to_jsonb(ur) - 'id'
from public.user_roles ur join public.roles ro on ro.id = ur.role_id
where ro.key in ('manager', 'back_office', 'inside_sales', 'field_sales');

alter table public.user_roles disable trigger user_roles_audit; -- role_normalization_audit is the record of this conversion
insert into public.user_roles (user_id, role_id, organization_id, is_primary, scope, granted_by, granted_at)
select distinct on (ur.user_id) ur.user_id, (select id from public.roles where key = 'sales_agent'), ur.organization_id, false, ur.scope, ur.granted_by, ur.granted_at
from public.user_roles ur join public.roles ro on ro.id = ur.role_id
join public.profiles p on p.id = ur.user_id
where ro.key in ('inside_sales', 'field_sales')
order by ur.user_id, ur.is_primary desc
on conflict do nothing;
delete from public.user_roles where role_id in (select id from public.roles where key in ('manager', 'back_office', 'inside_sales', 'field_sales'));
update public.user_roles nw set is_primary = true
where nw.role_id = (select id from public.roles where key = 'sales_agent')
  and exists (select 1 from public.role_normalization_audit a where a.kind = 'user_role' and a.user_id = nw.user_id and a.new_role = 'sales_agent' and (a.detail ->> 'is_primary')::boolean);
alter table public.user_roles enable trigger user_roles_audit;
delete from public.roles where key in ('manager', 'back_office', 'inside_sales', 'field_sales');

-- 3) the rows, then the constraint: exactly two values, for good
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set is_active = false, updated_at = now() where role in ('manager', 'back_office');
update public.profiles set role = 'sales_agent', updated_at = now() where role in ('manager', 'back_office', 'inside_sales', 'field_sales');
alter table public.profiles alter column role set default 'sales_agent';
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'sales_agent'));

-- 4) the role question every policy asks
create or replace function public.is_role(r text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select case
    when r in ('manager', 'back_office') then false
    when r in ('sales_agent', 'field_sales', 'inside_sales') then
      coalesce((select p.role from public.profiles p where p.id = auth.uid()) = 'sales_agent', false) or public.crm_has_role('sales_agent')
    else coalesce((select p.role from public.profiles p where p.id = auth.uid()) = r, false) or public.crm_has_role(r)
  end;
$function$;

-- 5) every direct comparison with a role name, same bodies as before with the two roles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    'sales_agent',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.profiles_guard_privileged()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if coalesce(new.role, 'sales_agent') <> 'sales_agent' or coalesce(new.is_active, true) then
        raise exception 'profiles: new profiles start inactive as sales_agent; use the staff administration' using errcode = '42501';
      end if;
    elsif new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.id is distinct from old.id then
      raise exception 'profiles: role/status can only be changed through the staff administration' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.staff_admin_can(p_actor uuid, p_target_role text, p_new_role text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce((
    select case
      when not coalesce(a.is_active, true) or a.role <> 'admin' then false
      -- create: the only role a new account can get is sales_agent
      when p_target_role is null then p_new_role = 'sales_agent'
      -- edit / (de)activate / reset a Sales Agent: stays a Sales Agent
      when p_target_role = 'sales_agent' then p_new_role is null or p_new_role = 'sales_agent'
      -- the shared Admin row: keep, reset or deactivate, never re-role
      when p_target_role = 'admin' then p_new_role is null or p_new_role = 'admin'
      else false
    end
    from public.profiles a
    where a.id = p_actor
      and p_actor = auth.uid() -- callers may only ask about themselves: no role enumeration through other UUIDs
  ), false);
$$;

create or replace function public.staff_update(p_id uuid, p_full_name text, p_phone text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid(); t public.profiles%rowtype; v_new_role text;
begin
  select * into t from public.profiles where id = p_id for update;
  if not found then raise exception 'staff_update: user not found' using errcode = 'P0002'; end if;
  v_new_role := coalesce(nullif(p_role, ''), t.role);
  if v_new_role not in ('admin', 'sales_agent') then
    raise exception 'staff_update: invalid role' using errcode = '22023';
  end if;
  if not public.staff_admin_can(v_actor, t.role, v_new_role) then
    raise exception 'staff_update: not allowed for this role' using errcode = '42501';
  end if;
  if p_id = v_actor and v_new_role <> t.role then
    raise exception 'staff_update: you cannot change your own role' using errcode = '42501';
  end if;
  if t.role = 'admin' and v_new_role <> 'admin' and coalesce(t.is_active, true)
     and (select count(*) from public.profiles where role = 'admin' and coalesce(is_active, true)) <= 1 then
    raise exception 'staff_update: the last active administrator cannot be demoted' using errcode = '42501';
  end if;
  update public.profiles
     set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
         phone = nullif(btrim(coalesce(p_phone, '')), ''),
         role = v_new_role,
         updated_at = now()
   where id = p_id;
  insert into public.staff_admin_audit (actor_id, action, target_id, before, after)
  values (v_actor, case when v_new_role <> t.role then 'role_change' else 'update' end, p_id,
          jsonb_build_object('full_name', t.full_name, 'phone', t.phone, 'role', t.role),
          jsonb_build_object('full_name', coalesce(nullif(btrim(p_full_name), ''), t.full_name), 'phone', nullif(btrim(coalesce(p_phone, '')), ''), 'role', v_new_role));
end;
$$;

create or replace function public.role_preview_event(p_action text, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action not in ('start', 'end') then raise exception 'role_preview_event: invalid action' using errcode = '22023'; end if;
  if p_action = 'start' then
    if not coalesce((public.role_preview_status() ->> 'allowed')::boolean, false) then
      raise exception 'role_preview_event: role preview is not available for this account' using errcode = '42501';
    end if;
    if p_role not in ('admin', 'sales_agent') then
      raise exception 'role_preview_event: invalid role' using errcode = '22023';
    end if;
  end if;
  insert into public.staff_admin_audit (actor_id, action, target_id, note)
  values (auth.uid(), 'role_preview_' || p_action, auth.uid(), p_role);
  return true;
end;
$$;

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
       or not public.is_role('admin') then
      raise exception 'reassign_lead: office permission required' using errcode = '42501';
    end if;
  end if;

  if not (
    exists (
      select 1 from public.profiles p
      where p.id = new_agent_id and coalesce(p.is_active, true)
        and p.role = 'sales_agent'
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

create or replace function public.contact_role()
returns text language sql stable security definer set search_path = public
as $$ select p.role from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('admin', 'sales_agent') $$;

create or replace function public.b2b_distribute(p_ids uuid[], p_mode text, p_agents uuid[])
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_role text := public.b2b_role(); p record; agents uuid[]; i integer := 0; a uuid; v_lead uuid; out jsonb := '[]'::jsonb;
begin
  if v_role is null or v_role <> 'admin' then raise exception 'b2b_distribute: not allowed' using errcode = '42501'; end if;
  if p_mode not in ('manual', 'round_robin', 'workload') then raise exception 'b2b_distribute: invalid mode' using errcode = '22023'; end if;
  select array_agg(x order by ord) into agents
    from unnest(p_agents) with ordinality u(x, ord)
    join public.profiles pr on pr.id = u.x and pr.role = 'sales_agent' and coalesce(pr.is_active, true);
  if agents is null or array_length(agents, 1) = 0 then raise exception 'b2b_distribute: choose at least one active sales agent' using errcode = '22023'; end if;
  if p_mode = 'manual' and array_length(agents, 1) <> 1 then raise exception 'b2b_distribute: manual mode takes exactly one agent' using errcode = '22023'; end if;

  for p in select * from public.b2b_prospects where id = any(p_ids) and status = 'approved' order by collected_at for update loop
    if p_mode = 'workload' then
      select x into a from unnest(agents) x
       order by (select count(*) from public.leads l where l.assigned_to_user_id = x and coalesce(l.status, 'new') in ('new', 'contacted', 'qualified', 'meeting', 'offer')), x
       limit 1;
    else
      a := agents[(i % array_length(agents, 1)) + 1];
    end if;
    insert into public.leads (full_name, client_name, client_contact, company, phone, address, region, lead_type, service_category,
                              status, source, source_label, assigned_to_user_id, lat, lng, comments)
    values (p.company_name, p.company_name, coalesce(p.phone, ''), p.company_name, p.phone, p.address, p.region, 'B2B', 'energy',
            'new', 'import', 'B2B Scraper · Google Maps', a, p.lat, p.lng,
            concat_ws(' | ', 'Πηγή: Google Maps (SerpApi)', 'Κατηγορία: ' || coalesce(p.category, '—'),
                      case when p.website is not null then 'Ιστοσελίδα: ' || p.website end,
                      'Συλλογή: ' || to_char(p.collected_at, 'DD/MM/YYYY'),
                      'Πριν από τηλεφωνική προώθηση: έλεγχος μητρώου Άρθρου 11 — ΔΕΝ έχει γίνει'))
    returning id into v_lead;
    update public.b2b_prospects set status = 'assigned', assigned_to = a, assigned_by = auth.uid(), assigned_at = now(), lead_id = v_lead where id = p.id;
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('b2b_prospect', p.id, 'b2b_assigned', jsonb_build_object('actor_id', auth.uid(), 'agent', a, 'lead_id', v_lead, 'mode', p_mode));
    insert into public.app_notifications (user_id, title, body, type)
    values (a, 'Νέο B2B lead', p.company_name || coalesce(' · ' || p.city, ''), 'b2b_assigned');
    out := out || jsonb_build_array(jsonb_build_object('prospect', p.id, 'lead', v_lead, 'agent', a));
    i := i + 1;
  end loop;
  return out;
end;
$$;

drop policy if exists "b2b profiles read" on public.b2b_search_profiles;
create policy "b2b profiles read" on public.b2b_search_profiles for select to authenticated
  using (public.b2b_role() in ('admin', 'sales_agent'));
drop policy if exists "b2b profiles write" on public.b2b_search_profiles;
create policy "b2b profiles write" on public.b2b_search_profiles for all to authenticated
  using (public.b2b_role() in ('admin', 'sales_agent') and (created_by = auth.uid() or public.b2b_role() in ('admin')))
  with check (public.b2b_role() in ('admin', 'sales_agent') and created_by = auth.uid());
drop policy if exists "b2b jobs read" on public.b2b_search_jobs;
create policy "b2b jobs read" on public.b2b_search_jobs for select to authenticated
  using (public.b2b_role() in ('admin', 'sales_agent'));
drop policy if exists "b2b prospects read" on public.b2b_prospects;
create policy "b2b prospects read" on public.b2b_prospects for select to authenticated
  using (public.b2b_role() in ('admin', 'sales_agent'));
