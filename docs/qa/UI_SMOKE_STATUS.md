# Legacy `ui-smoke.mjs` — status after the redesign

`npm run qa:ui` / `qa:redesign` run `scripts/qa/redesign-smoke.mjs` (27 checks, strict error/network filter, all passing).
`npm run qa:ui:legacy` runs the old functional suite (304 `check()` calls, 41 sections) against the mock backend. It is **not** green yet:

| State | What |
|---|---|
| Navigation | Ported: `click()` / `text()` on the old `#shell-rail` selector now drive the new top-bar modules + sidebar + avatar menu (`gotoLabel`, `allNavLabels`). Renamed pages are mapped (`Προτιμήσεις→Εμφάνιση`, `Λογαριασμός→Προφίλ`). |
| Expectations changed by the two-role model | Ported: legacy Manager / Back Office no longer have «Διαχείριση»; account-menu text; role labels («Sales Agent»). |
| Result of the last run | **87 PASS, 4 FAIL**, then the script **aborts at line ~254** inside section «2c Users». |
| Failing / blocking | Section 2c «Users» (grouping label, create, directory re-read, delete refusal): the user-management UI changed (single Sales Agent choice, admin-only) and its DOM hooks (`[data-group]`, role radio) need porting to `StaffAdmin.tsx`. |
| Not yet executed | Everything after 2c (sections 2d … 13: trash, case workflow, B2B, contact eligibility, lead forms, supply points, customer details, case details, field day, operations queue, field outcomes — ≈ 215 checks). They were passing before the redesign; they have **not** been re-run since, because the script stops at 2c. |

## Obsolete checks (not to be migrated) and why
| Check | Reason |
|---|---|
| `Labs: …` toggle in «Προτιμήσεις» | The toggle moved to Εμφάνιση (admin only); covered by `redesign-smoke` theme/prefs checks and `CustomizePage`. |
| Role-preview banner checks (2b) | The presentation preview has a built-in hard stop (16 Oct 2026) and is not part of the two-role model. |
| `Home command center` geometry (`.cc-work/.cc-pipe/.cc-team` side by side) | Replaced by the widget grid; covered by `home-widgets.test.mjs` and the Home checks in `redesign-smoke`. |
| `Users: Back Office manages Sales Agents` | Superseded: only the shared Admin / Back Office account manages accounts (see `scripts/qa/staging-two-role.mjs` for the real-JWT tests). |

## Next step
Port section 2c to the new Users UI, then run the script to completion and triage sections 2d–13 (expected: mostly selector fixes).
These are UI-rendering checks against a mock that performs **no authorization**; they are never evidence of RLS or data isolation.
