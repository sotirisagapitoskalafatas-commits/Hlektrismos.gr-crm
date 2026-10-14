# Staged migration — phase 2 (NOT applied)

`05_staff_admin_and_role_preview.sql` — **apply on staging first**, then production only with the owner's approval and a fresh backup. Nothing here has been applied by Claude Code.

## What it does
1. **Security fix — profile self-promotion.** Migration `20260910103000` (line 586) re-created `profiles update own` as `with check (auth.uid() = id)`, undoing the hardening of `20260910010000`. Any signed-in user can run `update profiles set role = 'admin', is_active = true where id = auth.uid()`. The fix is a trigger (`profiles_guard_privileged`) that refuses role/status changes from the `authenticated`/`anon` API roles, plus the restored hardened policy.
2. **Staff administration** with one matrix (`staff_admin_can`): admin → every role; manager → Inside Sales / Field Sales / Back Office; back office → Back Office. Nobody changes their own role or status; the last active admin cannot be demoted/deactivated/deleted. Audited SQL functions: `staff_list`, `staff_update`, `staff_set_active`, `staff_reference_count`. Audit table: `staff_admin_audit`.
3. **Role preview (presentation)**: `role_preview_grants` seeded for `qa.admin@hlektrismos.gr` until **16/10/2026 00:00 Europe/Athens** (`2026-10-16 00:00:00+03`). `role_preview_status()` decides with the server clock; `role_preview_event()` records start/end. The preview never touches `profiles.role`, JWTs or RLS.
4. **crm_settings**: managers no longer read credential rows (SerpApi/IMAP/Vapi…) or rewrite `role_permissions`; only admins write. Remaining risk: admins can still read credential rows via the table (legacy SettingsPanel) — retire that panel next.

## Local evidence (PGlite, not staging)
`node --test supabase/tests/staff-admin.test.mjs` — 8/8: reproduces the self-promotion and the crm_settings exposure against the current policy definitions, then proves the fixes, the matrix, the last-admin protection, the directory scoping, the reference count and the preview expiry.

## Apply (staging, then production)
1. Backup / PITR checkpoint.
2. Run the SQL file in the SQL editor (it is idempotent: `create or replace`, `if not exists`, `on conflict`).
3. Deploy the edge function: `supabase functions deploy admin-users` (needs `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`; invites also need Auth e-mail/SMTP configured).
4. Verify with the real QA accounts (one per role), not with the role preview:
   - `qa.insidesales` → `update profiles set role='admin' where id = auth.uid()` must fail.
   - `qa.manager` → can create/edit an Inside Sales user, cannot create a manager/admin, cannot read `SERPAPI_KEY` from `crm_settings`.
   - `qa.backoffice` → sees only Back Office colleagues.
   - `qa.admin` → «Επίδειξη ρόλου (demo)» visible on 15/10; after 16/10 00:00 Athens it disappears.
5. Rollback: drop the trigger `profiles_guard_privileged`, the new functions and tables; re-create the previous `crm_settings_admin_all` policy (see the migration header). The preview grant can be removed at any time with `delete from role_preview_grants`.
