# Hlektrismos CRM OS — Full Audit

> Evidence-based audit of the repository at branch `claude/stoic-hamilton-j68206`
> (forked from `port/crm-os` work, HEAD `29eefde` at audit start).
> Produced per the Master Audit prompt §2–§3. Every claim below is grounded in
> repository files, migration SQL, or build output that was actually run.
> Live-database, RLS, and production-runtime claims are marked **BLOCKED**
> where they could not be verified — see §0.

---

## 0. Audit integrity & access constraints (read first)

This audit was produced inside a sandboxed remote execution environment. Two
hard constraints shaped what could and could not be verified:

| Capability | State | Evidence |
|---|---|---|
| Repo / code / migrations inspection | **AVAILABLE** | files read directly |
| `npm` typecheck / lint / build | **AVAILABLE** | commands run, output captured |
| Supabase **MCP** access to prod `nonaymiwdayfuulccxrl` | **BLOCKED** | MCP call → `You do not have permission to perform this action`; MCP is bound to a *different* project (`jbmccmokfvyvijmumuzn`, org `sktaeavbglbzoewqrkmd`) than production (`nonaymiwdayfuulccxrl`, org `srjsrgrtcroqsxwsydxl`) |
| Direct HTTPS to `*.supabase.co` (anon REST probe) | **BLOCKED** | `curl: (56) CONNECT tunnel failed, response 403`; egress proxy reports host not allowed by org policy. The supplied `sb_publishable_…` key is anon-level and could not be tested because the host itself is blocked. |
| Browser QA against production / preview | **BLOCKED** | no egress to the deployed origin; headless-browser scripts exist in `scripts/` but cannot reach prod from here |

**Consequence:** no live schema, RLS behaviour, row counts, or production
runtime could be verified in this session. Any statement that a data-layer
feature "works" would violate the prompt's Absolute Rule (§0), so those are all
**NOT TESTED / BLOCKED** below. To lift the block, a future session needs
either (a) the Supabase MCP authenticated against `nonaymiwdayfuulccxrl`
(OAuth flow run locally, then a fresh session), or (b) egress allow-listing of
the production Supabase host.

A secondary integrity finding: the prior **Phase 1.2 report claimed
`typecheck PASS / build PASS`**, but HEAD's typecheck was in fact **broken**
(`maplibre-provider.ts` passed a `workerUrl` option that does not exist in
maplibre-gl v6 `MapOptions`). This was fixed in this session (see §23). Treat
historical "PASS" claims in commit messages with caution until re-verified.

---

## 1. Executive summary

The project is a Vite + React 18 + TypeScript single-page app backed by
Supabase (Postgres + Auth + Storage + Edge Functions). It contains a marketing
site (landing/energy/contact pages) **and** an authenticated CRM shell
(`DashboardPage.tsx`), plus 26 Supabase Edge Functions covering AI, comms,
scraping and campaigns.

Three layers are at very different maturities:

1. **Shell / UI (mature).** Liquid-glass sidebar, role-based nav, role
   dashboards, lead/case/customer/map/back-office pages all exist and build.
2. **CRM core data layer (functional, legacy-shaped).** `src/lib/api.ts` drives
   `customers`, `cases`, `timeline_events`, `follow_ups`, `case_documents`,
   `case_visits`, `case_signatures`, `case_offers`, `app_notifications`,
   `leads`, `activity_log`, plus the `providers`/`products` catalog. This is the
   working system today.
3. **CRM OS foundation (DDL-only, unwired).** Migration
   `20260910000100_crm_os_foundation_phase1.sql` creates the entire
   organizational spine (`organizations`, `departments`, `teams`, `territories`,
   `roles`, `user_roles`), canonical `assignments`, append-only
   `business_events`, `work_items`, and `campaigns`. **None of these tables are
   referenced anywhere in `src/`** (verified by grep). They are foundation DDL
   with zero application wiring.

The single most important structural gap is therefore **not missing tables —
it is that the canonical foundation is disconnected from the app.** The
Master prompt's top priority (Phase 1.1 org/multi-role, 1.4 assignments, 1.5
business_events→Timeline) is largely a *wiring* task on top of already-authored
DDL, not a green-field build.

