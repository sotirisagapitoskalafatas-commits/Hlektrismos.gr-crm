# Production rollout checklist — two-role model, sales isolation, real accounts

**This is the procedure and its gates; live status and findings are kept privately by the owner.** Nothing here is executed without the owner's explicit approval. Production project and CRM origin: see the owner's private notes; the public WordPress site is never used for Auth.
Status legend used in the private copy: ✅ completed · ⏳ pending · 🚫 blocked · 🔐 awaiting owner approval · 👤 owner action.

## 0. What kind of evidence is this? (never mix them)
| Evidence | Where it ran | What it proves | What it does NOT prove |
|---|---|---|---|
| Unit + local SQL tests (503, Node 20; PGlite) | developer machine, in-memory Postgres | SQL/TypeScript logic | anything about Supabase, Auth, storage or production data |
| Backup → isolated restore → **27-file rehearsal** → generated rollback (`scripts/ops/restore-verify.mjs`, 31/31) | developer machine, in-memory Postgres loaded with a **copy of production data** | the SQL applies to real production data shapes; objects roll back exactly | it is **not** a production deployment; Supabase platform behaviour (Auth, storage, cron, vault, pgvector) is stand-in |
| `scripts/qa/staging-two-role.mjs` (72/72, 1 skipped) | **Supabase STAGING** project, real Auth JWTs, real PostgREST, real Edge Function | admin-only account management and Sales Agent isolation are enforced by the backend | production (different project, different data/policies until the SQL is applied) |
| Read-only production audits (catalog, Auth users, public Auth settings, function list) | **Supabase PRODUCTION**, SELECT/GET only | the current state | any behaviour of the new code on production |
| `npm run qa:redesign` (27) | local build against a **mock** with no authorization | the screens render per role | authorization, RLS, data isolation |

## 1. Gates
| # | Gate | Status |
|---|---|---|
| G1 | Backup of the database **and** Storage files, isolated restore passed (repeat immediately before the window; enable platform backups) | see private copy |
| G2 | Staging verification with real JWTs (`node scripts/qa/staging-two-role.mjs`) | see private copy |
| G3 | Independent review of the migration sequence, rollback and security boundaries | see private copy |
| G4 | Auth URL configuration + `SITE_URL` + public sign-up disabled (`AUTH_URL_CONFIGURATION.md`, `auth-settings-check.mjs`) | see private copy |
| G5 | Owner's separate written approval of the rollout | see private copy |

## 2. Exact SQL list (28 files, in this order) — the first 27 were rehearsed on a restored copy of production; the 28th (phase6/22) has only local PGlite tests and must be added to the next rehearsal
Apply one file at a time in the SQL editor; run its check (`APPLY_ORDER.md`) after each; stop on the first failure.
| # | Step | File (`supabase/staged-migrations/…`) |
|---|---|---|
| 1 | 1 | `phase1/16_storage_docs_lockdown.sql` |
| 2 | 2 | `phase1/01_rls_hardening.sql` |
| 3 | 2b | `phase1/17_anon_restrictive_lockdown.sql` |
| 4 | 2c | `phase4/19_staff_only_legacy_tables.sql` |
| 5 | 2d | `phase1/18_live_api_privilege_hardening.sql` |
| 6 | 2e | `phase1/19_stage1_gap_fixes.sql` |
| 7 | 3 | `phase2/05_staff_admin_and_role_preview.sql` |
| 8 | 25 | `phase6/21_two_role_model.sql` ← right after 3; replaces 3b + 3c |
| 9 | 5 | `phase1/02_outreach_decisions_audit.sql` |
| 10 | 6 | `phase1/04_cron_secret_and_pause.sql` (owner pre-steps: `CRON_SECRET`, Vault; tariff cron stays disabled) |
| 11 | 7 | `phase4/15_convert_lead_match_phone_only.sql` |
| 12 | 8 | `phase2/06_trash_leads_customers.sql` |
| 13 | 9 | `phase2/07a_document_checklist_and_return.sql` |
| 14 | 10 | `phase2/07b_case_stage_guard_and_set_stage.sql` |
| 15 | 11 | `phase2/07c_reopen_completed_case.sql` |
| 16 | 12 | `phase4/10_field_checkin_manual_flag.sql` |
| 17 | 13 | `phase4/11_customer_names.sql` |
| 18 | 14 | `phase4/12_default_backoffice_assignee.sql` |
| 19 | 15 | `phase4/13_case_exception_state.sql` |
| 20 | 16 | `phase4/14_follow_up_kind.sql` |
| 21 | 17 | `phase3/08_b2b_prospects_review_distribution.sql` |
| 22 | 18 | `phase3/09_contact_eligibility.sql` |
| 23 | 21 | `phase4/16_import_legacy_leads.sql` |
| 24 | 22 | `phase4/18_sales_own_records_scope.sql` ← Sales Agent isolation |
| 25 | 22b | `phase4/21_sales_isolation_completion.sql` |
| 26 | 23 | `phase5/19_field_sales_saved_routes.sql` |
| 27 | 24 | `phase6/20_user_preferences.sql` |
| 28 | 26 | `phase6/22_crm_integrations_status_invoker.sql` ← after phase6/21 (security_invoker view; advisor finding) |
**Skipped on purpose:** already live — `phase1/03_drop_exec_sql`, `phase5/17_customer_supply_points`, `phase5/18_lead_supply_points`; superseded — `phase4/17_admin_only_staff_provisioning`, `phase4/20_backoffice_sales_agent_provisioning` (replaced by `phase6/21`).
**Rehearsal result (local, restored production copy):** all 27 applied without error; only existing-data change = one seed row in `crm_settings` (32→33).

