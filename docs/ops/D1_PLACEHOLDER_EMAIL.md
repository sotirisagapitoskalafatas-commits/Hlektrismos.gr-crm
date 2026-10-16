# D1: two people joined to one customer through the placeholder email

**What happens.**
1. When the website form has no email, the lead is stored with `not-provided@hlektrismos.local` (`LandingPage.tsx` and `insert_website_lead`).
2. When the office converts a lead, `convert_lead_to_case` (migration `20260909200000`) reuses any customer with the same phone **or the same email**.
3. So everyone who left the email blank matches the first such customer.

The second person's case is attached to the first person's customer record, and shows under the first person's name.

**Do not touch live.** The steps below are for you to run and decide.

## Step 1: count (read-only, numbers only)
Run [`d1_placeholder_count.sql`](d1_placeholder_count.sql) in the Supabase SQL editor (production). It returns three numbers and no personal data:

| Column | Meaning |
|---|---|
| `customers_with_placeholder` | customers whose email is the placeholder (any `…@hlektrismos.local`) |
| `placeholder_customers_multi_lead` | of those, how many are linked to **more than one** lead through their cases |
| `likely_two_people` | of those, how many have leads with **different phones**, i.e. most likely two different people |

If `likely_two_people` = 0, nothing is merged; still apply the fix so it cannot happen.

## Step 2: the fix (staged, NOT applied)
`supabase/staged-migrations/phase4/15_convert_lead_match_phone_only.sql`:
- Reuse an existing customer **only by phone**, compared on the last 10 digits (`6900000000` = `+30 690 000 0000`).
  - **Email is never used for matching.**
  - A phone with fewer than 10 digits never matches.
- Never reuse a customer in the Κάδος (works with or without phase2/06).
- A new customer never gets the placeholder; the email is stored empty (null).
- The case timeline records whether an existing customer was reused (`metadata.customer_reused`).
- **Existing records are not changed.**
- **Rollback:** [`rollback_phase4_15_convert_lead.sql`](rollback_phase4_15_convert_lead.sql), which restores the original function verbatim.
- Idempotent (`create or replace`). It is independent of the other staged files.

**Behaviour to know:** two leads for the same person with a real email but **different or missing phones** now become two customers. Before, the email joined them. That is the safer side; duplicates are a nuisance, merges are a privacy problem. Joining such duplicates is a manual decision (question 9 in `docs/product/UNIFIED_CUSTOMER_FOLDER.md`).

**Local evidence** (PGlite): `supabase/tests/convert-lead-d1.test.mjs`, 7/7. It checks:
- the bug, reproduced with the real live function;
- the count query and the review query, on the merged data;
- the fix applied twice;
- phone formats;
- customers in the Κάδος;
- old rows left untouched;
- the rollback restoring D1.

## Step 3: repair note for records that may already be merged (manual, no auto-split)
Only if Step 1 shows `likely_two_people` > 0:
1. Run [`d1_placeholder_review.sql`](d1_placeholder_review.sql), read-only, as the admin. It lists one row per lead on each suspect customer: customer, case, lead name, lead phone and date.
   - It shows personal data: do not export or share the result outside the office.
2. For each suspect customer, decide by hand (ideally with a call to the people involved):
   - **Same person** (e.g. a new phone): nothing to do.
   - **Different people:** give the second person their own customer record. Create a new customer with the second lead's name and phone, move only **that** person's case(s) to it (`cases.customer_id`), and correct the first customer's name if it was taken from the wrong person. Keep a note in each case's history: «Διόρθωση πελάτη: …».
3. Check documents and consent records attached to the wrong customer before moving anything.
4. **Nothing is split automatically**: a wrong automatic split would create a second privacy problem. If there are more than a handful, ask me for a small, audited admin function that moves one case to a new customer, written and approved as another staged file.

**Not in this fix:** the website still stores the placeholder on the **lead** itself. It no longer harms matching, and phase3/09 already ignores it for consent. Removing it from the form is a separate change.
