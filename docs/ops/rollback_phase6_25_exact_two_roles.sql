-- Rollback of phase6/25. Restores the old role values, constraint, grants and functions from role_normalization_audit. Deploy the previous code only if you
-- also intend to stay on it: this release's code reads both spellings. Accounts created after phase6/25 have no audit row and become field_sales.
-- One transaction. phase6/26 must be rolled back first.
do $$
begin
  if to_regclass('public.role_normalization_audit') is null then raise exception 'phase6/25 was not applied'; end if;
  if to_regclass('public.profiles_single_active_admin') is not null then raise exception 'roll back phase6/26 first'; end if;
end $$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles disable trigger profiles_no_new_legacy_office;
update public.profiles p set role = a.old_role, is_active = a.old_is_active, updated_at = now()
from public.role_normalization_audit a where a.kind = 'profile' and a.user_id = p.id and p.role = 'sales_agent';
update public.profiles set role = 'field_sales', updated_at = now() where role = 'sales_agent';
alter table public.profiles enable trigger profiles_no_new_legacy_office;
alter table public.profiles alter column role set default 'inside_sales';
alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'manager', 'inside_sales', 'field_sales', 'back_office'));

insert into public.roles (key, name, sort_order) values ('manager', 'Manager', 2), ('inside_sales', 'Inside Sales', 3), ('field_sales', 'Field Sales', 4), ('back_office', 'Back Office', 5)
on conflict (key) do nothing;
alter table public.user_roles disable trigger user_roles_audit;
delete from public.user_roles where role_id = (select id from public.roles where key = 'sales_agent');
alter table public.user_roles disable trigger user_roles_audit; -- role_normalization_audit is the record of this conversion
insert into public.user_roles (user_id, role_id, organization_id, is_primary, scope, granted_by, granted_at)
select a.user_id, ro.id, (a.detail ->> 'organization_id')::uuid, coalesce((a.detail ->> 'is_primary')::boolean, false), coalesce(a.detail -> 'scope', '{}'::jsonb), (a.detail ->> 'granted_by')::uuid, coalesce((a.detail ->> 'granted_at')::timestamptz, now())
from public.role_normalization_audit a join public.roles ro on ro.key = a.old_role where a.kind = 'user_role'
on conflict do nothing;
alter table public.user_roles enable trigger user_roles_audit;
delete from public.roles where key = 'sales_agent';

create or replace function public.is_role(r text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select (select p.role from public.profiles p where p.id = auth.uid()) = r
      or public.crm_has_role(r);
$function$;

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
    'inside_sales',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.profiles_guard_privileged()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if coalesce(new.role, 'inside_sales') <> 'inside_sales' or coalesce(new.is_active, true) then
        raise exception 'profiles: new profiles start inactive as inside_sales; use the staff administration' using errcode = '42501';
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
      -- create: the only role a new account can get is field_sales
      when p_target_role is null then p_new_role = 'field_sales'
      -- edit / (de)activate / reset a Sales Agent: stays in the Sales Agent group
      when p_target_role in ('inside_sales', 'field_sales') then p_new_role is null or p_new_role in ('inside_sales', 'field_sales')
      -- existing office rows (the admin itself, legacy manager / back_office): keep, reset or deactivate — never re-role
      when p_target_role in ('admin', 'manager', 'back_office') then p_new_role is null or p_new_role = p_target_role
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
  if v_new_role not in ('admin', 'manager', 'inside_sales', 'field_sales', 'back_office') then
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
    if p_role not in ('admin', 'manager', 'inside_sales', 'field_sales', 'back_office') then
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

create or replace function public.contact_role()
returns text language sql stable security definer set search_path = public
as $$ select p.role from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('admin', 'inside_sales', 'field_sales') $$;

create or replace function public.b2b_distribute(p_ids uuid[], p_mode text, p_agents uuid[])
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_role text := public.b2b_role(); p record; agents uuid[]; i integer := 0; a uuid; v_lead uuid; out jsonb := '[]'::jsonb;
begin
  if v_role is null or v_role not in ('back_office', 'admin', 'manager') then raise exception 'b2b_distribute: not allowed' using errcode = '42501'; end if;
  if p_mode not in ('manual', 'round_robin', 'workload') then raise exception 'b2b_distribute: invalid mode' using errcode = '22023'; end if;
  select array_agg(x order by ord) into agents
    from unnest(p_agents) with ordinality u(x, ord)
    join public.profiles pr on pr.id = u.x and pr.role in ('inside_sales', 'field_sales') and coalesce(pr.is_active, true);
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
  using (public.b2b_role() in ('admin', 'manager', 'inside_sales', 'back_office'));
drop policy if exists "b2b profiles write" on public.b2b_search_profiles;
create policy "b2b profiles write" on public.b2b_search_profiles for all to authenticated
  using (public.b2b_role() in ('admin', 'manager', 'inside_sales', 'back_office') and (created_by = auth.uid() or public.b2b_role() in ('admin', 'manager')))
  with check (public.b2b_role() in ('admin', 'manager', 'inside_sales', 'back_office') and created_by = auth.uid());
drop policy if exists "b2b jobs read" on public.b2b_search_jobs;
create policy "b2b jobs read" on public.b2b_search_jobs for select to authenticated
  using (public.b2b_role() in ('admin', 'manager', 'inside_sales', 'back_office'));
drop policy if exists "b2b prospects read" on public.b2b_prospects;
create policy "b2b prospects read" on public.b2b_prospects for select to authenticated
  using (public.b2b_role() in ('admin', 'manager', 'back_office', 'inside_sales'));

drop table public.role_normalization_audit;
