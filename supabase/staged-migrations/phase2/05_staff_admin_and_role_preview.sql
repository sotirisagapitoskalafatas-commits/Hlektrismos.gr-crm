-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 2 / 05: close profile self-promotion, role-scoped staff administration, and the time-boxed
-- role-preview grant for the 15 Oct 2026 presentation.
--
-- 1) SECURITY FIX (source finding): 20260910010000 hardened "profiles update own" so a user could not change their
--    own role, but 20260910103000 (line 586) re-created the policy as `with check (auth.uid() = id)`, which reopens
--    the hole: any signed-in user can `update profiles set role = 'admin', is_active = true where id = auth.uid()`.
--    UPDATE policies are OR'ed, so policy wording alone is fragile. A trigger now blocks every change of the
--    privileged columns made directly by the `authenticated`/`anon` API roles. Legitimate changes go through the
--    audited SECURITY DEFINER functions below (they run as the function owner) or the service role (edge function).
-- 2) Staff administration matrix (single source of truth: public.staff_admin_can):
--      admin       → every role (create, edit, change role, deactivate/reactivate, delete)
--      manager     → inside_sales, field_sales, back_office only; can never create/promote/edit/delete admin or manager
--      back_office → back_office only
--      inside_sales, field_sales → nothing
--    Always: nobody changes their own role or deactivates/deletes themselves; the last active admin cannot be
--    demoted, deactivated or deleted.
-- 3) Role preview (presentation only): an allowlist row with a hard expiry. The preview never changes
--    profiles.role, JWT claims or RLS — it only lets the UI render another role's screens, read-only.

-- ───────────────────────── 1) audit table ─────────────────────────
create table if not exists public.staff_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,           -- create | update | role_change | deactivate | reactivate | delete | role_preview_start | role_preview_end | denied
  -- Note: a refused SQL call raises and rolls back, so refusals inside these functions cannot be stored here (no
  -- autonomous transactions). The admin-users edge function records its own refusals (create/delete) as 'denied'.
  target_id uuid,
  target_email text,
  before jsonb,
  after jsonb,
  note text,
  created_at timestamptz not null default now()
);
alter table public.staff_admin_audit enable row level security;
revoke all on public.staff_admin_audit from anon, authenticated;
grant select on public.staff_admin_audit to authenticated;
grant all on public.staff_admin_audit to service_role;
drop policy if exists "staff admin audit read" on public.staff_admin_audit;
create policy "staff admin audit read" on public.staff_admin_audit for select to authenticated
  using (public.is_staff() and (public.is_role('admin') or public.is_role('manager')));
-- no insert/update/delete policy: rows are written only by the SECURITY DEFINER functions / service role.

-- ───────────────────────── 2) the matrix ─────────────────────────
create or replace function public.staff_admin_can(p_actor uuid, p_target_role text, p_new_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when not coalesce(a.is_active, true) then false
      when a.role = 'admin' then coalesce(p_new_role, p_target_role) in ('admin', 'manager', 'inside_sales', 'field_sales', 'back_office')
      when a.role = 'manager' then coalesce(p_target_role, p_new_role) in ('inside_sales', 'field_sales', 'back_office')
                               and coalesce(p_new_role, p_target_role) in ('inside_sales', 'field_sales', 'back_office')
      when a.role = 'back_office' then coalesce(p_target_role, p_new_role) = 'back_office' and coalesce(p_new_role, p_target_role) = 'back_office'
      else false
    end
    from public.profiles a where a.id = p_actor
  ), false);
$$;
revoke all on function public.staff_admin_can(uuid, text, text) from public, anon;
grant execute on function public.staff_admin_can(uuid, text, text) to authenticated, service_role;

create or replace function public.staff_active_admin_count()
returns integer language sql stable security definer set search_path = public
as $$ select count(*)::int from public.profiles where role = 'admin' and coalesce(is_active, true) $$;
revoke all on function public.staff_active_admin_count() from public, anon, authenticated;
grant execute on function public.staff_active_admin_count() to service_role;

