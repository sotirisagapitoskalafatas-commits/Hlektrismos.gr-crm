# Field Visits and Applications: security review and evidence

Companion of [`FIELD_VISITS_AND_APPLICATIONS.md`](FIELD_VISITS_AND_APPLICATIONS.md). Written from the repository, **not from the live database** (the Supabase connector refused read access; `docs/ops/FIELD_APPLICATIONS_LIVE_CHECK.sql` is the read-only script the owner runs to close that gap).

## 1. What was tested where

| Claim | Implemented in code | Local unit / source tests | Isolated database (PGlite) | Authenticated app | Production |
|---|---|---|---|---|---|
| Visits without a Case; no-show; reschedule link; reasons | yes | yes | **yes** (23 tests) | no | **no** |
| Check-in / check-out with no Case, idempotent, NOT_OPEN | yes | yes | **yes** | no | **no** |
| Ownership, cross-agent isolation, duplicate signal, ownership requests | yes | yes | **yes** | no | **no** |
| Application lifecycle, drafts, versioned documents, submit → one Case | yes | yes | **yes** (18 tests + 81-pair parity) | no | **no** |
| Storage: read / write own application files only, no deletes | yes | n/a | **yes** (policy functions and `storage.objects` stand-in) | no | **no** |
| Rollbacks keep data and are re-appliable | yes | n/a | **yes** | no | **no** |
| Screens (wizard, visit panel, scheduler, detail, queue, Customer 360) | yes | yes (21 + 8) | n/a | **driven in a browser against an in-memory fake backend**, synthetic data; never the real signed-in app | **no** |
| Merge-safety: nothing changes before the SQL is applied | yes | yes (probes, "not installed" tests) | n/a | no | **no** |

Nothing here is "verified in Production". The gate (`final-state-role-isolation.test.mjs`) now replays phase7 as steps 30 and 31, and all 23 of its isolation checks still pass with them applied.

## 2. Findings

**F-1 (fixed in the design).** `follow_ups.case_id` and `timeline_events.case_id` are NOT NULL: a "follow-up required" outcome on a visit with no Case was impossible. `phase7/01` makes `follow_ups.case_id` nullable and anchors a follow-up to a lead, customer or visit; standalone events go to `activity_log`. `timeline_events` is deliberately left case-bound.

**F-2 (fixed in the design and hardened in this branch).** `field_checkin` / `field_checkout` keep their existing signatures and work without a Case; standalone events go to `activity_log`, while case-bound behaviour remains aligned with `phase4/10`. Structured standalone outcomes use the separate `field_checkout_with_outcome` SECURITY DEFINER transaction: it locks the visit, performs check-out and stores the structured outcome atomically, accepts same-result retries, and refuses a different result. The guard also blocks authenticated direct inserts/updates of `outcome_key` / `outcome_reason`, so clients cannot bypass the atomic operation. Applying `phase7/01` still requires `phase4/10`; the manual check-in policy remains accepted-and-flagged, not the older geofence refusal.

**F-3 (fixed in the design).** Storage access follows `case_documents` (`phase4/21`). Application files would have been unreadable to agents, or exposed if loosened. `phase7/02` extends `sales_can_read_object` / `sales_can_write_object` with an application branch (all earlier branches kept; a test calls the old branches) and adds a RESTRICTIVE delete policy: nobody signed in can delete `client_documents/applications/…` (history is evidence; `service_role` is unaffected).

**F-4 (fixed).** `sales_owns_entity` returned false for unknown entity types, which would have hidden new audit rows from their owner. Extended with `visit` and `application`, all `phase4/18` branches preserved (tested).

**F-5 (found by the test, fixed).** Supabase's default privileges grant `DELETE` on every new public table to `authenticated`. The new tables revoke first, then grant only what is needed; a test asserts it. `case_visits` keeps its historical grant but a guard trigger refuses any direct delete (`field_checkins` cascades on visit delete: the check-in audit would have been erasable).

**F-6 (found by the test, fixed).** A NULL-safe comparison bug in `add_application_document` let a document be attached to another customer's supply point when the application had no lead. Fixed and covered.

**F-7 (found by the parity test, fixed).** The screen did not offer Back Office "withdraw" on a draft although the database allows it. The 81-pair test now keeps the screen and the guard identical in both directions.

**F-8 (found during branch handover and fixed).** Submitting an Application from an already-converted Lead could reuse its Case without confirming that the Case matched the Application service and ownership, or overwrite a Case already linked to another Application. Converted-Lead Applications also needed a narrowly scoped path to select Customer-owned supply points and documents after conversion. Phase 7/02 now reuses only a matching, unclaimed Case; otherwise it creates a separate Case without changing the old Case or the Lead's conversion pointer. It uses the selected Application service, resolves converted-Lead supply ownership through the converted Case, scopes duplicate-supply repointing to this Application's linked records, and returns the original Case on a valid submission retry. Withdrawn/rejected Applications remain closed. PGlite regression tests cover the converted-Lead/document path and non-overwrite behaviour.


## 3. Residual risks and limitations (not hidden)
1. **Live schema unread.** Constraint names, existing policies, the `client_documents` bucket (MIME / size limits, permissive policies are dashboard-defined) and which staged files are live are **unverified**. Run `FIELD_APPLICATIONS_LIVE_CHECK.sql`.
2. **Guards bind direct client writes.** They test `current_user = 'authenticated'`; the SECURITY DEFINER operations (check-in, submit, request documents, ownership decision, audit) run as the owner by design. Each checks the caller (`is_staff`, `is_role('admin')`, `sales_owns_*`, or `auth.uid()`); the gate's tripwire lists none as unreviewed.
3. **Minimal disclosure by the duplicate signal.** For another agent's records `field_prospect_matches` returns only `{kind, id, owned_by_other}`, but an agent can still learn *that* a lead with a given phone exists. Accepted: it is the point of the duplicate check; no name or phone is returned.
4. **Ownership requests cover leads only.** A customer's owner is derived from its cases and creator, so a customer transfer has no equivalent single field to change.
5. **No timeline of audit events in the UI.** `activity_log` has no permissive read policy for signed-in users (only a restrictive one), so the screens do not show an application / visit history feed; Back Office reads status, reasons and dates from the rows. Surfacing the audit needs a reviewed read function: not done.
6. **Shared Admin login.** Audit rows record the shared profile as `actor_id`. The screens say so; no individual office employee is ever named.
7. **NOT VALID constraints** (`case_visits_anchor`, `case_visits_prospect_shape`, `follow_ups_anchor`) protect new and updated rows only; validating them against legacy data is a separate, reviewed step.
8. **Offline.** Check-in and standalone check-out (visit ID, position, controlled outcome/reason and short notes) are queued and replayed idempotently. Transient RPC errors retry; cancelled/missing visits and outcome conflicts are dropped and reported. Outcomes requiring a follow-up stay open while offline, since the follow-up write is online-only. Prospect creation, Application drafts and documents are online-only; sensitive identity files and prospect details are not queued.
9. **Application → Case.** Submission creates or safely reuses one primary Case at stage «Νέο» like every conversion; only an unclaimed Case with matching service and supply can be reused. An already-claimed or mismatched converted-Lead Case is not overwritten: a separate Case is created for the new Application. Same-submission network retries return the original Case; withdrawn/rejected Applications remain terminal.
10. **Not built:** a screen for editing the service-type list (the table is admin-editable in SQL / the Dashboard), a "ready to visit" geofence (derived from time only), photographs on visits, reassigning a visit from the UI (the database allows Admin to), and Learning Centre guides for the new screens.