The Map / Route / Navigation OS is notably **better** than the prompt assumed
("NOT TESTED / previously forgotten"): it has a clean provider abstraction with
**real** OpenRouteService road routing, a Haversine fallback that is correctly
flagged `estimated: true` (never passed off as a road route — satisfies §27),
and external Google-Maps navigation handoff (§28). Its gaps are route
*persistence* (no `crm_routes*` tables) and Apple-Maps handoff.

---

## 2. Current architecture

```
Browser SPA (Vite/React/TS)
  ├── Marketing site  : Landing / Energy / Services / About / Contact / FAQ / legal
  └── CRM shell       : DashboardPage.tsx (290 KB) → app/* pages, dashboards/*, components/*
        │
        ├── src/lib/api.ts        data access (Supabase JS client, anon/user JWT)
        ├── src/lib/auth.tsx      session + single-role + localStorage role override
        ├── src/lib/roles.ts      client-side nav config + PERMS matrix (UI only)
        ├── src/lib/catalog.ts    providers/products cache + canonical-label resolver
        ├── src/lib/maps/*        map provider abstraction (MapLibre + CARTO)
        ├── src/lib/routing/*     routing provider abstraction (ORS + Haversine)
        ├── src/lib/geo/*         distance + geolocation
        └── src/lib/offline/*     idempotent queue + sync (field ops)
Supabase
  ├── Postgres  : 77 migrations (legacy CRM + P0/P1 security + CRM-OS foundation DDL)
  ├── Auth      : email/password; handle_new_user() trigger → profiles
  ├── Storage   : hlektrismos_docs (private), client_documents
  └── Edge Fns  : 26 functions (ai-developer, orchestrator, agent-worker, chat,
                   scrape-b2b, enrich-lead, billing-ocr, send-email/sms/offer,
                   make-voice-call, vapi-webhook, campaign-scheduler, sync-*-tariffs, …)
Hosting: Vercel (build-time VITE_* / CRM_VITE_* vars; @vercel/analytics + speed-insights)
```

Client talks to Postgres directly through PostgREST with the anon key; the user
JWT (after login) carries `auth.uid()` which RLS policies key off. There is **no
app-server tier** — all authorization is RLS + client-side gating.

---

## 3. Current database model (from migrations; NOT live-verified)

**Legacy/working core** (`20260908180000_crm_base_tables.sql` and later):
`profiles`, `customers`, `cases`, `timeline_events`, `follow_ups`,
`case_documents`, `case_visits`, `case_signatures`, `case_offers`,
`app_notifications`, `leads`, `activity_log`, plus sales-agent / commission /
tariff / calendar / doc-template tables from the pre-CRM app.

**Catalog** (Phase 1.2, `…phase12_provider_product_fk.sql`, VERIFIED per prior
report): `providers`, `products` with FK columns `provider_id` / `product_id`
added to `cases` and `leads`, deterministic backfill, auto-resolve trigger.

**CRM-OS foundation** (`20260910000100`, DDL present, wiring absent):
`organizations`, `roles`, `departments`, `territories`, `teams`, `user_roles`
(multi-role M:N), `provider_regions`, `assignments` (polymorphic ownership),
`business_events` (append-only, trigger-enforced), `work_items`, `campaigns`;
`profiles` extended with `organization_id`, `department_id`, `team_id`,
`territory_id`, `manager_id`, `availability_status`, etc.

Design quality of the foundation migration is high: additive-only, idempotent
(`if not exists`, `on conflict do nothing`), RLS enabled on every table,
`updated_at` triggers, sensible indexes, deterministic backfills from existing
owner columns. The problem is purely that the app never reads it.

---

## 4. Current API architecture

There is no REST/RPC API tier of the project's own — `src/lib/api.ts` is the de
facto data layer, calling PostgREST/RPC through `supabase-js`. Observations:

- Consistent `logError()` + graceful `return null/[]` on failure (no blank
  crashes) — good.
- Attribution-preserving lead→case conversion is a single `SECURITY DEFINER`
  RPC `convert_lead_to_case` (good; matches §108/§109 intent).
- `addActivity()` writes `timeline_events` only — **does not** emit
  `business_events`. The canonical event backbone is never populated (§22 gap).
- Search/filtering for cases is **client-side** (`fetchCases` pulls rows then
  `.filter()` in JS) — fine at 10 cases, violates §98 at 10k+.