## 3. Rollback — verified on the same rehearsal
`node scripts/ops/make-rollback-sql.mjs <pre-rollout backup> > rollback.sql` (idempotent; run twice in the rehearsal). After it, compared with the snapshot: **71/71 function definitions identical, no extra functions; 287/287 `public` policies and 14/14 `storage.objects` policies identical; 38/38 triggers; all tables and columns (rollout-created ones removed); RLS flags; 1 673/1 673 API-role grants; storage buckets (rollout-created `avatars` removed when empty)**. Not restored by the script: row data (the rollout rewrites none; restore from `data/*.ndjson` if ever needed), the one `crm_settings` seed row, Auth and Storage *files*. Per-file rollbacks also exist in `docs/ops/rollback_*.sql`.

## 4. Order of work after approval
| Step | Action | Status |
|---|---|---|
| A1 | Gates G1–G5 satisfied; screenshot Auth settings (URL config, SMTP, templates) | 🔐 |
| A2 | Fresh backup (DB + Storage), `restore-verify` 14/14, `REHEARSE=1` 31/31 | ⏳ (repeat on the day) |
| A3 | `pending_migrations_check.sql` on production = the 28 files + 2 superseded | ⏳ |
| B | The 28 SQL files (§2), one at a time, check after each | 🔐 |
| C1 | Backup #2; probe: all true except 3b/3c | 🔐 |
| C2 | Non-mutating smoke: `is_staff()` of the QA accounts; `staff_list()` as QA admin = 6 rows; a QA Sales Agent sees only own records | 🔐 |
| D1 | Deploy `admin-users` **by hand** (`supabase functions deploy admin-users --project-ref <production ref> --use-api`); needs `SITE_URL` and the project secret key; do **not** add it to `config.toml` | 🔐 |
| D2 | Merge PR #130 (frontend → Vercel). Confirm the CRM loads and the QA admin can sign in | 🔐 |
| E1 | 👤 Dashboard invitation of the Admin; owner chooses a password on the CRM page | 🚫 blocked by G4 + approval |
| E2 | Claude verifies the Auth user, then runs `docs/ops/sql/provision_profile.sql` (`admin`) | ⏳ after E1 |
| E3 | Recovery e-mail to the Sales Agent (public Auth API; no secret) | 🚫 needs G4, SQL step 24–25 installed **and verified** (C2) |
| E4 | `provision_profile.sql` (`field_sales`) after the owner controls the password | ⏳ after E3 |
| E1b | `admin_identity_report.sql` before E2: exactly one Auth user, an identity row, signed in | ⏳ after E1 |
| E5 | `deactivate_qa_accounts.sql` (the script refuses unless the real admin has signed in) | ⏳ after E2 + successful sign-in |
| E5b | `deactivate_probe_accounts.sql` (the two verification probe logins; same guard) | ⏳ after E5 |

Deployment-integration facts: production has **27 Edge Functions and no `admin-users`**; the GitHub integration deploys only the 6 functions declared in `supabase/config.toml` (`agent-worker`, `ai-developer`, `chat`, `orchestrator`, `scrape-b2b`, `unsubscribe`). Merging #130 deploys the **frontend** to production at once — so it follows the SQL.

## 5. Account onboarding (template — the filled-in table with real addresses is kept privately)
For each of the two accounts (Admin / Back Office `admin`; Sales Agent `field_sales`) record: Auth user exists · e-mail confirmed · invitation/recovery e-mail generated · link opens the CRM origin · link reaches «Νέος κωδικός» · password set by the user only · CRM profile + role · successful login with the new password · permissions verified · password reset works · an unprovisioned or inactive account cannot read CRM data. A row is marked done only when the check has actually passed; an account is never reported ready before all applicable rows pass.
