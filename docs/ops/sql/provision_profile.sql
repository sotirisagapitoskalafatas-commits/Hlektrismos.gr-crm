-- Attach a CRM profile (+ canonical user_roles row) to an EXISTING, confirmed Auth user. Idempotent and guarded.
-- Never creates an Auth user and never touches a password. Edit the three values, nothing else.
--   admin    -> role 'admin'       (the shared Admin / Back Office login; displayed as «Admin / Back Office»)
--   a sales  -> role 'field_sales' (displayed as «Sales Agent»)
do $$
declare
  v_email text := 'CHANGE-ME@example.com';
  v_name  text := 'CHANGE ME';
  v_role  text := 'field_sales';
  v_id uuid; v_n int; v_role_id uuid; v_org uuid;
begin
  if v_role not in ('admin', 'field_sales') then raise exception 'role % is not assignable (only admin or field_sales)', v_role; end if;
  select count(*), (array_agg(id))[1] into v_n, v_id from auth.users
   where lower(email) = lower(v_email) and email_confirmed_at is not null and (banned_until is null or banned_until < now());
  if v_n <> 1 then raise exception 'expected exactly one confirmed, not-banned Auth user for %, found %', v_email, v_n; end if;
  -- the CRM has one organization; profiles and role rows must belong to it (trigger user_roles_org_consistency)
  select count(*), (array_agg(id))[1] into v_n, v_org from public.organizations;
  if v_n <> 1 then raise exception 'expected exactly one organization, found %', v_n; end if;
  insert into public.profiles (id, full_name, role, is_active, organization_id) values (v_id, v_name, v_role, true, v_org)
    on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, is_active = true, organization_id = coalesce(public.profiles.organization_id, excluded.organization_id), updated_at = now();
  select id into v_role_id from public.roles where key = v_role;
  if v_role_id is null then raise exception 'roles row % missing', v_role; end if;
  delete from public.user_roles where user_id = v_id and role_id <> v_role_id; -- exactly one effective role
  insert into public.user_roles (user_id, role_id, is_primary) select v_id, v_role_id, true
   where not exists (select 1 from public.user_roles where user_id = v_id and role_id = v_role_id);
  raise notice 'profile for % set to % (id %)', v_email, v_role, v_id;
end $$;
