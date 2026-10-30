# Real accounts — provisioning runbook (generic)

Two categories only: **Admin / Back Office** (one shared login, role `admin`) and **Sales Agent** (individual logins, role `field_sales`; legacy `inside_sales` is the same group). Only the active Admin / Back Office account manages Sales Agent accounts. With a shared login the audit log names the shared account, not the individual employee.

> Account-specific facts (e-mail addresses, the state of each Auth user, QA-account findings, incident notes) are kept **privately by the owner**, not in this public repository.

## Principles
- Passwords are never generated, stored, logged or sent by anyone but the user: Admin → Dashboard **invitation**; existing Auth user → **password-recovery** e-mail; the person chooses the password on the CRM page «Νέος κωδικός».
- Never insert into `auth.users` by SQL; never reuse or overwrite an existing Auth identity (keep its UUID).
- A CRM profile is attached only **after** the person has set a password they control and signed in, and — for a Sales Agent — only after Sales Agent isolation (`phase4/18` + `phase4/21`) is installed and verified.
- QA/demo accounts are deactivated (never deleted) only after the real Admin has signed in.

## Steps
1. Auth configuration (`docs/ops/AUTH_URL_CONFIGURATION.md`): Site URL, Redirect URL, `SITE_URL` secret, public sign-up **off**, e-mail confirmation **on**; check with `node scripts/ops/auth-settings-check.mjs`.
2. Admin: Dashboard → Authentication → Users → **Invite user** → the person opens the link and chooses a password.
3. Attach the profile with `docs/ops/sql/provision_profile.sql` (edit the three values; guarded and idempotent; dry-run it first inside `begin; … rollback;`).
4. Sales Agent: send the recovery e-mail (public Auth API, no secret), the person chooses a password, verify an identity row exists, then `provision_profile.sql` with role `field_sales`.
5. Deactivate QA/demo logins with `docs/ops/sql/deactivate_qa_accounts.sql` (refuses to run unless a real admin has signed in). History is preserved; the change is reversible.

## Production code and SQL rollout
Backup → the staged SQL in `PRODUCTION_ROLLOUT_CHECKLIST.md` → manual deployment of `admin-users` → merge of the frontend PR. Merging a PR does not deploy `admin-users` (it is not in `supabase/config.toml`) but does deploy the frontend, so it comes last.

## E-mail handover of the Admin account
Admin → Profile → «Αλλαγή email του λογαριασμού» (Supabase `updateUser({ email })`). Open the confirmation link(s). The same user id, profile, history and audit stay. Never edit `auth.users.email` directly.
