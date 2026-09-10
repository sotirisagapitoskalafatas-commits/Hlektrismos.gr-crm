-- Restore canonical roles after verification probes mutated profiles.
-- QA verification (scripts/verify-qa-login.mjs) runs under each account and,
-- before 20260910010000 hardened profiles via RLS, the probe update({role:
-- 'admin'}) succeeded — every QA profile was left as admin. Reset the QA
-- accounts to their assigned roles. demo@hlektrismos.gr must remain admin.
-- Migration runs as the migration role (bypasses RLS); intended for a one-time
-- correction, kept idempotent so re-runs are no-ops.

update public.profiles p
set role = x.role,
    updated_at = now()
from (values
  ('qa.admin@hlektrismos.gr',    'admin'),
  ('qa.manager@hlektrismos.gr',  'manager'),
  ('qa.insidesales@hlektrismos.gr', 'inside_sales'),
  ('qa.fieldsales@hlektrismos.gr', 'field_sales'),
  ('qa.backoffice@hlektrismos.gr', 'back_office')
) as x(email, role)
join auth.users u on u.email = x.email
where p.id = u.id
  and p.role is distinct from x.role;