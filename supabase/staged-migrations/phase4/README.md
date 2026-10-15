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

  The CRM shows the list as «Check-in προς έλεγχο» in *Λειτουργίες*.
- **Arrival prompt:** the setting `arrival_prompt_radius_m` (default 75) is read by «Ημέρα μου». While the page is open and location permission is already granted, the page asks «Φτάσατε στο…;» with a one-tap Check In.
  - No background tracking.
  - Only the position at check-in is stored.
  - The setting has no effect on the server.
- **The app already handles both server versions.** With the live (old) function, a refused check-in still offers the labelled «Καταγραφή χωρίς GPS» case note.
- **Local evidence:** `node --test supabase/tests/field-checkin.test.mjs`, 5/5. It is applied on top of the real live migration, and a sanity check first confirms that the old version rejects.
- **Rollback:** re-run the `field_checkin` definition from `20260911010000…` and drop the two review functions. The columns and the setting can stay.
