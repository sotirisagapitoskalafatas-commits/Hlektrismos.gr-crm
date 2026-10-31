# Independent security review package — Hlektrismos CRM

**Purpose:** let a reviewer who did not write the changes confirm that the two-role model, sales-data isolation and account provisioning are safe to release. The repository currently has one collaborator, so **a reviewer must be invited** (owner: GitHub → Settings → Collaborators; read access is enough) and given **read-only** Supabase access to *staging only* (never production credentials).

## 0. Reviewer instructions (read this first)
**Status: not started. No reviewer has been invited and nobody has been given repository or Supabase access; that needs the owner's explicit approval.**
**You are read-only.** You get: (a) read access to the GitHub repository (owner adds you as a *Read* collaborator — never Write/Admin); (b) optionally the pre-rollout `schema.json` of the production backup **without any `data/` or `storage/` folders** (definitions only, no customer data). You do **not** receive production or staging credentials, Supabase dashboard access, keys, tokens, backups with data, or passwords. If you want the real-JWT staging run repeated, ask the owner to run `node scripts/qa/staging-two-role.mjs` and share the console output.
Do **not** run anything against production. The repository's scripts refuse unknown project references and only the read-only ones can touch production at all.

### Files and boundaries to review (in priority order)
| # | Boundary | Files | What to attack |
|---|---|---|---|
| 1 | Who may manage accounts (database) | `supabase/staged-migrations/phase6/21_two_role_model.sql`, `phase2/05_staff_admin_and_role_preview.sql` (`staff_update`, `staff_set_active`, `staff_admin_audit`, `profiles_guard_privileged`) | any role other than the active `admin` reaching `staff_*`, `profiles`, `user_roles`, `set_user_role`; self-promotion; reactivating oneself; legacy-role trigger bypass |
| 2 | Who may manage accounts (Edge Function) | `supabase/functions/admin-users/index.ts`, `_shared/staff-admin.ts`, `_shared/site-url.ts`, `_shared/keys.ts` | caller identity (JWT vs API key), `SITE_URL` handling, compensation paths, audit completeness, error messages |
| 3 | Sales Agent isolation | `phase4/18_sales_own_records_scope.sql`, `phase4/21_sales_isolation_completion.sql`, `phase1/01`, `phase1/16–19` | cross-agent reads/edits through joins, views, SECURITY DEFINER RPCs, storage paths, realtime |
| 4 | Onboarding links | `src/lib/auth-link.ts`, `auth-link-boot.ts`, `auth.tsx`, `src/components/auth/*`, `LoginPage.tsx`, `CustomizePage.tsx` (e-mail change) | open redirect, token leakage, account enumeration, forced password step bypass |
| 5 | Rollout tooling | `scripts/ops/*.mjs`, `docs/ops/rollback_phase6_*.sql`, `docs/ops/sql/*.sql`, `docs/ops/PRODUCTION_ROLLOUT_CHECKLIST.md` | is the 27-file order right, is the rollback a true inverse, can any script write to production without approval |
| 6 | Preferences + avatars | `phase6/20_user_preferences.sql`, `src/lib/preferences.ts`, `src/lib/avatar.ts` | own-row RLS, private bucket policies |
**Out of reviewer scope:** the UI redesign (visual), the public WordPress site, third-party services.

## 1. What is being released
| Area | Change | Where |
|---|---|---|
| Role model | One shared Admin / Back Office login (`admin`); individual Sales Agents (`field_sales`, legacy `inside_sales` = same group). Only the active `admin` manages accounts. Legacy `manager` / `back_office` never assignable again. | `supabase/staged-migrations/phase6/21_two_role_model.sql`, `supabase/functions/_shared/staff-admin.ts`, `supabase/functions/admin-users/index.ts`, `src/lib/roles.ts` |
| Account matrix in the database | `staff_admin_can`, `staff_list`, `staff_reference_count`, audit-read policy, `profiles_no_new_legacy_office` trigger, own-profile update requires an active account | `phase6/21` (supersedes `phase4/17`, `phase4/20`), on top of `phase2/05` (`staff_update`, `staff_set_active`, `profiles_guard_privileged`, `staff_admin_audit`) |
| Sales isolation | Sales Agents read only their own leads/cases/customers/… | `phase4/18_sales_own_records_scope.sql`, `phase4/21_sales_isolation_completion.sql` |
| Onboarding | Invitation / recovery links open the CRM root, link type captured (no tokens stored), forced password choice; admin-only e-mail change | `src/lib/auth-link*.ts`, `src/lib/auth.tsx`, `src/components/auth/*`, `src/components/app/CustomizePage.tsx`, `supabase/functions/_shared/site-url.ts` |
| Preferences + avatars | per-user table (own row only), private `avatars` bucket | `phase6/20_user_preferences.sql` |
| Rollout tooling | read-only backup, isolated restore, rollout rehearsal, generated rollback | `scripts/ops/*`, `docs/ops/BACKUP_RESTORE.md`, `docs/ops/PRODUCTION_ROLLOUT_CHECKLIST.md` |
PRs: #130 (draft, two-role model + QA tooling). Merged earlier: #118, #120 (key migration), #123–#129 (UI redesign, preferences SQL staged).

