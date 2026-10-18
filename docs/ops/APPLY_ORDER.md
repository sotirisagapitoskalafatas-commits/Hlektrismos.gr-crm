# Apply order — every staged SQL file not yet on live

**One list, in the exact order to run them.** 21 files, security first, ending with the supply points (phase5/17, phase5/18) and then the legacy-leads import (phase4/16, PR #79 and its v2).
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
- **Decide before steps 3 and 9:** the role model (`docs/product/ROLE_MODEL.md`); both are written for the current five roles. The master prompt v3 (PR #91) describes two roles; that is **not started** and needs your go-ahead.

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

## 3. `phase2/05_staff_admin_and_role_preview.sql` — security
- **Depends on:** the role-model decision (see above); then deploy `admin-users`.
- **Unlocks on screen:** no more self-promotion to admin; user management (Χρήστες & Ρόλοι) becomes editable; managers can no longer read credential rows in `crm_settings`.
- **Rollback:** header of the file and `supabase/staged-migrations/phase2/README.md` (drop the trigger `profiles_guard_privileged`, the new functions and tables; re-create `crm_settings_admin_all`).
- **Check:**
```sql
select exists (select 1 from pg_trigger where tgname='profiles_guard_privileged') as applied;
```

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
