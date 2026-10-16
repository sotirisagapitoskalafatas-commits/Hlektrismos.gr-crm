# Rollback material for the non-additive staged files (07, 10, 14)

Documentation only — nothing here has been applied anywhere. Run on **staging first**. Take a backup before production.

Apply order (unchanged, matches the files and PR #46's table):
1. `phase2/07`
2. `phase4/10`
3. `phase4/11`
4. `phase4/12`
5. `phase4/13`
6. `phase4/14`

## phase2/07 — stage-transition list

**What enforces it:**
- trigger `cases_stage_guard` (`BEFORE UPDATE OF current_stage ON public.cases`) → function `public.cases_stage_guard()`;
- it refuses a stage change made by a signed-in user unless the pair is in `public.case_stage_transitions`: `raise exception 'stage_transition_not_allowed: % -> %' ... hint = 'transition'`;
- the service role (edge functions) and SECURITY DEFINER functions are not affected.

**To turn it off:** `rollback_phase2_07_transitions.sql`.
- **Option A** keeps the document gates and drops only the transition check (tested locally: `case-workflow.test.mjs`, last test).
- **Option B** drops the trigger.

### Every stage move the CRM makes today, and what happens after 07

| Where | Move | After 07 |
|---|---|---|
| Case stepper / «Επόμενη ενέργεια» / stage dialog | only moves in the app's own list (`STAGE_TRANSITIONS`, same pairs as the table) | ✅ allowed |
| Διεκπεραίωση (Back Office queue) forward button | next stage from the same list | ✅ allowed |
| Reopen a lost / cancelled case | `lost → new`, `cancelled → new` | ✅ allowed |
| Reopen a completed case | not offered today either (`completed` has no next stage) | — unchanged |
| «Νέο Sale» handover (field) | **no stage change** (owner + next action only) | ✅ unaffected |
| «Επιστροφή για διόρθωση» / «Επανυποβολή» | **no stage change** (function from 07 itself) | ✅ unaffected |
| Admin/manager «Παράκαμψη» | only document blockers; the transition must still be in the list | as designed |
| Case → tab «Back Office» → buttons «Ενεργοποίηση» / «Ολοκλήρωση» | fixed in `fix/bo-stage-buttons-handover`: only the allowed next stage is attempted; otherwise a Greek message names the stage the move comes from and the next step. A database refusal is shown on screen | ✅ allowed (once that fix is live) |

⚠️ **Deploy that fix before applying 07.** Before the fix, these two buttons jumped straight to the stage and ignored the error, so after 07 a click would silently do nothing.

Edge functions do not write `current_stage` (checked: none in `supabase/functions`). Creating a case (insert) is not affected: the trigger is UPDATE-only.

## phase4/10 — check-in function

**To restore the previous (rejecting) `field_checkin()`:** run `rollback_phase4_10_field_checkin.sql`.
- It is the exact function from `supabase/migrations/20260911010000_field_sales_geofence.sql`, plus dropping the two review functions.
- Tested locally (`field-checkin.test.mjs`, last test): after rollback a far check-in is rejected again (`OUTSIDE_RADIUS`).
- The added columns and the `arrival_prompt_radius_m` setting can stay.

**The app handles both versions:** with the old function, «Ημέρα μου» offers the labelled «Καταγραφή χωρίς GPS» note again, and «Check-in προς έλεγχο» is hidden.

## phase4/14 — follow_ups.kind (fills existing rows)

**Count only, before applying** (no personal data; works before 14 exists):
```sql
select count(*) as rows_14_would_flag
from public.follow_ups
where reason like 'Follow-up από υπεύθυνο%';
```

**Keep a list of exactly what 14 changes** (ids only; run just before 14):
```sql
create table if not exists public._rollback_14_follow_up_ids as
  select id from public.follow_ups where reason like 'Follow-up από υπεύθυνο%';
```

**Reverse:**
- *Keep the column, undo only the backfill:*
  ```sql
  update public.follow_ups set kind = null where id in (select id from public._rollback_14_follow_up_ids);
  ```
- *Remove everything 14 added:*
  ```sql
  alter table public.follow_ups drop column if exists kind;
  ```
  This also loses the flag on follow-ups created after 14. The app then falls back to the text prefix automatically.
- Without the id list, the exact pre-14 state can only be restored **from the backup**.

## The additive files (11, 12, 13)
Each file ends with its own rollback comment (drop the added columns/functions). The app falls back gracefully when they are missing. See the phase4 README.
