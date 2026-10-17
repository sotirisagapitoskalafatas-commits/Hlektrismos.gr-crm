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

---

# 06 — «Κάδος» for leads and customers (NOT applied)

`06_trash_leads_customers.sql` — owner decision 14/10/2026: trash + admin-only permanent delete.

- **Διαγραφή** (admin, manager) moves a lead/customer to the trash (`deleted_at/by/reason`). A RESTRICTIVE row policy hides trashed rows from every other role. A customer with open cases cannot be trashed.
- **Επαναφορά** (admin, manager) restores it unchanged.
- **Οριστική διαγραφή** (admin only) only from the trash and only when no other row references the record (cases, consent records, …, including tables that would otherwise cascade). It returns the lead's website-attachment paths; the admin's browser removes them from Storage (new admin-only delete policy on `hlektrismos_docs`).
- The trash columns can only be changed through these functions (trigger). Every action is written to `activity_log` with the actor; the purge entry keeps ids only, no personal data.
- Local evidence: `node --test supabase/tests/trash.test.mjs` — 6/6.
- Apply after 05 (independent, but same review). Rollback: drop the two restrictive policies, the triggers and functions; the added columns can stay (null).

---

# 07a / 07b — Case workflow (NOT applied)

The former single `07_case_return_and_document_gates.sql` is split in two independent files (owner decision of 17/10/2026). Either can be applied alone, in either order, and twice. The former file is kept only as a test fixture (`supabase/tests/fixtures/phase2_07_former.sql`) to prove the upgrade path.

## `07a_document_checklist_and_return.sql`
- **Document checklist — warnings only. There is no blocking mode and no override** (master prompt §7: missing documents never block; the «Μπλοκάρισμα» option was removed on the owner's approval). Missing, rejected or unverified documents are listed in the case checklist and the stage dialog; a stage change or a handover to Back Office is never refused. `case_document_blockers(case, stage)` stays as an informational function.
  - Requirements and levels live in `document_requirements` / `stage_document_gates` (`document_check` = received; `submitted` / `activation` / `completed` = verified), seeded from the app's indicative checklist. They **need business confirmation per provider/service before production**.
- **Επιστροφή για διόρθωση:** `return_case_for_correction` — Back Office/admin/manager, only in Back Office stages, reason ≥ 10 + at least one item, to Inside or Field Sales. Same case and stage; responsibility moves to the team owner (managers notified when nobody is assigned). `resubmit_returned_case` hands it back. Both are audited.
- **If the former 07 was already applied on staging:** this file sets any gate left on `block` back to `warn` and drops `set_stage_gate_mode` and `change_case_stage_override`. The column `stage_document_gates.mode`, if present, stays (nothing reads it).
- Rollback: `docs/ops/rollback_phase2_07a.sql` (data columns stay).

## `07b_case_stage_guard_and_set_stage.sql`
- **Allowed moves** (`case_stage_transitions`) = the app's matrix (`STAGE_TRANSITIONS`), enforced for **direct** writes by signed-in users (trigger on `cases.current_stage`). Sales roles work inside this list. The guard no longer looks at documents.
- **`set_case_stage(case, stage, reason)` — «Αλλαγή σταδίου από Back Office»:** Back Office, admin and manager (the roles that hold `create_application` in the app; a test keeps the two lists equal) may move a case to **any other stage**, with a written reason (≥ 10 characters). Audited on the timeline (`stage_set`) and in `activity_log` with the actor.
  - **Owner decisions in the function, each one line to change:** a completed case is final; a case is completed only from «Ενεργοποίηση».
  - **Columns:** like the app's `changeStage` — completed → `status = 'completed'`, `activation_status = 'active'`; lost / cancelled → `status = 'lost'`; leaving lost / cancelled → `status = 'open'`.
- Edge functions using the service role are not affected by the trigger (trusted server paths).
- **Impact when applied:** direct stage writes outside the list are refused (the app already prevents them, PR #49). Nothing about documents changes.
- Rollback: `docs/ops/rollback_phase2_07b.sql`, option A, B or C.

## Local evidence (PGlite, not staging)
`node --test supabase/tests/case-workflow.test.mjs supabase/tests/stage-jump.test.mjs supabase/tests/stage-set.test.mjs` — 9 + 7 + 8. Includes: a role × from × to matrix (605 combinations) against an independent statement of the rule, the same for direct writes, the SQL role list equal to the app's, seven apply orders, and the upgrade from the former 07.