- `ensureProfile()` contains dead logic: `if (!supabase || !supabase.auth.getUser())`
  — `getUser()` returns a Promise (always truthy), so the guard never triggers.
  Harmless, but misleading.

---

## 5. Current UI architecture

Single source of nav truth in `roles.ts` (`NAV_SECTIONS` → `navForRole`).
Pages are code-split (`dist/assets/*Page-*.js` chunks confirm lazy loading of
MapPage, MyDayPage, Reports, Customers, Settings, etc.). `DashboardPage.tsx` is
a 290 KB monolith orchestrating the shell; this is a maintainability risk but
not a correctness bug. Visual shell (liquid glass, contrast, category icons,
notifications, account menu) matches the "preserve" directive (§5).

---

## 6. Current auth / RLS model

- **Auth:** Supabase email/password. `handle_new_user()` trigger seeds
  `profiles` with safe default role `inside_sales` (P0 fixed a prior
  privilege-escalation default of `admin` — good).
- **RLS helpers:** `is_staff()` = *a profile row exists for `auth.uid()`*, i.e.
  **any authenticated user is "staff"**; `is_role(r)` compares `profiles.role`.
- **Policy shape:** most CRM tables are `staff read/insert/update` +
  `admin/manager delete`. `leads` additionally allows **anon INSERT** (public
  website intake — the only anonymous write). Storage `hlektrismos_docs` allows
  anon upload only under `leads/`|`contact-forms/` prefixes.
- **Role override is client-only** (`localStorage 'atlas.role.override'`). It
  changes the UI's effective role but **not** `auth.uid()` or `profiles.role`,
  so it cannot escalate DB privileges (RLS reads the real row). This is a UI
  simulator, acceptable, but should be labelled as such in-product.

**RLS verification status: BLOCKED.** Anon-isolation, cross-user, cross-team,
and cross-org tests (§96) could not be executed — no DB egress.

---

## 7. Current role model

Client type `Role = 'admin'|'manager'|'inside_sales'|'field_sales'|'back_office'`
is a hardcoded union in `roles.ts`; `PERMS` is a client-side capability matrix.
The DB now has a canonical `roles` registry and `user_roles` M:N table (seeded,
and `profiles.role` mirrored into `user_roles` as primary) — but the app still
consumes only the single `profiles.role`. **Multi-role is DB-ready, app-blind.**

## 8. Organization / team model

`organizations`/`departments`/`teams`/`territories` exist with FKs and a seeded
`Hlektrismos.gr` org; `profiles` carries org/dept/team/territory/manager FKs.
App wiring: **none**. No team/territory scoping in queries or RLS beyond
`is_staff()`.

## 9. Ownership model

`assignments` table models polymorphic canonical ownership
(`entity_type`+`entity_id` → user/team/territory, `role_type`, `method`,
history via `active_since/through`, `is_primary` partial-unique index) and is
backfilled from `cases.owner_id`/`inside_sales_owner` and
`leads.assigned_to_user_id`. App still reads the flat owner columns on
`cases`/`leads`. **Canonical ownership is DB-ready, app-blind** (§8 of prompt).

## 10. Event / timeline model

Two parallel systems:
- `timeline_events` (per-case, **used** by the app; drives case timeline UI).
- `business_events` (append-only canonical backbone, **unused**).
- `activity_log` (audit; written best-effort by `logAudit`).

This is precisely the "two timeline systems" anti-pattern the prompt forbids
(§107). Target: `business_events` canonical, `timeline_events` becomes a
projection/view, `activity_log` stays as immutable governance (§22/§73).

## 11. Map architecture

`src/lib/maps/`: `map-provider.ts` (interface), `maplibre-provider.ts`
(MapLibre GL + authenticated CARTO Voyager raster, attribution preserved,
bundled worker asset), `navigate.ts`, `types.ts`. CARTO key is required at build
time (`CRM_VITE_CARTO_API_KEY`/`VITE_CARTO_API_KEY`) with **no unauthenticated
fallback** — correct per §102 (attribution never hidden). Mapbox-gl is also
bundled (1.8 MB) — appears to be a heavyweight dependency that may be
removable if only MapLibre is used.

## 12. Route / navigation architecture

