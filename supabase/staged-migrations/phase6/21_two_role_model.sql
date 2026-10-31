-- STAGED ONLY — do not apply to staging/production without an owner-approved change window (staging first).
-- Phase 6 / 21: the exact two-role account model, enforced in the database.
--   • Admin / Back Office = the ONE shared office login, stored as role `admin`.
--   • Sales Agent = individual logins; new accounts are `field_sales` (legacy `inside_sales` rows are the same group).
--   • ONLY the active `admin` may create / edit / (de)activate / reset / delete Sales Agent accounts and read the staff directory.
--   • `manager` and `back_office` are legacy: no account-management rights, never creatable, never a role-change target.
-- Supersedes phase4/17 and phase4/20 (apply AFTER phase2/05; do not replay 17/20 afterwards). Additive: no row is rewritten.
-- Rollback: docs/ops/rollback_phase6_21_two_role_model.sql.

-- 1) the matrix
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
revoke all on function public.staff_admin_can(uuid, text, text) from public, anon;
grant execute on function public.staff_admin_can(uuid, text, text) to authenticated, service_role;

-- 2) the staff directory: admin only (it exposes e-mail addresses and last sign-in)
create or replace function public.staff_list()
returns table (id uuid, full_name text, email text, phone text, role text, is_active boolean,
               created_at timestamptz, last_sign_in_at timestamptz, can_manage boolean)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_actor uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles p where p.id = v_actor and p.role = 'admin' and coalesce(p.is_active, true)) then
    raise exception 'staff_list: not allowed' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, u.email::text, p.phone, p.role, coalesce(p.is_active, true), p.created_at, u.last_sign_in_at,
           (p.id <> v_actor and public.staff_admin_can(v_actor, p.role, null))
    from public.profiles p left join auth.users u on u.id = p.id
    order by coalesce(p.is_active, true) desc, p.full_name;
end;
$$;
revoke all on function public.staff_list() from public, anon;
grant execute on function public.staff_list() to authenticated, service_role;

-- 3) reference counting (used before a permanent delete): admin only
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
    select 1 from public.profiles a where a.id = auth.uid() and a.role = 'admin' and coalesce(a.is_active, true)
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

-- 4) the audit trail is readable by the admin only (the shared office account)
drop policy if exists "staff admin audit read" on public.staff_admin_audit;
create policy "staff admin audit read" on public.staff_admin_audit for select to authenticated
  using (public.is_staff() and public.is_role('admin'));

-- 5) nobody — not even a service-role code path — can CREATE a profile with, or move a profile INTO, a legacy office
--    role. Existing legacy rows are untouched (they can be deactivated). Fails closed for every caller.
create or replace function public.profiles_no_new_legacy_office()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role in ('manager', 'back_office') and (tg_op = 'INSERT' or new.role is distinct from old.role) then
    raise exception 'profiles: manager / back_office are legacy roles and cannot be assigned' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_no_new_legacy_office on public.profiles;
create trigger profiles_no_new_legacy_office before insert or update on public.profiles
  for each row execute function public.profiles_no_new_legacy_office();

-- 6) a deactivated account can no longer edit even its own profile row (the own-row policy now also requires an active
--    profile; role/is_active stay pinned by profiles_guard_privileged from phase2/05). Reading the own row stays allowed.
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (auth.uid() = id and public.is_staff())
  with check (auth.uid() = id and public.is_staff() and role = (select p.role from public.profiles p where p.id = auth.uid()));

comment on function public.staff_admin_can(uuid, text, text) is
  'Phase 6/21: only the active admin (shared Admin / Back Office login) manages accounts; create = field_sales only; legacy office rows cannot be re-roled.';
