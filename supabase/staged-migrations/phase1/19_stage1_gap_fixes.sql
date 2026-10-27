-- STAGED ONLY: do not apply to staging or production without an owner-approved change window.
-- Phase 1 / 19: Stage 1 emergency hardening, the gaps left after phase1/16, 01, 17, phase4/19 and phase1/18.
-- Apply LAST in the Stage 1 sequence (docs/ops/STAGE1_EMERGENCY_DB_HARDENING.md).
-- No rows are inserted, updated or deleted. Idempotent: safe to run twice.
--
-- 1. set_user_role(uuid,text): its guard
--      IF (auth.jwt()->'app_metadata'->>'role' != 'admin') AND (current_setting('role') != 'service_role')
--    is NULL (not true) for a caller whose JWT has no app_metadata.role, such as the anon key. The IF is then
--    skipped and the SECURITY DEFINER body rewrites auth.users.raw_app_meta_data.role for any user.
--    phase1/18 already limits EXECUTE to service_role; this redefines the body NULL-safe as well, so a later
--    re-grant cannot re-open it. Nothing in src/ or supabase/functions/ calls this RPC.
-- 2. energy-bills storage bucket (20260810190238): anyone may upload anywhere in it, and any signed-in
--    account, including inactive ones, may read, replace or delete every file. phase1/16 covers only
--    hlektrismos_docs. Nothing in the live app writes to this bucket; old leads may reference files in it, so
--    active staff keep READ access. No other role can upload, replace or delete. The service role is unchanged.
-- 3. Default privileges: Supabase grants new tables and functions to anon by default, so a future table
--    without RLS, or a future SECURITY DEFINER function, is exposed to anonymous visitors automatically.
--    New objects created by the migration role are no longer granted to anon. Authenticated users and the
--    service role keep their defaults, so staff features keep working. COORDINATION: a future migration that
--    really needs anonymous access must grant it explicitly (as insert_website_lead already does).
-- Rollback (re-opens the findings; emergency use only): see the end of this file.

-- 1. set_user_role: NULL-safe guard, service role only.
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
        -- IS DISTINCT FROM is never NULL, so a missing claim counts as "not admin".
        if coalesce(current_setting('role', true), '') is distinct from 'service_role'
           and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') is distinct from 'admin' then
          raise exception 'Unauthorized: only an administrator can change roles.' using errcode = '42501';
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

-- 3. Future objects are not granted to anon automatically.
do $$
begin
  execute 'alter default privileges in schema public revoke all on tables from anon';
  execute 'alter default privileges in schema public revoke all on sequences from anon';
  -- Functions get EXECUTE through the built-in PUBLIC default. Postgres cannot remove a global default with
  -- IN SCHEMA, so this is the global form (for objects created by the migration role, in every schema), and
  -- signed-in users and the service role get EXECUTE back explicitly.
  execute 'alter default privileges in schema public revoke execute on functions from anon';
  execute 'alter default privileges revoke execute on functions from public';
  execute 'alter default privileges grant execute on functions to authenticated, service_role';
end $$;

-- Rollback (emergency only; re-opens the findings):
--   alter default privileges in schema public grant all on tables to anon;
--   alter default privileges in schema public grant all on sequences to anon;
--   alter default privileges grant execute on functions to public;
--   drop policy if exists "staff reads energy bills" on storage.objects;
--   re-run the energy-bills policy block of supabase/migrations/20260810190238_add_bill_upload_columns_and_storage.sql;
--   set_user_role: leave EXECUTE restricted to service_role (never re-grant to anon/authenticated).
