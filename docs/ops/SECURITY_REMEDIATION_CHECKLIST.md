# Production security remediation: staging first, backup first (CHECKLIST, NOTHING APPLIED)

**Read this first.** PR #151 is a **regression-test and release-gate PR**. It adds tests and documents. It **does not apply, change or contain any database fix**. The fixes are the STAGED SQL files below; they sit outside `supabase/migrations/` on purpose, so merging a PR never applies them.

**Production is not protected because tests pass.** `supabase/tests/final-state-role-isolation.test.mjs` runs on embedded Postgres (PGlite) with stand-ins for Auth, Storage and PostgREST. It proves the staged files, applied in the order of `APPLY_ORDER.md`, close the paths it probes. It says nothing about what the live database contains today. The owner's earlier read-only probe reported `phase4/18` and `phase4/21` absent; the rest is **unverified** until `pending_migrations_check.sql` is run against Production.

This checklist uses **`docs/ops/APPLY_ORDER.md` as the single source of order** (its «Corrections found on 30 Oct 2026» included). A test (`the chain is the order of docs/ops/APPLY_ORDER.md`) fails if the gate drifts from it.

## 1. The findings and the exact files that close them
| Confirmed finding | Closed by (APPLY_ORDER step) | Depends on | Verification query (read-only catalog check, run on the TARGET database) |
|---|---|---|---|
| A signed-in user can make themselves Admin (`20260910103000`, line 586); anonymous access to private legacy tables; non-public SECURITY DEFINER functions open to `anon` | **`phase1/18_live_api_privilege_hardening`** (2d) | review the live findings; run after `phase1/01`, `16`, `17`, `19`-window; changes grants, RLS and legacy RPC bodies | `select exists (select 1 from pg_trigger where tgname='profiles_guard_privileged' and not tgisinternal) as profile_guard_exists, not has_table_privilege('anon','public.crm_users','SELECT') as anon_cannot_read_crm_users, not has_function_privilege('anon','public.reassign_lead(uuid,uuid)','EXECUTE') as anon_cannot_reassign;` (full 9-column query: `APPLY_ORDER.md` step 2d) |
| Profile and staff administration protection; managers reading credentials | **`phase2/05_staff_admin_and_role_preview`** (3) | the role-model decision; then deploy the Edge Function `admin-users` | `select exists (select 1 from pg_trigger where tgname='profiles_guard_privileged') as applied;` |
| Two account categories only; `manager`/`back_office` can no longer be assigned; inactive accounts cannot edit | **`phase6/21_two_role_model`** (25: apply **immediately after step 3**, per the 30 Oct correction; it replaces `phase4/17` and `phase4/20`) | `phase2/05` | `select exists (select 1 from pg_trigger where tgname='profiles_no_new_legacy_office' and not tgisinternal) and pg_get_functiondef('public.staff_admin_can(uuid,text,text)'::regprocedure) like '%a.role <> ''admin''%' as applied;` |
| Sales Agents read other agents' leads, cases, customers, documents | **`phase4/18_sales_own_records_scope`** (22) | tables from `phase4/14` (step 16), `phase5/17`, `phase5/18` (**already live**), `phase2/06` (step 8) | `select exists (select 1 from pg_policies where schemaname='public' and tablename='leads' and policyname='sales own records (restrictive)');` |
| …completion: offers, signatures, consents, files, reassign, verify | **`phase4/21_sales_isolation_completion`** (22b, **right after 22**) | `phase4/18`, `phase1/02`, `phase3/09` | `select to_regprocedure('private.convert_lead_to_case(uuid)') is not null and exists (select 1 from pg_trigger where tgname='case_documents_verification_guard') and exists (select 1 from pg_policies where schemaname='storage' and policyname='sales own files read (restrictive)');` |
| Exactly two roles in the database | **`phase6/25_exact_two_roles`** (27) | `phase6/21`, `phase3/08`, `phase3/09` (the file checks and stops). **Deploy the code that reads `sales_agent` first** (it is in `main`; code from before locks Sales Agents out) | `select exists (select 1 from pg_constraint where conname='profiles_role_check' and pg_get_constraintdef(oid) like '%sales_agent%');` |
| One active Admin | **`phase6/26_single_active_admin`** (28) | `phase6/25`; the **real Admin has signed in** and the QA admins are off (`docs/ops/sql/deactivate_qa_accounts.sql`); the file refuses otherwise | `select to_regclass('public.profiles_single_active_admin') is not null;` |
| Admin can read raw integration credentials; `role_permissions` writable through the table | **`phase6/27_credentials_write_only`** (29) | `phase2/05`, `phase6/25`. **Deploy the write-only settings panel first** (in `main`; the old panel would fail silently) | `select to_regprocedure('public.crm_set_credential(text,text)') is not null and to_regprocedure('public.crm_credential_status()') is not null;` |

Background files of the same security window (not named in the findings, but the order includes them): `phase1/21b`, `21c` (0b, 0c), `phase1/16` (1), `phase1/01` (2), `phase1/17` (2b), `phase4/19` (2c), `phase1/19` (2e). Their checks are in `APPLY_ORDER.md` and `pending_migrations_check.sql`.

