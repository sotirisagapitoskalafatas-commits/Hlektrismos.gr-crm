# Staging apply script (for OpenCode)

The 22 staged SQL files of `docs/ops/APPLY_ORDER.md` (steps 1–21 and 2b) as exact `psql` commands, **one per step, each followed by its check query**, with a **STOP** between steps.

> **STAGING ONLY.** Never run this against the live database. Never print or commit the connection string. Nothing here deploys an edge function: a step that needs a deploy says so, and you **report that it is pending**.

## Rules for the person (or agent) running it
1. Set the staging connection string in the environment, **not in a file**: `export STAGING_DB_URL='postgresql://…'` (a *staging* project, built from the schema dump of live). Check it: `psql "$STAGING_DB_URL" -At -c "select current_database(), inet_server_addr()"` and confirm with the owner that it is staging.
2. Work from the repository root, on `main` (every SQL file is there).
3. **One step at a time, in this order.** Each file is run with `-v ON_ERROR_STOP=1`, so the first error stops it. Then run the check query: it must print `t`.
4. If a step fails or its check does not print `t`: **STOP and report** the step number, the file, the exact output, and do **not** continue, retry in a loop, or edit the SQL.
5. After the last step run the whole-database check: `psql "$STAGING_DB_URL" -f docs/ops/pending_migrations_check.sql` and paste the grid in the report.
6. Take a backup / snapshot of staging first (provider dashboard) and say so in the report.

### Non-additive steps — marked ⚠
The owner's list of non-additive steps is **07a, 07b, 07c, 10, 14** (steps 9, 10, 11, 12, 16 below). Each carries the ⚠ **NON-ADDITIVE** mark. Others also change or drop existing objects (1, 2, 3, 4, 6, 7, 8, 17, 20): their **kind** is written in each step so nothing is hidden. Rollback files and instructions: `docs/ops/APPLY_ORDER.md`.

### Before step 1
```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f docs/ops/pending_migrations_check.sql   # what is already applied; skip a step whose check is already t
```
**STOP and report** the grid before continuing.

## Step 1 — `phase1/16_storage_docs_lockdown.sql`
*storage lockdown* · kind: **drops storage policies**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase1/16_storage_docs_lockdown.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='website uploads contact forms') and not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='hlektrismos_docs_anon_select')"
```
Then do the **incognito upload test** in `docs/ops/SECURITY_LIVE_FINDINGS.md` (a website upload must still work). A person must do that; report that it is pending.

**STOP and report if this fails** (step 1). Otherwise continue to step 2.

## Step 2 — `phase1/01_rls_hardening.sql`
*RLS hardening* · kind: **drops policies, revokes anonymous grants**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase1/01_rls_hardening.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from pg_policies where schemaname='public' and tablename='crm_integrations' and policyname='admin manage crm_integrations')"
```
**STOP and report if this fails** (step 2). Otherwise continue to step 3.

## Step 2b — `phase1/17_anon_restrictive_lockdown.sql`
*anonymous lockdown for legacy tables (security audit F-02, F-06)* · kind: **additive** (RESTRICTIVE policies and a function setting; nothing dropped, nothing revoked)

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase1/17_anon_restrictive_lockdown.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select count(*) > 0 from pg_policies where schemaname='public' and policyname='anon never (restrictive)'"
```
**STOP and report if this fails** (step 2b). Otherwise continue to step 3.

## Step 3 — `phase2/05_staff_admin_and_role_preview.sql`
*staff administration + self-promotion fix* · kind: **replaces policies (profiles update own, crm_settings)**

**Prerequisite:** The **role-model decision** (docs/product/ROLE_MODEL.md) must be made. After the SQL, the edge function `admin-users` must be deployed: **OpenCode must not deploy it — report that a deploy is pending.**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase2/05_staff_admin_and_role_preview.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from pg_trigger where tgname='profiles_guard_privileged')"
```
**STOP and report if this fails** (step 3). Otherwise continue to step 4.

## Step 4 — `phase1/03_drop_exec_sql.sql`
*drop exec_sql* · kind: **drops a function**

