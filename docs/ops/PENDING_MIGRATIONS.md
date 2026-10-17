# Pending staged migrations: full inventory

**Status, 16/10/2026:** nothing in `supabase/staged-migrations/` has been applied by Claude Code, on staging or production.

**Correction.** I earlier said that "only six files were pending" (07 and 10–14). That was wrong. **18 staged SQL files** are pending:
- **16** written before today;
- **2** new in this branch: `phase4/15` (finding D1) and `phase1/16` (storage lockdown).

The Admin centre findings match this: anonymous read of integration settings, self-promotion to admin, credentials readable in `crm_settings`, and anonymous listing of files.

**Check before you apply.** Run [`pending_migrations_check.sql`](pending_migrations_check.sql) on staging and production. It is read-only, catalog only, and shows which files are already applied. I have not run it on either.

These files sit outside `supabase/migrations/`, so the GitHub integration never applies them. They are run by hand in the SQL editor, staging first. Production needs your approval and a backup or PITR checkpoint.

> **Hotfix first:** apply `phase1/16` and `phase1/01` ahead of everything else, and **rotate the leaked service-role key** in the same window. See [`SECURITY_HOTFIX_RUNBOOK.md`](SECURITY_HOTFIX_RUNBOOK.md).

## Recommended order (security first)

