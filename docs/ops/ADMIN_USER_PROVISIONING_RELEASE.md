# Admin user provisioning — release checklist (2026-11-02)

This release completes the existing **Χρήστες & Ρόλοι** screen. The code already exists in the application; Production was missing the `admin-users` Edge Function, and its staff RPCs still used legacy role names after the profile table had moved to `admin` / `sales_agent`.

## Intended account model

- `admin`: the shared Admin / Back Office identity. Only an active Admin can administer accounts.
- `sales_agent`: one individual account per Sales Agent.
- No new Manager, Back Office, Inside Sales or Field Sales account roles may be created.

## Supabase Dashboard deployment (no Supabase CLI)

1. Take/confirm a fresh Production backup. The migration's first block performs a read-only, column-specific preflight and aborts before changing functions if the final two-role constraint or active Admin is missing.
2. In **Production → SQL Editor**, run `supabase/staged-migrations/phase6/28_staff_admin_sales_agent_sync.sql`. It replaces only two authorization functions; it does not rewrite profile or CRM data.
3. Deploy `supabase/functions/admin-users/index.ts` with its relative `_shared` dependencies and **Verify JWT = ON**. The function must use the latest `keys.ts`, `staff-admin.ts`, `permissions.ts`, `signed-link.ts`, `cors.ts`, and `site-url.ts` from this branch. Do not turn JWT verification off.
4. In **Edge Functions → Secrets**, set `SITE_URL=https://hlektrismos-crm.vercel.app`. Do not use `https://hlektrismos.gr` (the public WordPress site). The function intentionally refuses invite/recovery links when the URL is missing or invalid.
5. In **Authentication → URL Configuration**, allow `https://hlektrismos-crm.vercel.app/**`. Confirm Email is enabled, public sign-ups remain disabled, and the Invite User / Reset Password templates use Supabase's `{{ .ConfirmationURL }}`.
6. Configure and test Supabase Auth SMTP separately. A successful API response is not proof that an external mailbox received the invitation.

## Acceptance tests

- As the active Admin, create a Sales Agent using **Πρόσκληση με email**. The invitation must open the CRM and let the user choose a password.
- As the active Admin, create a Sales Agent using **Προσωρινός κωδικός**. The new account must be forced onto the password screen immediately after first sign-in; the CRM remains blocked until the password is changed.
- After the new password is saved, the app clears the server-only `app_metadata.must_change_password` marker and refreshes the session.
- A Sales Agent, inactive account, missing JWT and API-key-only caller cannot create or manage users.
- Editing and activation/deactivation work through the audited `staff_update` / `staff_set_active` SQL functions.
- Reset sends a Supabase Auth recovery email. Permanent delete is refused when CRM records reference the user; deactivation remains available.
- Verify the `staff_admin_audit` rows after create, update, activate/deactivate, reset and delete.

## Important limitation

The shared Admin / Back Office account is one identity. Audit records can identify that shared account, but cannot identify which member of office staff used it.
