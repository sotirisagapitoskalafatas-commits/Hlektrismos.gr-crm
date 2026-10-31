-- Attach a CRM profile (+ canonical user_roles row) to an EXISTING Auth user. Idempotent and guarded.
-- Never creates an Auth user, never touches a password, an identity, a session, crm_users, sales_agents or any lead. Edit the three values, nothing else.
--   admin    -> role 'admin'       (the shared Admin / Back Office login; displayed as «Admin / Back Office»)
--   a sales  -> role 'sales_agent' (displayed as «Sales Agent»)
-- Refuses unless ALL of these hold, because each one is a way to end with an account that looks provisioned but is not:
--   * exactly one Auth user has that e-mail, confirmed and not banned (no duplicate, no guessing);
--   * it has an identity row, i.e. it can actually sign in (a user with none cannot; it must be created through the Dashboard invitation);
--   * its owner has already signed in (owner-controlled sign-in comes first; provisioning never hands out access to an account nobody controls yet);
--   * an existing profile either has no role yet or already has THIS role (a role is never silently changed here: use the Admin screens, which audit it).
-- Legacy records (crm_users, hlektrismos_leads.assigned_to) are only REPORTED, never modified; see docs/ops/ACCOUNT_PROVISIONING.md.
do $$
declare
  v_email text := 'CHANGE-ME@example.com';
  v_name  text := 'CHANGE ME';
  v_role  text := 'sales_agent';
  v_id uuid; v_n int; v_role_id uuid; v_org uuid; v_existing text; v_legacy text; v_leads int;
begin
  if v_email ilike 'CHANGE-ME%' or v_name = 'CHANGE ME' then raise exception 'edit the three values first'; end if;
  if v_role not in ('admin', 'sales_agent') then raise exception 'role % is not assignable (only admin or sales_agent)', v_role; end if;
  select count(*), (array_agg(id))[1] into v_n, v_id from auth.users
   where lower(email) = lower(v_email) and email_confirmed_at is not null and (banned_until is null or banned_until < now());
  if v_n <> 1 then raise exception 'expected exactly one confirmed, not-banned Auth user for %, found %', v_email, v_n; end if;
  if not exists (select 1 from auth.identities where user_id = v_id) then
    raise exception 'this Auth user has no identity row, so it cannot sign in: create it through the Dashboard invitation instead of editing auth tables';
  end if;
  if (select last_sign_in_at from auth.users where id = v_id) is null then
    raise exception 'the owner has not signed in yet: provisioning waits for the owner-controlled sign-in';
  end if;
  -- the CRM has one organization; profiles and role rows must belong to it (trigger user_roles_org_consistency)
  select count(*), (array_agg(id))[1] into v_n, v_org from public.organizations;
  if v_n <> 1 then raise exception 'expected exactly one organization, found %', v_n; end if;
  select role into v_existing from public.profiles where id = v_id;
  if v_existing is not null and v_existing <> v_role then
    raise exception 'this account already has the role %: refusing to change it here', v_existing;
  end if;
  insert into public.profiles (id, full_name, role, is_active, organization_id) values (v_id, v_name, v_role, true, v_org)
    on conflict (id) do update set full_name = coalesce(nullif(btrim(public.profiles.full_name), ''), excluded.full_name), role = excluded.role, is_active = true,
      organization_id = coalesce(public.profiles.organization_id, excluded.organization_id), updated_at = now();
  select id into v_role_id from public.roles where key = v_role;
  if v_role_id is null then raise exception 'roles row % missing', v_role; end if;
  delete from public.user_roles where user_id = v_id and role_id <> v_role_id; -- exactly one effective role
  insert into public.user_roles (user_id, role_id, is_primary) select v_id, v_role_id, true
   where not exists (select 1 from public.user_roles where user_id = v_id and role_id = v_role_id);

  -- Report only. The legacy lead distribution (trigger distribute_leads_equally) gives every new website lead to the active crm_users row with role 'sales'.
  if to_regclass('public.crm_users') is not null then execute 'select role::text from public.crm_users where id = $1' into v_legacy using v_id; end if;
  if to_regclass('public.hlektrismos_leads') is not null then execute 'select count(*) from public.hlektrismos_leads where assigned_to = $1' into v_leads using v_id; end if;
  raise notice 'profile for % set to % (id %); legacy crm_users role: %; legacy leads assigned to this account: % (left untouched)', v_email, v_role, v_id, coalesce(v_legacy, 'none'), coalesce(v_leads, 0);
end $$;
