# Stage 2A: Sales Agent record isolation (staged; not applied anywhere)

**Status:** staged SQL with local tests. **Not applied** to staging or production. Nothing is deployed.
**Prerequisites:** Stage 1 (`STAGE1_EMERGENCY_DB_HARDENING.md`), revocation of the exposed service key, and APPLY_ORDER steps 3–22, in particular `phase4/18`.
**Roles:** unchanged. «Admin / Back Office» means admin, manager and back_office; «Πωλητής» means inside_sales and field_sales. No third role is introduced. The shared Back Office login can't tell individual employees apart; RLS can't fix that.

## What `phase4/21` adds on top of `phase4/18`
| | Gap left by phase4/18 (reproduced locally) | Fix |
|---|---|---|
| A | Sales Agent A could read and change Agent B's **offers, signatures, consent records, check-ins, events, work items** and contact consents and objections. Every sales account could read the **legacy** tables: private notes, call recordings and transcripts, emails, commissions, customer documents. | RESTRICTIVE row policies: own case, own customer, own lead, or "mine". The legacy tables are tied to `hlektrismos_leads`, so ownership can't be resolved there; they become Back Office only for sales. The live app doesn't read them, and Edge Functions use the service role. |
| B | A Sales Agent could **hand their own lead to another agent**, or move ownership fields on cases and customers. | A trigger refuses changes, by a Sales Agent, to `leads.assigned_to_user_id` / `created_by_user_id`, `cases.owner_id` / `inside_sales_owner` / `field_sales_owner` / `back_office_owner` / `next_action_owner_id` / `created_by` / `customer_id` / `lead_id`, and `customers.created_by`. On insert, an agent may only name themself. |
| C | A Sales Agent could **verify a document**, and the app sent `verified_by` from the browser, so anyone could forge the reviewer. | A trigger: Sales Agents can't change a document's status or verification. For every browser user, `verified_by` and `verified_at` are set **by the database** (`auth.uid()`, `now()`). |
| D | Every sales account could open **every file** (`hlektrismos_docs`, `client_documents`, `energy-bills`). | RESTRICTIVE storage policies. `leads/<own lead>/…`; `contact-forms/…` only when it is attached to an own lead (`leads.attached_files`) or filed on an own case (`case_documents.file_url`); `client_documents` objects filed on an own case. Uploads only into an own lead folder (case uploads stay allowed because their names carry no case id). `energy-bills` is closed to sales. |
| E | **SECURITY DEFINER RPCs ignored ownership.** Locally, Agent A converted Agent B's lead (`convert_lead_to_case`), routed it to Back Office (`route_lead_to_backoffice`), set an exception on B's case (`set_case_exception`), and read B's checklist (`case_document_blockers`) and metrics (`field_sales_metrics`). | Each original moves **unchanged** into a `private` schema that the API doesn't expose. A SECURITY INVOKER wrapper with the same name, arguments and result stays in `public` and refuses another agent's id. Calls from the service role and from other SECURITY DEFINER functions pass through. |

Back Office and the service role are unchanged.

## Tests (local PGlite: the real migration chain + Stage 1 + every later staged file)
`supabase/tests/stage2a-sales-isolation.test.mjs`, 13 tests:
- **BEFORE:** the A–E gaps reproduced.
- **APPLY:** twice.
- **AFTER:**
  - Agent A sees only their own records and files.
  - Agent A can't change or add to Agent B's records by id, payload or folder.
  - Agent A's own work, uploads and new leads still work.
  - No reassignment, no ownership rewrite.
  - Verification is Back Office only, and the reviewer comes from the database.
  - The RPCs refuse B's ids but work on A's own (conversion, routing, checklist, metrics).
  - Back Office reads everything, reassigns, and acts on any case.
  - The service role is unaffected.
  - `sales_scope_status()` lists the new tables.
- **ROLLBACK:** the rollback script restores the earlier behaviour, and the file then re-applies.

## Needs confirmation before applying
1. **`client_documents` bucket policies on live.** No migration creates the bucket. The test assumes the most open plausible case, every active staff account. Run: `select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='storage' and (qual like '%client_documents%' or with_check like '%client_documents%');`
2. **`private` schema is not exposed by the API:** Dashboard → Settings → API → Exposed schemas must not include `private`.
3. **Sales Agents on the legacy tables.** After this, no sales account can read `lead_notes`, `voice_calls`, `crm_emails`, commissions, or `customer_documents`/`customer_meters`. The live app's screens don't use them; confirm nothing in the field workflow does.
4. **Contact-form files filed on a case** are matched by `case_documents.file_url = 'hlektrismos_docs/<path>'` (`src/lib/lead-files.ts`).
5. **Order:** apply right after `phase4/18` (APPLY_ORDER 22b). If a later migration redefines one of the five RPCs in `public`, re-apply this file.
6. **The app keeps sending `verified_by`.** The database now overrides it, so no app change is required for correctness.

## Procedure, rollback, remaining risks
- **Procedure:** staging first, with a backup, then the check row in `pending_migrations_check.sql`. Smoke test with two Sales Agents and one Back Office user:
  - each agent sees only their own leads, cases, documents and files;
  - conversion and routing still work on their own leads;
  - Back Office verifies a document, and the reviewer is Back Office.
- **Rollback:** `docs/ops/rollback_phase4_21_sales_isolation_completion.sql` (tested). It re-opens the findings.
- **Remaining risks:**
  - The Edge Functions still use the service role with no per-lead checks (Stage 2B).
  - `client_documents` uploads by sales are allowed into `cases/` because the names carry no case id. Reading them back is limited.
  - The legacy tables still exist with permissive policies for office roles.
  - The `field_sales_routes` and B2B queues follow their own role rules (phase5/19, phase3/08), not these.
