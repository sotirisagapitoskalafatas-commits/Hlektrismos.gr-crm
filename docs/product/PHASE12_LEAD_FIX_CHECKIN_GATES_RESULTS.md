# Phase 1 of the Hlektrismos brief — lead creation fix, manual check-in, document warnings

Branch `fix/lead-creation-checkin-gates` (from `main` @ `6b3d0b4`). Code and tests only: **no production change, nothing deployed, nothing sent.**

## 1. Lead creation — root cause (reproduced) and fix

| Path | Cause | Fix |
|---|---|---|
| CRM «Leads → Νέο Lead» | `createLead()` sent `first_name: null` always (the form only has a full name) and `client_contact: null` when neither phone nor email was given. In the real table both columns are `NOT NULL` (an explicit null does not fall back to the default). PostgreSQL rejected the insert. | `src/lib/lead-payload.ts` builds the identity columns: first/last name derived from the name, `client_contact` = email, phone, or `''`. A **name-only quick lead** is valid, and program/provider stay optional. |
| Error display | The generic «Δεν ήταν δυνατή η δημιουργία του lead.» was set on the **page** behind the open dialog, so the user saw nothing. The console logged the whole error, including PostgreSQL `details` (the full row with personal data). | Specific Greek messages inside the dialog: missing field, permission/RLS, invalid status or source, network, code. Logs carry only `{op, code, column, constraint}`. Double submit is blocked. |
| Editing a lead | `updateLead()` wrote `first_name/last_name/client_name = null` on every edit that did not change the name (e.g. location only), and the database rejects that. | Only the edited fields are sent; `client_contact` is kept in step with phone/email. |
| Chatbot callback (`chat`) | Wrote to the **legacy** `hlektrismos_leads`, which the CRM does not list, so the requests never reached the team. | Uses `insert_website_lead()`, the same public intake as the website form. The database re-checks consent and 18+. Shown as «Ιστοσελίδα · Chatbot». |
| Ad-form webhook (`receive-lead-webhook`) | Same legacy table. It also invented values (provider "Unknown", region, customer category), used `lead_notes` (legacy), and could trigger an AI call. | Writes to `leads` (source `campaign`, label Facebook/Google/Instagram/LinkedIn), stores only what the form sent, records consent only if the form asked for it, logs to `activity_log`, triggers **no** call, and logs no personal data. |

**Evidence:**
- `supabase/tests/lead-create.test.mjs` (PGlite, the **real** `leads` DDL + status/source constraints): the old payload fails with `23502 first_name`; a name-only lead failed on `client_contact`. The fixed payloads (name only / phone / email / company) are saved. The old edit payload fails and the fixed one does not.
- UI section 2h: a refused save shows «Δεν έχετε δικαίωμα…» inside the dialog, never the database row; a name-only lead is saved and listed; an edit sends no nulls.

