-- Phase 7 / 03: Admin-only assignment for standalone and case-bound field visits.
-- Additive, idempotent. Assignment is always to an ACTIVE Sales Agent; every change
-- passes through case_visits_audit, which records the shared Admin account as actor.
create or replace function public.assign_field_visit(p_visit uuid, p_agent uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_visit public.case_visits%rowtype;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'admin' and coalesce(p.is_active, true)
  ) then
    raise exception 'visit assignment: Admin / Back Office only' using errcode = '42501';
  end if;

  if p_visit is null or p_agent is null or not exists (
    select 1 from public.profiles p
    where p.id = p_agent and p.role = 'sales_agent' and coalesce(p.is_active, true)
  ) then
    raise exception 'visit assignment: choose an active Sales Agent' using errcode = '22023';
  end if;

  select * into v_visit
  from public.case_visits
  where id = p_visit
  for update;

  if not found then
    return false;
  end if;

  if v_visit.status not in ('planned', 'in_progress') then
    raise exception 'visit assignment: only open visits can be reassigned' using errcode = '23514';
  end if;

  update public.case_visits
  set user_id = p_agent,
      updated_at = now()
  where id = p_visit
    and user_id is distinct from p_agent;

  return true;
end;
$$;

revoke all on function public.assign_field_visit(uuid, uuid) from public, anon, service_role;
grant execute on function public.assign_field_visit(uuid, uuid) to authenticated;
