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

## 18 — «Παροχές» on a lead (additive; needs 17)
`18_lead_supply_points.sql` — owner request 18/10/2026: connections can be entered on a **lead**, not only on a customer.
- **Same table:** `customer_supply_points.customer_id` becomes nullable and `lead_id` is added; **exactly one** is set (check constraint). Everything else is as in 17.
- **Conversion:** when `leads.converted_case_id` goes from null to a case, a trigger **moves the lead's connections to the case's customer — the same rows, not copies** (ids, document tags and history stay). Because it is a trigger on the lead update, it works with the live `convert_lead_to_case()` and with the staged phase4/15 version; neither is replaced.
  - If the customer **already has an active connection with the same supply number**: no copy. The lead's row stays on the lead, flagged «Προς έλεγχο», its document tags are re-pointed to the customer's connection, and the case is linked to that connection.
  - The case is linked to a connection **only when exactly one** results; with several, which one the case is about is for the user to say (never guessed).
- **Documents:** files uploaded with a lead live in `leads.attached_files` (jsonb); an entry may carry `supply_point_id`.
- **Guard:** only the conversion can change a connection's owner; a signed-in user cannot (trigger). `supply_point_duplicates` also reports lead-owned connections.
- Local evidence: `node --test supabase/tests/lead-supply-points.test.mjs` — 13/13 (one owner, staff only, owner guard, duplicates, conversion with the live AND the phase4/15 function, existing number on the customer, exactly-one linking, idempotent, rollback A and B).
- Rollback: `docs/ops/rollback_phase5_18_lead_supply_points.sql` (A keeps the data).
- Until applied the lead form works as today and the lead-side section shows «Η λειτουργία δεν είναι ακόμη διαθέσιμη.».
