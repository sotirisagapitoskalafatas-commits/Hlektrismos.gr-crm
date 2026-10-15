# Live runbook — production smoke test

**When:** after the staged SQL is applied to production (order: phase2/07 → phase4/10 → 11 → 12 → 13 → 14), with a backup taken first.

**Ground rules:**
- Use test data only, with your own phone and email.
- Do not project real customers.
- Afterwards, move the test lead to the Κάδος.
- If a check fails, stop and use `docs/ops/ROLLBACK_NON_ADDITIVE.md`.

## The 5 checks (≈5 minutes)

| # | Do | Expected result |
|---|---|---|
| 1 | **Name-only lead:** Leads → «Νέο Lead» → «Γρήγορο lead» → name «Δοκιμή Smoke», nothing else → Δημιουργία | A green message «Δημιουργήθηκε το lead…». The lead appears under «Νέο» with no program, phone or email. No error. |
| 2 | **Chatbot callback:** on the website, ask the chatbot for a call; give a test name and your phone; confirm 18+ and consent | The chatbot confirms. In the CRM the lead appears in Leads as «Ιστοσελίδα · Chatbot» within a minute. |
| 3 | **Far check-in:** with a test field account, pick a visit whose case has a stored address, stand **>150 m** away (or deny location), press Check In | Accepted: «Check In ✓ — … μ από την αποθηκευμένη διεύθυνση» (or «χωρίς θέση GPS»), and the visit shows «Σε εξέλιξη». As admin or Back Office, in **Λειτουργίες** it appears under «Check-in προς έλεγχο»; «Ελέγχθηκε» removes it. |
| 4 | **Move with a missing document:** open a test case in «Υπογραφή» with no documents → «Έλεγχος εγγράφων» | The dialog says «Λείπουν έγγραφα — η μετάβαση επιτρέπεται» and lists them. «Συνέχεια με ελλείψεις» works: the stage changes, and the history shows «Μετάβαση με ελλείψεις εγγράφων». |
| 5 | **Gate setting:** Διαχείριση → Έγγραφα → «Έλεγχος εγγράφων ανά στάδιο» | Every stage shows «Προειδοποίηση». **Leave them as they are.** |

## Known gap before applying 07
On a case's **Back Office** tab, the buttons «Ενεργοποίηση» and «Ολοκλήρωση» jump straight to that stage. After 07 only the next allowed stage is accepted, and these buttons fail **silently**. Until they are fixed, move cases with the stage stepper or Λειτουργίες instead. See `docs/ops/ROLLBACK_NON_ADDITIVE.md`.
