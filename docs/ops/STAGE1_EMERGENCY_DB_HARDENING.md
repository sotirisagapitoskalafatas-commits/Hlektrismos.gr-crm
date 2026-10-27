# Stage 1: emergency database hardening (staged; not applied anywhere)

**Status:** staged SQL with local tests. **Not applied** to staging or production. This PR does not deploy anything or change any live setting.

**Prerequisite, not a substitute:** the exposed `service_role` key must be revoked first (`SECURITY_HOTFIX_RUNBOOK.md`). Until it is, the leaked key bypasses every policy below.

**Scope (this stage only):**
- Privilege escalation: `set_user_role`, self-promotion and self-reactivation through `profiles`.
- Anonymous access to private and legacy tables.
- Integration credentials (`crm_integrations`, `crm_settings`).
- The two document buckets (`hlektrismos_docs`, `energy-bills`).
- Default privileges for future objects.

**Out of scope (Stage 2):** isolating one Sales Agent's records from another's (`phase4/18`), per-owner storage access, and the Edge Function ownership checks. Today every **active** staff account can still read every lead, case and document. The test marks this as `TODO`.

## Order (one controlled window, staging first)
Steps 1, 2, 2b, 2c, 2d and 2e of [`APPLY_ORDER.md`](APPLY_ORDER.md):

| # | File | What it closes |
|---|---|---|
| 1 | `staged-migrations/phase1/16_storage_docs_lockdown.sql` | Anonymous listing and download of `hlektrismos_docs`. Anonymous upload is allowed only into `contact-forms/`. Inactive accounts lose access. Staff can't replace or delete files. |
| 2 | `staged-migrations/phase1/01_rls_hardening.sql` | Anonymous access to `crm_emails` and `crm_integrations`. Integrations become admin-only; the `crm_integrations_status` view (which has no `config` column) replaces direct reads. |
| 2b | `staged-migrations/phase1/17_anon_restrictive_lockdown.sql` | A RESTRICTIVE "anon never" policy on legacy `TO public USING (true)` tables. |
| 2c | `staged-migrations/phase4/19_staff_only_legacy_tables.sql` | Deactivated accounts lose access to about 30 legacy tables. |
| 2d | `staged-migrations/phase1/18_live_api_privilege_hardening.sql` | Anonymous table privileges; the `profiles` guard trigger (role, `is_active`); `reassign_lead` / `upsert_supply_point` / role RPCs (including `set_user_role`) restricted; settings and integrations restricted to the office roles; `search_path` pinned. |
| 2e | `staged-migrations/phase1/19_stage1_gap_fixes.sql` (**new**) | `set_user_role` made **service-role only** in both its grants and its body (no admin-claim alternative); the `energy-bills` bucket made read-only for active staff; **secure-by-default privileges**: new functions are executable by nobody (PUBLIC, anon, authenticated) until a migration grants EXECUTE explicitly, and new tables and sequences are not granted to anon. |

