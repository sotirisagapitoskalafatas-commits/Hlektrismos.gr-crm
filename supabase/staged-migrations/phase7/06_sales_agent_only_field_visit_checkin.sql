-- Phase 7 / 06: only Sales Agents perform physical field check-in / check-out.
-- The Admin / Back Office account may see, schedule, cancel, review and reassign visits,
-- but must not claim GPS attendance or complete a field visit on behalf of an agent.
-- The checks run at the table boundary, so SECURITY DEFINER RPCs cannot bypass them.

do $preflight$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.case_visits') is null
     or to_regclass('public.field_checkins') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('auth.role()') is null then
    raise exception 'phase7/06 requires profiles, case_visits, field_checkins and Supabase Auth helpers';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name in ('role','is_active')
    group by table_name having count(*) = 2
  ) then
    raise exception 'phase7/06 requires profiles.role and profiles.is_active';
  end if;
end
$preflight$;

create or replace function public.reject_admin_field_visit_event_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.role() = 'authenticated'
     and auth.uid() is not null
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = 'admin'
         and coalesce(p.is_active, true)
     )
     and (
       (new.status is distinct from old.status and new.status in ('in_progress', 'completed'))
       or new.started_at is distinct from old.started_at
       or new.ended_at is distinct from old.ended_at
       or new.check_in is distinct from old.check_in
       or new.check_out is distinct from old.check_out
     ) then
    raise exception 'field visit: Check In / Check Out actions are Sales Agent only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_admin_field_visit_event_update() from public, anon, authenticated, service_role;
drop trigger if exists case_visits_admin_field_event_guard_trg on public.case_visits;
create trigger case_visits_admin_field_event_guard_trg
before update on public.case_visits
for each row execute function public.reject_admin_field_visit_event_update();

create or replace function public.reject_admin_field_checkin_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if auth.role() = 'authenticated'
     and auth.uid() is not null
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = 'admin'
         and coalesce(p.is_active, true)
     ) then
    raise exception 'field visit: Check In / Check Out records are Sales Agent only'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_admin_field_checkin_insert() from public, anon, authenticated, service_role;
drop trigger if exists field_checkins_admin_insert_guard_trg on public.field_checkins;
create trigger field_checkins_admin_insert_guard_trg
before insert on public.field_checkins
for each row execute function public.reject_admin_field_checkin_insert();
