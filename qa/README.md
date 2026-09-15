# Authenticated CRM Mobile/Tablet QA (Playwright)

Reproducible responsive + map/navigation QA for the CRM, run against a **live
environment where Supabase auth is reachable** (local dev or staging). It cannot
run in an offline sandbox.

## What it checks

`crm-mobile.spec.ts` — for every configured role, across 7 viewports, walks each
reachable screen and asserts:

- no horizontal overflow (`scrollWidth <= clientWidth`)
- touch targets ≥ 40px on their smaller side
- bottom tab bar present and bottom-anchored on phones (safe-area)
- a screenshot + JSON summary of findings per role/viewport

Screens a role cannot see are **skipped**, never failed.

`map-navigation.spec.ts` — Field Sales map end-to-end (a URL opening is **not** a
pass): destination place search → real result → coordinates → route/ETA card →
Navigate button; plus GPS-denied and no-results failure states.

## Viewports (Playwright projects)

`360x800  375x812  390x844  430x932  768x1024  820x1180  1024x768`

## Credentials — never commit these

Provide **dedicated QA accounts** via environment variables. Only roles you set
are tested:

```
QA_BASE_URL=https://staging.your-crm.example      # default http://127.0.0.1:4173
QA_ADMIN_EMAIL=...        QA_ADMIN_PASSWORD=...
QA_MANAGER_EMAIL=...      QA_MANAGER_PASSWORD=...
QA_INSIDE_EMAIL=...       QA_INSIDE_PASSWORD=...
QA_FIELD_EMAIL=...        QA_FIELD_PASSWORD=...
QA_BACKOFFICE_EMAIL=...   QA_BACKOFFICE_PASSWORD=...
```

Use a secrets manager / CI secrets. Do **not** use production employee passwords.

## Run

```bash
npm run qa:install          # one-time: download the Chromium Playwright uses
# point at a running app (either is fine):
npm run build && npm run preview &   # serves http://127.0.0.1:4173
QA_BASE_URL=http://127.0.0.1:4173 \
QA_FIELD_EMAIL=... QA_FIELD_PASSWORD=... \
npm run qa                  # whole matrix (all configured roles x 7 viewports)

npm run qa -- --project=390x844        # one viewport
npm run qa -- qa/map-navigation.spec.ts # just the map E2E
```

HTML report: `qa/report/index.html` · JSON: `qa/report/results.json` · per-role
finding summaries and screenshots are attached to each test.

## Notes / limits

- Place search uses Photon (Komoot). It must be reachable from the browser
  running the tests; a network that blocks it will fail place-search assertions.
- Internal CRM pages are reached by clicking nav items (the app is a single-route
  shell), so nav-label changes require updating `SCREENS` in `helpers.ts`.