`src/lib/routing/`: `routing-provider.ts` selects **ORS** (`VITE_ORS_API_KEY`)
else **Haversine**; `planRoute()` falls back to Haversine on ORS error with a
clear Greek "straight-line estimate" message. `ors-provider.ts` is a real
OpenRouteService `driving-car` call with polyline decode. `haversine-provider.ts`
marks output `source:'haversine', estimated:true`. `navigate.ts` builds a Google
Maps directions URL and opens it. **This satisfies §27 (no fake road routes)
and §28 (external handoff).**

## 13. Field Sales architecture

`components/app/MyDayPage.tsx`, `components/field-sales/RoutePanel.tsx`,
`components/app/MapPage.tsx`, offline queue/sync in `src/lib/offline/`, and
check-in/out in `api.ts` (`checkInVisit`/`checkOutVisit` persist coords +
accuracy + write timeline events). Structurally aligned with §31–§33.

## 14. Back Office architecture

`components/app/BackOfficePage.tsx` + `BACK_OFFICE_STAGES` pipeline
(signed → document_check → submitted → activation → completed). Document
verification via `setDocumentStatus`. Present and role-gated in nav.

## 15. Provider / product architecture

Phase 1.2 canonical FKs (verified previously). `catalog.ts` caches providers/
products and `applyCanonicalLabels()` rewrites legacy free-text
`provider`/`program` from the FK — good migration discipline (§18/§108).

## 16. Communications architecture

Edge functions `send-email`, `send-sms`, `send-offer`, `make-voice-call`,
`vapi-webhook`, `fetch-emails`, `receive-lead-webhook` exist. No unified inbox /
conversation threading / consent / suppression model in the schema yet (§45).
**Unverified** (needs prod + provider secrets).

## 17. Automation architecture

`campaign-scheduler`, `orchestrator`, `agent-worker` edge functions +
`config.toml` `verify_jwt=false` on several. No declarative rules/workflow
engine, no durable job/queue tables, no dead-letter/retry surface in schema
(§68–§70 gap). **Unverified.**

## 18. AI architecture

Heavy AI surface: `ai-developer`, `ai-orchestrator`, `orchestrator`,
`agent-worker`, `chat`, `ask-market-rag`, `generate-embedding`,
`autonomous-tariff-scraper`, plus UI (`ChatBot`, `CrmAiAssistantWidget`,
`MarketRAGSearch`, `MarketRagFolders`, `LiveVoiceSupervisor`). This is well
beyond the "build Atlas after the data foundation is reliable" sequencing the
prompt recommends (§74). Permissions/eval/cost-control/fact-classification
layers (§76–§86) are not evident in code. **Unverified; flagged as ahead of its
dependencies.**

## 19. Analytics / reporting architecture

`components/app/ReportsPage.tsx` + `dashboards/*`. Metrics are computed from the
live legacy tables. Business-health / bottleneck / forecasting / revenue-leakage
engines (§53–§61) are not present. No fabricated scores observed (good).

## 20. Deployment / infrastructure

Vite build → Vercel. Build-time vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`CRM_VITE_CARTO_API_KEY`/`VITE_CARTO_API_KEY`, optional `VITE_ORS_API_KEY`,
`VITE_MAP_STYLE_URL`. **Deployed-commit / prod-env verification: BLOCKED** (no
egress). The committed `.env` anon key could not be validated against prod; if
keys were rotated (the new `sb_publishable_…` key handed over suggests they may
have been), the committed `.env` is stale — confirm Vercel env vars separately.

---

## 21. Existing functionality (present & builds)

- Auth + profile + single-role + role-simulator.
- Leads: list/kanban, attribution fields, staff create, public intake RPC,
  stage updates, convert-to-case RPC.
- Cases: create (with customer upsert), list (client filter), stage machine
  with transition matrix, timeline, documents, visits, signatures, offers,
  notifications.
- Follow-ups: create/complete/snooze/reschedule.
- Field: visits, GPS check-in/out with accuracy, offline queue/sync.
- Map: MapLibre+CARTO, ORS routing + Haversine fallback, Google-Maps handoff.
- Catalog: canonical provider/product with label rewrite.
- 26 edge functions (AI/comms/scrape/campaign) — present, runtime unverified.

## 22. Missing functionality (vs Master spec)

- App wiring for the entire CRM-OS foundation (orgs/teams/territories/multi-role/
  assignments/business_events/work_items/campaigns).