| # | File | What | Additive? | Depends on | Could it break the website form / chatbot / webhook? | Priority |
|---|---|---|---|---|---|---|
| 1 | `phase1/01_rls_hardening.sql` | Anonymous visitors lose all access to `crm_emails`, `crm_integrations` and 18 more tables. Integrations become admin-only, plus a safe status view | **No**: drops policies, revokes anonymous grants | none | **No.** The form writes through `insert_website_lead` (SECURITY DEFINER). The chatbot (`chat`, anon key) calls only that RPC and `get_active_tariff_prices`. The webhook uses the service role. Proved locally: `website-intake-hardening.test.mjs` | **Security: high** |
| 2 | `phase1/16_storage_docs_lockdown.sql` *(new)* | Anonymous visitors can no longer list or download files in `hlektrismos_docs`. They may upload only into `contact-forms/`. Inactive accounts lose access | **No**: drops policies | none | **Website upload: must keep working.** Upload with `upsert:false` needs INSERT only, which is kept. Proved locally in `storage-docs.test.mjs`. **Verify on staging with the incognito upload test** in `SECURITY_LIVE_FINDINGS.md` | **Security: high** |
| 3 | `phase2/05_staff_admin_and_role_preview.sql` | Stops self-promotion to admin (trigger). Adds staff administration functions and audit. Managers can no longer read credential rows in `crm_settings` | **No**: replaces the `profiles update own` and `crm_settings` policies | none (then deploy the `admin-users` function) | No | **Security: high.** ⚠ Decide the role model first (`docs/product/ROLE_MODEL.md`): its permission matrix names the five roles |
| 4 | `phase1/03_drop_exec_sql.sql` | Drops a hand-made `exec_sql` RPC if one exists | **No**: drops a function | Save its definition first (audit query 9) | No (nothing in the repo calls it) | Security |
| 5 | `phase1/02_outreach_decisions_audit.sql` | Append-only `outreach_decisions` log | Yes | none | No | Security (needed before outreach functions are redeployed; outreach is off) |
| 6 | `phase1/04_cron_secret_and_pause.sql` | Tariff cron authenticates with a dedicated secret. Unschedules the two outreach schedulers | **No**: replaces cron jobs | Owner pre-steps: `CRON_SECRET` + Vault entries (in the file) | Chatbot prices could go stale if the tariff sync fails; the form is unaffected | Security / operations |
| 7 | `phase4/15_convert_lead_match_phone_only.sql` *(new)* | Lead → Case conversion reuses a customer **only by phone** (last 10 digits). Never by email, never the placeholder | Function replaced (same signature) | none | No: affects office conversion only | **Data correctness: high** (D1) |
| 8 | `phase2/06_trash_leads_customers.sql` | Κάδος for leads and customers; admin-only permanent delete | Mostly additive (columns, functions); adds a **restrictive** policy that hides trashed rows | after 05 (same review) | No (definer RPC and service role are unaffected) | Normal |
| 9 | `phase2/07a_document_checklist_and_return.sql` | Document checklist that only **warns** (never blocks) + «Επιστροφή για διόρθωση». Owner decision 17/10: the «Μπλοκάρισμα» option and the override are gone | Additive (tables, columns, functions). Drops only what the *former* single 07 created, if it was ever applied on staging | Decide the role model (who may return a case) | No | Normal |
| 9b | `phase2/07b_case_stage_guard_and_set_stage.sql` | Allowed stage moves for direct writes (trigger) + **«Αλλαγή σταδίου από Back Office»**: Back Office/admin/manager set any stage, with a written reason, audited | **No**: new trigger on `cases.current_stage` | **PR #49 must be live first** (it is). The app control for set_case_stage degrades to a neutral Greek sentence until this is applied | No (the trigger is UPDATE-only and the service role is not affected) | Normal |
| 9c | `phase2/07c_reopen_completed_case.sql` *(new)* | **«Επαναφορά ολοκληρωμένου case»**: an admin reopens a completed case to a working stage, with a written reason, audited | Yes: one function, no table, column or trigger | none (independent of 07a and 07b) | No (nothing changes until an admin uses it) | Low |
| 9d | `phase4/16_import_legacy_leads.sql` *(new, data script)* | One-time copy of the 130 legacy leads (`hlektrismos_leads`) into `public.leads`, marked as imported, duplicates skipped. **Run the read-only dry run first** (`docs/ops/LEGACY_LEADS_IMPORT_DRYRUN.sql`) | Inserts rows only; the old table is untouched | Owner decisions: the status mapping, and whether rows without recorded consent are shown | No | Normal (the team cannot see its lead history) |
| 9e | `phase5/17_customer_supply_points.sql` *(new)* | **«Παροχές»**: several independent electricity connections per customer (home and business), each with its own address, Αριθμός Παροχής, meter, tariff category and name, dates, documents and cases. Configurable tariff list. Duplicate numbers are flagged, never blocked or merged | Yes: two tables, two nullable columns, functions and triggers. The legacy `supply_points` / `customer_meters` are not touched | none | No | Normal |
| 10 | `phase4/10_field_checkin_manual_flag.sql` | Check-in always accepted, with a review flag (no 150 m rejection) | Function replaced | none | No | Normal (field complaint) |
| 11 | `phase4/11_customer_names.sql` | `customers.first_name / last_name` | Yes | none | No | Low |
| 12 | `phase4/12_default_backoffice_assignee.sql` | Default Back Office assignee setting + routing | Yes | role model (who counts as "Back Office") | No | Normal |
| 13 | `phase4/13_case_exception_state.sql` | `cases.exception_state` + `set_case_exception` | Yes | none | No | Low |
| 14 | `phase4/14_follow_up_kind.sql` | `follow_ups.kind` (fills nulls once) | Additive + one-time fill | none | No | Low |
| 15 | `phase3/08_b2b_prospects_review_distribution.sql` | B2B: discover → review → distribute (no direct inserts into leads) | **No**: replaces B2B policies | Deploy the rewritten `scrape-b2b` **after** the SQL. ⚠ Check which `scrape-b2b` version is live: the GitHub integration redeploys listed functions on merge | No | Normal, needs legal review (retention, Article 11) |
| 16 | `phase3/09_contact_eligibility.sql` | Objections, consent with evidence, Article 11 screenings | Additive tables + functions (drops only its own policies) | after **1–6** and **15 (08)** | No. Outreach functions **fail closed** (nothing is sent) until it is applied; the form and chatbot are unaffected | Compliance (must come before any outreach) |

Item 8 (06) can move anywhere after 05. Items 10–14 are independent of each other. Item 7 (D1) is independent and can go right after the security block.

## What the app does until each file is applied