**Live data (count only, read with the owner's approval on 15/10):** the legacy table holds **130 rows, all dated 17–24 Aug 2026**: 127 with no source, 2 «website», 1 «facebook»; 7 already deleted. Nothing has landed there since 24 Aug. So there are no chatbot/ad leads waiting from after that date, and the chatbot callback has apparently never saved a request. **Not migrated or backfilled**; the owner decides.

**Not verified:** whether production's `leads.first_name` is `NOT NULL` like the migration. If it is, the CRM form failed on every attempt; if not, only when phone and email were both empty. The fix works in both cases.

## 2. Document gates — warning by default, block is a setting (phase2/07, still staged)
- `stage_document_gates.mode`:
  - `warn` (default for **every** stage): missing, rejected or unverified documents are listed but never stop a stage change or the handover to Back Office;
  - `block`: the previous server refusal, with admin/manager override.
- `set_stage_gate_mode(stage, mode)`: admin only, audited. The CRM toggle is in *Διαχείριση → Έγγραφα → «Έλεγχος εγγράφων ανά στάδιο»*. «Καταχώρηση Παρόχου» stays on warn until the owner decides.
- Stage dialog:
  - warn → «Λείπουν έγγραφα — η μετάβαση επιτρέπεται», «Συνέχεια με ελλείψεις», and the missing list is written to the case history;
  - block → the earlier behaviour.
- The «Επόμενο βήμα» card and the Back Office queue no longer hide the forward move when documents are missing.
- Προσφορά → Αίτηση had no gate and still has none.
- Evidence: `case-workflow.test.mjs` 10/10 (+2: defaults are warn and a move passes; only an admin switches and it is audited); UI section 2e 10/10 (+2).

## 3. Check-in — manual always works, flag for review (new staged `phase4/10`)
- `field_checkin()` accepts every check-in and records distance and accuracy, with a `review_flag`: `far_from_address`, `gps_uncertain`, `no_gps` or `no_target`. The old version rejected anything more than 150 m away and anything without GPS.
- «Check-in προς έλεγχο» in *Λειτουργίες*: admin, manager and Back Office can mark each one «Ελέγχθηκε».
- «Φτάσατε στο…;» within `arrival_prompt_radius_m` (75 m, setting):
  - only while «Ημέρα μου» is open and location permission was already granted;
  - one-tap Check In or «Όχι ακόμη»;
  - no background tracking, nothing stored.
- Check-in reuses the position the page already holds (≤30 s old) instead of a second location request. That second request could fail and send the check-in without coordinates.
- Evidence: `field-checkin.test.mjs` 5/5 (on top of the live migration); UI section 11 14/14 and section 12 6/6, incl. the arrival prompt, a check-in without GPS that is accepted and flagged, and the review list.

## 4. Answers requested

**Shared office login:** not implemented, as instructed. Individual accounts and user management (#39) stay. A shared Back Office queue already exists (*Λειτουργίες*). It waits on the client's answer.

**B2B map discovery:**
- Provider: **SerpApi**, `engine=google_maps` (Google Maps results), called from the `scrape-b2b` edge function.
- Key: `crm_settings.SERPAPI_KEY`, set in *Διαχείριση → B2B Scraper* and never in the browser. Limits come from `b2b_scraper_config` (daily quota, per-run cap).
- The key is paid per search on SerpApi's plan.

**Stop ordering and routing:**
- Ordering is a nearest-neighbour sort in the browser (`RoutePanel.tsx`), not real optimisation.
- The route line comes from the **public OSRM demo server** `router.project-osrm.org`, which has no SLA and is not meant for production. **OpenRouteService** is used if `VITE_ORS_API_KEY` is set, with a straight-line fallback.
- The map uses MapLibre with Carto tiles (`VITE_CARTO_API_KEY` / `VITE_MAP_STYLE_URL` optional).
- The address search uses the public Photon (komoot) server.
- For 40–60 stops a day across several agents, this needs a provider decision: ORS optimisation, Google Route Optimization, or Mapbox.

## 5. Deploy notes (for when the owner approves)
- **Merging this PR redeploys `chat` automatically** (it is listed in `supabase/config.toml` and deployed by the GitHub integration). From then on, chatbot callbacks go to `leads` through the live `insert_website_lead()`. This needs no SQL.
- `receive-lead-webhook` is **not** auto-deployed; deploy it manually when ready.
- SQL, staging first:
  - `phase2/07` (now warn-by-default);
  - `phase4/10` (check-in).

  Until then the app falls back gracefully: no gate setting, and the old check-in refusal with the labelled fallback.

## 6. Validation (local)

| Check | Result |
|---|---|
| `npm test` | **136 / 136**. New: 4 lead (real DDL), 5 check-in, 2 gate-mode. |
| Quality gate | types **17** (baseline lowered from 18), lint 281 / 32 unchanged |
| `npm run build` | passes |
| Edge functions `chat`, `receive-lead-webhook` | bundle with esbuild (syntax/TS); not executed against Supabase |
| UI sections 2e / 2h / 11 / 12 (mock backend, synthetic data) | 10/10 · 3/3 · 14/14 · 6/6 |

The mock backend now enforces the `leads` NOT NULL columns like the real table; before, it accepted the broken payload, which is why the earlier UI suite never caught the bug. The mock still has no real permission rules (RLS).
