-- ============================================================================
-- CRM-OS Phase 1.1 verification harness — org / role / team model
-- ----------------------------------------------------------------------------
-- Versioned OUTSIDE supabase/migrations on purpose: it mutates auth.users and
-- temporarily flips RLS/triggers, and is meant to be re-run by hand against a
-- live project to prove the model is intact. It is NOT part of migration
-- history (a fresh environment must never execute it as part of setup).
--
-- Run it from the Supabase SQL editor or psql as a privileged role
-- (e.g. postgres). It creates temporary fixture orgs/users/roles, runs ~40
-- assertions, then removes every trace it created. On any assertion failure it
-- RAISEs, which rolls the whole script back (fixtures never leak).
--
-- Assumes the Phase 1.1 model (20260910103000_crm_os_phase11_org_team_role_model)
-- is already applied and that the 5 system roles exist.
--
-- Append-only journal note: cleanup temporarily DISABLES business_events RLS and
-- its append-only trigger — the same approved bypass the live harness used.
-- ============================================================================

do $$
declare
  v_root            text;
  v_tag             text;
  v_org_baseline    bigint;
  v_profiles_base   bigint;
  v_user_roles_base bigint;
  v_events_base     bigint;
  v_asserts         int := 0;

  v_role_admin      uuid;
  v_role_manager    uuid;
  v_role_inside     uuid;
  v_role_field      uuid;
  v_role_backoffice uuid;

  v_org_a           uuid;
  v_org_b           uuid;
  v_dept_a          uuid;
  v_dept_b          uuid;
  v_team_a          uuid;
  v_team_b          uuid;
  v_div_b           uuid;

  v_uid_admin       uuid;
  v_uid_user        uuid;
  v_uid_other       uuid;

  v_cnt             bigint;
  v_before          bigint;
  v_after           bigint;
