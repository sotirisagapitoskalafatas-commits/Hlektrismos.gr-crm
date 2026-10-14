# ATLAS CRM — Roles, user management, Admin Center, presentation role preview

Branch `feat/roles-admin-center` (from `main` @ `d73bc46`). **No production database change, deployment or secret change was made.** Server-side pieces are written and tested locally; they take effect only after the owner applies `supabase/staged-migrations/phase2/05` and deploys the `admin-users` function (see its README).

## Security findings (source-verified, fixes staged)
| Severity | Finding | Evidence | Fix |
|---|---|---|---|
| Critical | Any signed-in user can make themselves admin (and activate an inactive account). | `20260910103000` line 586 re-created `profiles update own` with `with check (auth.uid() = id)`, undoing `20260910010000`. Reproduced in `supabase/tests/staff-admin.test.mjs`. | Trigger `profiles_guard_privileged` + restored policy (phase2/05 §3). |
| High | Managers can read credential rows of `crm_settings` (SerpApi key; IMAP/Vapi settings) and rewrite `role_permissions` used by edge-function authorization. | `20260911040000` policy `crm_settings_admin_all` FOR ALL admin OR manager. Reproduced in the same test. | Read split + admin-only writes (phase2/05 §6). Admins can still read credential rows (legacy SettingsPanel) — remaining risk. |
| Info | Old role simulator lived in `localStorage`, appeared in the sidebar, the account menu and Preferences; labelled «sim». | `RoleSwitcher.tsx`, `PreferencesPage.tsx`, `AppShell.tsx` | Replaced by the time-boxed preview below. |

## Presentation role preview («Επίδειξη ρόλου (demo)»)
- Shown **only** when the server says so: `role_preview_status()` → allowlisted `qa.admin@hlektrismos.gr`, active admin, server clock before **16/10/2026 00:00 Europe/Athens**. The browser adds the same hard stop and fails closed (no answer → no preview).
- Starting/ending calls `role_preview_event()` (audited; start rejected by the server when not allowed).
- Persistent banner: «ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΡΟΛΟΥ — DEMO. Δεν αλλάζει τα πραγματικά δικαιώματα του λογαριασμού.» + previewed role, real role, «Επιστροφή στον πραγματικό ρόλο».
- **Read-only:** while previewing, every write (REST POST/PATCH/DELETE, non-read RPCs, storage uploads, edge functions) is refused inside the Supabase client before leaving the browser (`src/lib/supabase.ts`, `isMutation` unit-tested).
- Stored per tab (`sessionStorage`), re-validated on load; ends by itself at expiry.
- It is UI simulation only — **not** a test of the previewed role's server permissions. Real role tests need the QA accounts.

## Account menu & profile
- Menu: name, e-mail, real role, Λογαριασμός, Προτιμήσεις, Κέντρο βοήθειας, (demo selector only while allowed), Αποσύνδεση. «sim/πραγματικός» badges and the role list removed; the Preferences role simulator removed.
- Λογαριασμός: real role read-only with «Ο ρόλος και τα δικαιώματά σας ορίζονται από τον διαχειριστή.»; one sign-out.

## Admin Center («Διαχείριση»)
Tabs by role — admin: Επισκόπηση · Χρήστες & Ρόλοι · Δικαιώματα · Cases & Ροή εργασίας · Έγγραφα · B2B Scraper · Ασφάλεια & Έλεγχοι · Audit Log; manager: the same without Scraper/Security; back office: Χρήστες (Back Office only).
- **Χρήστες & Ρόλοι:** list (name, e-mail, role, status, created, last sign-in), search, role/status filters; create (e-mail invite or temporary password), edit (name, phone, role within scope), deactivate/reactivate, permanent delete (typed e-mail confirmation; refused if the person appears in CRM history — deactivate instead). Success is shown only after re-reading the directory. Without the staged SQL the tab says «Μόνο προβολή» instead of pretending.
- **Δικαιώματα:** readable matrix (Greek labels, grouped) labelled as the app's reference, not live verification.
- **Cases & Ροή:** stage → team, allowed transitions, and plainly stated gaps (document blockers not server-enforced; Back Office return not yet built).
- **Ασφάλεια & Έλεγχοι:** live checks of what an anonymous visitor can read (public key, no session, `id` only, nothing displayed), source findings with evidence, and an explicit «Δεν έχει επαληθευτεί ζωντανά» list (RLS per role, MFA, sign-ups, backups, function versions). The old hard-coded green cards are gone.
- **Audit Log:** `staff_admin_audit` (create, edit, role change, (de)activation, delete, preview start/end).

## Permission matrix for user administration (server: `staff_admin_can`, edge: `_shared/staff-admin.ts`)
| Actor | Can create / edit / (de)activate / delete |
|---|---|
| Διαχειριστής | all five roles |
| Διευθυντής | Inside Sales, Field Sales, Back Office (never admin/manager) |
| Back Office | Back Office only |
| Inside Sales, Field Sales | nobody |
Always: not yourself (role/status/delete); the last active admin is protected; deletion only without CRM history.

## Validation (local)
| Check | Result |
|---|---|
| `npm test` | **84 / 84** (+8 PGlite SQL tests, +3 edge decision tests, +2 preview guard tests) |
| Quality gate | type 18 / lint 281 / 32 — unchanged baseline |
| `npm run build` | passes |
| `npm run qa:ui` (mock, no real authorization) | **158 / 158** (+account menu per role, preview banner/read-only/exit/expiry, Admin Center tabs per role, no unverified claims, create/deactivate/delete flows, manager & back-office scoping, read-only role on profile) |

Screenshots: `docs/product/screenshots/after/admin-*.jpg`, `account-menu-1440.jpg`, `role-preview-bo-1440.jpg`. The mock backend has no access control, so its anonymous-visitor checks show «Χρειάζεται ενέργεια» — that is the correct result for the mock, not a statement about production.

## Owner actions for the presentation (15/10)
1. Apply `staged-migrations/phase2/05` on staging, verify with the QA accounts (README step 4), then production.
2. `supabase functions deploy admin-users`.
3. Merge and deploy this PR.
Without step 1 the demo selector stays hidden (fails closed) and user management is view-only.

## Not in this PR (next)
Back Office «Επιστροφή για διόρθωση», server-enforced document blockers, Κάδος/permanent delete for leads & customers (approved), the activity-timeline record redesign, Field Sales & B2B prospecting module.
