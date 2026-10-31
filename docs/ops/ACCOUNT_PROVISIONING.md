# Real accounts — provisioning runbook (generic)

Two categories only: **Admin / Back Office** (one shared login, role `admin`) and **Sales Agent** (individual logins, role `sales_agent`; legacy `inside_sales` is the same group). Only the active Admin / Back Office account manages Sales Agent accounts. With a shared login the audit log names the shared account, not the individual employee.

> Account-specific facts (e-mail addresses, the state of each Auth user, QA-account findings, incident notes) are kept **privately by the owner**, not in this public repository.

## Principles
- Passwords are never generated, stored, logged or sent by anyone but the user: Admin → Dashboard **invitation**; existing Auth user → **password-recovery** e-mail; the person chooses the password on the CRM page «Νέος κωδικός».
- Never insert into `auth.users` by SQL; never reuse or overwrite an existing Auth identity (keep its UUID).
- A CRM profile is attached only **after** the person has set a password they control and signed in, and — for a Sales Agent — only after Sales Agent isolation (`phase4/18` + `phase4/21`) is installed and verified.
- QA/demo accounts are deactivated (never deleted) only after the real Admin has signed in.

## Steps
1. Auth configuration (`docs/ops/AUTH_URL_CONFIGURATION.md`): Site URL, Redirect URL (`<CRM origin>/**`), `SITE_URL` secret, public sign-up **off**, e-mail confirmation **on**, Secure e-mail change **on**; check with `node scripts/ops/auth-settings-check.mjs`.
2. **Read first, change nothing:** `docs/ops/sql/admin_identity_report.sql` (edit the e-mail). It shows whether exactly one Auth user has that address, whether it **can sign in** (an identity row exists), whether it has signed in, what profile and canonical role it has, and what legacy records exist for the same user id. Stop and read it if any figure is not what you expect.
3. Admin: Dashboard → Authentication → Users → **Invite user** → the person opens the link and chooses a password. (An existing Auth user is never recreated; its UUID is kept.)
4. Attach the profile with `docs/ops/sql/provision_profile.sql` (edit the three values; dry-run it first inside `begin; … rollback;`). It refuses unless the Auth user is unique, confirmed, not banned, **has an identity row**, and **has already signed in**; it never changes an existing role (the Admin screens do that, audited); it keeps an existing name; it is safe to run twice. It only **reports** legacy records, it never changes them.
5. Sales Agent: send the recovery e-mail (public Auth API, no secret), the person chooses a password, verify an identity row exists, then `provision_profile.sql` with role `sales_agent`.
6. Deactivate the QA/demo logins with `docs/ops/sql/deactivate_qa_accounts.sql`, then the verification probe logins with `docs/ops/sql/deactivate_probe_accounts.sql`. Both refuse to run unless a real, active admin that is **not** one of the accounts being switched off has signed in and has an identity row (the company address is allowed: the domain is not the test). Nothing is deleted, no Auth user or identity is removed, and both are reversible (`banned_until = null`, `is_active = true`).

## Legacy records that outlive the role model
- `crm_users` (role `sales`) is read by the lead-distribution trigger `distribute_leads_equally`: **every new website lead is assigned to the active `crm_users` rows with role `sales`**. Provisioning does not change it. Leaving it means new leads keep going to that account; deactivating or removing the row would leave new leads unassigned. This is an owner decision, not a side effect of provisioning.
- `hlektrismos_leads.assigned_to` ownership, and any `sales_agents` row (including an inactive placeholder), are preserved. A `sales_agents` row is matched by e-mail only; it has no link to a login.
- The Admin sees every record regardless of assignment; a Sales Agent only their own.

## Tests
`node --test supabase/tests/account-provisioning.test.mjs` runs these scripts themselves on embedded Postgres against a replica of the Auth and CRM tables (synthetic data): only `admin` and `sales_agent` assignable, duplicate and missing Auth users, an account without an identity or that never signed in, a missing profile, idempotency, no silent role change, legacy records untouched, QA and probe cleanup. Self-promotion, Admin-only management and legacy-role denial are in `two-role-model.test.mjs`. Local evidence only.

## Production code and SQL rollout
Backup → the staged SQL in `PRODUCTION_ROLLOUT_CHECKLIST.md` → manual deployment of `admin-users` → merge of the frontend PR. Merging a PR does not deploy `admin-users` (it is not in `supabase/config.toml`) but does deploy the frontend, so it comes last.

## E-mail handover of the Admin account
Admin → Profile → «Αλλαγή email του λογαριασμού» (Supabase `updateUser({ email })`). Open the confirmation link(s). The same user id, profile, history and audit stay. Never edit `auth.users.email` directly.
