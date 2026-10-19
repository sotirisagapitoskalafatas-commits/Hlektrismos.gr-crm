-- ROLLBACK for phase4/20_backoffice_sales_agent_provisioning.sql.
-- Restores the phase4/17 ADMIN-ONLY matrix and the prior Back Office directory scope.
-- This does not change business data, but removes Back Office's account-provisioning rights.

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
      when a.role = 'admin' then coalesce(p_new_role, p_target_role) in ('admin', 'manager', 'inside_sales', 'field_sales', 'back_office')
      else false
    end
    from public.profiles a where a.id = p_actor
  ), false);
$$;
revoke all on function public.staff_admin_can(uuid, text, text) from public, anon;
grant execute on function public.staff_admin_can(uuid, text, text) to authenticated, service_role;

comment on function public.staff_admin_can(uuid, text, text) is
  'Account provisioning matrix: admin only (rollback of phase4/20).';

create or replace function public.staff_list()
returns table (
  id uuid, full_name text, email text, phone text, role text, is_active boolean,
  created_at timestamptz, last_sign_in_at timestamptz, can_manage boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
begin
  select p.role into v_role from public.profiles p
  where p.id = v_actor and coalesce(p.is_active, true);

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
