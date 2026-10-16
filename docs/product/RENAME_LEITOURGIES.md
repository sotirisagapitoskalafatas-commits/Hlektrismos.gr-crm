# Rename «Λειτουργίες» → «Διεκπεραίωση» (the Back Office queue)

**Status:** list only. **Nothing is changed until you approve.**

Why rename:
- «Λειτουργίες» also means "features / functions" (e.g. «Δεν περιλαμβάνει διαχειριστικές λειτουργίες» in the Admin centre).
- It is also the name of the menu **section** that holds the page.
- «Διεκπεραίωση» says what the page is for: getting submitted cases through to activation.

The internal page key `backoffice` and the database are **not** renamed. Only the text users see, plus the tests that look for it.

## App: text shown to users (to change)

| File | Line | Today |
|---|---|---|
| `src/lib/roles.ts` | 277 | menu section label `'Λειτουργίες'` |
| `src/lib/roles.ts` | 280 | menu item label `'Λειτουργίες'` |
| `src/lib/roles.ts` | 353 | page title (`PAGE_TITLES.backoffice`) |
| `src/components/app/BackOfficePage.tsx` | 64 | `<h1>` page heading |
| `src/components/shells/MobileShell.tsx` | 36 | mobile bottom tab |
| `src/lib/crm-assistant.ts` | 52 | assistant navigation label (the matcher `λειτουργι` stays as an alias so old wording still finds the page) |
| `src/lib/crm-assistant.ts` | 68 | suggested command «Άνοιξε Λειτουργίες» |
| `src/lib/home-insights.ts` | 82 | Home insight button «Λειτουργίες» |
| `src/components/app/MyDayPage.tsx` | 163 | toast «… Follow-up για υπεύθυνο … στις Λειτουργίες.» |
| `src/components/app/MyDayPage.tsx` | 262 | notice «(ουρά Λειτουργιών)» |
| `src/components/admin/BackofficeAssignee.tsx` | 35 | «… το βλέπει στις «Λειτουργίες».» |
| `src/components/admin/AdminReference.tsx` | 19 | permission group label «Λειτουργίες». **Check first:** this groups document/application permissions and may be better as «Back Office» |

**Not changed:** `src/components/admin/AdminCenter.tsx:48`. There «λειτουργίες» is the ordinary word ("functions").

## Code comments (cosmetic, change with the rest)
- `src/components/app/BackOfficePage.tsx:1`
- `src/components/field-sales/ManagerFollowUps.tsx:1`
- `src/components/leads/BackofficeLeads.tsx:1`

## Notifications
No notification text names the page:
- `app_notifications` bodies from the staged functions (07 return/resubmit, 12 routing) say «Νέο Sale», «Επιστροφή για διόρθωση» and so on;
- the comment in `phase4/12_default_backoffice_assignee.sql:4` names it, but that is a comment, not user text.

So the database needs **no change**.

## Tests (to change together)

| File | Lines |
|---|---|
| `scripts/qa/ui-smoke.mjs` | 11 places: the per-role menu expectations (`EXPECT`, inside / field / back office), the role-preview navigation check, and every `click(page, 'Λειτουργίες', …)` with the check names that mention it (sections 2e, 2i, 12, 13) |
| `scripts/qa/shoot-phase5.mjs` | 21 (screenshot script) |

## Docs (update the current ones; past results stay as they were)
- **Update:** `LIVE_RUNBOOK.md` (check 3); `docs/ops/ROLLBACK_NON_ADDITIVE.md`; `supabase/staged-migrations/phase4/README.md:19`; `docs/product/ATLAS_UX_BLUEPRINT.md` (3 places).
- **Leave as they are:** the historical results files `PHASE5/9/12/13_*_RESULTS.md`, and `docs/presentation.md` (untracked, client presentation; your call).

## When approved
One small PR: the text changes above plus the tests, with `npm test` and the full screen suite. About half a day.
