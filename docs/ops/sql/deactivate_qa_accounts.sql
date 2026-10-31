-- Deactivate the synthetic QA/demo logins in PRODUCTION without deleting any CRM history.
-- Run ONLY after the real Admin / Back Office account exists, is active, can sign in and HAS signed in (the guard below enforces it),
-- otherwise the CRM would be left with no working administrator.
-- Effects: profile is_active = false (RLS stops all CRM access at once, even for a session that is still valid),
-- the Auth user is banned and every session / refresh token is revoked. Customer records, ownership, activity and audit
-- rows are untouched. No Auth user and no identity is deleted. Reversible: set is_active = true and banned_until = null.
-- The two probe accounts (qa.probe.signup, qa.tmp.autoconf) have no profile and are handled by deactivate_probe_accounts.sql.
do $$
declare
  v_admin_ok boolean;
  v_emails text[] := array[
    'demo@hlektrismos.gr', 'qa.admin@hlektrismos.gr', 'qa.backoffice@hlektrismos.gr',
    'qa.manager@hlektrismos.gr', 'qa.fieldsales@hlektrismos.gr', 'qa.insidesales@hlektrismos.gr'];
  v_found int;
begin
  -- A real administrator is any active admin that is NOT one of the accounts being switched off. The domain proves nothing: the company's own
  -- address (@hlektrismos.gr) is exactly what the real Admin is meant to use.
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.role = 'admin' and p.is_active and u.last_sign_in_at is not null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
      and exists (select 1 from auth.identities i where i.user_id = u.id)
      and lower(u.email) <> all (v_emails)) into v_admin_ok;
  if not v_admin_ok then raise exception 'refusing: no active real admin (not one of the accounts being deactivated) has signed in yet'; end if;

  select count(*) into v_found from auth.users where lower(email) = any (v_emails);
  if v_found <> 6 then raise exception 'expected the 6 known QA/demo accounts, found % — stop and review', v_found; end if;

  update public.profiles set is_active = false, updated_at = now()
   where id in (select id from auth.users where lower(email) = any (v_emails));
  update auth.users set banned_until = now() + interval '100 years' where lower(email) = any (v_emails);
  delete from auth.refresh_tokens where user_id in (select id from auth.users where lower(email) = any (v_emails));
  delete from auth.sessions where user_id in (select id from auth.users where lower(email) = any (v_emails));
  raise notice 'deactivated % QA/demo accounts', v_found;
end $$;