| File | Until it is applied |
|---|---|
| phase1/01 | Anonymous visitors can read and rewrite `crm_integrations` (incl. `config`) and read `crm_emails`. The Admin centre shows «Χρειάζεται ενέργεια» |
| phase1/16 | Anonymous visitors can list files in `contact-forms/` (and the whole bucket). Any signed-in account can read, change and delete files |
| phase2/05 | Any signed-in user can make themselves admin. Managers can read SerpApi, IMAP and Vapi keys in `crm_settings`. User management is view-only |
| phase1/03 | An `exec_sql` RPC may exist (unknown; checked by audit query 9) |
| phase1/02, 04 | Outreach is off by switches. The tariff cron uses the old authentication |
| phase4/15 | People without email can be joined to one customer on conversion (D1) |
| phase2/06 | «Διαγραφή» shows «ο κάδος ενεργοποιείται μετά…»; nothing is trashed |
| phase2/07a | Document gaps are shown as warnings (never block). Return for correction is unavailable |
| phase2/07b | Stage moves are checked only in the app. Back Office cannot jump to another stage: «Αλλαγή σταδίου από Back Office» is unavailable (the app shows a neutral sentence) |
| phase2/07c | An admin cannot reopen a completed case; the control shows «Η λειτουργία δεν είναι ακόμη διαθέσιμη.» |
| phase5/17 | The «Παροχές» tab shows «Η λειτουργία δεν είναι ακόμη διαθέσιμη.»; the customer has one address and the old single supply number field |
| phase4/10 | The server refuses check-ins more than 150 m away; the app offers «Καταγραφή χωρίς GPS» |
| phase4/11 | One «Ονοματεπώνυμο» field (the app checks once per session) |
| phase4/12 | Leads with documents stay with their creator, who is told routing is not active |
| phase4/13 | The exception picker is disabled; «Εξαιρέσεις» counts only returned cases |
| phase4/14 | Manager follow-ups are recognised by their text prefix |
| phase3/08 | The B2B screen shows «ενεργοποιείται μετά…» (or the old scraper behaviour, depending on the live function) |
| phase3/09 | «Επικοινωνία & συγκαταθέσεις» shows a developer sentence (to be neutralised, bug T1); outreach fails closed |

## Rollback

| File | How |
|---|---|
| phase1/01 | At the end of the file: re-creates the old open policies. This re-opens the finding, so use it only to restore service |
| phase1/16 | At the end of the file (same warning) |
| phase2/05 | Drop trigger `profiles_guard_privileged`, the new functions and tables; re-create `crm_settings_admin_all` (header of the file / phase2 README) |
| phase1/03 | Re-create the saved `exec_sql` definition only if something legitimate needed it (nothing in the repo does) |
| phase1/02 | Drop `outreach_decisions` (append-only log; export it first) |
| phase1/04 | Re-create the jobs from `20260819000009_pg_cron_autonomous.sql` |
| phase4/15 | [`rollback_phase4_15_convert_lead.sql`](rollback_phase4_15_convert_lead.sql): the original function verbatim (tested) |
| phase2/06 | Drop the two restrictive policies, triggers and functions; the columns can stay |
| phase2/07a | [`rollback_phase2_07a.sql`](rollback_phase2_07a.sql) (tested; data columns stay) |
| phase2/07b | [`rollback_phase2_07b.sql`](rollback_phase2_07b.sql), option A, B or C (tested) |
| phase2/07c | [`rollback_phase2_07c.sql`](rollback_phase2_07c.sql) (drops the function; reopened cases stay reopened, listed from `activity_log`) |
| phase5/17 | [`rollback_phase5_17_supply_points.sql`](rollback_phase5_17_supply_points.sql): A switches it off and keeps the data, B removes everything (tested) |
| phase4/10 | [`rollback_phase4_10_field_checkin.sql`](rollback_phase4_10_field_checkin.sql) (tested) |
| phase4/11–14 | Comment at the end of each file; the columns can stay |
| phase3/08 | Drop the new tables, functions and trigger; redeploy the previous `scrape-b2b` |
| phase3/09 | At the end of the file. It drops the recorded objections, consents and screenings, so **export them first** |

## Decide before applying 05 and 07a
The client asks for **two** roles: Admin/Back Office, and Sales agent. Both 05 (the staff administration matrix) and 07a (who may return a case, and to which team) are written for the current **five**. See `docs/product/ROLE_MODEL.md` for the two paths and what each means for these files.

## Local evidence (PGlite, not staging)
`npm test` runs every file under `supabase/tests/`. Relevant here:
- `rls.test.mjs`
- `website-intake-hardening.test.mjs` *(new)*
- `storage-docs.test.mjs` *(new)*
- `staff-admin.test.mjs`
- `trash.test.mjs`
- `case-workflow.test.mjs`
- `stage-jump.test.mjs`
- `field-checkin.test.mjs`
- `backoffice-assignee.test.mjs`
- `case-exception.test.mjs`
- `b2b-pipeline.test.mjs`
- `contact-eligibility.test.mjs`
- `convert-lead-d1.test.mjs` *(new)*
