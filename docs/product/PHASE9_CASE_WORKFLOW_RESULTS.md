# ATLAS CRM — Server-enforced case workflow: document gates & Back Office return

Branch `feat/case-return-doc-gates` (from `main` @ `2c55442`, PR #40 merged). **No production change made** — the server part is `supabase/staged-migrations/phase2/07` (not applied; see its README section).

## What changed
| Area | Behaviour |
|---|---|
| Stage change | The dialog asks the server what blocks the move and lists it («Ταυτότητα ή διαβατήριο — λείπει», «… — δεν έχει ελεγχθεί»). A refused save now shows the reason instead of a generic failure (`updateCase` no longer swallows errors). |
| Document gates (server) | Entering «Έλεγχος εγγράφων» needs every required document received; «Καταχώρηση παρόχου», «Ενεργοποίηση», «Ολοκληρώθηκε» need them verified. Enforced by a database trigger for every browser write — not by disabled buttons. |
| Allowed transitions (server) | Same matrix as the app, enforced for browser writes. |
| Override | Διαχειριστής / Διευθυντής only, reason ≥ 10 characters, recorded on the timeline with the skipped blockers and in the audit log. |
| Επιστροφή για διόρθωση | Back Office (and admin/manager) in a Back Office stage: reason + at least one missing/incorrect item, to Inside or Field Sales (missing signature → Field Sales by default). Same case and stage; responsibility and «Επόμενο βήμα» move to that team's owner, who is notified (managers if nobody is assigned). Banner on the case; Λειτουργίες shows «Επιστράφηκε για διόρθωση σε …». |
| Επανυποβολή | The receiving team/person (or admin/manager) hands it back to the Back Office owner, who is notified. |

## Validation (local)
| Check | Result |
|---|---|
| `npm test` | **103 / 103** (+8 PGlite tests for 07, +2 return/err unit tests, +1 ops-queue test) |
| Quality gate | 18 / 281 / 32 — unchanged |
| `npm run qa:ui` (mock mirrors the rules; no real RLS) | see PR |

## Needs business confirmation
- The required-document list per service and the gate levels (seeded from the app's indicative checklist).
- Whether an e-signature route should skip the Field Sales signature step.
