-- Switch off the two verification probe logins left in PRODUCTION by earlier testing: qa.probe.signup and qa.tmp.autoconf.
-- They have no CRM profile, so they already open nothing in the CRM, but each is a live Auth login with a password (public sign-up was open while they
-- were created), which is exactly what an attacker would try. Not covered by deactivate_qa_accounts.sql, which handles the six accounts that have profiles.
-- Effects: the Auth user is banned and its sessions / refresh tokens are revoked. NOTHING is deleted (not the Auth user, not its identity); reversible by
-- setting banned_until = null. Same guard as the other script: a real admin must already have signed in. Refuses if either probe has gained a profile
-- (then it is not a probe any more: review it by hand).
do $$
declare
  v_emails text[] := array['qa.probe.signup@hlektrismos.gr', 'qa.tmp.autoconf@hlektrismos.gr'];
  v_qa text[] := array['demo@hlektrismos.gr', 'qa.admin@hlektrismos.gr', 'qa.backoffice@hlektrismos.gr', 'qa.manager@hlektrismos.gr', 'qa.fieldsales@hlektrismos.gr', 'qa.insidesales@hlektrismos.gr'];
  v_found int;
begin
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.role = 'admin' and p.is_active and u.last_sign_in_at is not null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
      and exists (select 1 from auth.identities i where i.user_id = u.id)
      and lower(u.email) <> all (v_qa || v_emails)) then
    raise exception 'refusing: no active real admin has signed in yet';
  end if;
  select count(*) into v_found from auth.users where lower(email) = any (v_emails);
  if v_found <> 2 then raise exception 'expected the 2 known probe accounts, found % — stop and review', v_found; end if;
  if exists (select 1 from public.profiles where id in (select id from auth.users where lower(email) = any (v_emails))) then
    raise exception 'a probe account has a CRM profile: it is not a probe any more, review it by hand';
  end if;
  update auth.users set banned_until = now() + interval '100 years' where lower(email) = any (v_emails);
  delete from auth.refresh_tokens where user_id in (select id from auth.users where lower(email) = any (v_emails));
  delete from auth.sessions where user_id in (select id from auth.users where lower(email) = any (v_emails));
  raise notice 'switched off % probe accounts (nothing deleted)', v_found;
end $$;