begin
  v_root := session_user;
  v_tag  := left(replace(gen_random_uuid()::text, '-', ''), 12);

  raise notice 'Phase 1.1 verify: start (running as %)', v_root;

  -- ------------------------------------------------------------------------
  -- 0. Baselines
  -- ------------------------------------------------------------------------
  select count(*) into v_org_baseline    from public.organizations;
  select count(*) into v_profiles_base   from public.profiles;
  select count(*) into v_user_roles_base from public.user_roles;
  select count(*) into v_events_base     from public.business_events;

  -- ------------------------------------------------------------------------
  -- 1. Preconditions: tables + the 5 system roles exist
  -- ------------------------------------------------------------------------
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='organizations')  then raise exception 'ASSERT FAIL: organizations table missing'; end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='roles')         then raise exception 'ASSERT FAIL: roles table missing'; end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='divisions')     then raise exception 'ASSERT FAIL: divisions table missing'; end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='departments')   then raise exception 'ASSERT FAIL: departments table missing'; end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='territories')   then raise exception 'ASSERT FAIL: territories table missing'; end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='teams')         then raise exception 'ASSERT FAIL: teams table missing'; end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='user_roles')    then raise exception 'ASSERT FAIL: user_roles table missing'; end if;
  if not exists (select 1 from pg_tables where schemaname='public' and tablename='business_events') then raise exception 'ASSERT FAIL: business_events table missing'; end if;
  v_asserts := v_asserts + 8;

  select id into v_role_admin      from public.roles where key='admin';
  select id into v_role_manager    from public.roles where key='manager';
  select id into v_role_inside     from public.roles where key='inside_sales';
  select id into v_role_field      from public.roles where key='field_sales';
  select id into v_role_backoffice from public.roles where key='back_office';
  if v_role_admin is null or v_role_manager is null or v_role_inside is null
     or v_role_field is null or v_role_backoffice is null then
    raise exception 'ASSERT FAIL: one or more of the 5 system roles are missing';
  end if;
  v_asserts := v_asserts + 1;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='crm_grant_role') then
    raise exception 'ASSERT FAIL: crm_grant_role RPC missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='crm_revoke_role') then
    raise exception 'ASSERT FAIL: crm_revoke_role RPC missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='public' and p.proname='crm_set_primary_role') then
    raise exception 'ASSERT FAIL: crm_set_primary_role RPC missing';
  end if;
  v_asserts := v_asserts + 3;

  -- ------------------------------------------------------------------------
  -- 2. Fixture orgs + org model rows
  -- ------------------------------------------------------------------------
  insert into public.organizations (name, slug) values ('Phase 1.1 Verify Org A', 'phase11-verify-orga-' || v_tag) returning id into v_org_a;
  insert into public.organizations (name, slug) values ('Phase 1.1 Verify Org B', 'phase11-verify-orgb-' || v_tag) returning id into v_org_b;
  v_asserts := v_asserts + 2;

  -- Org B hierarchy (used for cross-org rejection tests)
  insert into public.divisions (organization_id, name, code) values (v_org_b, 'Verify Division B', 'VDB-' || v_tag) returning id into v_div_b;
  insert into public.departments (organization_id, division_id, name, code) values (v_org_b, v_div_b, 'Verify Dept B', 'VDEPT-B-' || v_tag) returning id into v_dept_b;
  insert into public.teams (organization_id, department_id, name, code) values (v_org_b, v_dept_b, 'Verify Team B', 'VTEAM-B-' || v_tag) returning id into v_team_b;
  -- Org A hierarchy (for the profile cross-org team test + positive reads)
  insert into public.departments (organization_id, name, code) values (v_org_a, 'Verify Dept A', 'VDEPT-A-' || v_tag) returning id into v_dept_a;
  insert into public.teams (organization_id, department_id, name, code) values (v_org_a, v_dept_a, 'Verify Team A', 'VTEAM-A-' || v_tag) returning id into v_team_a;
  v_asserts := v_asserts + 5;

  -- ------------------------------------------------------------------------
  -- 3. Fixture auth users (handle_new_user() auto-creates their profiles)
  -- ------------------------------------------------------------------------
  v_uid_admin := gen_random_uuid();
  v_uid_user  := gen_random_uuid();
  v_uid_other := gen_random_uuid();

  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (v_uid_admin, 'authenticated', 'authenticated', 'pv11.' || v_tag || '.admin@invalid.test', 'x', now(), '{"full_name":"Verify Admin"}'::jsonb, now(), now());
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (v_uid_user, 'authenticated', 'authenticated', 'pv11.' || v_tag || '.user@invalid.test', 'x', now(), '{"full_name":"Verify User"}'::jsonb, now(), now());
  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (v_uid_other, 'authenticated', 'authenticated', 'pv11.' || v_tag || '.other@invalid.test', 'x', now(), '{"full_name":"Verify Other"}'::jsonb, now(), now());

  -- profiles were auto-created by on_auth_user_created; wire them into orgs (never INSERT, per model)
  update public.profiles set organization_id = v_org_a where id = v_uid_admin;
  update public.profiles set organization_id = v_org_a where id = v_uid_user;
  update public.profiles set organization_id = v_org_b where id = v_uid_other;

  select count(*) into v_cnt from public.profiles where id in (v_uid_admin, v_uid_user, v_uid_other);
  if v_cnt <> 3 then raise exception 'ASSERT FAIL: expected auto-created profiles, got %', v_cnt; end if;
  v_asserts := v_asserts + 1;

  -- ------------------------------------------------------------------------
  -- 4. Role lifecycle (service_role through the RPCs)
  -- ------------------------------------------------------------------------
  execute 'set local role service_role';

  -- admin + grant a role to org-B user
  perform public.crm_grant_role(v_uid_admin, 'admin', true);
  perform public.crm_grant_role(v_uid_other, 'inside_sales', true);

  select count(*) into v_before from public.business_events where entity_id = v_uid_user;

  -- grant inside_sales (primary) -> RoleGranted
  perform public.crm_grant_role(v_uid_user, 'inside_sales', true);
  -- idempotent re-grant -> no new row, no audit event
  perform public.crm_grant_role(v_uid_user, 'inside_sales', true);
  -- grant field_sales (non-primary) -> RoleGranted
  perform public.crm_grant_role(v_uid_user, 'field_sales', false);

  select count(*) into v_after from public.business_events where entity_id = v_uid_user;
  if v_after - v_before <> 2 then raise exception 'ASSERT FAIL: expected 2 RoleGranted events, got %', v_after - v_before; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.user_roles where user_id = v_uid_user;
  if v_cnt <> 2 then raise exception 'ASSERT FAIL: expected 2 user_roles, got %', v_cnt; end if;
  if (select count(*) from public.user_roles where user_id = v_uid_user and is_primary) <> 1 then
    raise exception 'ASSERT FAIL: exactly one primary role expected after grants';
  end if;
  v_asserts := v_asserts + 2;

  -- grant unknown role -> error
  begin
    perform public.crm_grant_role(v_uid_user, 'bogus_role', false);
    raise exception 'SENTINEL';
  exception
    when others then
      if sqlerrm = 'SENTINEL' then raise; end if;
      if sqlerrm like '%unknown role%' then v_asserts := v_asserts + 1;
      else raise exception 'ASSERT FAIL: unexpected error (%)', sqlerrm; end if;
  end;

  -- set primary -> flips both rows (2 RoleChanged events; distinct old->new keys)
  select count(*) into v_before from public.business_events where entity_id = v_uid_user;
  perform public.crm_set_primary_role(v_uid_user, 'field_sales');
  select count(*) into v_after from public.business_events where entity_id = v_uid_user;
  if v_after - v_before <> 2 then raise exception 'ASSERT FAIL: expected 2 RoleChanged events, got %', v_after - v_before; end if;
  v_asserts := v_asserts + 1;

  if (select count(*) from public.user_roles where user_id = v_uid_user and is_primary) <> 1 then
    raise exception 'ASSERT FAIL: exactly one primary after set_primary';
  end if;
  if (select p.role from public.profiles p where p.id = v_uid_user) <> 'field_sales' then
    raise exception 'ASSERT FAIL: profiles.role did not mirror primary role';
  end if;
  v_asserts := v_asserts + 2;

  -- audit idempotency fix: the two RoleChanged events must have distinct keys ending in :true->false / :false->true
  if (
    select count(*) from public.business_events
    where entity_id = v_uid_user and event_type = 'RoleChanged'
      and (idempotency_key like '%:true->false' or idempotency_key like '%:false->true')
  ) <> 2 then
    raise exception 'ASSERT FAIL: RoleChanged events missing old->new key suffix';
  end if;
  v_asserts := v_asserts + 1;

  -- revoke inside_sales (a 2nd role remains) -> RoleRevoked
  select count(*) into v_before from public.business_events where entity_id = v_uid_user;
  perform public.crm_revoke_role(v_uid_user, 'inside_sales');
  select count(*) into v_after from public.business_events where entity_id = v_uid_user;
  if v_after - v_before <> 1 then raise exception 'ASSERT FAIL: expected 1 RoleRevoked event, got %', v_after - v_before; end if;
  v_asserts := v_asserts + 1;

  if (select count(*) from public.user_roles where user_id = v_uid_user) <> 1 then
    raise exception 'ASSERT FAIL: expected 1 user_role remaining after revoke';
  end if;
  if (select p.role from public.profiles p where p.id = v_uid_user) <> 'field_sales' then
    raise exception 'ASSERT FAIL: profiles.role did not follow revoke';
  end if;
  v_asserts := v_asserts + 2;

  -- revoke the last role -> must be rejected
  begin
    perform public.crm_revoke_role(v_uid_user, 'field_sales');
    raise exception 'SENTINEL';
  exception
    when others then
      if sqlerrm = 'SENTINEL' then raise; end if;
      if sqlerrm like '%cannot revoke the only role%' then v_asserts := v_asserts + 1;
      else raise exception 'ASSERT FAIL: unexpected error (%)', sqlerrm; end if;
  end;

  if (select count(*) from public.user_roles where user_id = v_uid_user) <> 1 then
    raise exception 'ASSERT FAIL: last-role guard did not protect the remaining role';
  end if;
  v_asserts := v_asserts + 1;

  execute 'set local role ' || quote_ident(v_root);

  -- ------------------------------------------------------------------------
  -- 5. Cross-org rejection (privileged direct inserts; org-consistency triggers)
  -- ------------------------------------------------------------------------
  -- user_roles cannot cross orgs
  begin
    insert into public.user_roles (user_id, role_id, organization_id, is_primary)
    values (v_uid_user, v_role_manager, v_org_b, false);
    raise exception 'SENTINEL';
  exception
    when others then
      if sqlerrm = 'SENTINEL' then raise; end if;
      if sqlerrm like '%cannot cross organizations%' then v_asserts := v_asserts + 1;
      else raise exception 'ASSERT FAIL: unexpected error (%)', sqlerrm; end if;
  end;

  -- user_roles cannot be created for a user without an organization
  begin
    insert into public.user_roles (user_id, role_id, organization_id, is_primary)
    values (v_uid_other, v_role_manager, v_org_a, false);
    raise exception 'SENTINEL';
  exception
    when others then
      if sqlerrm = 'SENTINEL' then raise; end if;
      if sqlerrm like '%cannot cross organizations%' then v_asserts := v_asserts + 1;
      else raise exception 'ASSERT FAIL: unexpected error (%)', sqlerrm; end if;
  end;

  -- profiles.team_id cannot cross orgs (org-A user forced into org-B team)
  begin
    update public.profiles set team_id = v_team_b where id = v_uid_user;
    raise exception 'SENTINEL';
  exception
    when others then
      if sqlerrm = 'SENTINEL' then raise; end if;
      if sqlerrm like '%crosses organizations%' then v_asserts := v_asserts + 1;
      else raise exception 'ASSERT FAIL: unexpected error (%)', sqlerrm; end if;
  end;

  -- departments.division_id cannot cross orgs (org-A dept on org-B division)
  begin
    insert into public.departments (organization_id, division_id, name, code)
    values (v_org_a, v_div_b, 'X', 'VDXP-' || v_tag);
    raise exception 'SENTINEL';
  exception
    when others then
      if sqlerrm = 'SENTINEL' then raise; end if;
      if sqlerrm like '%crosses organizations%' then v_asserts := v_asserts + 1;
      else raise exception 'ASSERT FAIL: unexpected error (%)', sqlerrm; end if;
  end;

  -- teams.department_id cannot cross orgs (org-B team on org-A dept)
  begin
    insert into public.teams (organization_id, department_id, name, code)
    values (v_org_b, v_dept_a, 'X', 'VTXP-' || v_tag);
    raise exception 'SENTINEL';
  exception
    when others then
      if sqlerrm = 'SENTINEL' then raise; end if;
      if sqlerrm like '%crosses organizations%' then v_asserts := v_asserts + 1;
      else raise exception 'ASSERT FAIL: unexpected error (%)', sqlerrm; end if;
  end;

  -- ------------------------------------------------------------------------
  -- 6. RLS: admin reads own org; other org is fully isolated
  -- ------------------------------------------------------------------------
  -- 6a. admin (org A) reads org-A rows + all roles
  perform set_config('request.jwt.claims',    json_build_object('sub', v_uid_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_uid_admin::text, true);
  perform set_config('request.jwt.claim.role','authenticated', true);
  execute 'set local role authenticated';

  select count(*) into v_cnt from public.organizations where id = v_org_a;
  if v_cnt <> 1 then raise exception 'ASSERT FAIL: admin cannot see own org'; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.roles;
  if v_cnt <> 5 then raise exception 'ASSERT FAIL: roles not readable (got %)', v_cnt; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.teams where organization_id = v_org_a;
  if v_cnt <> 1 then raise exception 'ASSERT FAIL: admin cannot see own teams'; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.profiles where id = v_uid_user;
  if v_cnt <> 1 then raise exception 'ASSERT FAIL: admin cannot read same-org staff profile'; end if;
  v_asserts := v_asserts + 1;

  -- 6b. org-B user is isolated from org-A rows
  perform set_config('request.jwt.claims',    json_build_object('sub', v_uid_other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_uid_other::text, true);
  perform set_config('request.jwt.claim.role','authenticated', true);

  select count(*) into v_cnt from public.organizations where id = v_org_a;
  if v_cnt <> 0 then raise exception 'ASSERT FAIL: org-B user should not see org-A'; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.user_roles where organization_id = v_org_a;
  if v_cnt <> 0 then raise exception 'ASSERT FAIL: org-B user should not see org-A user_roles'; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.teams where organization_id = v_org_a;
  if v_cnt <> 0 then raise exception 'ASSERT FAIL: org-B user should not see org-A teams'; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.departments where organization_id = v_org_a;
  if v_cnt <> 0 then raise exception 'ASSERT FAIL: org-B user should not see org-A departments'; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.organizations where id = v_org_b;
  if v_cnt <> 1 then raise exception 'ASSERT FAIL: org-B user should see own org'; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.profiles where id = v_uid_admin;
  if v_cnt <> 0 then raise exception 'ASSERT FAIL: org-B user should not read org-A profile'; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.profiles where id = v_uid_other;
  if v_cnt <> 1 then raise exception 'ASSERT FAIL: user should read own profile'; end if;
  v_asserts := v_asserts + 1;

  -- 6c. non-admin cannot grant roles through the RPC
  begin
    perform public.crm_grant_role(v_uid_user, 'back_office', false);
    raise exception 'SENTINEL';
  exception
    when others then
      if sqlerrm = 'SENTINEL' then raise; end if;
      if sqlerrm like '%permission denied%' then v_asserts := v_asserts + 1;
      else raise exception 'ASSERT FAIL: unexpected error (%)', sqlerrm; end if;
  end;

  execute 'set local role ' || quote_ident(v_root);

  -- ------------------------------------------------------------------------
  -- 7. Append-only journal: a service_role DELETE silently skips rows.
  --    auth.role() only ever reads the JWT claim (never the SQL role), so the
  --    claim must carry role=service_role for the trigger's allow-list to hit.
  -- ------------------------------------------------------------------------
  perform set_config('request.jwt.claims',    '{}', true);
  perform set_config('request.jwt.claim.sub',  '',  true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select count(*) into v_before from public.business_events where entity_id = v_uid_user;
  execute 'set local role service_role';
  delete from public.business_events where entity_id = v_uid_user;
  execute 'set local role ' || quote_ident(v_root);
  perform set_config('request.jwt.claim.role', '', true);
  execute 'set local role ' || quote_ident(v_root);
  select count(*) into v_after from public.business_events where entity_id = v_uid_user;
  if v_before <> v_after or v_after = 0 then
    raise exception 'ASSERT FAIL: append-only journal was mutated by DELETE (%, %)', v_before, v_after;
  end if;
  v_asserts := v_asserts + 1;

  -- ------------------------------------------------------------------------
  -- 8. Cleanup: remove every fixture trace
  -- ------------------------------------------------------------------------
  delete from public.user_roles where user_id in (v_uid_admin, v_uid_user, v_uid_other);
  delete from public.teams      where organization_id in (v_org_a, v_org_b);
  delete from public.departments where organization_id in (v_org_a, v_org_b);
  delete from public.divisions  where organization_id in (v_org_a, v_org_b);
  delete from public.profiles   where organization_id in (v_org_a, v_org_b);
  delete from auth.users        where id in (v_uid_admin, v_uid_user, v_uid_other);
  delete from public.organizations where id in (v_org_a, v_org_b);

  -- grind the fixture audit events; guard trigger + RLS are off only for this
  alter table public.business_events disable row level security;
  alter table public.business_events disable trigger business_events_append_only;
  delete from public.business_events where entity_id in (v_uid_admin, v_uid_user, v_uid_other);
  alter table public.business_events enable trigger business_events_append_only;
  alter table public.business_events enable row level security;
  v_asserts := v_asserts + 1;

  -- ------------------------------------------------------------------------
  -- 9. Final state restored
  -- ------------------------------------------------------------------------
  select count(*) into v_cnt from public.organizations;
  if v_cnt <> v_org_baseline then raise exception 'ASSERT FAIL: organizations not restored (%), baseline %', v_cnt, v_org_baseline; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.profiles;
  if v_cnt <> v_profiles_base then raise exception 'ASSERT FAIL: profiles not restored (%), baseline %', v_cnt, v_profiles_base; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.user_roles;
  if v_cnt <> v_user_roles_base then raise exception 'ASSERT FAIL: user_roles not restored (%), baseline %', v_cnt, v_user_roles_base; end if;
  v_asserts := v_asserts + 1;

  select count(*) into v_cnt from public.business_events;
  if v_cnt <> v_events_base then raise exception 'ASSERT FAIL: business_events not restored (%), baseline %', v_cnt, v_events_base; end if;
  v_asserts := v_asserts + 1;

  raise notice 'Phase 1.1 verify: PASSED (% assertions)', v_asserts;
end $$;