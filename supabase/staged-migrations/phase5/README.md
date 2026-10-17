# Staged migration — phase 5 (NOT applied)

## 17 — «Παροχές»: several independent electricity connections per customer (additive)
`17_customer_supply_points.sql` — owner go-ahead 18/10/2026 (master prompt §6.2 / §12.5; design in `docs/product/PHASE_ONE_AUDIT_AND_PLAN.md` §6).
- **`customer_supply_points`:** one row per connection of a CRM customer. Usage (residential / commercial), property address (separate from the customer's home address), **Αριθμός Παροχής** (optional; exactly 11 digits when given — the generated column `supply_number_ok` flags it, the form explains it), the **physical meter** in its own fields (identifier, type, note), **tariff category code** and the **commercial tariff name** as two separate fields, application date, contract duration in months, notes.
- **`tariff_categories`:** the configurable list, seeded Γ1, Γ1Ν, Γ21, Γ22, Γ23 (descriptions left for an admin). Only admins edit it. A connection stores the **code text**, so editing, archiving or deleting an option never rewrites a connection.
- **Independent:** nothing is shared between rows; a connection can never move to another customer (trigger); there is no delete, only archive.
- **Duplicates are a signal, never a block:** no unique constraint on the number. `supply_point_duplicates(number, exclude)` lists other active connections with the same digits on any customer; `flag_supply_point_review` marks one for review (any staff); `resolve_supply_point_review` closes it (admin, manager, Back Office). Nothing is moved or merged.
- **Links:** nullable `supply_point_id` on `case_documents` and `cases`, checked to belong to the same customer.
- **Audit:** every create / change / archive goes to `activity_log` with the actor and the NAMES of the changed fields; the old and new supply number are kept. Addresses and notes are not copied into the log.
- **Nothing is mandatory** — not at lead creation, not for any stage change.
- **Legacy `supply_points` / `customer_meters` are not touched** (a test checks they are byte-for-byte unchanged).
- Until applied the «Παροχές» tab shows «Η λειτουργία δεν είναι ακόμη διαθέσιμη.».
- Local evidence: `node --test supabase/tests/supply-points.test.mjs` — 11/11 (independence, no moves, the 11-digit rule SQL = app, duplicates, RLS, tariff list, audit, links, legacy untouched + idempotent, rollback A and B).
- Rollback: `docs/ops/rollback_phase5_17_supply_points.sql` (A keeps the data, B removes everything).