## Evidence that this works (local only)
`supabase/tests/stage1-emergency-db-hardening.test.mjs` uses `supabase/tests/helpers/replay-migrations.mjs`. That helper rebuilds the database by replaying the **real `supabase/migrations/` chain** in PGlite (88 of 89 files; the one exception, `20260810185405`, only loosens `ai_agents`/`lead_sources` and can't replay in filename order). The test runs in three steps:
1. **BEFORE: the exploits are reproduced with the real policies and functions.**
   - Anon calls `set_user_role`, and the role is written.
   - A Sales Agent promotes itself to admin.
   - An inactive account reactivates itself.
   - Anon reads integration tokens, `sales_agents` and `customer_documents`, and modifies `sales_agents`.
   - A Sales Agent reads integration tokens.
   - Anon lists customer documents and uploads anywhere, including into `energy-bills`.
   - An inactive account lists and deletes files.
2. **APPLY:** the six files above in order, **twice**, to prove they compose and are idempotent. Until now each file had been tested only on its own.
3. **AFTER:** every exploit is denied, and these still work:
   - the website form (`insert_website_lead`; under-18 still refused);
   - Back Office CRUD on leads, customers, cases, documents and follow-ups;
   - staff opening documents, and Back Office uploading to a lead folder;
   - the service role (trusted administration path) changing roles and status;
   - editing your own name and phone.

**Coordination with later stages.** `supabase/tests/stage1-later-migrations-grants.test.mjs` builds two databases from the real chain:
- **control:** Stage 1 without `phase1/19`;
- **treated:** Stage 1 with `phase1/19`.

It then applies all 23 later staged files (APPLY_ORDER steps 3–23) to both, and compares the EXECUTE privileges of the roughly 70 functions those files create.
- All later files apply cleanly in both databases.
- Only trigger functions, plus five normaliser helpers called solely by SECURITY DEFINER functions, lose their implicit EXECUTE. Losing it is correct: neither kind needs EXECUTE for the API roles.
- One function did need a grant: `crm_setting_is_credential`, which the `crm_settings` RLS policy in `phase2/05` calls. That file now grants it explicitly to `authenticated`.
- A behaviour check proves that Sales and the office can still query the RLS-protected tables after all later stages.
- Removing that grant makes three of these tests fail, so the check really works.

Result on this branch: `npm test`: **386 tests: 385 pass, 0 fail, 1 todo** (the Stage 2 cross-agent item).

PGlite emulates the hosted platform's roles, `auth.*` and `storage.objects`. It does **not** prove real Supabase Auth, the Storage API, Edge Functions or the live catalog.

## Depends on unverified production state (check before applying)
1. **The live schema may differ from Git.** Dashboard edits are invisible to the repo. Run `pending_migrations_check.sql` (read-only) and the `pg_policies` listing in `SECURITY_LIVE_FINDINGS.md`, and save the output.
2. **`profiles` columns.** `phase1/18` grants column-level UPDATE on `full_name, phone, avatar_url, timezone, language, availability_status, updated_at`. All of these exist in the repo migrations. If one is missing live, that statement fails and the transaction rolls back. Check with `select column_name from information_schema.columns where table_schema='public' and table_name='profiles';`.
3. **Which role does the shared Admin / Back Office login use?** After `phase1/18`, only `profiles.role = 'admin'` can read or write `crm_settings` and `crm_integrations`.
   - `manager` could before and **cannot after**.
   - `back_office` couldn't before and still can't.
   - If the shared login is `manager` or `back_office`, the legacy settings screens stop showing settings. Confirm: `select role, count(*) from public.profiles where is_active group by role;`.
4. **Role and status changes from the browser are blocked for every role**, admin included, by the `profiles_guard_privileged` trigger. Legitimate changes go through the `admin-users` Edge Function (service role), which the audit judged properly authorised. Confirm that the live admin screens use that function, not a direct `profiles` update.
5. **`energy-bills`.** No live code writes to this bucket. The unused legacy `LeadDetailSlideout` only reads from it, and active staff keep read access. Confirm that no external integration uploads there.
6. **Default privileges are per creating role.** No migration in this repo changes role or ownership (`set role`, `owner to`, `for role`). Files are applied by the owner in the Supabase SQL editor or CLI, which run as `postgres`. `phase1/19` therefore sets the defaults `FOR ROLE postgres`, and also for whichever role runs it if that is different. Objects created by `supabase_admin` (platform objects and extensions) are not affected, and this project's migrations never create objects as that role.
   - Before applying, confirm the role: `select current_user;` in the SQL editor.
   - Check afterwards: `select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl;`.
   - Existing functions keep their current grants; only **new** objects are affected.
   - **Coordination:** from now on, every migration that creates a function called by the browser, an RLS policy or an Edge Function must `grant execute ... to authenticated` (or anon) explicitly. `insert_website_lead` and `phase4/18` already do. `service_role` keeps the platform's own schema default.
7. **Live app reads checked:** `fetchArrivalRadius()` (`src/lib/api.ts:1269`) reads `crm_settings` as a Sales Agent. After Stage 1 it gets no row and keeps its built-in default radius, so nothing breaks.

## Procedure (owner or operator)
1. Confirm the service-role key is revoked.
2. **Staging:** take a backup; run the read-only checks; apply 1 → 2e one file at a time, and after each file run its check (`pending_migrations_check.sql`).
3. **Staging smoke test**, with one synthetic account per role:
   - website form with a test PDF (incognito), and the contact form;
   - chatbot tariff question;
   - Back Office login: leads, customers, cases, upload and open a document, the integrations status screen;
   - Sales Agent login: My Day, field check-in, open a lead's documents;
   - confirm that a Sales Agent cannot open the integrations or settings data.
4. **Production:** only with approval, in a maintenance window, after a fresh backup/PITR point. Same order, same checks.
5. Re-run the anonymous probe in the Admin centre (Ασφάλεια → «Εκτέλεση ελέγχων»).

## Rollback
Each file has its own rollback (the end of the file, or `docs/ops/rollback_phase1_17_*.sql` / `rollback_phase4_19_*.sql` / `rollback_phase1_18_*.sql`). Roll back in **reverse order** (2e → 1), and only to restore service: rollback re-opens the findings. Never re-grant `set_user_role` to anon or authenticated.

## `set_user_role` policy
It is service-role only: EXECUTE is granted to `service_role` alone, and the body refuses any caller whose session role is not `service_role`. The earlier admin-JWT-claim alternative has been removed. Nothing in the app or the Edge Functions calls it; staff roles are managed through the `admin-users` Edge Function. The test checks the grants, and checks that anon and an authenticated caller with an admin claim are refused even after an accidental re-grant.

## Remaining risks after Stage 1
- Cross-agent read and write between active Sales Agents (Stage 2, `phase4/18`). Storage is not scoped per owner.
- The Edge Functions' own authorisation gaps (orchestrator, send-email, send-offer, SSRF…): Stage 2.
- `crm_users` reads fail for every role, because its legacy "Admins can manage" policy queries the table itself (infinite recursion). This existed before Stage 1; only the unused `DashboardPage` reads it.
- Credentials stay in plain text in `crm_settings` (admin-readable) until they move to Vault or secrets.
- The shared Back Office login cannot attribute actions to individual employees; RLS cannot fix that.
