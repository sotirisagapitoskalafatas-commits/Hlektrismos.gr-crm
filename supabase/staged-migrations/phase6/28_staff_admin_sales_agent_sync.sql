-- STAGED — run in a controlled Supabase SQL Editor release after confirming a fresh backup.
begin;
-- Repairs only the staff-management authorization RPCs after the database was normalized to the exact
-- two-role model (admin / sales_agent) but staff_admin_can and staff_update still contained legacy role names.
-- No profile rows, Auth users, role grants, leads, customers, assignments or audit history are modified.
do $preflight$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.staff_admin_audit') is null then
    raise exception 'staff-admin hotfix requires profiles and staff_admin_audit';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and conkey @> array[(
        select attnum from pg_attribute
        where attrelid = 'public.profiles'::regclass and attname = 'role' and not attisdropped
      )]::smallint[]
      and pg_get_constraintdef(oid) like '%admin%'
      and pg_get_constraintdef(oid) like '%sales_agent%'
      and pg_get_constraintdef(oid) not like '%field_sales%'
      and pg_get_constraintdef(oid) not like '%inside_sales%'
      and pg_get_constraintdef(oid) not like '%manager%'
      and pg_get_constraintdef(oid) not like '%back_office%'
  ) then
    raise exception 'staff-admin hotfix requires profiles.role to be limited to admin and sales_agent';
  end if;
  if not exists (select 1 from public.profiles where role = 'admin' and coalesce(is_active, true)) then
    raise exception 'staff-admin hotfix refused: no active Admin account exists';
  end if;
end
$preflight$;

create or replace function public.staff_admin_can(p_actor uuid, p_target_role text, p_new_role text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select coalesce((
    select case
      when not coalesce(a.is_active, true) or a.role <> 'admin' then false
      when p_target_role is null then p_new_role = 'sales_agent'
      when p_target_role = 'sales_agent' then p_new_role is null or p_new_role = 'sales_agent'
      when p_target_role = 'admin' then p_new_role is null or p_new_role = 'admin'
      else false
    end
    from public.profiles a
    where a.id = p_actor
      and p_actor = auth.uid()
  ), false);
$function$;

revoke all on function public.staff_admin_can(uuid, text, text) from public, anon;
grant execute on function public.staff_admin_can(uuid, text, text) to authenticated, service_role;

create or replace function public.staff_update(p_id uuid, p_full_name text, p_phone text, p_role text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  t public.profiles%rowtype;
  v_new_role text;
begin
  select * into t from public.profiles where id = p_id for update;
  if not found then
    raise exception 'staff_update: user not found' using errcode = 'P0002';
  end if;

  v_new_role := coalesce(nullif(p_role, ''), t.role);
  if v_new_role not in ('admin', 'sales_agent') then
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
  values (
    v_actor,
    case when v_new_role <> t.role then 'role_change' else 'update' end,
    p_id,
    jsonb_build_object('full_name', t.full_name, 'phone', t.phone, 'role', t.role),
    jsonb_build_object(
      'full_name', coalesce(nullif(btrim(p_full_name), ''), t.full_name),
      'phone', nullif(btrim(coalesce(p_phone, '')), ''),
      'role', v_new_role
    )
  );
end;
$function$;

revoke all on function public.staff_update(uuid, text, text, text) from public, anon;
grant execute on function public.staff_update(uuid, text, text, text) to authenticated;

comment on function public.staff_admin_can(uuid, text, text) is
  'Two-role staff administration: only the active Admin account creates/manages Sales Agent accounts.';
comment on function public.staff_update(uuid, text, text, text) is
  'Audited profile updates for the exact admin / sales_agent account model.';

commit;
