-- STAGED ONLY — do not apply to staging/production without a separately approved change window.
-- Phase 4 / 20: align staff administration with the two effective access groups.
-- New accounts and role changes are restricted to the Sales Agent group. The legacy Admin may operate existing office rows during migration, but cannot create another office account or promote a Sales Agent to an office role;
-- Back Office / legacy Manager may administer Sales Agent accounts only. Sales roles cannot provision.
-- Back Office's directory shows Sales Agent profiles only. No data rows are rewritten.
-- Depends on phase2/05 + phase4/17. Must be applied AFTER phase4/17 if that file is replayed later.
-- Rollback: docs/ops/rollback_phase4_20_backoffice_sales_agent_provisioning.sql.

create or replace function public.staff_admin_can(p_actor uuid, p_target_role text, p_new_role text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce((
    select case
      when not coalesce(a.is_active, true) then false
      when a.role = 'admin' then
        case
          when p_target_role is null then p_new_role in ('inside_sales', 'field_sales')
          when p_target_role in ('inside_sales', 'field_sales') then p_new_role is null or p_new_role in ('inside_sales', 'field_sales')
          when p_target_role in ('admin', 'manager', 'back_office') then p_new_role is null or p_new_role = p_target_role
          else false
        end
      when a.role in ('manager', 'back_office') then
        case
          when p_target_role is null then p_new_role in ('inside_sales', 'field_sales')
          when p_target_role in ('inside_sales', 'field_sales') then p_new_role is null or p_new_role in ('inside_sales', 'field_sales')
          else false
        end
      else false
    end
    from public.profiles a
    where a.id = p_actor
      -- Callers may query only their own permission matrix; trusted SECURITY DEFINER staff RPCs
      -- pass auth.uid() as the actor. This prevents role-enumeration via arbitrary user UUIDs.
      and p_actor = auth.uid()
  ), false);
$$;
revoke all on function public.staff_admin_can(uuid, text, text) from public, anon;
grant execute on function public.staff_admin_can(uuid, text, text) to authenticated, service_role;

comment on function public.staff_admin_can(uuid, text, text) is
  'Phase 4/20: all new accounts and role promotions are restricted to Sales Agent roles; existing legacy office rows are maintained only without changing their role; inactive/unknown callers are denied.';

-- Keep the directory response compatible with the existing UI and with the phase2/05 fallback.
create or replace function public.staff_list()
returns table (
  id uuid, full_name text, email text, phone text, role text, is_active boolean,
  created_at timestamptz, last_sign_in_at timestamptz, can_manage boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_actor and coalesce(p.is_active, true);

  if v_role is null or v_role not in ('admin', 'manager', 'back_office') then
    raise exception 'staff_list: not allowed' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, u.email::text, p.phone, p.role,
           coalesce(p.is_active, true), p.created_at, u.last_sign_in_at,
           (p.id <> v_actor and public.staff_admin_can(v_actor, p.role, null))
    from public.profiles p
    left join auth.users u on u.id = p.id
    where v_role = 'admin'
       or (v_role in ('manager', 'back_office') and p.role in ('inside_sales', 'field_sales'))
    order by coalesce(p.is_active, true) desc, p.full_name;
end;
$$;
revoke all on function public.staff_list() from public, anon;
grant execute on function public.staff_list() to authenticated, service_role;

