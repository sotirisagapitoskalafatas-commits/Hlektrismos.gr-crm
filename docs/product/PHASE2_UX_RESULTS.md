# ATLAS CRM — Phase 2, increment 1: Navigation, Αρχική, Η εργασία μου

Branch `ux/atlas-home-my-work` (from `main` @ `1f6b678`, PR #29 merged). Scope of THIS PR: the shell, navigation, Home and My Work only.
Deliberately **not** in this PR: database/RLS/migration changes, status-value changes, table consolidation, campaign or permission changes, Lead/Customer/Case detail screens, Field/Operations/Settings redesign.

## Verification levels
| Level | Status |
|---|---|
| Local unit tests, type/lint gate, build | ✅ below |
| Local browser tests against a **mock** Supabase (synthetic data, 5 role profiles, 5 widths) | ✅ 77/77 — see caveat |
| Staging / production | ❌ not done. The mock performs **no authorization**: it proves how the UI renders for a role's profile and that hidden items stay hidden, **not** that a role is blocked from data. Hiding a nav item is not a security control. |

## What changed
| Area | Change |
|---|---|
| Navigation | 19 pages regrouped into the 9 blueprint destinations (data-only change in `src/lib/roles.ts`); **every page and each page's existing role list preserved** (no access broadened). Single-item destinations show no redundant caption. Phone bottom bar now includes «Εργασία» (Cases/Πελάτες remain in «Περισσότερα») |
| Top bar | Removed the four duplicate counter shortcuts; compact icon-only search on phones. Existing `Ctrl+K`/`⌘K` palette, `+ Νέο`, notifications and account menu kept (they already worked) |
| Look & feel | New scoped layer `src/styles/atlas-ux.css` (`.atx-shell`): light translucent sidebar, neutral background, one blue accent (`#0066cc`), Inter (has Greek glyphs; the old mono face has none), sentence-case labels, visible focus rings. Landing page, login and legacy dashboards untouched |
| Αρχική | Greeting, one-line "what needs attention", 4 figures, "Τι να κάνετε τώρα" (top 5), team panel for admin/manager. The previous role dashboards are kept under «Αναλυτικός πίνακας» (collapsed) so no capability is lost |
| Η εργασία μου | One prioritized list (follow-ups, leads awaiting first contact, cases needing my action) with tabs (Σήμερα/Προσεχώς/Όλα), type filters with counts, sorting, loading/empty/error states |
| Actions (all real) | follow-up: **Ολοκλήρωση** (`completeFollowUp`), **Αναβολή** to tomorrow 09:00 (`snoozeFollowUp`), open case; lead: open Leads + `tel:` link; case: open case. Success is only claimed when the refreshed list confirms it |
| Logic | `src/lib/work.ts` (single definition of every number), `lead-status.ts` (display-only labels; stored values untouched; unknown values shown verbatim), `work-format.ts`, `useWorkData.ts` |
| Bug fixes found on the way | stray `-1` AI error count (Phase 1); `badge: 'beta'` type error (type errors 24 → 20) |

## Metric definitions (shared by Home and My Work; unit-tested)
Εκπρόθεσμα / Σήμερα = my pending follow-ups by due time · Leads για πρώτη επικοινωνία = leads assigned to me with stored status `new` · Cases που περιμένουν εσάς = active cases whose next-action owner is me (legacy fallback: I am an owner and none is recorded) · Team: unassigned `new` leads, active cases not updated for 7+ days, overdue follow-ups, **recorded** case value (cases with value 0/unset are counted separately, never summed as €0).
The conflicting numbers on the old Home (e.g. "new leads 4 / 1 today / 5 awaiting") came from several independent computations; Home and My Work now share one.

## Lead status display mapping (stored values unchanged; **pending owner approval**)
new→Νέο · contacted→Σε επικοινωνία · qualified/meeting/offer→Ειδικευμένο (+detail) · converted→Μετατράπηκε · lost→Χάθηκε · unqualified→Χάθηκε («Μη επιλέξιμο») · duplicate→Διπλότυπο (quality flag) · anything else→shown verbatim. This increment only uses the mapping for work items (status `new`); wider adoption comes with the Lead screen.

## Results
| Check | Result |
|---|---|
| `npm test` | **37 / 37** (adds 9 for work logic/formatting) |
| Quality gate | type errors **20** (baseline lowered from 24), lint **281 / 32 warnings** (unchanged); baseline file updated, never raised |
| `npm run build` | passes |
| `npm run qa:ui` (needs mock + dev server) | **77 / 77**: nav per role (admin, manager, inside, field, back office); simulator only for admin; a stored `admin` override does **not** escalate a non-admin; Home figures equal My Work counts; complete and snooze send the right PATCH and the list updates; Ctrl+K opens the palette; no horizontal overflow at 1440 / 1280 / 1024 / 820 / 390 |
| Console | only the pre-existing `fetchPriority` React warning from the landing page |

Screenshots: `docs/product/screenshots/before` and `after` (synthetic data, inside-sales unless named).

## Known limitations / honest notes
* The api helpers swallow query errors and return `[]`, so a failed query looks like "no work". Errors are shown only for rejected promises and offline. Fixing this needs `api.ts` changes (next increment).
* Follow-ups exist only on **Cases** in the data model, so leads cannot get follow-ups or a call outcome yet — not faked. A per-lead deep link and call-outcome flow arrive with Lead Details.
* The phone bottom bar changed (Cases/Πελάτες moved to «Περισσότερα» for some roles) — please confirm.
* The sidebar is **light** per this session's brief. Another session relayed a dark-navy token set (`#0B1F3A`, primary `#1677FF`); that conflicts, so it was not applied pending the owner's decision. Switching is a small change in `atlas-ux.css`.
* Real tablet/phone hardware, screen-reader and real-keyboard testing were not performed.

## Security / production items that remain OPEN (unchanged by this PR)
Verify production RLS and grants; apply and test the staged SQL on a real staging project; verify the WordPress→CRM form path; decide customer-record access policy; verify the tariff-cron fix and deployed function versions; keep outbound campaigns disabled; enable the GitHub Actions workflow (`docs/ci/ci.yml`) once the token has `workflow` scope. **This PR does not make production more or less secure.**

## Running the UI checks locally
`node scripts/qa/mock-supabase.mjs` · `npm run dev -- --port 5199` · `npm run qa:ui` (restart the mock between runs to reset its in-memory data).

## Next increment (recommended)
Lead details (deep link from My Work, status via `lead-status.ts`, call-outcome logging + next-action) — then Customer, Case, Field/Operations, Settings, each as its own PR.
