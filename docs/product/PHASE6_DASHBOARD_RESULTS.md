# ATLAS CRM — Αρχική: full-width command center

Branch `ux/atlas-dashboard-grid` (from `main` @ `976e615`). UI only: **no database, RLS, migration, permission, campaign, route or stored-value changes.** Every existing dashboard module is still present; nothing was removed to make the page shorter.

## Root cause of the narrow page
`.atx-page { max-width: 880px }` (src/styles/atlas-ux.css) capped Home like a reading page. Home now uses `.atx-page.atx-wide` (up to 1760px, `min-width: 0`); other pages keep 880px.

## Layout (mockup structure)
| Width | Layout |
|---|---|
| ≥1280 (admin/manager) | 48-column grid: 4 personal KPIs over ¾ + «Καταγεγραμμένη αξία» heading the team column · «Τι να κάνετε τώρα» \| Pipeline \| Η ομάδα (+ Στελέχωση, Atlas AI) · summary metrics row (admin) · «Αναλυτικός πίνακας»: Funnel \| Back Office ροή + Έγγραφα & Υπογραφές \| Κορυφαία Cases + Ειδοποιήσεις · team follow-ups strip |
| ≥1024 | 5 KPIs · work 7/12 \| pipeline 5/12 · team full width · detail 2 columns |
| <1024 | single column; KPIs 3 or 2 per row (5th spans the remaining space) |

At 1440×900 the greeting, KPIs, work queue, pipeline and team health are all in the first viewport. Long work lists scroll inside their card (no records hidden). Detailed modules follow below and can be hidden (preference remembered per browser).

## Inventory — every module kept
| Module | Where now |
|---|---|
| Personal KPIs (overdue, today, first contact, cases waiting for you) | top row (same `lib/work.ts` definitions as «Η εργασία μου») |
| Τι να κάνετε τώρα (all items, actions unchanged) | main area |
| 8-stage pipeline + «Προβολή όλων» | Pipeline card; **each stage now opens Cases filtered by that stage** (was: unfiltered) |
| Team health (unassigned leads, stale cases, team overdue, recorded value) | Η ομάδα; recorded value is the 5th KPI |
| Στελέχωση (admin) | Η ομάδα panel (moved from the detail grid, shown once) |
| Ενεργά Cases, Πελάτες, Pipeline σταθμισμένο, Εκπρόθεσμα | admin summary row (now clickable) |
| Funnel, Back Office ροή, Έγγραφα & Υπογραφές, Κορυφαία Cases, Ειδοποιήσεις | detail row, 3 columns |
| Team follow-ups list, «Νέα leads (όλα)» | strip under the detail row |
| Manager / Inside Sales / Field Sales / Back Office dashboards | unchanged content, under «Αναλυτικός πίνακας» |
| Atlas AI | header button (unchanged) + new suggestions card (see below) |

Consolidated, not removed: the 8-stage pipeline was rendered twice (strip + Home) → once; for admin/manager the strip's «Ενεργά Cases» and «Pipeline» cards repeated the role dashboard's identical numbers → shown once.

## Data fixes (definitions documented in `src/lib/home-insights.ts`, unit-tested)
- **Unknown ≠ €0:** weighted pipeline treated missing values as 0 and showed «0 €». Now totals use known values only, say how many cases are excluded, and show «μη διαθέσιμο» when none is known (Home, strip, admin, manager).
- **«leads στο pipeline»** counted every lead incl. converted/lost → now «ανοιχτά leads» (excludes converted, lost, unqualified, duplicate).
- Admin «αξία X κερδισμένων» printed a raw number without currency formatting → `fmtMoney`.
- Strip labels clarified to distinguish team-wide numbers from the personal KPIs («Follow-ups ομάδας σήμερα & εκπρόθεσμα», «Νέα leads (όλα)»).
- Strip stage labels used codes (ΝΕΟ, ΕΠΙ…) → full Greek names; footer said «Νέα» → «Νέο».
- Funnel lists every stage (also zero) and each row opens the filtered list.

## Atlas AI suggestions
Rule-based over the records already loaded (stale case 14+ days, unassigned new leads, team overdue follow-ups, cases at application/signature/document stages, cases without value). Each has a navigation action. The card says plainly it is rules, not an AI analysis. «Ρωτήστε» opens the existing assistant (window event `atlas:open-assistant`).

## Other fixes found on the way
- Role dashboards overflowed horizontally on phones (grids without `grid-cols-1`).
- Landing-page CSS pads every `<section>` on phones; Home cards use `div role="region"`.
- QA runs left ~15 GB of throwaway Chrome profiles in %TEMP% (cleanup on close fails on Windows) → the QA launcher now sweeps its own stale profiles.

## Results (local, mock Supabase, synthetic data)
| Check | Result |
|---|---|
| `npm test` | **71 / 71** (+3 home-insights tests) |
| Quality gate | type errors 18 / lint 281 / 32 — unchanged baseline |
| `npm run build` | passes |
| `npm run qa:ui` | **126 / 126** (+6: full width, side-by-side areas, all modules present, staffing once, stage → filtered cases, detail toggle) |
| `scripts/qa/shoot-dashboard.mjs` | admin + inside_sales at 1440×900, 1280×800, 1024×768, 820×1180, 390×844: no horizontal overflow |

Screenshots: `docs/product/screenshots/after/home-*.jpg`.

## Not done / limitations
- The mockup's Acropolis banner was not added (the brief excludes decorative imagery). The sidebar Atlas AI card in the mockup was not added; Atlas AI stays in the header.
- Sidebar width/header height unchanged (shared shell; out of scope for this PR).
- At 1440×900 the admin's summary row sits just below the fold when the team column is tall; the work queue and pipeline are fully visible.
- Production data not inspected; numbers are verified only against the mock.
