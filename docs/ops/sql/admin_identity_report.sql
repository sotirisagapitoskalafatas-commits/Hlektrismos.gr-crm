-- READ-ONLY. Run before provision_profile.sql for the Admin (and any account with older records). Changes nothing. Edit the e-mail only.
-- It answers: does exactly one Auth user have this address, can it sign in, has it signed in, what does the CRM already hold for that user id, and what
-- legacy records would be left behind. Counts and flags only: no names, phone numbers or e-mail addresses are returned.
select
  (select count(*) from auth.users where lower(email) = lower('CHANGE-ME@example.com'))                                   as auth_users_with_this_email,
  u.id                                                                                                                      as auth_user_id,
  (u.email_confirmed_at is not null)                                                                                       as email_confirmed,
  (u.banned_until is not null and u.banned_until > now())                                                                  as banned,
  (select count(*) from auth.identities i where i.user_id = u.id)                                                          as identity_rows,
  (u.last_sign_in_at is not null)                                                                                          as has_signed_in,
  (select role from public.profiles p where p.id = u.id)                                                                   as profile_role,
  (select is_active from public.profiles p where p.id = u.id)                                                              as profile_active,
  (select count(*) from public.user_roles r where r.user_id = u.id)                                                        as canonical_role_rows,
  (select role::text from public.crm_users c where c.id = u.id)                                                            as legacy_crm_users_role,
  (select is_active from public.crm_users c where c.id = u.id)                                                             as legacy_crm_users_active,
  (select count(*) from public.hlektrismos_leads l where l.assigned_to = u.id)                                             as legacy_leads_assigned,
  (select count(*) from public.sales_agents s where lower(s.email) = lower(u.email))                                       as sales_agent_rows_same_email,
  (select count(*) from public.crm_users where role = 'sales' and is_active)                                               as active_legacy_sales_users_in_distribution
from auth.users u
where lower(u.email) = lower('CHANGE-ME@example.com');