**Prerequisite:** Before running: save the existing definition of `public.exec_sql` if it exists (query 9 in docs/audit/audit-rls-readonly.sql) and attach it to the report.

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase1/03_drop_exec_sql.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='exec_sql')"
```
**STOP and report if this fails** (step 4). Otherwise continue to step 5.

## Step 5 — `phase1/02_outreach_decisions_audit.sql`
*outreach decisions audit table* · kind: **additive**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase1/02_outreach_decisions_audit.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select to_regclass('public.outreach_decisions') is not null"
```
**STOP and report if this fails** (step 5). Otherwise continue to step 6.

## Step 6 — `phase1/04_cron_secret_and_pause.sql`
*cron secret + pause outreach schedulers* · kind: **replaces cron jobs**

**Prerequisite:** Requires `pg_cron`, `pg_net`, Supabase Vault and the owner pre-steps written at the top of the file (`CRON_SECRET`, Vault entries). **If they are not done, SKIP this step and report.**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase1/04_cron_secret_and_pause.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select count(*) > 0 from cron.job where command like '%x-cron-secret%'"
```
An error on the check only means `pg_cron` is not readable for this user: report it, do not retry.

**STOP and report if this fails** (step 6). Otherwise continue to step 7.

## Step 7 — `phase4/15_convert_lead_match_phone_only.sql`
*lead → customer matching by phone only (D1)* · kind: **replaces a function (same signature)**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase4/15_convert_lead_match_phone_only.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from pg_proc where proname='customer_match_phone')"
```
**STOP and report if this fails** (step 7). Otherwise continue to step 8.

## Step 8 — `phase2/06_trash_leads_customers.sql`
*Κάδος (trash) for leads and customers* · kind: **adds a restrictive policy and triggers**

**Prerequisite:** Step 3 must be applied.

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase2/06_trash_leads_customers.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='deleted_at')"
```
**STOP and report if this fails** (step 8). Otherwise continue to step 9.

## Step 9 — `phase2/07a_document_checklist_and_return.sql` ⚠ NON-ADDITIVE
*document checklist (warn only) + return for correction* · kind: **additive; drops only what the FORMER 07 created, if it was ever applied**

**Prerequisite:** The role-model decision (who may return a case).

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase2/07a_document_checklist_and_return.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select to_regprocedure('public.return_case_for_correction(uuid,text,jsonb,text)') is not null"
```
**STOP and report if this fails** (step 9). Otherwise continue to step 10.

## Step 10 — `phase2/07b_case_stage_guard_and_set_stage.sql` ⚠ NON-ADDITIVE
*allowed stage moves guard + «Αλλαγή σταδίου (Back Office)»* · kind: **NEW TRIGGER on cases.current_stage**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase2/07b_case_stage_guard_and_set_stage.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select to_regprocedure('public.set_case_stage(uuid,text,text)') is not null"
```
**STOP and report if this fails** (step 10). Otherwise continue to step 11.

## Step 11 — `phase2/07c_reopen_completed_case.sql` ⚠ NON-ADDITIVE
*admin reopens a completed case* · kind: **adds one function (listed by the owner as non-additive; the file itself is additive)**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase2/07c_reopen_completed_case.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select to_regprocedure('public.reopen_completed_case(uuid,text,text)') is not null"
```
**STOP and report if this fails** (step 11). Otherwise continue to step 12.

## Step 12 — `phase4/10_field_checkin_manual_flag.sql` ⚠ NON-ADDITIVE
*check-in always accepted + review flag* · kind: **REPLACES the field_checkin function**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase4/10_field_checkin_manual_flag.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from pg_proc where proname='review_field_checkin')"
```
**STOP and report if this fails** (step 12). Otherwise continue to step 13.

## Step 13 — `phase4/11_customer_names.sql`
*customer first/last name* · kind: **additive**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase4/11_customer_names.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from information_schema.columns where table_schema='public' and table_name='customers' and column_name='first_name')"
```
**STOP and report if this fails** (step 13). Otherwise continue to step 14.

## Step 14 — `phase4/12_default_backoffice_assignee.sql`
*default Back Office assignee* · kind: **additive**

