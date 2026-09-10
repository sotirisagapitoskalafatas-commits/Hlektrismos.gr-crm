-- ============================================================================
-- CRM-OS Phase 1.1: Organization / Role / Team model
-- Idempotent reconstruction of the live database state (applied 2026-09-10 as
-- migration crm_os_phase11_org_team_role_wiring directly on the project DB).
-- Safe to re-run: tables IF NOT EXISTS, functions CREATE OR REPLACE, triggers
-- and policies are dropped+recreated, indexes guarded.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  tax_id      text,
  phone       text,
  email       text,
  website     text,
  address     text,
  is_active   boolean not null default true,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.divisions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  parent_id       uuid references public.divisions(id),
  name            text not null,
  code            text,
  head_user_id    uuid,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  name            text not null,
  code            text not null unique,
  description     text,
  head_user_id    uuid,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  division_id     uuid references public.divisions(id)
);

create table if not exists public.territories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  name            text not null,
  external_code   text unique,
  geometry        jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  department_id   uuid references public.departments(id),
  name            text not null,
  code            text unique,
  lead_user_id    uuid,
  territory_id    uuid references public.territories(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.user_roles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  role_id         uuid not null references public.roles(id),
  organization_id uuid not null references public.organizations(id),
  is_primary      boolean not null default false,
  scope           jsonb not null default '{}'::jsonb,
  granted_by      uuid,
  granted_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.business_events (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  text,
  event_type       text not null,
  entity_type      text not null,
  entity_id        uuid not null,
  actor_type       text,
  actor_id         uuid,
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  constraint business_events_idem_uq unique (idempotency_key) where (idempotency_key is not null)
);

alter table public.profiles add column if not exists organization_id uuid references public.organizations(id);
alter table public.profiles add column if not exists department_id uuid references public.departments(id);
alter table public.profiles add column if not exists team_id uuid references public.teams(id);
alter table public.profiles add column if not exists territory_id uuid references public.territories(id);
alter table public.profiles add column if not exists manager_id uuid references public.profiles(id);
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists timezone text not null default 'Europe/Athens';
alter table public.profiles add column if not exists language text not null default 'el';
alter table public.profiles add column if not exists availability_status text not null default 'available';
alter table public.profiles add column if not exists is_active boolean not null default true;
alter table public.profiles add column if not exists last_login_at timestamptz;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.divisions enable row level security;
alter table public.departments enable row level security;
alter table public.territories enable row level security;
alter table public.teams enable row level security;
alter table public.user_roles enable row level security;
alter table public.business_events enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------
create index if not exists divisions_org_idx        on public.divisions (organization_id);
create index if not exists divisions_parent_idx     on public.divisions (parent_id);
create unique index if not exists divisions_org_code_uq on public.divisions (organization_id, code) where (code is not null);
create index if not exists departments_org_idx      on public.departments (organization_id);
create index if not exists departments_division_idx on public.departments (division_id);
create index if not exists territories_org_idx      on public.territories (organization_id);
create index if not exists teams_org_idx            on public.teams (organization_id);
create index if not exists teams_dept_idx           on public.teams (department_id);
create index if not exists teams_territory_idx      on public.teams (territory_id);
create index if not exists user_roles_org_idx       on public.user_roles (organization_id);
create index if not exists user_roles_user_idx      on public.user_roles (user_id);
create index if not exists user_roles_role_idx      on public.user_roles (role_id);
create unique index if not exists user_roles_org_user_role_uq on public.user_roles (organization_id, user_id, role_id) where (organization_id is not null);
create unique index if not exists user_roles_user_id_role_id_key on public.user_roles (user_id, role_id);
create unique index if not exists user_roles_primary_uq on public.user_roles (user_id, organization_id) where (is_primary and organization_id is not null);
create index if not exists profiles_org_idx         on public.profiles (organization_id);
create index if not exists profiles_department_idx  on public.profiles (department_id);
create index if not exists profiles_team_idx        on public.profiles (team_id);
create index if not exists profiles_territory_idx   on public.profiles (territory_id);
create index if not exists profiles_manager_idx     on public.profiles (manager_id);
create index if not exists business_events_entity_idx      on public.business_events (entity_type, entity_id, created_at);
create index if not exists business_events_type_created_idx on public.business_events (event_type, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. Helper / security functions
-- ----------------------------------------------------------------------------
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end $$;

create or replace function public.crm_current_organization_id()
returns uuid language sql stable security definer set search_path to 'public' as $function$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid();
$function$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$function$;

create or replace function public.crm_has_role(r text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles ro on ro.id = ur.role_id
    where ur.user_id = auth.uid()
      and ro.key = r
      and (ur.organization_id is null or ur.organization_id = public.crm_current_organization_id())
  );
$function$;

create or replace function public.is_role(r text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select (select p.role from public.profiles p where p.id = auth.uid()) = r
      or public.crm_has_role(r);
$function$;

create or replace function public.crm_can_view_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.teams t
    where t.id = p_team_id
      and (t.organization_id = public.crm_current_organization_id())
      and (public.is_role('admin') or public.is_role('manager')
           or (select p.team_id from public.profiles p where p.id = auth.uid()) = t.id
           or t.lead_user_id = auth.uid())
  );
$function$;

create or replace function public.crm_can_view_territory(p_territory_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.territories t
    where t.id = p_territory_id
      and t.organization_id = public.crm_current_organization_id()
      and (public.is_role('admin') or public.is_role('manager')
           or (select p.territory_id from public.profiles p where p.id = auth.uid()) = t.id)
  );
$function$;

-- ----------------------------------------------------------------------------
-- 4. Role lifecycle RPCs (service_role or admin/manager only)
-- ----------------------------------------------------------------------------
create or replace function public.crm_grant_role(p_user_id uuid, p_role_key text, p_is_primary boolean default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_role uuid; v_org uuid; v_primary boolean;
begin
  if auth.role() <> 'service_role'
     and not (public.is_role('admin') or public.is_role('manager')) then
    raise exception 'permission denied: only admins/managers may grant roles';
  end if;
  select id into v_role from public.roles where key = p_role_key;
  if v_role is null then raise exception 'unknown role: %', p_role_key; end if;
  select organization_id into v_org from public.profiles where id = p_user_id;
  if v_org is null then raise exception 'user % has no organization; set it before granting a role', p_user_id; end if;

  v_primary := coalesce(p_is_primary, not exists (select 1 from public.user_roles where user_id = p_user_id and is_primary));

  insert into public.user_roles (user_id, role_id, organization_id, is_primary, granted_by, scope)
  values (p_user_id, v_role, v_org, v_primary, auth.uid(), '{"source":"crm_grant_role"}'::jsonb)
  on conflict (user_id, role_id) do nothing;

  if v_primary then
    update public.profiles set role = p_role_key where id = p_user_id and role <> p_role_key;
  end if;
end;
$function$;

create or replace function public.crm_revoke_role(p_user_id uuid, p_role_key text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_role uuid; v_remaining bigint; v_next text;
begin
  if auth.role() <> 'service_role'
     and not (public.is_role('admin') or public.is_role('manager')) then
    raise exception 'permission denied: only admins/managers may revoke roles';
  end if;
  select id into v_role from public.roles where key = p_role_key;
  if v_role is null then raise exception 'unknown role: %', p_role_key; end if;

  select count(*) into v_remaining from public.user_roles where user_id = p_user_id;
  if v_remaining <= 1 then
    raise exception 'cannot revoke the only role of user % (roles are mandatory; assign another role first)', p_user_id;
  end if;

  delete from public.user_roles where user_id = p_user_id and role_id = v_role;

  select ro.key into v_next
  from public.user_roles ur join public.roles ro on ro.id = ur.role_id
  where ur.user_id = p_user_id
  order by ur.created_at asc, ur.id asc
  limit 1;

  if v_next is not null then
    update public.user_roles ur
    set is_primary = true
    from public.roles ro
    where ur.role_id = ro.id and ur.user_id = p_user_id and ro.key = v_next;
    update public.profiles set role = v_next where id = p_user_id;
  end if;
end;
$function$;

create or replace function public.crm_set_primary_role(p_user_id uuid, p_role_key text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.role() <> 'service_role'
     and not (public.is_role('admin') or public.is_role('manager')) then
    raise exception 'permission denied: only admins/managers may change the primary role';
  end if;
  if not exists (
    select 1 from public.user_roles ur join public.roles ro on ro.id = ur.role_id
    where ur.user_id = p_user_id and ro.key = p_role_key
  ) then
    raise exception 'user % does not hold role %', p_user_id, p_role_key;
  end if;
  update public.user_roles ur
  set is_primary = (ro.key = p_role_key)
  from public.roles ro
  where ur.role_id = ro.id and ur.user_id = p_user_id;
  update public.profiles set role = p_role_key where id = p_user_id;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 5. Org-consistency triggers
-- ----------------------------------------------------------------------------
create or replace function public.profiles_org_consistency()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_org uuid;
begin
  if new.organization_id is null then
    v_org := coalesce(
      (select d.organization_id from public.departments d where d.id = new.department_id),
      (select t.organization_id from public.teams t where t.id = new.team_id),
      (select t.organization_id from public.territories t where t.id = new.territory_id)
    );
    new.organization_id := v_org;
  else
    v_org := new.organization_id;
    if new.department_id is not null
       and exists (select 1 from public.departments d where d.id = new.department_id and d.organization_id <> v_org) then
      raise exception 'profiles.department_id crosses organizations';
    end if;
    if new.team_id is not null
       and exists (select 1 from public.teams t where t.id = new.team_id and t.organization_id <> v_org) then
      raise exception 'profiles.team_id crosses organizations';
    end if;
    if new.territory_id is not null
       and exists (select 1 from public.territories t where t.id = new.territory_id and t.organization_id <> v_org) then
      raise exception 'profiles.territory_id crosses organizations';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.departments_org_consistency()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.organization_id is null and new.division_id is not null then
    new.organization_id := (select d.organization_id from public.divisions d where d.id = new.division_id);
  end if;
  if new.organization_id is not null and new.division_id is not null
     and exists (select 1 from public.divisions d where d.id = new.division_id and d.organization_id <> new.organization_id) then
    raise exception 'departments.division_id crosses organizations';
  end if;
  return new;
end;
$function$;

create or replace function public.teams_org_consistency()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.organization_id is null and new.department_id is not null then
    new.organization_id := (select d.organization_id from public.departments d where d.id = new.department_id);
  end if;
  if new.organization_id is not null then
    if new.department_id is not null
       and exists (select 1 from public.departments d where d.id = new.department_id and d.organization_id <> new.organization_id) then
      raise exception 'teams.department_id crosses organizations';
    end if;
    if new.territory_id is not null
       and exists (select 1 from public.territories t where t.id = new.territory_id and t.organization_id <> new.organization_id) then
      raise exception 'teams.territory_id crosses organizations';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.user_roles_org_consistency()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_org uuid;
begin
  select p.organization_id into v_org
  from public.profiles p
  where p.id = new.user_id;

  if v_org is null then
    raise exception 'user_roles cannot be created for a user without an organization (infer: set profiles.organization_id first)';
  end if;

  if new.organization_id is null then
    new.organization_id := v_org;
  elsif new.organization_id <> v_org then
    raise exception 'user_roles cannot cross organizations: user belongs to %, got %', v_org, new.organization_id;
  end if;
  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 6. Audit (append-only event journal)
-- ----------------------------------------------------------------------------
create or replace function public.prevent_business_events_mutation()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.idempotency_key is null then
      new.idempotency_key := gen_random_uuid()::text;
    end if;
    return new;
  end if;
  raise exception 'business_events is append-only';
end;
$function$;

create or replace function public.user_roles_audit()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_event text; v_payload jsonb; v_org uuid; v_role_key text;
begin
  if tg_op = 'INSERT' then
    v_event := 'RoleGranted';
    v_payload := jsonb_build_object('role_id', new.role_id, 'organization_id', new.organization_id, 'is_primary', new.is_primary);
  elsif tg_op = 'UPDATE' then
    if new.role_id = old.role_id and new.organization_id = old.organization_id
       and new.is_primary = old.is_primary and new.granted_by is not distinct from old.granted_by then
      return new;
    end if;
    v_event := 'RoleChanged';
    v_payload := jsonb_build_object('role_id', new.role_id, 'organization_id', new.organization_id,
                                    'is_primary', new.is_primary, 'previous_primary', old.is_primary);
    v_org := new.organization_id;
  else
    v_event := 'RoleRevoked';
    v_payload := jsonb_build_object('role_id', old.role_id, 'organization_id', old.organization_id, 'is_primary', old.is_primary);
    v_org := old.organization_id;
  end if;

  if v_org is null then
    v_org := coalesce(new.organization_id, old.organization_id);
  end if;
  select ro.key into v_role_key from public.roles ro where ro.id = coalesce(new.role_id, old.role_id);

  insert into public.business_events (idempotency_key, event_type, entity_type, entity_id, actor_type,
                                      actor_id, payload)
  values ('role:' || tg_op || ':' || coalesce(new.user_id, old.user_id) || ':' || v_role_key || ':' || v_org
          || case when tg_op = 'UPDATE'
                  then ':' || old.is_primary::text || '->' || new.is_primary::text
                  else '' end,
          v_event, 'user_role', coalesce(new.user_id, old.user_id), 'user', auth.uid(),
          v_payload || jsonb_build_object('role_key', v_role_key));
  return coalesce(new, old);
end;
$function$;

-- ----------------------------------------------------------------------------
-- 7. Triggers
-- ----------------------------------------------------------------------------
drop trigger if exists profiles_org_consistency on public.profiles;
create trigger profiles_org_consistency before insert or update on public.profiles for each row execute function public.profiles_org_consistency();
drop trigger if exists departments_org_consistency on public.departments;
create trigger departments_org_consistency before insert or update on public.departments for each row execute function public.departments_org_consistency();
drop trigger if exists teams_org_consistency on public.teams;
create trigger teams_org_consistency before insert or update on public.teams for each row execute function public.teams_org_consistency();
drop trigger if exists user_roles_org_consistency on public.user_roles;
create trigger user_roles_org_consistency before insert or update on public.user_roles for each row execute function public.user_roles_org_consistency();
drop trigger if exists business_events_append_only on public.business_events;
create trigger business_events_append_only before insert or delete or update on public.business_events for each row execute function public.prevent_business_events_mutation();
drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit after insert or delete or update on public.user_roles for each row execute function public.user_roles_audit();

drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at before update on public.organizations for each row execute function public.update_updated_at();
drop trigger if exists roles_updated_at on public.roles;
create trigger roles_updated_at before update on public.roles for each row execute function public.update_updated_at();
drop trigger if exists divisions_updated_at on public.divisions;
create trigger divisions_updated_at before update on public.divisions for each row execute function public.update_updated_at();
drop trigger if exists departments_updated_at on public.departments;
create trigger departments_updated_at before update on public.departments for each row execute function public.update_updated_at();
drop trigger if exists territories_updated_at on public.territories;
create trigger territories_updated_at before update on public.territories for each row execute function public.update_updated_at();
drop trigger if exists teams_updated_at on public.teams;
create trigger teams_updated_at before update on public.teams for each row execute function public.update_updated_at();
drop trigger if exists user_roles_updated_at on public.user_roles;
create trigger user_roles_updated_at before update on public.user_roles for each row execute function public.update_updated_at();

-- ----------------------------------------------------------------------------
-- 8. RLS policies
-- ----------------------------------------------------------------------------
-- organizations
drop policy if exists "Service role full access on organizations" on public.organizations;
create policy "Service role full access on organizations" on public.organizations for all to service_role using (true) with check (true);
drop policy if exists "authenticated read organizations" on public.organizations;
create policy "authenticated read organizations" on public.organizations for select to authenticated using (id = public.crm_current_organization_id());
drop policy if exists "admin insert organizations" on public.organizations;
create policy "admin insert organizations" on public.organizations for insert to authenticated with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin update organizations" on public.organizations;
create policy "admin update organizations" on public.organizations for update to authenticated using (public.is_role('admin') or public.is_role('manager')) with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin delete organizations" on public.organizations;
create policy "admin delete organizations" on public.organizations for delete to authenticated using (public.is_role('admin') or public.is_role('manager'));

-- roles
drop policy if exists "Service role full access on roles" on public.roles;
create policy "Service role full access on roles" on public.roles for all to service_role using (true) with check (true);
drop policy if exists "authenticated read roles" on public.roles;
create policy "authenticated read roles" on public.roles for select to authenticated using (true);
drop policy if exists "admin insert roles" on public.roles;
create policy "admin insert roles" on public.roles for insert to authenticated with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin update roles" on public.roles;
create policy "admin update roles" on public.roles for update to authenticated using (public.is_role('admin') or public.is_role('manager')) with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin delete roles" on public.roles;
create policy "admin delete roles" on public.roles for delete to authenticated using (public.is_role('admin') or public.is_role('manager'));

-- divisions
drop policy if exists "Service role full access on divisions" on public.divisions;
create policy "Service role full access on divisions" on public.divisions for all to service_role using (true) with check (true);
drop policy if exists "authenticated read divisions" on public.divisions;
create policy "authenticated read divisions" on public.divisions for select to authenticated using (organization_id = public.crm_current_organization_id());
drop policy if exists "admin insert divisions" on public.divisions;
create policy "admin insert divisions" on public.divisions for insert to authenticated with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin update divisions" on public.divisions;
create policy "admin update divisions" on public.divisions for update to authenticated using (public.is_role('admin') or public.is_role('manager')) with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin delete divisions" on public.divisions;
create policy "admin delete divisions" on public.divisions for delete to authenticated using (public.is_role('admin') or public.is_role('manager'));

-- departments
drop policy if exists "Service role full access on departments" on public.departments;
create policy "Service role full access on departments" on public.departments for all to service_role using (true) with check (true);
drop policy if exists "authenticated read departments" on public.departments;
create policy "authenticated read departments" on public.departments for select to authenticated using ((organization_id = public.crm_current_organization_id()) or (organization_id is null));
drop policy if exists "admin insert departments" on public.departments;
create policy "admin insert departments" on public.departments for insert to authenticated with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin update departments" on public.departments;
create policy "admin update departments" on public.departments for update to authenticated using (public.is_role('admin') or public.is_role('manager')) with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin delete departments" on public.departments;
create policy "admin delete departments" on public.departments for delete to authenticated using (public.is_role('admin') or public.is_role('manager'));

-- territories
drop policy if exists "Service role full access on territories" on public.territories;
create policy "Service role full access on territories" on public.territories for all to service_role using (true) with check (true);
drop policy if exists "authenticated read territories" on public.territories;
create policy "authenticated read territories" on public.territories for select to authenticated using ((organization_id = public.crm_current_organization_id()) or (organization_id is null));
drop policy if exists "admin insert territories" on public.territories;
create policy "admin insert territories" on public.territories for insert to authenticated with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin update territories" on public.territories;
create policy "admin update territories" on public.territories for update to authenticated using (public.is_role('admin') or public.is_role('manager')) with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin delete territories" on public.territories;
create policy "admin delete territories" on public.territories for delete to authenticated using (public.is_role('admin') or public.is_role('manager'));

-- teams
drop policy if exists "Service role full access on teams" on public.teams;
create policy "Service role full access on teams" on public.teams for all to service_role using (true) with check (true);
drop policy if exists "authenticated read teams" on public.teams;
create policy "authenticated read teams" on public.teams for select to authenticated using ((organization_id = public.crm_current_organization_id()) or (organization_id is null));
drop policy if exists "admin insert teams" on public.teams;
create policy "admin insert teams" on public.teams for insert to authenticated with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin update teams" on public.teams;
create policy "admin update teams" on public.teams for update to authenticated using (public.is_role('admin') or public.is_role('manager')) with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin delete teams" on public.teams;
create policy "admin delete teams" on public.teams for delete to authenticated using (public.is_role('admin') or public.is_role('manager'));

-- user_roles
drop policy if exists "Service role full access on user_roles" on public.user_roles;
create policy "Service role full access on user_roles" on public.user_roles for all to service_role using (true) with check (true);
drop policy if exists "authenticated read user_roles" on public.user_roles;
create policy "authenticated read user_roles" on public.user_roles for select to authenticated using ((user_id = auth.uid()) or (organization_id = public.crm_current_organization_id()));
drop policy if exists "admin insert user_roles" on public.user_roles;
create policy "admin insert user_roles" on public.user_roles for insert to authenticated with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin update user_roles" on public.user_roles;
create policy "admin update user_roles" on public.user_roles for update to authenticated using (public.is_role('admin') or public.is_role('manager')) with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin delete user_roles" on public.user_roles;
create policy "admin delete user_roles" on public.user_roles for delete to authenticated using (public.is_role('admin') or public.is_role('manager'));

-- business_events
drop policy if exists "Service role full access on business_events" on public.business_events;
create policy "Service role full access on business_events" on public.business_events for all to service_role using (true) with check (true);
drop policy if exists "staff insert business_events" on public.business_events;
create policy "staff insert business_events" on public.business_events for insert to authenticated with check (public.is_staff());
drop policy if exists "staff read business_events" on public.business_events;
create policy "staff read business_events" on public.business_events for select to authenticated using (public.is_staff());

-- profiles
drop policy if exists "profiles read own or staff" on public.profiles;
create policy "profiles read own or staff" on public.profiles for select to authenticated using ((auth.uid() = id) or (public.is_staff() and ((organization_id is null) or (organization_id = public.crm_current_organization_id()))));
drop policy if exists "profiles role managed by admin" on public.profiles;
create policy "profiles role managed by admin" on public.profiles for update to authenticated using (public.is_role('admin') and ((organization_id is null) or (organization_id = public.crm_current_organization_id()))) with check (public.is_role('admin') and ((organization_id is null) or (organization_id = public.crm_current_organization_id())));
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 9. Grants (the RPC/security functions are SECURITY DEFINER; still need EXECUTE)
-- ----------------------------------------------------------------------------
grant execute on function public.crm_current_organization_id() to anon, authenticated, service_role;
grant execute on function public.crm_has_role(text) to anon, authenticated, service_role;
grant execute on function public.is_role(text) to anon, authenticated, service_role;
grant execute on function public.is_staff() to anon, authenticated, service_role;
grant execute on function public.crm_can_view_team(uuid) to anon, authenticated, service_role;
grant execute on function public.crm_can_view_territory(uuid) to anon, authenticated, service_role;
grant execute on function public.crm_grant_role(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.crm_revoke_role(uuid, text) to authenticated, service_role;
grant execute on function public.crm_set_primary_role(uuid, text) to authenticated, service_role;