- Canonical `business_events` population + Timeline-as-projection.
- Route **persistence** (`crm_routes`/`crm_route_stops`/`crm_route_events`).
- Universal Work OS / "My Work" aggregation (§9), Next-Action engine (§10),
  dependency/blocking engine (§11).
- SLA engine (§41), approval engine (§43), business-rules engine (§44),
  notification policy (§42).
- Communications unified inbox + consent/suppression (§45–§46).
- Revenue/commission/reconciliation/leakage (§53–§55), data-quality center
  (§56), business-health/bottleneck/forecast (§58–§61).
- Duplicate/identity resolution (§20), global search (§21), import/export
  pipeline (§66), integration hub + webhook reliability (§67–§68), job/queue
  system (§69), feature flags (§71), system-health center (§72).
- Atlas governance stack: tool permission enforcement, memory, RAG permissioning,
  eval lab, cost control, fact classification (§74–§89).

## 23. Broken functionality (found this session)

| # | Issue | Severity | Status |
|---|---|---|---|
| B1 | `maplibre-provider.ts` passed `workerUrl` in `new maplibregl.Map({…})`; removed from maplibre-gl v6 `MapOptions`. Broke `tsc` (and any typecheck-gated CI). | High (typecheck/build-gate) | **FIXED** → uses module-level `maplibregl.setWorkerUrl(maplibreWorkerUrl)`; typecheck + build now pass. |
| B2 | ESLint: 395 problems (372 errors) across `src` (299) and `supabase/functions` (96). Breakdown in `src`: 151 `no-explicit-any`, 123 `no-unused-vars`, 15 `react-refresh`, 8 `react-hooks/exhaustive-deps`, 2 misc. | Medium (tech debt; `exhaustive-deps` can mask stale-closure bugs) | **OPEN** — documented, not mass-fixed (would be low-value churn; needs per-case review). |
| B3 | Prior Phase 1.2 report claimed typecheck/build PASS while HEAD's typecheck was broken (B1). | Process/integrity | **NOTED** — re-verify historical PASS claims. |
| B4 | `ensureProfile()` dead guard on `supabase.auth.getUser()` (Promise always truthy). | Low | **OPEN** (cosmetic). |

## 24. Duplicate / conflicting functionality

- **Dead code + dual auth context (found this session).** `src/lib/auth.tsx`
  (full: profile/role/override) is the live provider wired in `App.tsx`.
  `src/hooks/useAuth.tsx` is a *second*, minimal auth context with its own
  default value and **no provider mounted in the tree**. The only importers of
  the minimal one are orphaned files: `src/pages/DashboardPage.tsx` (290 KB),
  `src/pages/LoginPage.tsx`, and `src/components/LeadDetailSlideout.tsx` — none
  of which are imported by anything in the live render path (the live CRM is
  `src/components/app/*` + `src/components/LoginPage.tsx`). Net: a ~290 KB+
  legacy monolith and its helpers are dead (tree-shaken from the bundle, but
  still typechecked/linted and a large share of the 299 `src` lint problems).
  Recommend confirming with the team, then deleting, to cut lint noise and
  confusion. Not deleted here (deletion is destructive; may be kept for
  reference).
- **Events:** `timeline_events` (used) vs `business_events` (canonical, unused) —
  must converge (§10/§107).
- **Ownership:** flat owner columns on `cases`/`leads` vs `assignments` table.
- **Roles:** `profiles.role` (used) vs `user_roles` (canonical, unused).
- **Map libs:** both `mapbox-gl` (1.8 MB) and `maplibre-gl` bundled; confirm
  whether mapbox-gl is still needed.
- **"tasks":** prompt notes `tasks` is a legacy VIEW over `calendar_events`;
  canonical work is `work_items`. Converging these needs care.

## 25. Technical debt

290 KB `DashboardPage.tsx` monolith; client-side case search/filter; 395 lint
problems; heavy AI/edge surface built ahead of its data foundation; two map
libraries; committed `.env` possibly stale.

## 26. Security risks

- `is_staff()` = any authenticated user → effectively flat authorization; no
  team/territory/ownership scoping at the RLS layer (§96 unmet). **Verify live.**
- `VITE_ORS_API_KEY` is shipped client-side (browser calls ORS directly) —
  low-sensitivity but exposed; consider proxying via an edge function.