**Prerequisite:** The role-model decision (who counts as Back Office).

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase4/12_default_backoffice_assignee.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from pg_proc where proname='route_lead_to_backoffice')"
```
**STOP and report if this fails** (step 14). Otherwise continue to step 15.

## Step 15 — `phase4/13_case_exception_state.sql`
*case exception state* · kind: **additive**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase4/13_case_exception_state.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from information_schema.columns where table_schema='public' and table_name='cases' and column_name='exception_state')"
```
**STOP and report if this fails** (step 15). Otherwise continue to step 16.

## Step 16 — `phase4/14_follow_up_kind.sql` ⚠ NON-ADDITIVE
*follow-up kind* · kind: **additive column + a ONE-TIME FILL of existing rows**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase4/14_follow_up_kind.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from information_schema.columns where table_schema='public' and table_name='follow_ups' and column_name='kind')"
```
**STOP and report if this fails** (step 16). Otherwise continue to step 17.

## Step 17 — `phase3/08_b2b_prospects_review_distribution.sql`
*B2B prospects review/distribution* · kind: **replaces B2B policies**

**Prerequisite:** Steps 1–6 applied. The rewritten `scrape-b2b` function must be deployed AFTER the SQL: **OpenCode must not deploy — report that a deploy is pending.**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase3/08_b2b_prospects_review_distribution.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select to_regclass('public.b2b_prospects') is not null"
```
**STOP and report if this fails** (step 17). Otherwise continue to step 18.

## Step 18 — `phase3/09_contact_eligibility.sql`
*contact eligibility (objections, consent, screenings)* · kind: **additive (drops only its own policies)**

**Prerequisite:** Steps 1–6 and step 17 applied.

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase3/09_contact_eligibility.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select to_regclass('public.contact_objections') is not null"
```
**STOP and report if this fails** (step 18). Otherwise continue to step 19.

## Step 19 — `phase5/17_customer_supply_points.sql`
*supply points (customer folder)* · kind: **additive**

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase5/17_customer_supply_points.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select to_regclass('public.customer_supply_points') is not null"
```
**STOP and report if this fails** (step 19). Otherwise continue to step 20.

## Step 20 — `phase5/18_lead_supply_points.sql`
*supply points on leads + conversion trigger* · kind: **additive column; adds triggers; replaces one function (supply_point_duplicates)**

**Prerequisite:** Step 19 applied.

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase5/18_lead_supply_points.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select exists (select 1 from information_schema.columns where table_schema='public' and table_name='customer_supply_points' and column_name='lead_id')"
```
**STOP and report if this fails** (step 20). Otherwise continue to step 21.

## Step 21 — `phase4/16_import_legacy_leads.sql`
*legacy leads import (creates a view and a function only — copies NOTHING)* · kind: **additive objects; the later import writes rows**

**Prerequisite:** Run the read-only dry run FIRST (see below). The import itself is a separate, deliberate step that needs the owner's "go".

```bash
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/staged-migrations/phase4/16_import_legacy_leads.sql
```
Check (must print `t`):
```bash
psql "$STAGING_DB_URL" -At -c "select to_regprocedure('public.import_legacy_leads(boolean)') is not null"
```
**Dry run before applying this step** (counts only, nothing is created or written):
```bash
psql "$STAGING_DB_URL" -f docs/ops/LEGACY_LEADS_IMPORT_DRYRUN.sql
```
Paste both grids. Look at the `skipped_deleted` line (soft-deleted old rows are skipped). **Do NOT run `select * from public.import_legacy_leads(false);` — that writes rows and needs the owner's explicit go.** After applying the file, `select * from public.import_legacy_leads();` is a dry run by default (counts only).

**STOP and report.** Then the whole-database check and the report.


## Report back
A table of 22 rows: step, file, result of the command, result of the check (`t` or the output), and for each step that needs a deploy or an owner pre-step: **pending**. Then the final `pending_migrations_check.sql` grid, and the two dry-run grids from step 21. Do not paste connection strings, keys, or personal data.

## Rollback
Each step's rollback file or instructions are in `docs/ops/APPLY_ORDER.md`. On staging, restoring the snapshot taken before step 1 is the quickest way back.
