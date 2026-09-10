-- Backfill public.profiles for auth users that existed before the CRM
-- foundation (20260908180000) and the handle_new_user trigger (20260909120000).
-- Those pre-existing users have no profile row, which makes is_staff()/is_role()
-- false and locks them out of every staff-only RLS policy.
--
-- Roles mirror the reference environments: demo stays admin; the five QA
-- accounts keep the roles they claimed at signup. Explicit allowlist only, so
-- leftover probe users never gain staff access. 'on conflict do nothing' keeps
-- this idempotent and never overwrites an existing profile.

insert into public.profiles (id, full_name, role)
select u.id, x.full_name, x.role
from (values
  ('demo@hlektrismos.gr',        'Διαχειριστής Demo', 'admin'),
  ('qa.admin@hlektrismos.gr',    'QA Admin',          'admin'),
  ('qa.manager@hlektrismos.gr',  'QA Manager',        'manager'),
  ('qa.insidesales@hlektrismos.gr', 'QA Inside Sales', 'inside_sales'),
  ('qa.fieldsales@hlektrismos.gr', 'QA Field Sales',  'field_sales'),
  ('qa.backoffice@hlektrismos.gr', 'QA Back Office',  'back_office')
) as x(email, full_name, role)
join auth.users u on u.email = x.email
on conflict (id) do nothing;