-- ───────────────────────── 3) guard trigger (the actual fix) ─────────────────────────
-- SECURITY INVOKER on purpose: current_user is the API role for direct PostgREST writes ('authenticated'/'anon'),
-- and the function owner when the write comes from one of the SECURITY DEFINER functions below.
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
drop trigger if exists profiles_guard_privileged on public.profiles;
create trigger profiles_guard_privileged before insert or update on public.profiles
  for each row execute function public.profiles_guard_privileged();

-- Belt and braces: restore the hardened own-row policy that 20260910103000 dropped.
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- ───────────────────────── 4) staff directory + RPCs ─────────────────────────
-- Directory with e-mail and last sign-in (auth.users is not readable from the browser). Admin/manager see all staff;
-- back_office sees back_office colleagues only. can_manage tells the UI what the server will allow.
create or replace function public.staff_list()
returns table (id uuid, full_name text, email text, phone text, role text, is_active boolean, created_at timestamptz,
               last_sign_in_at timestamptz, can_manage boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid(); v_role text;
begin
  select p.role into v_role from public.profiles p where p.id = v_actor and coalesce(p.is_active, true);
  if v_role is null or v_role not in ('admin', 'manager', 'back_office') then
    raise exception 'staff_list: not allowed' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, u.email::text, p.phone, p.role, coalesce(p.is_active, true), p.created_at,
           u.last_sign_in_at, (p.id <> v_actor and public.staff_admin_can(v_actor, p.role, null))
    from public.profiles p
    left join auth.users u on u.id = p.id
    where v_role in ('admin', 'manager') or p.role = 'back_office'
    order by coalesce(p.is_active, true) desc, p.full_name;
end;
$$;
revoke all on function public.staff_list() from public, anon;
grant execute on function public.staff_list() to authenticated;

-- How many business rows reference this person (any single-column FK to profiles or auth.users in schema public).
-- Used to refuse permanent deletion of someone who appears in CRM history; deactivation is the safe path then.
create or replace function public.staff_reference_count(p_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare r record; n integer := 0; c integer;
begin
  if auth.uid() is not null and not exists (
    select 1 from public.profiles a where a.id = auth.uid() and a.role in ('admin', 'manager', 'back_office') and coalesce(a.is_active, true)
  ) then
    raise exception 'staff_reference_count: not allowed' using errcode = '42501';
  end if;
  for r in
    select cl.relname as tbl, att.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and array_length(con.conkey, 1) = 1 and ns.nspname = 'public'
      and con.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
      and con.conrelid <> 'public.profiles'::regclass
      and cl.relname <> 'staff_admin_audit'
  loop
    execute format('select count(*) from public.%I where %I = $1', r.tbl, r.col) into c using p_id;
    n := n + c;
  end loop;
  return n;
end;
$$;
revoke all on function public.staff_reference_count(uuid) from public, anon;
grant execute on function public.staff_reference_count(uuid) to authenticated, service_role;

-- Edit name/phone/role. Role changes need the matrix for BOTH the current and the new role.
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
revoke all on function public.staff_update(uuid, text, text, text) from public, anon;
grant execute on function public.staff_update(uuid, text, text, text) to authenticated;

create or replace function public.staff_set_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid(); t public.profiles%rowtype;
begin
  select * into t from public.profiles where id = p_id for update;
  if not found then raise exception 'staff_set_active: user not found' using errcode = 'P0002'; end if;
  if p_id = v_actor then raise exception 'staff_set_active: you cannot change your own status' using errcode = '42501'; end if;
  if not public.staff_admin_can(v_actor, t.role, null) then
    raise exception 'staff_set_active: not allowed for this role' using errcode = '42501';
  end if;
  if not p_active and t.role = 'admin' and coalesce(t.is_active, true)
     and (select count(*) from public.profiles where role = 'admin' and coalesce(is_active, true)) <= 1 then
    raise exception 'staff_set_active: the last active administrator cannot be deactivated' using errcode = '42501';
  end if;
  update public.profiles set is_active = p_active, updated_at = now() where id = p_id;
  insert into public.staff_admin_audit (actor_id, action, target_id, before, after)
  values (v_actor, case when p_active then 'reactivate' else 'deactivate' end, p_id,
          jsonb_build_object('is_active', coalesce(t.is_active, true)), jsonb_build_object('is_active', p_active));
end;
$$;
revoke all on function public.staff_set_active(uuid, boolean) from public, anon;
grant execute on function public.staff_set_active(uuid, boolean) to authenticated;

-- ───────────────────────── 5) role preview (presentation only) ─────────────────────────
create table if not exists public.role_preview_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  note text
);
alter table public.role_preview_grants enable row level security;
revoke all on public.role_preview_grants from anon, authenticated;
grant all on public.role_preview_grants to service_role;