## 2. Trust boundaries and assets
- **Assets:** customer data (leads, cases, documents, supply points), Auth accounts, the shared office credential, Edge Function secrets, the Supabase secret key.
- **Actors:** anonymous visitor; Sales Agent; shared Admin / Back Office; inactive account holding an old JWT; API-key-only caller; Supabase Auth Admin API (service key).
- **Known trade-off:** one shared office login ⇒ audit rows name the shared account, not the employee.
- **Enforcement points (must agree):** UI hides actions → `admin-users` Edge Function matrix → database `staff_*` functions / RLS. Only the last two are security controls.

## 3. Questions for the reviewer
1. Can any caller other than the active `admin` create, edit, (de)activate, reset or delete an account, by any path — `admin-users`, `staff_*` RPCs, direct PostgREST on `profiles`, `user_roles`, `set_user_role` (exists on production), `role_preview_*`?
2. `set_user_role(...)` and `reassign_lead(...)` had their API grants revoked (see EMERGENCY_CHANGE). Do any other SECURITY DEFINER functions in `public` allow role or ownership changes to `authenticated`? (list in `schema.json` of the backup)
3. Is the legacy-role trigger bypassable by a code path that sets `session_replication_role = replica`? (only superusers can)
4. Does `is_staff()` fail closed for deactivated users on **every** table policy, storage policy and Edge Function that uses a service client?
5. Are invitation / recovery links safe: open redirect, `SITE_URL` handling, token leakage via `sessionStorage` (only the link *type* is stored), referrer, logs?
6. Onboarding of a pre-existing Auth user that has never signed in: after a password-recovery reset, can the previous (unknown) credential still be used, and is attaching the profile only after the reset sufficient?
7. Sales isolation: can an agent read another agent's records through joins, views (`market_tariffs_view`), RPCs that are SECURITY DEFINER, storage paths (`hlektrismos_docs`), realtime, or exports?
8. Is the rollback script a faithful inverse (it was rehearsed on a restored production snapshot)?

## 4. Evidence already produced (re-runnable)
| Evidence | Command | Result (30 Oct 2026) |
|---|---|---|
| Unit + PGlite tests (Node 20) | see CI workflow | 503 pass / 0 fail |
| Two-role SQL matrix + direct API writes | `node --test supabase/tests/two-role-model.test.mjs` | 6/6 |
| **Real-JWT run on Supabase STAGING** | `node scripts/qa/staging-two-role.mjs` | 72/72, 1 skipped (e-mail-change confirmation, mailer rate-limited) — throwaway users, random passwords never printed; includes Sales Agent isolation with real records |
| Backup + isolated restore of production (local, in-memory Postgres) | `node scripts/ops/prod-backup.mjs`, `restore-verify.mjs` | 14/14 |
| Rollout rehearsal (27 files) + rollback on a LOCAL copy of production data — not a production deployment | `REHEARSE=1 node scripts/ops/restore-verify.mjs <folder>` | 31/31 |
| UI rendering (mock, **no authorization**) | `npm run qa:redesign` | 27/27 — *not* security evidence |
The reviewer should re-run these independently and try to break them.

## 5. Not yet done / out of scope here
- Production SQL, function deployment and credential retirement (legacy `service_role` key is still valid and read by 21 old production functions; see `docs/ops/SERVICE_KEY_INCIDENT.md`).
- 21 of 27 production Edge Functions run pre-hardening code.
- Follow-ups: missing `auth.users` trigger (`handle_new_user`), unaudited direct stage changes, `ai_agents.custom_api_key` credential column, production tariff scheduler stays disabled until its first-sync checks.
- Custom SMTP, MFA, daily backups / PITR are owner configuration items.

## 6. Reviewer deliverable
A written verdict per question in §3 (pass / fail / cannot tell), the commit hash reviewed, and any reproduction steps for findings. **No production rollout until the verdict is attached to the approval request.**
