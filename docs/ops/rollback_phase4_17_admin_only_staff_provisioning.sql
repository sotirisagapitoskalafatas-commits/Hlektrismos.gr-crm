-- Rollback of supabase/staged-migrations/phase4/17_admin_only_staff_provisioning.sql:
-- restores the phase2/05 matrix (admin → all; manager → inside_sales, field_sales, back_office; back_office → back_office).
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
comment on function public.staff_admin_can(uuid, text, text) is null;
