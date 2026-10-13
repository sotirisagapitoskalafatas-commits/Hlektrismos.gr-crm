-- READ-ONLY live-state audit. Run in the Supabase SQL editor (project nonaymiwdayfuulccxrl). Changes nothing.
-- 1) Public tables with RLS disabled (must be empty)
select c.relname as table_without_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1;

-- 2) Policies reachable by anon/public, or unconditional (qual = true)
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname in ('public','storage')
   and (roles && array['anon','public']::name[] or qual = 'true' or with_check = 'true')
 order by tablename, policyname;

-- 3) Table privileges granted to anon (RLS is the only barrier for these)
select table_name, string_agg(privilege_type, ',' order by privilege_type) as anon_privileges
  from information_schema.role_table_grants where grantee='anon' and table_schema='public'
 group by 1 order by 1;

-- 4) SECURITY DEFINER functions without a pinned search_path, and whether anon can execute them
select p.proname, pg_get_function_identity_arguments(p.oid) args,
       p.proconfig as config, has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef
   and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
 order by 1;

-- 5) Storage buckets that are public + their policies
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;

-- 6) Secrets stored in tables (should be moved to Supabase secrets / Vault): key NAMES only, no values
select setting_key from public.crm_settings
 where setting_key ~* '(key|secret|token|password|pass)' order by 1;

-- 7) Users and roles (who can do what)
select p.id, p.is_active, p.role from public.profiles p order by p.role;

-- 8) Auth hardening hints
select count(*) filter (where email_confirmed_at is null) as unconfirmed_users, count(*) as users from auth.users;
