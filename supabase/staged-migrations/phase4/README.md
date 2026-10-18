# Staged migration — phase 4 (NOT applied)

## 10 — Field check-in: manual check-in always succeeds, review flag instead of rejection

`10_field_checkin_manual_flag.sql` replaces `field_checkin()` from the live migration `20260911010000_field_sales_geofence.sql`. Meeting decision, 15/10/2026.

- **Before:** the server **refused** a check-in more than `check_in_radius_m` (150 m) from the case's stored location. It also refused when there was no GPS or the GPS was too inaccurate. With GPS drift or a mis-geocoded address, the agent could not record the visit.
- **After:** the check-in is accepted and the visit opens. Distance and accuracy are recorded. A `review_flag` is set when something is off:
  - `far_from_address`;
  - `gps_uncertain` (accuracy worse than 2× radius);
  - `no_gps`;
  - `no_target` (the case has no stored coordinates).

  The timeline says «προς έλεγχο». Idempotency and "only your own visit" are unchanged.
- **Review:** admin, manager and Back Office use:
  - `field_checkins_for_review(days)`, which lists flagged, unreviewed check-ins with agent, case and customer;
  - `review_field_checkin(id, note)`, which marks one as checked.

  The CRM shows the list as «Check-in προς έλεγχο» in *Διεκπεραίωση*.
- **Arrival prompt:** the setting `arrival_prompt_radius_m` (default 75) is read by «Ημέρα μου». While the page is open and location permission is already granted, the page asks «Φτάσατε στο…;» with a one-tap Check In.
  - No background tracking.
  - Only the position at check-in is stored.
  - The setting has no effect on the server.
- **The app already handles both server versions.** With the live (old) function, a refused check-in still offers the labelled «Καταγραφή χωρίς GPS» case note.
- **Local evidence:** `node --test supabase/tests/field-checkin.test.mjs`, 5/5. It is applied on top of the real live migration, and a sanity check first confirms that the old version rejects.
- **Rollback:** re-run the `field_checkin` definition from `20260911010000…` and drop the two review functions. The columns and the setting can stay.

## 11 — Customer first / last name (additive)
- Adds nullable `customers.first_name` and `customers.last_name`. Existing rows are not rewritten.
- `full_name` stays the display name, and the app keeps it equal to first + last.
- Until applied, the customer form shows the single «Ονοματεπώνυμο» field (the app checks once whether the columns exist).

## 12 — Default Back Office assignee (additive)
- A setting `crm_settings.default_backoffice_assignee` that points to a user id, never a hardcoded name. It is set by an admin, must be an active Back Office user, and changes are audited.
- `route_lead_to_backoffice(lead)` assigns a lead created with documents to that user, notifies them, and keeps the creator.
- Until applied:
  - the admin card says it activates after the migration;
  - leads with documents stay with their creator;
  - the creator is told the routing is not active yet.

## 13 — Case exception state (additive)
- Adds `cases.exception_state` (`offer_declined` / `no_response` / `unsigned` / `provider_rejected`), with a note, time and author.
- `set_case_exception(case, state, note)` requires a note, writes the timeline and the audit log, and never moves or closes the case.
- Missing information still uses «Επιστροφή για διόρθωση».
- Until applied, the picker on the case shows «ενεργοποιείται μετά την εφαρμογή…» and the «Εξαιρέσεις» filter counts only returned cases.

## 14 — Follow-up kind (additive + fills nulls)
- Adds `follow_ups.kind` (`manager`) for follow-ups escalated from a field visit.
- Marks existing follow-ups whose reason starts with «Follow-up από υπεύθυνο». It only fills nulls.
- Until applied, the app does not send `kind` and recognises these follow-ups by that text prefix.

**Apply order:** phase2/07 → phase4/10 → 11 → 12 → 13 → 14, on staging first. They are independent of each other except that all expect the live schema.

## 15 — Lead → Case: match an existing customer on phone only (finding D1)
- `convert_lead_to_case` reused a customer by exact phone **or email**. The website placeholder `not-provided@hlektrismos.local` therefore joined different people without email into one customer.
- Now: phone only (last 10 digits); never a customer in the Κάδος; the placeholder is never stored on a new customer. Existing rows unchanged.
- Count (read-only) and manual review: `docs/ops/D1_PLACEHOLDER_EMAIL.md`. Rollback: `docs/ops/rollback_phase4_15_convert_lead.sql`.
- Local evidence: `node --test supabase/tests/convert-lead-d1.test.mjs` — 7/7. Independent of the other files; full order in `docs/ops/PENDING_MIGRATIONS.md`.

## 16 — Import the legacy leads into the CRM (one-time data script, NOT applied)
`16_import_legacy_leads.sql` imports **all** rows of `hlektrismos_leads` (130 on live, newest 24/08/2026) into `public.leads`, which is the only table the CRM lists. Owner decisions of 18/10/2026: import all rows · no marketing consent → imported but «not for marketing» · unassigned · statuses mapped, original status kept in a note.
- **How to run (SQL editor, as owner):** run the file once (creates a view and a function; **copies nothing**), then `select * from public.import_legacy_leads();` — a **dry run by default, counts only, no writes** — and only then `select * from public.import_legacy_leads(false);`. The read-only `docs/ops/LEGACY_LEADS_IMPORT_DRYRUN.sql` gives the same counts **before anything is created**. App users (anon, authenticated) cannot run the function or read the plan view.
- **No row is skipped.** Each old row is copied once (tag `legacy_import:<old id>`); a second run copies nothing. Original date kept; `source 'import'`, label «Παλιά βάση»; **unassigned**.
- **Not for marketing:** rows without recorded consent get `gdpr_consent = false`, the tag `not_for_marketing` and a note: sales follow-up only, no campaigns, no bulk SMS/e-mail. (With phase3/09 applied, a contact with no permission record is already refused for promotional channels — fail closed.)
- **Statuses:** mapped to the values `leads_status_check` allows; the **original status is always kept** in the tag `legacy_status:<old>` and in the note. Old "beyond lead" statuses (converted, customer, won, active, …) → `qualified`, never «converted» (no case exists); unknown or empty → `new`.
- **Soft-deleted old rows** (`deleted_at`) are imported too, as `unqualified` with the tags `legacy_deleted` + `not_for_marketing` and a note, so the history is visible but nobody is led to work them. The dry run counts them — **if any was deleted at a customer's request, tell Claude before running.**
- **Possible duplicates** (same phone — last 10 digits — or e-mail as an existing lead or an older old row) are copied and tagged `possible_duplicate`; nothing is merged or hidden. No name → «Χωρίς όνομα (παλιά βάση)».
- **Not copied:** `government_id`, bill files, scores, assignments. One `activity_log` entry with the count only.
- Local evidence: `node --test supabase/tests/legacy-leads-import.test.mjs`, 6/6, against the real `leads` definition and constraints (dry run default writes nothing and equals the docs file; all 14 fixture rows copied; mapping; not-for-marketing; deleted; duplicates; idempotent; privileges; rollback).
- Rollback: `docs/ops/rollback_phase4_16_legacy_leads_import.sql` (deletes only imported leads without a case or conversion, then drops the helper objects).
