# ATLAS CRM — Κάδος (trash) for leads and customers

Branch `feat/trash-leads-customers` (from `main` @ `3deeb90`, PR #39 merged). Owner decision (14/10/2026): deleting a lead/customer moves it to a trash; permanent deletion is admin-only. **No production change made** — the server part is `supabase/staged-migrations/phase2/06` (not applied).

## Behaviour
| Action | Who | Where | Server rule |
|---|---|---|---|
| Διαγραφή → Κάδος | Διαχειριστής, Διευθυντής | Leads list & lead page, Customers list & customer page | `trash_record`; customer with open cases refused |
| Επαναφορά | Διαχειριστής, Διευθυντής | Διαχείριση → Κάδος, banner on a trashed record | `restore_record` |
| Οριστική διαγραφή | Διαχειριστής | Διαχείριση → Κάδος (typed name) | `purge_record`: only from the trash, refused when cases/consents/other rows reference it; website files removed from Storage |

- Trashed rows are hidden from other roles **by the database** (restrictive RLS policy); the app also filters them out of every list, search and count.
- Every action is in `activity_log` with the actor; the purge entry keeps no personal data.
- Without the staged SQL the buttons explain that the trash is not yet active (no fake success).

## Validation (local)
| Check | Result |
|---|---|
| `npm test` | **92 / 92** (+6 PGlite SQL tests for 06, +2 unit tests for messages/permissions) |
| Quality gate | 18 / 281 / 32 — unchanged |
| `npm run build` | passes |
| `npm run qa:ui` (mock, no real RLS) | **169 / 169** (+11: no delete for inside sales; trash with reason; hidden from list; listed with who/why; restore; permanent delete with typed name; refusal for a lead with a case; refusal for a customer with open cases; manager restore but no permanent delete) |

Screenshot: `docs/product/screenshots/after/admin-trash-1440.jpg`.

## Not covered
- Map pins: an admin/manager map may still show a trashed lead/customer pin (the field query selects explicit columns); other roles never see it (RLS).
- GDPR erasure of a customer **with** cases (anonymisation instead of deletion) is a separate, still-open design decision.
