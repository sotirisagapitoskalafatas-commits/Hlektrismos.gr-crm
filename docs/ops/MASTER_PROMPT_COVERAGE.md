# Master prompt v3 — coverage (`docs/product/ATLAS_MASTER_PROMPT.md`, PR #91)

Written 18/10/2026 from the code on `main` (commit after #92), not from memory: the facts below were read from `src/`, `supabase/` and `docs/`.
**Status words:** **done** (in the code and covered by tests; works on live today) · **built-waiting-for-SQL** (code and staged SQL exist and are tested locally; not applied, so the screen shows the neutral sentence) · **partial** (some of it exists) · **not started** · **paid-waiting** (needs the client's written approval; **not to be built until the owner says so**: §4 routes/map/check-in, §5.2 duplicate approval queue, §6.3 custom fields).
Nothing here has been verified against the live database. Where a PR number is unknown to me from the repository, I name the file instead.

| § | Requirement | Status | Covered by | What is missing |
|---|---|---|---|---|
| 0 | Working rules | done (process) | every PR is small, stacked, staged SQL only, nothing applied | — |
| 1 | Phase-one audit | done | `docs/product/PHASE_ONE_AUDIT_AND_PLAN.md` (#68, #74), `docs/audit/*`, `docs/ops/PENDING_MIGRATIONS.md` | live-database checks need you: `docs/ops/pending_migrations_check.sql`, `LEAD_CREATION_CHECK.sql` |
| 1.1 | Lead-creation root cause | done in code | #44: the form sent `first_name`/`client_contact` as null into NOT NULL columns; fixed in `src/lib/lead-payload.ts`; regression `supabase/tests/lead-create.test.mjs`, `lead-check.test.mjs`; live grid (18/10) confirmed the two NOT NULL columns | **not yet confirmed on live after #44:** no Inside Sales lead exists since the fix — ask one user to create a test lead and rerun items 9/10 of the check |
| 1.2 | Program optional at lead creation | done | quick lead is name-only; provider/program optional in the form (`LeadsPage.tsx`, `ProviderProgramPicker`) | — |
| 2 | Exactly two roles (Admin/Back Office, Sales Agent) | **partial** | today `Role` has five values (`src/lib/roles.ts`: admin, manager, inside_sales, field_sales, back_office); staged `phase2/05` staff-admin matrix; `docs/product/ROLE_MODEL.md` | the **mapping** (queue item 5): admin/manager/back_office → Back Office/Admin, inside_sales/field_sales → Πωλητής in the admin UI and permissions; DB roles kept |
| 2.1 | Shared Admin/Back Office account | partial | nothing in the code prevents a shared login; attribution is the account's id (`staff_admin_audit`, `activity_log`) | **Both work with no code change**: an admin creates one account per person (or one shared account) with the same screen; `ADMIN_PROVISIONING.md` says so; the audit log records the account that acted (queue item 4, PR #98) |
| 2.2 | Sales Agent accounts, attribution | partial | `created_by_user_id`, `assigned_to_user_id`, `owner_id`, `inside_sales_owner`, `field_sales_owner`, visit user; originator kept on handover (`src/lib/field-handover.ts`) | **Staged, not applied:** `phase4/18` makes Inside/Field Sales see only their own leads/cases/customers (RLS was staff-wide `is_staff()`); the admin screens show the two groups «Back Office / Admin» and «Πωλητής» as a mapping over the five roles (queue item 5) |
| 2.3 | Approval ownership | partial | manager follow-ups reach Back Office (`ManagerFollowUps.tsx`, staged `phase4/14` kind); document/stage control for Back Office | duplicate/ownership approvals = **paid-waiting** (§5.2) |
| 2.4 | Admin-only account provisioning | **partial** | edge function `supabase/functions/admin-users` (create invite/temporary password, delete; JWT verified, role read from `profiles`, matrix in `_shared/staff-admin.ts`); staged `phase2/05` (`staff_update`, `staff_set_active`, audit `staff_admin_audit`, self-promotion trigger); screen `src/components/admin/StaffAdmin.tsx`; no sign-up screen in `LoginPage.tsx` | **Done in PR #98:** admin-only matrix (TS + staged `phase4/17`), reset-password e-mail action, refusal tests (manager / inside / back office / sales get 403), live read of the provider's `disable_signup` flag. Left to you: switch public sign-up off in the Auth dashboard if the Security tab says «Χρειάζεται ενέργεια» |
| 3.1 | Five visit outcomes | done | `src/lib/field-day.ts` `OUTCOMES`: Νέο Sale, Ενδιαφέρεται, Υπογραφή/έγγραφα, νέα επίσκεψη, Follow-up από υπεύθυνο, Χωρίς πώληση (+reasons), Δεν ενδιαφέρεται (+reasons), Ο πελάτης δεν βρέθηκε; `MyDayPage.tsx` | wording of «No contact / decision-maker absent» is «Ο πελάτης δεν βρέθηκε»: add «Απών ο υπεύθυνος» as a reason/branch |
| 3.2 | Configurable outcomes, reasons, branches | **not started** | outcomes and reasons are code constants ("the owner may change them later", `field-day.ts`) | a settings list (outcome label, reason list, next step), editable by Back Office/Admin, stored in `crm_settings`-style JSON (no migration per reason) — staged SQL only if a table is genuinely needed |
| 3.3 | Follow-ups: reason, responsible agent, due date, in the task list, escalation | partial | `follow_ups` table and pages (`FollowUpsPage.tsx`, My Work), date asked after the outcome, manager follow-up → Back Office queue | the follow-up created from an outcome must **name the responsible agent and reason** explicitly and appear in the agent's day; check against `MyDayPage` |
| 3.4 | Branch model, no second lead per visit | partial | handover keeps originator; a visit never creates a lead (`field-handover.ts`) | follow-up → later branch to New Sale / No Sale etc. as configured (3.2) |
| 4 | Daily routes, map discovery, check-in | **paid-waiting** (parts exist) | exists today: My Day route panel with provider-based ordering (`src/lib/routing/*` OSRM/ORS/haversine), external navigation links (`src/lib/maps/navigate.ts`), manual check-in/out (`field_checkin`, staged `phase4/10` for the review flag) | **saved routes per date, map-discovered candidates, team routes, reassignment: not built, waiting for approval** |
| 5.1 | Duplicate matching and warnings | partial | supply-number duplicate signal on connections and leads (#80–#88, staged `phase5/17–18`); lead→customer match by phone only (staged `phase4/15`, D1) | business-level duplicate warnings across agents depend on §5.2 |
| 5.2 | Duplicate/ownership approval queue | **paid-waiting** | — | the whole queue |
| 6.1 | Standard customer information | done / waiting | customer folder (#61–#65, #71): name, contact, address, documents with `id_front`, `id_back`, bill, `meter_photo`, E9 (`src/lib/documents.ts`); staged `phase4/11` first/last name | live needs `phase4/11` for the split name fields |
| 6.2 | Multiple supply points | **built-waiting-for-SQL** | #80–#84 (customer), #85–#88 (lead, conversion), #89 (case hint); staged `phase5/17`, `phase5/18`; PGlite 11 + 13 tests | apply `phase5/17`, then `18` |
| 6.3 | Global custom fields | **paid-waiting** | — | everything |
| 6.4 | Provider/tariff-specific fields | not started (depends on 6.3) | tariff category list exists (`tariff_categories`) | provider-specific fields |
| 7.1 | Document checklist, warnings only | done in the app / built-waiting-for-SQL for per-stage levels | `src/lib/documents.ts` `buildChecklist`; stage warnings; staged `phase2/07a` (levels per stage, never blocking, «Μπλοκάρισμα» removed) | apply `07a`; the checklist **per supply point** is not built (documents link to a connection, #83) |
| 7.2 | Sensitive file security | partial | private bucket, short-lived signed URLs (`getLeadFileUrl` 1 h), upload type/size checks (`upload-files.ts`); staged `phase1/16` storage lockdown | server-side file-type check beyond the client; `phase1/16` not applied (queue item 3) |
| 8 | Back Office: non-linear stages, exceptions | built-waiting-for-SQL / partial | stage control (#72, staged `07b`), reopen (#77/#78, `07c`), return for correction (#75, `07a`), exception state (staged `phase4/13`), Back Office queues (`BackOfficePage.tsx`, Διεκπεραίωση) | apply `07a/b/c`, `13`; "awaiting response/missing documents" as a parallel state: partial (follow-ups); exception reason lists are code constants (see 3.2) |
| 9 | Lead / business / customer / supply-point relationships | done | `cases.lead_id`, `customer_id`, `supply_point_id`; conversion moves lead connections (staged `18`) | "business" entity is the customer/lead today (no separate table) |
| 10 | UX redesign (sidebar, dashboard, Lead/Customer screens) | **partial** | unified folder tabs (Part B), dashboards per role (`src/components/dashboards/*`), shells (`src/components/shells/*`) | queue items 6, 7, 8: one folder layout for Lead/Case/Customer, sidebar grouping and shorter labels, full-width dashboard, phone layout |
| 11 | Persistence and migration policy | done (process) | every DB change is a staged additive file with rollback and PGlite tests | — |
| 12 | Tests | partial | unit 288, screen suite 368, PGlite files per staged SQL; gate at baseline (types 15, lint 281/32) | live-database and real-RLS tests: not possible here |
| 13–14 | Sequence, final report | done (process) | one summary at the end of the queue | — |
| 15 | Architecture audit | partial | `docs/product/PHASE_ONE_AUDIT_AND_PLAN.md`; this table | a code→DB→policy traceability table (queue, with the security audit) |
| 16 | Frontend standards | partial | shared `SupplyFields`, `Btn`/`Card` primitives, double-submit guards | redesign pass (queue 8) |
| 17 | Design system, responsive checks (§17.7) | partial | atlas-ux tokens (`src/styles/atlas-ux.css`) | screenshots at the §17.7 sizes (queue 8) |
| 18 | Backend, API, integrations | partial | edge functions list (`supabase/functions/*`), staged RLS files | integrations inventory table (security audit) |
| 19 | Business flows | done / waiting | lead without program, handover, supply-point relationships | routes and approvals (paid) |
| 20 | Change control, SQL rules | done (process) | staged files, `docs/ops/APPLY_ORDER.md` (#92) | — |
| 21 | Security and RLS | **partial** | `docs/audit/SECURITY_AUDIT.md`, `docs/ops/SECURITY_LIVE_FINDINGS.md`, staged `phase1/01`, `phase1/16`, `phase2/05`; PGlite RLS tests (`rls.test.mjs`, `website-intake-hardening.test.mjs`, `storage-docs.test.mjs`, `staff-admin.test.mjs`) | a fresh code-level review of every policy/function/edge function, secrets search incl. git history, anonymous/sales read-write matrix (queue item 3) → `docs/ops/SECURITY_AUDIT.md` |
| 22 | Role and account acceptance criteria | partial | see 2 and 2.4 | see 2 and 2.4 |
| 23 | Source-code delivery | done (process) | PRs #44 … #92 | — |

## Gaps to build (everything except the paid items), in the order of the owner's queue
1. Legacy import: soft-deleted rows skipped.
2. `docs/ops/STAGING_APPLY_SCRIPT.md`.
3. Security audit (`docs/ops/SECURITY_AUDIT.md`) and its code fixes; SQL fixes staged.
4. Admin-only account provisioning (reset/invite, two-role chooser, refusal tests).
5. Two-role mapping + own-records visibility for sales (staged SQL; neutral message until applied).
6. One folder layout for Lead, Case and Customer.
7. Rename «Λειτουργίες».
8. Redesign pass (§10, §17).
9. §3 configurable outcomes/reasons/branches and the follow-up fields; §7 per-stage checklist (warn only); §8 remaining Back Office parts.
