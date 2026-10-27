-- STAGED ONLY: do not apply to staging or production without an owner-approved change window.
-- Phase 1 / 19: Stage 1 emergency hardening, the gaps left after phase1/16, 01, 17, phase4/19 and phase1/18.
-- Apply LAST in the Stage 1 sequence (docs/ops/STAGE1_EMERGENCY_DB_HARDENING.md).
-- No rows are inserted, updated or deleted. Idempotent: safe to run twice.
--
-- 1. set_user_role(uuid,text): its original guard
--      IF (auth.jwt()->'app_metadata'->>'role' != 'admin') AND (current_setting('role') != 'service_role')
--    is NULL (not true) for a caller whose JWT has no app_metadata.role, such as the anon key. The IF is then
--    skipped and the SECURITY DEFINER body rewrites auth.users.raw_app_meta_data.role for any user.
--    POLICY: this RPC is SERVICE-ROLE ONLY. Nothing in src/ or supabase/functions/ calls it, and staff roles are
--    managed through the admin-users Edge Function. The body now refuses every caller that is not the service
--    role (there is no admin-claim alternative any more), and EXECUTE is granted to service_role only. Grant and
--    body enforce the same rule, so an accidental re-grant cannot re-open it.
-- 2. energy-bills storage bucket (20260810190238): anyone may upload anywhere in it, and any signed-in
--    account, including inactive ones, may read, replace or delete every file. phase1/16 covers only
--    hlektrismos_docs. Nothing in the live app writes to this bucket; old leads may reference files in it, so
--    active staff keep READ access. No other role can upload, replace or delete. The service role is unchanged.
-- 3. Default privileges (Supabase guidance: revoke default EXECUTE, then grant per function):
--    * Functions created in future by the migration role are NOT executable by PUBLIC, anon or authenticated
--      until a migration grants EXECUTE explicitly to the role that needs it. Supabase's own schema default
--      for service_role is left unchanged (this file adds no grant).
--    * Tables and sequences created in future are no longer granted to anon. Authenticated keeps the platform
--      default for tables (RLS remains the barrier there).
--    * Scope: default privileges apply only to objects created BY the named role. Migrations in this project
--      are applied as `postgres` (Supabase SQL editor / CLI); this file sets them for `postgres` and, if
--      different, for the role running it. Objects created by `supabase_admin` (platform/extensions) are not
--      affected and are outside this project's migrations.
--    * Existing functions keep their current grants: this changes defaults for NEW objects only.
--    COORDINATION: every later migration that creates a function the browser, an RLS policy or an Edge
--    Function calls must `grant execute ... to authenticated` (or anon) explicitly. The Stage 1 test replays
--    all later staged files after this one and checks that each function they need is still executable.
-- Rollback (re-opens the findings; emergency use only): see the end of this file.

-- 1. set_user_role: service role only, in the grant AND in the body.
do $$
begin
  if to_regprocedure('public.set_user_role(uuid,text)') is not null then
    execute $f$
      create or replace function public.set_user_role(target_user_id uuid, new_role text)
      returns void
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $body$
      begin
        -- IS DISTINCT FROM is never NULL: an unset role counts as "not the service role".
        if coalesce(current_setting('role', true), '') is distinct from 'service_role' then
          raise exception 'Unauthorized: set_user_role is service-role only.' using errcode = '42501';
        end if;
        update auth.users
          set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new_role)
          where id = target_user_id;
      end;
      $body$
    $f$;
    revoke all on function public.set_user_role(uuid, text) from public, anon, authenticated;
    grant execute on function public.set_user_role(uuid, text) to service_role;
  end if;
end $$;

-- 2. energy-bills bucket: active staff read only.
drop policy if exists "Public can upload energy bills" on storage.objects;
drop policy if exists "Authenticated can read energy bills" on storage.objects;
drop policy if exists "Authenticated can update energy bills" on storage.objects;
drop policy if exists "Authenticated can delete energy bills" on storage.objects;
drop policy if exists "staff reads energy bills" on storage.objects;
create policy "staff reads energy bills" on storage.objects
  for select to authenticated
  using (bucket_id = 'energy-bills' and public.is_staff());

-- 3. Secure-by-default privileges for future objects.
do $$
declare
  r text;
begin
  foreach r in array array(select distinct x from unnest(array['postgres', current_user::text]) x
                           where exists (select 1 from pg_roles where rolname = x)) loop
    -- Functions: no implicit EXECUTE for PUBLIC (global default) or for the API roles (Supabase schema default).
    execute format('alter default privileges for role %I revoke execute on functions from public', r);
    execute format('alter default privileges for role %I in schema public revoke execute on functions from anon, authenticated', r);
    -- Tables and sequences: no implicit anon access.
    execute format('alter default privileges for role %I in schema public revoke all on tables from anon', r);
    execute format('alter default privileges for role %I in schema public revoke all on sequences from anon', r);
  end loop;
end $$;

-- Rollback (emergency only; re-opens the findings), per role used above:
--   alter default privileges for role postgres grant execute on functions to public;
--   alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated;
--   alter default privileges for role postgres in schema public grant all on tables to anon;
--   alter default privileges for role postgres in schema public grant all on sequences to anon;
--   drop policy if exists "staff reads energy bills" on storage.objects;
--   re-run the energy-bills policy block of supabase/migrations/20260810190238_add_bill_upload_columns_and_storage.sql;
--   set_user_role: leave EXECUTE restricted to service_role (never re-grant to anon/authenticated).