-- The QA Admin presentation account only, until Friday 16 Oct 2026 00:00 Europe/Athens (EEST = UTC+3).
insert into public.role_preview_grants (user_id, expires_at, note)
select u.id, timestamptz '2026-10-16 00:00:00+03', 'Παρουσίαση Hlektrismos.gr — Πέμπτη 15/10/2026'
from auth.users u where u.email = 'qa.admin@hlektrismos.gr'
on conflict (user_id) do update set expires_at = excluded.expires_at, note = excluded.note;

-- Server decides; the browser clock is never trusted. Fails closed for everyone else and after expiry.
create or replace function public.role_preview_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'allowed', coalesce((
      select g.expires_at > now()
      from public.role_preview_grants g
      join public.profiles p on p.id = g.user_id and p.role = 'admin' and coalesce(p.is_active, true)
      where g.user_id = auth.uid()
    ), false),
    'expires_at', (select g.expires_at from public.role_preview_grants g where g.user_id = auth.uid()),
    'server_now', now()
  );
$$;
revoke all on function public.role_preview_status() from public, anon;
grant execute on function public.role_preview_status() to authenticated;

-- Start/end are audited; start is rejected unless the grant is valid right now.
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
revoke all on function public.role_preview_event(text, text) from public, anon;
grant execute on function public.role_preview_event(text, text) to authenticated;

-- ───────────────────────── 6) crm_settings: secrets and permission overrides ─────────────────────────
-- Finding (20260911040000): "crm_settings_admin_all" is FOR ALL to admin OR manager. A manager could therefore
--   (a) read credential rows directly (e.g. SERPAPI_KEY — only the RPC hid it; IMAP/Vapi settings live here too), and
--   (b) rewrite `role_permissions`, which the edge-function guard (_shared/guard.ts) uses to decide capabilities.
-- Now: managers read only non-credential rows; only admins write. The SECURITY DEFINER RPCs (crm_scraper_settings,
-- crm_set_scraper_*) and the service role keep working. Remaining risk (documented): admins can still read credential
-- rows through the table because the legacy SettingsPanel needs it; retire that panel, then hide them for admins too.
create or replace function public.crm_setting_is_credential(k text)
returns boolean language sql immutable
as $$ select k ilike any (array['%key%', '%secret%', '%password%', '%passwd%', '%token%', '%credential%', '%imap%', '%smtp%', '%vapi%', '%twilio%']) $$;
-- Called inside the crm_settings RLS policy below, so signed-in users need EXECUTE explicitly (phase1/19 removes
-- the implicit default). Pure name check: reads no data.
revoke all on function public.crm_setting_is_credential(text) from public, anon;
grant execute on function public.crm_setting_is_credential(text) to authenticated, service_role;

drop policy if exists "crm_settings_admin_all" on public.crm_settings;
drop policy if exists "crm_settings read" on public.crm_settings;
drop policy if exists "crm_settings admin write" on public.crm_settings;
create policy "crm_settings read" on public.crm_settings for select
  using (public.is_role('admin') or (public.is_role('manager') and not public.crm_setting_is_credential(setting_key)));
create policy "crm_settings admin write" on public.crm_settings for all
  using (public.is_role('admin')) with check (public.is_role('admin'));
