# Apply order — every staged SQL file not yet on live

**One list, in the exact order to run them.** 28 files (23 numbered steps, plus 2b, 2c, 2d, 3b and 3c added by the security audit, the live API hardening hotfix, account/visibility work and Field Sales route planning), security first, ending with the supply points (phase5/17, phase5/18) and then the legacy-leads import (phase4/16, PR #79 and its v2).
Written 18/10/2026 from the repository, **not from the live database**: nothing in `supabase/staged-migrations/` has been applied by Claude Code, on staging or live. The files sit outside `supabase/migrations/`, so GitHub never applies them; each is run by hand in the Supabase SQL editor.

## Before step 1
1. **Check what is already there.** Run [`pending_migrations_check.sql`](pending_migrations_check.sql) (read-only, catalog only) on the database you are about to change. Skip a step whose check already says `true`; a step is idempotent, but skipping is clearer.
2. **Staging first.** Staging is being built from a schema dump of live. Run the whole list there, in this order, with the check after each step; only then live.
3. **Live needs a backup or a PITR checkpoint first**, and your approval of each step.
4. **One file at a time. After each file run its check query (below). If it is not `true`, stop and tell Claude** — do not continue down the list.
5. The checks below are the quick one-liners. `pending_migrations_check.sql` runs all of them at once.

## Not SQL, but part of the same window
- **Rotate the leaked service-role key** with steps 1–2 ([`SECURITY_HOTFIX_RUNBOOK.md`](SECURITY_HOTFIX_RUNBOOK.md)). Until then it bypasses every policy below.
- **Step 3 (phase2/05):** deploy the edge function `admin-users` (`supabase functions deploy admin-users`; needs `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`; invites need Auth e-mail/SMTP).
- **Step 6 (phase1/04):** owner pre-steps in the file (`CRON_SECRET` and the Vault entries).
- **Step 17 (phase3/08):** deploy the rewritten `scrape-b2b` **after** the SQL; check which version is live first (the GitHub integration redeploys listed functions on merge).
- **Roles:** the database keeps the five roles. The two application roles of the master prompt v3 (Back Office / Admin, Πωλήτης) are a **mapping** in the admin screens plus steps 3b and 22; the role model is `docs/product/ROLE_MODEL.md`.

---

## 1. `phase1/16_storage_docs_lockdown.sql` — security
- **Depends on:** nothing.
- **Unlocks on screen:** nothing visible. Anonymous visitors can no longer list or download files in `hlektrismos_docs` (they may still upload into `contact-forms/`); inactive accounts lose access.
- **Rollback:** end of the file (it re-opens the finding; use only to restore service).
- **Verify the website upload still works** with the incognito test in [`SECURITY_LIVE_FINDINGS.md`](SECURITY_LIVE_FINDINGS.md).
- **Check:**
```sql
select exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='website uploads contact forms') and not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='hlektrismos_docs_anon_select') as applied;
```

## 2. `phase1/01_rls_hardening.sql` — security
- **Depends on:** nothing. (Rotate the service-role key in the same window.)
- **Unlocks on screen:** Admin centre «Χρειάζεται ενέργεια» for integrations goes away; integrations become admin-only. The website form, chatbot and webhooks keep working (proved in `website-intake-hardening.test.mjs`).
- **Rollback:** end of the file (re-opens the finding).
- **Check:**
```sql
select exists (select 1 from pg_policies where schemaname='public' and tablename='crm_integrations' and policyname='admin manage crm_integrations') as applied;
```

## 2b. `phase1/17_anon_restrictive_lockdown.sql` — security (new, from the security audit F-02, F-06)
- **Depends on:** step 2 (it closes what phase1/01 leaves open for the anonymous role).
- **Unlocks on screen:** nothing visible. **Additive:** no policy dropped, no grant revoked — it adds a RESTRICTIVE «anon: never» policy to 12 legacy tables that still carry `using (true)` policies for the role `public` (commissions, agent attribution, customer document records, sales agents, staff directory, tasks, integrations, e-mails, legacy supply points/meters), and pins the `search_path` of `create_crm_user()`. The website form is not affected (`hlektrismos_leads` is not touched).
- **Rollback:** [`rollback_phase1_17_anon_restrictive_lockdown.sql`](rollback_phase1_17_anon_restrictive_lockdown.sql) (drops only its own policies).
- **Check** (at least one table had the policy added; a database that lacks some legacy tables gets fewer than 12):
```sql
select count(*) > 0 from pg_policies where schemaname='public' and policyname='anon never (restrictive)';
```

## 2c. `phase4/19_staff_only_legacy_tables.sql` — security (new, from the security audit F-08)
- **Depends on:** nothing (uses `is_staff()`). **Additive:** one RESTRICTIVE «staff only» policy per legacy table; nothing dropped or rewritten.
- **Unlocks on screen:** nothing visible. A **deactivated** account (or any signed-in user without an active profile) can no longer read or write ~30 older tables (campaigns, calendar, chat, voice calls, lead notes, tasks …). Active staff see exactly what they saw before.
- **Rollback:** [`rollback_phase4_19_staff_only_legacy_tables.sql`](rollback_phase4_19_staff_only_legacy_tables.sql).
- **Check:**
```sql
select count(*) > 0 from pg_policies where schemaname='public' and policyname='staff only (restrictive)';
```

## 2d. `phase1/18_live_api_privilege_hardening.sql` — security hotfix (branch PR; not applied)
- **Depends on:** review the read-only live findings first; run after 01/16/17/19 during the same controlled security window. It does not require data backfills, but it changes grants, RLS policies and legacy RPC bodies.
- **Unlocks:** anonymous access to the audited private legacy tables is denied; profile role/status cannot be changed through direct API writes; exposed legacy reassignment and supply-point RPCs require office authorization; the audited non-public SECURITY DEFINER RPCs lose anonymous EXECUTE; mutable SECURITY DEFINER `search_path` values are pinned; the public tariff view runs with invoker permissions.
- **Public paths that must keep working:** website/contact lead intake, chatbot public tariff lookup, and staff conversion/assignment flows. A successful local PGlite test is not a replacement for staging smoke tests.
- **Runbook:** [`SECURITY_REMEDIATION_PR_20261019.md`](SECURITY_REMEDIATION_PR_20261019.md). Do not apply this file as part of an automated batch. Check the exact target database, take a backup/PITR checkpoint, apply only this file, then run the checks below.
- **Rollback:** [`rollback_phase1_18_live_api_privilege_hardening.sql`](rollback_phase1_18_live_api_privilege_hardening.sql). Emergency only: it intentionally restores prior vulnerable access.
- **Catalog checks (run against the target only during an approved change window):**
```sql
select
  not has_table_privilege('anon','public.crm_users','SELECT') as anon_cannot_read_crm_users,
  not has_table_privilege('anon','public.customer_documents','SELECT') as anon_cannot_read_customer_documents,
  not has_table_privilege('anon','public.hlektrismos_leads','SELECT') as anon_cannot_read_legacy_leads,
  not has_function_privilege('anon','public.reassign_lead(uuid,uuid)','EXECUTE') as anon_cannot_reassign,
  not has_function_privilege('anon','public.upsert_supply_point(uuid,text,text,text,text,uuid,numeric,numeric)','EXECUTE') as anon_cannot_upsert_supply,
  has_function_privilege('anon','public.insert_website_lead(text,jsonb)','EXECUTE') as public_intake_rpc_preserved,
  has_function_privilege('anon','public.get_active_tariff_prices(text)','EXECUTE') as public_tariff_lookup_preserved,
  exists (select 1 from pg_trigger where tgname='profiles_guard_privileged' and not tgisinternal) as profile_guard_exists,
  (select coalesce('security_invoker=true'=any(reloptions),false) from pg_class where oid=to_regclass('public.market_tariffs_view')) as tariff_view_invoker;
```
- **Required before production:** on staging, test website/contact intake including invalid consent/age cases, chatbot tariff lookup, Admin/Back Office account provisioning, Sales Agent login, and routine lead/case/customer/document flows. If anything fails, stop and diagnose.

## 2e. `phase1/19_stage1_gap_fixes.sql` — security (Stage 1, last file)
- **Depends on:** 2d (`phase1/18`), in the same window. Full Stage 1 order and checks: [`STAGE1_EMERGENCY_DB_HARDENING.md`](STAGE1_EMERGENCY_DB_HARDENING.md).
- **Unlocks on screen:** nothing visible. `set_user_role` service-role only (grants and body); `energy-bills` bucket: active staff read only; new functions are executable by nobody until granted explicitly, and new tables are not granted to anon. **Every later step that creates a function the browser or an RLS policy calls must grant EXECUTE explicitly** (checked by `stage1-later-migrations-grants.test.mjs`).
- **Rollback:** end of the file (re-opens the findings).
- **Check:** see `pending_migrations_check.sql` row `phase1/19_stage1_gap_fixes`.

## 3. `phase2/05_staff_admin_and_role_preview.sql` — security
- **Depends on:** the role-model decision (see above); then deploy `admin-users`.
- **Unlocks on screen:** no more self-promotion to admin; user management (Χρήστες & Ρόλοι) becomes editable; managers can no longer read credential rows in `crm_settings`.
- **Rollback:** header of the file and `supabase/staged-migrations/phase2/README.md` (drop the trigger `profiles_guard_privileged`, the new functions and tables; re-create `crm_settings_admin_all`).
- **Check:**
```sql
select exists (select 1 from pg_trigger where tgname='profiles_guard_privileged') as applied;
```

## 3b. `phase4/17_admin_only_staff_provisioning.sql` — security / roles (queue item 4, master prompt §2.4)
- **Depends on:** step 3 (re-defines `staff_admin_can()` created there). **Additive:** one function body replaced; no drop, rename or data change.
- **Unlocks on screen:** only administrators create users, change roles, disable accounts (Admin Center → Χρήστες & Ρόλοι). Managers and Back Office keep the read-only team list. Deploy the edge function `admin-users` again (new action `reset`: password-recovery e-mail).
- **Rollback:** [`rollback_phase4_17_admin_only_staff_provisioning.sql`](rollback_phase4_17_admin_only_staff_provisioning.sql) (restores the step-3 matrix).
- **If step 3 is ever re-applied, apply this step again afterwards.** Guide: [`ADMIN_PROVISIONING.md`](ADMIN_PROVISIONING.md).
- **Check:**
```sql
select position('a.role = ''manager''' in pg_get_functiondef('public.staff_admin_can(uuid,text,text)'::regprocedure)) = 0;
```

## 3c. `phase4/20_backoffice_sales_agent_provisioning.sql` — two effective access groups
- **Depends on:** phase2/05 (creates the audited staff administration foundation) and phase4/17. Apply AFTER phase4/17; if phase4/17 is ever re-applied, run phase4/20 afterwards.
- **Behavior:** Admin retains legacy super-admin scope. Back Office and legacy Manager can create/invite, activate/deactivate and initiate recovery for Sales Agent accounts only. They cannot create/promote office accounts. Sales Agents cannot administer accounts. The directory shown to Back Office includes Sales Agent profiles only.
- **No role data is rewritten.** The migration replaces trusted function bodies and therefore must be reviewed as a security-sensitive, non-additive change.
- **Deploy/redeploy:** the `admin-users` Edge Function uses the same two-group decision helper in this branch. The Edge Function source must be deployed to the intended environment separately, with protected secrets unchanged.
- **Rollback:** [`rollback_phase4_20_backoffice_sales_agent_provisioning.sql`](rollback_phase4_20_backoffice_sales_agent_provisioning.sql). It restores the prior Admin-only staff matrix.
- **Check:** run the local regression `supabase/tests/admin-only-provisioning.test.mjs`; on staging, run an approved positive/negative matrix with Back Office, Sales and inactive test users before production.

## 4. `phase1/03_drop_exec_sql.sql` — security
- **Depends on:** save the definition first (audit query 9 in `docs/audit/audit-rls-readonly.sql`).
- **Unlocks on screen:** nothing (nothing in the repo calls `exec_sql`).
- **Rollback:** restore the saved definition only if something legitimate needed it.
- **Check:**
```sql
select not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='exec_sql') as applied;
```

## 5. `phase1/02_outreach_decisions_audit.sql` — security
- **Depends on:** nothing. Needed before outreach functions are redeployed (outreach is off).
- **Unlocks on screen:** nothing.
- **Rollback:** drop `outreach_decisions` (an append-only log: export it first).
- **Check:**
```sql
select to_regclass('public.outreach_decisions') is not null as applied;
```

## 6. `phase1/04_cron_secret_and_pause.sql` — security / operations
- **Depends on:** `pg_cron`, `pg_net`, Supabase Vault; the owner pre-steps in the file (`CRON_SECRET`, Vault entries).
- **Unlocks on screen:** nothing; the tariff cron authenticates with its own secret and the two outreach schedulers are unscheduled. Chatbot prices could go stale if the tariff sync fails.
- **Rollback:** re-create the jobs from `supabase/migrations/20260819000009_pg_cron_autonomous.sql`.
- **Check** (an error only means `pg_cron` is not readable for your user):
```sql
select count(*) > 0 as applied from cron.job where command like '%x-cron-secret%';
```

## 7. `phase4/15_convert_lead_match_phone_only.sql` — data correctness (finding D1)
- **Depends on:** nothing.
- **Unlocks on screen:** «Μετατροπή» reuses an existing customer **only by phone** (last 10 digits); two people without e-mail are no longer joined to one customer.
- **Rollback:** [`rollback_phase4_15_convert_lead.sql`](rollback_phase4_15_convert_lead.sql) (the original function verbatim).
- **Check:**
```sql
select exists (select 1 from pg_proc where proname='customer_match_phone') as applied;
```

## 8. `phase2/06_trash_leads_customers.sql`
- **Depends on:** step 3 (same review).
- **Unlocks on screen:** «Διαγραφή» moves a lead/customer to the Κάδος; «Επαναφορά» (admin, manager); «Οριστική διαγραφή» (admin only, only when nothing references the record).
- **Rollback:** no file: drop the two restrictive policies, the triggers and functions; the added columns can stay (see `PENDING_MIGRATIONS.md`).
- **Check:**
```sql
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='deleted_at') as applied;
```

## 9. `phase2/07a_document_checklist_and_return.sql`
- **Depends on:** the role-model decision (who may return a case); the checklist per service needs business confirmation before live.
- **Unlocks on screen:** document gaps shown as warnings per stage (never blocking); «Επιστροφή για διόρθωση» for Back Office.
- **Rollback:** [`rollback_phase2_07a.sql`](rollback_phase2_07a.sql) (data columns stay).
- **Check:**
```sql
select to_regprocedure('public.return_case_for_correction(uuid,text,jsonb,text)') is not null as applied;
```

## 10. `phase2/07b_case_stage_guard_and_set_stage.sql`
- **Depends on:** PR #49 live (it is). Independent of 07a (either order).
- **Unlocks on screen:** «Αλλαγή σταδίου (Back Office)» becomes a working form instead of «Η λειτουργία δεν είναι ακόμη διαθέσιμη.»; direct stage writes outside the allowed list are refused.
- **Rollback:** [`rollback_phase2_07b.sql`](rollback_phase2_07b.sql) (option A, B or C).
- **Check:**
```sql
select to_regprocedure('public.set_case_stage(uuid,text,text)') is not null as applied;
```

## 11. `phase2/07c_reopen_completed_case.sql`
- **Depends on:** nothing (independent of 07a and 07b).
- **Unlocks on screen:** an admin sees «Επαναφορά ολοκληρωμένου case» on a completed case (written reason, audited).
- **Rollback:** [`rollback_phase2_07c.sql`](rollback_phase2_07c.sql) (reopened cases stay reopened; listed from `activity_log`).
- **Check:**
```sql
select to_regprocedure('public.reopen_completed_case(uuid,text,text)') is not null as applied;
```

## 12. `phase4/10_field_checkin_manual_flag.sql`
- **Depends on:** nothing.
- **Unlocks on screen:** check-in is always accepted (no 150 m refusal) with a review flag; «Check-in προς έλεγχο» in Διεκπεραίωση; the arrival prompt setting.
- **Rollback:** [`rollback_phase4_10_field_checkin.sql`](rollback_phase4_10_field_checkin.sql).
- **Check:**
```sql
select exists (select 1 from pg_proc where proname='review_field_checkin') as applied;
```

## 13. `phase4/11_customer_names.sql`
- **Depends on:** nothing.
- **Unlocks on screen:** separate «Όνομα» / «Επώνυμο» fields in the customer form (instead of one «Ονοματεπώνυμο»).
- **Rollback:** comment at the end of the file (the columns can stay).
- **Check:**
```sql
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='customers' and column_name='first_name') as applied;
```

## 14. `phase4/12_default_backoffice_assignee.sql`
- **Depends on:** the role model (who counts as «Back Office»).
- **Unlocks on screen:** the admin setting for the default Back Office assignee (Διαχείριση → Cases & Ροή); a «Lead με έγγραφα» is then routed to that user (until then it stays with its creator, who is told routing is not active).
- **Rollback:** comment at the end of the file.
- **Check:**
```sql
select exists (select 1 from pg_proc where proname='route_lead_to_backoffice') as applied;
```

## 15. `phase4/13_case_exception_state.sql`
- **Depends on:** nothing.
- **Unlocks on screen:** the exception picker on a case (offer declined, no response, unsigned, provider rejected) and the «Εξαιρέσεις» count.
- **Rollback:** comment at the end of the file (the column can stay).
- **Check:**
```sql
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='cases' and column_name='exception_state') as applied;
```

## 16. `phase4/14_follow_up_kind.sql`
- **Depends on:** nothing.
- **Unlocks on screen:** manager follow-ups are recognised by their kind instead of a text prefix.
- **Rollback:** comment at the end of the file (the column can stay).
- **Check:**
```sql
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='follow_ups' and column_name='kind') as applied;
```

## 17. `phase3/08_b2b_prospects_review_distribution.sql`
- **Depends on:** steps 1–6; then deploy the rewritten `scrape-b2b`. Needs legal review (retention, Article 11).
- **Unlocks on screen:** the B2B screen works as discover → review → distribute (no direct inserts into leads) instead of «ενεργοποιείται μετά…».
- **Rollback:** drop the new tables, functions and trigger; redeploy the previous `scrape-b2b`.
- **Check:**
```sql
select to_regclass('public.b2b_prospects') is not null as applied;
```

## 18. `phase3/09_contact_eligibility.sql` — compliance
- **Depends on:** steps 1–6 and step 17 (08). Must come before any outreach.
- **Unlocks on screen:** «Επικοινωνία & συγκαταθέσεις» works (today it shows a developer sentence); the «μπορώ να καλέσω;» answer; outreach functions fail closed until it exists.
- **Rollback:** end of the file; it drops the recorded objections, consents and screenings, so **export them first**.
- **Check:**
```sql
select to_regclass('public.contact_objections') is not null as applied;
```

## 19. `phase5/17_customer_supply_points.sql`
- **Depends on:** nothing new (uses `customers`, `cases`, `case_documents`, `profiles`, `is_staff()`, `is_role()`, `activity_log`). The legacy `supply_points` / `customer_meters` are not touched.
- **Unlocks on screen:** the **«Παροχές»** tab right after Σύνοψη in the customer folder (cards, add/edit/archive, duplicate signal and review flag, documents and cases per connection); the case hint «Επιλέξτε παροχή για αυτή την υπόθεση»; the admin tariff list (Γ1, Γ1Ν, Γ21, Γ22, Γ23).
- **Rollback:** [`rollback_phase5_17_supply_points.sql`](rollback_phase5_17_supply_points.sql) (A keeps the data, B removes everything — export first).
- **Check:**
```sql
select to_regclass('public.customer_supply_points') is not null as applied;
```

## 20. `phase5/18_lead_supply_points.sql`
- **Depends on:** step 19.
- **Unlocks on screen:** «Παροχές ρεύματος» on the lead form (both modes) and the «Παροχές» tab on the lead screen; on conversion the lead's connections move to the customer (same rows), documents keep their tags, a number the customer already has is linked, not duplicated. Works with the live and the phase4/15 `convert_lead_to_case()`.
- **Rollback:** [`rollback_phase5_18_lead_supply_points.sql`](rollback_phase5_18_lead_supply_points.sql) (A keeps the data).
- **Check:**
```sql
select exists (select 1 from information_schema.columns where table_schema='public' and table_name='customer_supply_points' and column_name='lead_id') as applied;
```

## 21. `phase4/16_import_legacy_leads.sql` — PR #79 / v2, **last**
- **Depends on:** nothing technical; best **after step 18** (so a contact with no permission record is already refused for promotional channels).
- **Unlocks on screen:** the old leads (`hlektrismos_leads`) appear in Leads: **every row except the soft-deleted ones (skipped, they stay in the old table), unassigned, original status kept in a note, no marketing consent → «not for marketing»**.
- **How:** run the read-only [`LEGACY_LEADS_IMPORT_DRYRUN.sql`](LEGACY_LEADS_IMPORT_DRYRUN.sql) first (counts only, nothing created) and look at the `skipped_deleted` line; then run the file (it creates a view and a function and **copies nothing**); then `select * from public.import_legacy_leads();` (dry run by default) and only then `select * from public.import_legacy_leads(false);`.
- **Rollback:** [`rollback_phase4_16_legacy_leads_import.sql`](rollback_phase4_16_legacy_leads_import.sql) (deletes only imported leads without a case or conversion, then the helper objects).
- **Check:**
```sql
select to_regprocedure('public.import_legacy_leads(boolean)') is not null as applied;
```

---

### Why this order
Security first (1–6): they close live findings and nothing on screen depends on them. Then the data-correctness fix (7, D1) before more leads are converted. Then workflow features that are independent of each other (8–16). Compliance (17–18) before any outreach. The new supply points (19–20) need nothing above, but 20 needs 19; the legacy import (21) goes last so that everything it lands in (leads, consent rules, the new lead-side connections) already exists.

## 22. `phase4/18_sales_own_records_scope.sql` — roles / visibility (queue item 5, security audit F-04), **after steps 19–20**
- **Depends on:** the CRM tables (`leads`, `cases`, `customers`, …) and, to cover the connections too, steps 19–20 (`customer_supply_points`) — **a table that does not exist yet is skipped, so apply this after them (or run it again afterwards; it is idempotent)**.
- **Additive:** RESTRICTIVE policies only (AND-ed with the existing ones); nothing dropped or rewritten. SECURITY DEFINER functions (conversion, routing, trash, import, duplicate signal) are unaffected.
- **Unlocks on screen:** Inside Sales and Field Sales see **only their own** leads, cases, customers, follow-ups, documents, visits and connections (own = assigned to me / created by me / I am an owner of the case). Unassigned leads are visible to Back Office / Admin only. Back Office, Manager and Admin see everything. Admin Center → Επισκόπηση shows «Ορατότητα πωλητών: Μόνο τα δικά τους».
- **Before you apply on live:** check with two real sales accounts on staging that the daily screens (Αρχική, Η εργασία μου, Leads, Cases, Πελάτες, Ημέρα μου) still show their work; `docs/ops/ADMIN_PROVISIONING.md` explains the accounts.
- **Rollback:** [`rollback_phase4_18_sales_own_records_scope.sql`](rollback_phase4_18_sales_own_records_scope.sql).
- **Check:**
```sql
select exists (select 1 from pg_policies where schemaname='public' and tablename='leads' and policyname='sales own records (restrictive)');
```


## 22b. `phase4/21_sales_isolation_completion.sql` — Stage 2A: Sales Agent isolation (security), **right after step 22**
- **Depends on:** step 22 (`phase4/18`, its `sales_owns_*` helpers) and Stage 1. Runbook: [`STAGE2A_SALES_ISOLATION.md`](STAGE2A_SALES_ISOLATION.md).
- **Unlocks on screen:** nothing visible for Back Office. Sales Agents stop seeing other agents' offers, signatures, consents, events and files, cannot reassign or verify, and RPCs refuse other agents' ids.
- **Rollback:** [`rollback_phase4_21_sales_isolation_completion.sql`](rollback_phase4_21_sales_isolation_completion.sql) (re-opens the findings).
- **Re-apply after:** any later migration that `create or replace`s `convert_lead_to_case`, `route_lead_to_backoffice`, `set_case_exception`, `case_document_blockers` or `field_sales_metrics` in `public` (it would replace the wrapper).
- **Check:** `pending_migrations_check.sql` row `phase4/21_sales_isolation_completion`.

## 23. `phase5/19_field_sales_saved_routes.sql` — multiple saved routes for Field Sales
- **Depends on:** active staff role helpers (`is_staff()`, `is_role(text)`), `profiles`, and existing `leads`, `customers`, and `cases` tables; after step 22 in this ordered runbook. Adds saved-route tables, a Back Office duplicate-review queue, a privacy-preserving boolean duplicate-signal RPC, an invoker-secured route-stop replacement RPC, plus ownership/history guards. No existing CRM rows are rewritten.
- **Unlocks on screen:** multiple saved routes per Sales Agent, route date/status/travel-mode/origin, ordered stops from CRM, existing visits or discovered public-map candidates, save/reopen/pause/resume/complete, and Back Office route reassignment. Route owner must be an active Sales Agent. Anonymous callers have no route access.
- **History safety:** a saved route with an `arrived` or `completed` stop cannot be deleted; retain it and change its status.
- **Business discovery & duplicate handling:** public OpenStreetMap/Photon candidates are never treated as a complete business directory. The duplicate-signal function returns only true/false and does not reveal the matching customer or its owner. Potential matches or failed checks enter `field_sales_duplicate_reviews`; only Back Office can approve/reject them. Approval creates a Lead only after an active Sales Agent owner is verified. Public visitors cannot read the queue or call the signal function.
- **Rollback:** [`rollback_phase5_19_field_sales_saved_routes.sql`](rollback_phase5_19_field_sales_saved_routes.sql). **Destructive:** drops saved routes/stops. Export user-created routes and stop history first; do not use for routine cleanup.
- **Check (must be true):**
```sql
select
  to_regclass('public.field_sales_routes') is not null
  and to_regclass('public.field_sales_route_stops') is not null
  and to_regprocedure('public.field_sales_replace_route_stops(uuid,jsonb)') is not null
  and to_regprocedure('public.field_sales_route_owner_allowed(uuid)') is not null
  and to_regprocedure('public.field_sales_candidate_duplicate_signal(text,text,text,double precision,double precision)') is not null
  and to_regprocedure('public.field_sales_duplicate_review_stamp()') is not null
  and to_regclass('public.field_sales_duplicate_reviews') is not null
  and exists (select 1 from pg_trigger where tgname='field_sales_protect_route_history' and not tgisinternal)
  and exists (select 1 from pg_trigger where tgname='field_sales_duplicate_review_stamp' and not tgisinternal)
  as applied;
```
- **Required staging tests:** two Sales Agents can save/reopen separate routes with 40–60+ stops; cross-agent route reads/edits are denied; Back Office can reassign only to active Sales Agents; completed visit history cannot be removed; stop replacement preserves IDs/history; duplicate signal exposes only a boolean; queue requests are requester/office scoped; only Back Office can approve/reject; failed checks never create a Lead; anonymous signal/queue access is denied. Test website intake and normal CRM screens in the same window.


## 24. `phase6/20_user_preferences.sql` — per-user preferences and private avatar bucket
- **Depends on:** `is_staff()`, `is_role(text)`, `profiles`, the `storage` schema. Additive; no existing row or policy changes.
- **Unlocks on screen:** theme, compact sidebar and home layout follow the user across devices; profile photo upload. Until applied the app keeps working from this browser's local storage and the photo button says the feature is not yet available.
- **Security:** `user_preferences` — select/insert/update own row only, no delete, anon has no access. Bucket `avatars` is private (5 policies, own folder `{user_id}/avatar.jpg`; admin and Back Office may read); the app uses signed URLs.
- **Rollback:** [`rollback_phase6_20_user_preferences.sql`](rollback_phase6_20_user_preferences.sql) (destructive for saved preferences).
- **Check (must be true):**
```sql
select to_regclass('public.user_preferences') is not null
  and exists (select 1 from storage.buckets where id = 'avatars' and not public)
  and (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars %') = 5
  as applied;
```
- **Required staging tests:** user A cannot read/write user B's row or avatar; anon denied; admin/Back Office can read (not write) avatars; a non-JPEG or other-path upload is rejected.

## 25. `phase6/21_two_role_model.sql` — exactly two account categories (supersedes phase4/17 and phase4/20)
- **Depends on:** phase2/05 (staff functions, audit table, `profiles_guard_privileged`). Replace, do not replay, 17/20.
- **Effect:** only the active `admin` (the shared Admin / Back Office login) can create, edit, (de)activate, reset or delete Sales Agent accounts and read the staff directory / audit; new accounts are `field_sales` only; `manager` / `back_office` can never be assigned again (existing rows stay, can be deactivated); an inactive account can no longer edit even its own profile row.
- **Rollback:** [`rollback_phase6_21_two_role_model.sql`](rollback_phase6_21_two_role_model.sql).
- **Check (must be true):**
```sql
select exists (select 1 from pg_trigger where tgname = 'profiles_no_new_legacy_office' and not tgisinternal)
  and pg_get_functiondef('public.staff_admin_can(uuid,text,text)'::regprocedure) like '%a.role <> ''admin''%' as applied;
```
- **Required staging tests:** the 13-point matrix with real JWTs (admin, manager, legacy back office, both sales roles, inactive agent with an old session, anon, API-key-only) through `admin-users`, the `staff_*` RPCs and direct PostgREST; audit rows written for every management action.