- Several edge functions set `verify_jwt=false` (`orchestrator`, `agent-worker`,
  `ai-developer`, `chat`, `scrape-b2b`) — confirm each enforces its own authz;
  open AI/automation endpoints are a prompt-injection / abuse surface (§83).
- RLS/anon/cross-tenant tests **BLOCKED** — cannot certify isolation.

## 27. Data-integrity risks

Client-side dedupe only (`upsertCustomer` by phone); no formal identity
resolution; free-text vs FK still coexist during transition; `business_events`
idempotency exists in DDL but is unused.

## 28. Scalability risks

Client-side filtering and unpaginated `select('*')` on cases/customers/leads;
marker rendering without clustering for large sets; no viewport loading — all
fine now, breach §98 at 10k–100k.

## 29. UX / mobile risks

Map must be validated at 360/375/390/430 widths and not be hidden behind the
bottom nav (§101) — **NOT TESTED** (no browser egress). Touch-target and a11y
audit (§100) not performed.

## 30. Production risks

Deployed commit / env-var correctness **unverifiable here**; possible stale
`.env`; large JS chunks (mapbox 521 KB gz, r3f 234 KB gz, maplibre 284 KB gz)
affect first-load on mobile.

---

## 31. Recommended dependency graph

```
Prod DB access (MCP auth OR egress allow-list)         ← unblock everything data-layer
  └─ Phase 1.1  org/team/territory + multi-role wiring  (DDL done → wire app + RLS scoping)
       └─ Phase 1.4  assignments as canonical ownership  (DDL done → wire reads/writes)
            └─ Phase 1.5  business_events → Timeline projection
                 └─ Phase 2  CRM core on canonical entities
                      └─ Phase 3  Work OS / Next-Action / SLA / approvals
                           └─ Phase 4  Route persistence + Field Ops browser QA
                                └─ Phase 5+  Comms / Acquisition / Finance / Automation / Analytics
                                     └─ Phase 10+ Atlas governance (tools/permissions/eval/cost)
```

## 32. Phased implementation plan (next concrete steps)

**Gate 0 — Unblock (owner: user).** Authenticate Supabase MCP against
`nonaymiwdayfuulccxrl` (or allow-list egress), then start a fresh session so
live schema/RLS/data can be verified. Confirm Vercel env vars + deployed commit.

**Phase 1.1 (wiring).**
- Read `user_roles`+`roles` into auth context as `roles: Role[]` *additively*
  (keep single `role` behaviour); surface multi-role in Settings.
- Add `is_team_member()` / org-scoped RLS helpers; scope
  cases/leads/customers reads by org/team where policy requires (§6/§96).
- Verify: anon→0 rows; cross-team isolation; admin full access; typecheck/lint/build.

**Phase 1.4 (ownership).** Dual-write `assignments` on assign actions; read
primary owner from `assignments` with fallback to flat columns; preserve
history. Verify backfill parity against flat columns.

**Phase 1.5 (events).** Emit `business_events` from `addActivity`/stage changes
(dual-write, idempotency-keyed); add a `timeline` view/projection; keep
`activity_log` immutable. Verify append-only trigger + idempotency.

**Map/Nav (Phase 4).** Add `crm_routes*` persistence; Apple-Maps handoff;
browser QA at phone widths; ORS key proxied via edge function.

---

## Appendix A — Verification results (this session)

```
TYPECHECK : PASS   (tsc -p tsconfig.app.json, exit 0, after B1 fix)
LINT      : FAIL   (eslint ., 372 errors / 23 warnings — pre-existing tech debt)
BUILD     : PASS   (vite build, exit 0; worker asset emitted: maplibre-gl-worker-*.mjs)
UNIT/INTEG: NONE   (no test suite in repo)
DB VERIFY : BLOCKED (no prod egress / MCP permission)
RLS       : BLOCKED
BROWSER   : BLOCKED (no prod egress)
LOCAL     : build verified; runtime-with-data NOT TESTED (needs Supabase reachable)
PREVIEW   : NOT TESTED
PRODUCTION: NOT TESTED
```

## Appendix B — How to reproduce the verification

```
npm install
npx tsc --noEmit -p tsconfig.app.json        # PASS
npx eslint .                                  # 372 errors (pre-existing)
CRM_VITE_CARTO_API_KEY=<key> npm run build    # PASS
```
