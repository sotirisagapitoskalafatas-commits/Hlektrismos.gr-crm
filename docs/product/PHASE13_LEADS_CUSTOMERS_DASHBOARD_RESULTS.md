# Phase 2 of the Hlektrismos brief — leads, customers, dashboard, field outcomes, Back Office, stop ordering

Branch `feat/phase2-leads-customers-dashboard` (from `main` @ `73ef3eb`). Code and tests only: **no production change, nothing deployed.**

## What changed (in scope)

| Item | Done |
|---|---|
| **A. Leads** | «Γρήγορο lead» (name only) or «Lead με έγγραφα» in the same form. Up to 10 files are uploaded under `leads/<id>/` after the lead exists; a failed file never removes the lead. The source dropdown uses the unified source values. «Συνεργάτης» writes the existing `leads.partner`, with no commission logic. **Default Back Office assignee** is a setting that points to a user (admin-only, audited). A lead with documents is routed to that person, who is notified and sees it under «Νέα leads με έγγραφα» in Λειτουργίες, and can open and convert it. |
| **B. Customers** | Όνομα / Επώνυμο (additive columns; `full_name` kept in step). ID front and back are separate document types; a full scan or passport covers both; old uploads still count. |
| **C. Dashboard & case** | Tiles Επείγοντα · Follow Up σήμερα · Προσφορές · Υπογραφές · Νέα Cases, with real counts over loaded records. The recorded-value figure moved into the Pipeline card. «Σημερινά Tasks» has «+ Task». The case overview shows Στοιχεία επαφής, Επόμενη ενέργεια, Επόμενες ενέργειες, and an Ιστορικό tab. Offers were already only in their tab. |
| **D. Field outcomes (in code)** | «Νέο Sale» → steps: customer → documents → «Παράδοση στο Back Office». The case keeps its id; the field agent stays the originator; Back Office ownership goes to the default assignee. «Follow-up από υπεύθυνο» → a follow-up flagged `kind = manager`, assigned to the default assignee, listed under «Follow-ups για υπεύθυνο» in Λειτουργίες. Required reasons for «Χωρίς πώληση» and «Δεν ενδιαφέρεται». |
| **E. Back Office queue** | New filters «Από Sales» and «Εξαιρέσεις». **A new status was needed:** `cases.exception_state` (offer declined, no response, unsigned, provider rejection) with a required note, audited, never moving or closing the case. «Missing information» reuses «Επιστροφή για διόρθωση». |
| **F. Stop ordering** | `lib/routing/ordering.ts` — a `StopOrderingProvider` interface. Two local providers: `scheduled` (the order the route panel already used, which is **by visit time**, not nearest-first as I said earlier) and `nearest` (straight-line greedy). The provider is chosen with `VITE_STOP_ORDERING`. No paid provider or key. Replacing the public OSRM route-line server belongs to the same provider decision. |

**Not built (change request / owner decision):**
- change request: saved daily routes, ownership approvals, multiple supply points, global custom fields;
- owner decision: renaming stages to the 8 labels, case type values.

## Manager follow-ups: flag instead of text (item 5)
Done cheaply: staged `phase4/14` adds `follow_ups.kind`. The app sends `kind = manager` once the column exists, and the migration also flags older rows that carry the prefix. Until 14 is applied, the queue falls back to the text prefix «Follow-up από υπεύθυνο». That fallback has two risks: editing the reason text would drop a follow-up from the queue, and someone typing that prefix by hand would add one.

## «+ Task» limits (item 6)
A follow-up must belong to a case (`follow_ups.case_id` is `NOT NULL`), so «+ Task» **cannot** do these:
- create a free-standing to-do with no customer (e.g. «call the provider about commissions»);
- create a task for a **lead** that has not been converted to a case yet;
- create a task for a customer without an active case;
- create a team task with no customer.

It also has no recurrence or checklist. It only picks among **active** cases the user can see. Lifting these limits needs a separate tasks table, or making `case_id` nullable and adding `lead_id`/`customer_id` (additive) — not done.

## Assumptions about the live database (not verified)
- `leads.partner` exists (base migration `20260908180001`).
- Staff may insert `app_notifications` for another user (used by the Νέο Sale handover) and read `crm_settings`.
- `follow_ups.case_id` is `NOT NULL` (base migration).
- «Από Sales» = a case whose next action starts «Παραλαβή από Sales», **or** a case in Αίτηση/Υπογραφή that already has a Back Office owner. This is a convention over existing fields.

## SQL to apply by hand (staging first, then production) — all not applied

| Order | File | Additive? | Until applied |
|---|---|---|---|
| 1 | `phase2/07_case_return_and_document_gates.sql` | Adds tables, functions and a trigger; changes no data. **Not purely additive in behaviour:** it starts enforcing the allowed stage-transition list on direct writes (the UI already uses the same list). Documents only warn. | No missing-documents list in the stage dialog; the gate setting says «ενεργοποιείται…»; return for correction is unavailable. |
| 2 | `phase4/10_field_checkin_manual_flag.sql` | Adds columns and a setting; **replaces** the live `field_checkin()` function (behaviour: accept + flag instead of reject). | The live check-in still rejects >150 m or no GPS; the labelled «χωρίς GPS» note is offered; «Check-in προς έλεγχο» is hidden. |
| 3 | `phase4/11_customer_names.sql` | Yes (nullable columns). | Single «Ονοματεπώνυμο» field. |
| 4 | `phase4/12_default_backoffice_assignee.sql` | Yes (functions plus one settings row when set). | The assignee card says «ενεργοποιείται…»; leads with documents stay with the creator, who is told. |
| 5 | `phase4/13_case_exception_state.sql` | Yes (nullable columns plus a function). | The exception picker shows «ενεργοποιείται…»; «Εξαιρέσεις» counts only returned cases. |
| 6 | `phase4/14_follow_up_kind.sql` | Yes, plus it **fills nulls** on existing manager follow-ups. | The text-prefix fallback is used. |

The other staged files (phase1 01–04, phase2 05–06, phase3 08–09) are still pending as before.

## Validation (local)

| Check | Result |
|---|---|
| `npm test` (unit + PGlite) | **148 / 148** |
| Type errors | 17 (unchanged) |
| Lint | 281 / 32 (unchanged) |
| Build | OK |
| Screen-test suite (`npm run qa:ui`, mock backend) | **219 / 219** |

New screen sections:
- **2i** lead + documents → Back Office assignee;
- **2j** «+ Task» and the dashboard tiles;
- **13** Νέο Sale handover, manager follow-up, «Από Sales», the case exception and «Εξαιρέσεις».

**Found by these tests and fixed:** a «Νέο Sale» case handed over while still in a sales stage (e.g. Προσφορά) did not appear in the Back Office queue at all, because the page only listed Back Office stages. Cases handed over from Sales now appear whatever their stage; closed cases are still excluded.

**Test-harness fixes (no app change):**
- the mock now returns one object for `.single()`, as the real database does;
- the mock applies the `follow_ups.status` default;
- closed browser profiles are deleted during the run. The disk filled up mid-run once: there was **0 GB** free before cleanup, 0.7–2 GB after.

The mock backend has no real permission rules (RLS).