## 2. Gates before anything is applied
1. [ ] **Read what is already there.** Run `docs/ops/pending_migrations_check.sql` (read-only, catalog only) against **Production**. Record the result with the date. Skip a step whose check is already `true`.
2. [ ] **Backup.** Take the custom backup (`node scripts/ops/prod-backup.mjs --ref <production ref> --out <folder outside the repository>`) immediately before the window, and again after the last file. **No platform backup or PITR was recorded on 30/10/2026**: enabling daily backups or PITR in the Dashboard is a separate owner action and should come first. The restore test of 30/10/2026 was local (PGlite), not a platform restore (`BACKUP_RESTORE.md`).
3. [ ] **Staging first.** `APPLY_ORDER.md`: staging is built from a schema dump of live; run the whole list there, in order, with the check after each step, **before** Production. (`BACKUP_RESTORE.md` also mentions `scripts/qa/staging-two-role.mjs`; that script is **not in the repository**, so the real-JWT two-account test below is done by hand until it is added.)
4. [ ] **The right code is already deployed:** `sales_agent`-aware app and Edge Functions (before `phase6/25`), the write-only settings panel (before `phase6/27`), `admin-users` deployed by hand **after** `phase2/05`.
5. [ ] **Secrets present** (names only; never read values aloud): `SITE_URL` = `https://hlektrismos-crm.vercel.app`, `OUTREACH_LIMITS`, `LINK_SIGNING_SECRET`, `VAPI_WEBHOOK_SECRET`, `LEAD_WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET`, `CRON_SECRET`.
6. [ ] **Rotate the leaked service-role key** in the same window (`SECURITY_HOTFIX_RUNBOOK.md`) and confirm the old key is refused.
7. [ ] **Your written approval for each step.** One file at a time.

## 3. Staging run (the whole list, in order)
Apply, in this order, with the check after each file and a stop on the first `false`:
`phase1/21b` → `21c` → `16` → `01` → `17` → `phase4/19` → **`phase1/18`** → `phase1/19` → **`phase2/05`** → **`phase6/21`** → `phase1/02` → `phase2/06` → `07a` → `07b` → `phase4/14` → `phase3/08` → `phase3/09` → `phase3/10` → `phase3/11` → **`phase4/18`** → **`phase4/21`** → **`phase6/25`** → **`phase6/26`** → **`phase6/27`** (steps 0b, 0c, 1, 2, 2b, 2c, 2d, 2e, 3, 25, 5, 8, 9, 10, 16, 17, 18, 18b, 18c, 22, 22b, 27, 28, 29; the others in the document are applied where it lists them).

Staging smoke tests (a local PGlite pass does **not** replace these; `APPLY_ORDER.md` step 2d says so):
- [ ] Website and contact lead intake, including invalid consent and age cases; chatbot tariff lookup.
- [ ] Admin sign-in; staff invitation and direct Sales Agent creation through `admin-users`.
- [ ] **Two real Sales Agents** (A and B): each sees only their own leads, customers, cases, follow-ups, documents; neither can reassign, verify or attach to the other's records.
- [ ] A Sales Agent runs `update profiles set role = 'admin' where id = auth.uid()` and it **fails**; a deactivated account cannot reactivate itself.
- [ ] The settings panel saves ordinary settings; credentials are set through the write-only function and are **never** shown; `role_permissions` changes only through the protected function.
- [ ] Missing documents still **warn** and a case moves on and is handed to Back Office.
- [ ] Password change (PR A) for a Sales Agent and for the shared Admin.

## 4. Production window
1. [ ] Backup #1. Re-run `pending_migrations_check.sql` and record it.
2. [ ] For each file in §3: apply **only that file**, run **its check**; if not `true`, **stop** and report; do not continue.
3. [ ] Backup #2 after the last file.
4. [ ] Verify with **real accounts**, not the role preview: the Admin, two Sales Agents (the §3 isolation and self-promotion tests), anonymous.
5. [ ] Open Admin Center → Ασφάλεια & Έλεγχοι (PR #152) and run the live checks **from the Production app**; record the result and its time. A line becomes «Επαληθευμένο» only from a live Production run.
6. [ ] Record in the dashboard's manual lines what was tested by hand (isolation with two agents, the self-promotion attempt).

## 5. Stop rules and rollback
- Any check that is not `true`, any intake/login/provisioning failure, any unexpected permission error for a legitimate role: **stop, diagnose, do not continue.**
- Rollbacks (each **re-opens the finding**; use to restore service only): `rollback_phase1_18_…`, `rollback_phase4_18_…`, `rollback_phase4_21_…`, `rollback_phase6_21_…`, `rollback_phase6_25_…`, `rollback_phase6_26_…`, `rollback_phase6_27_…` in `docs/ops/`; `phase2/05` has no script (header of the file and `phase2/README.md`). `scripts/ops/make-rollback-sql.mjs` can rebuild the definitions from a pre-rollout backup.

## 6. What stays open after this checklist
Real Supabase Auth/PostgREST/Storage behaviour with live JWTs, Edge Function versions and secrets, MFA, backups/PITR, and the Dashboard settings for passwords: none of these are provable by the PGlite gate, and the dashboard lists each as an open item.
