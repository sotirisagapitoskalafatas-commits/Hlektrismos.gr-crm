-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 4 / 17: account provisioning is ADMIN-ONLY (master prompt v3 §2.4).
--
-- Only an administrator may create a user, choose or change a role, reset a password, and disable / re-enable an
-- account. Managers and Back Office keep READ access to the team directory (they need it to assign work) but
-- public.staff_admin_can() now says «no» to them, so staff_update / staff_set_active refuse them and
-- staff_list reports can_manage = false.
--
-- Depends on phase2/05 (it re-defines the function that file created). Additive: one function body is replaced,
-- nothing is dropped, renamed or rewritten; no data changes. Re-running is safe. If phase2/05 is applied AGAIN later,
-- apply this file again afterwards (APPLY_ORDER.md lists it right after 05).
-- Rollback: docs/ops/rollback_phase4_17_admin_only_staff_provisioning.sql (restores the phase2/05 matrix).

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
      else false  -- manager, back_office, inside_sales, field_sales: never
    end
    from public.profiles a where a.id = p_actor
  ), false);
$$;
revoke all on function public.staff_admin_can(uuid, text, text) from public, anon;
grant execute on function public.staff_admin_can(uuid, text, text) to authenticated, service_role;

comment on function public.staff_admin_can(uuid, text, text) is
  'Account provisioning matrix: admin only (phase4/17). Replaces the phase2/05 matrix that also let managers and back office manage operational staff.';
