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

## 16 — Copy the legacy leads into the CRM (one-time data script, NOT applied)
`16_import_legacy_leads.sql` copies `hlektrismos_leads` (130 rows on live, newest 24/08/2026) into `public.leads`, which is the only table the CRM lists. Owner request 18/10/2026.
- **Dry run first:** `docs/ops/LEGACY_LEADS_IMPORT_DRYRUN.sql` (read-only, counts only): how many would be copied, skipped as duplicates, skipped as unmappable, plus a check that the old-table columns exist.
- **Copy:** nothing is deleted or changed in the old table. Every copied row has `source = 'import'`, `source_label = 'Παλιά βάση'` and the tags `import`, `legacy_import:<old id>` (the marker that makes a second run copy nothing), and `legacy_source:<old source>`. The original date is kept.
- **Skipped:** already imported · soft-deleted · no name · no phone and no e-mail (the placeholder e-mail counts as empty) · status that cannot be mapped · same phone (last 10 digits) or e-mail as a lead the CRM already has · repeated inside the old table (the oldest is copied).
- **Statuses:** mapped to the values `leads_status_check` allows. Old "beyond lead" statuses (converted, customer, won, active, …) become **qualified** with a `legacy_status:<old>` tag; they are never marked «converted» because no case exists for them. **Owner decision**, one CASE in the file.
- **Consent** is copied as recorded (`gdpr_consent`, `consent_version 'legacy'`, `consent_source 'legacy_import'`). Rows without recorded consent are copied but visibly so; do not contact them until the contact-eligibility rules (phase3/09) are applied.
- **Not copied:** `government_id`, bill files, scores, assignments. Imported leads are unassigned.
- One statement (atomic); one `activity_log` entry with the counts only.
- Local evidence: `node --test supabase/tests/legacy-leads-import.test.mjs`, 5/5, against the real `leads` definition and constraints.
- Rollback: `docs/ops/rollback_phase4_16_legacy_leads_import.sql` (deletes only imported leads without a case or conversion).

