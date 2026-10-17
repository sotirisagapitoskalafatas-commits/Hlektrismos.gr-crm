# Master prompt (v2) — Phase One: audit, Lead-creation root cause, implementation plan

**Status:** report for decision. Nothing is built, applied, deployed or merged for any item below.
**Basis:** `main` after #63 (`7e80ce7`), plus the Part B PRs #64, #65 and #67 that were open when this was written; the master prompt v2 (§6.2 / §12.5 with multiple residential and commercial supply points; docs PR #66).
**Not read:** production. The Supabase and Vercel connectors were **not** used, not even read-only. Every statement about the live database is inferred from the migrations in this repository; section 8 has read-only queries for you to run.
**Prices and limits:** fetched from the vendors' own pages on 17/10/2026 (URLs in section 4). Where a page did not give a number, this report says "not verified" instead of using memory.
**Estimates:** days of engineering, my estimates, **not quotes**. They exclude client review time.

This report refreshes `FIELD_SALES_GAP_AUDIT.md` (written against v1 of the prompt, before the Lead fix, the 15/10 decisions and Part B of the customer folder).

---

## 0. What you asked me to call out (short answers)

| # | Item | Answer |
|---|---|---|
| 1 | **Staged 07 vs §8 (non-linear Back Office stages)** | They conflict in one part only: the **fixed transition list** enforced by `cases_stage_guard`. Proposal: **split 07**. 07a (document gates, return for correction, override) is safe to apply; 07b (the stage guard) is rewritten so Back Office/admin may set any stage, audited, while Sales keeps the list. 2–3 days. 07 stays unapplied until you agree (section 3). |
| 2 | **«Μπλοκάρισμα»** | Remove it (§7: documents never block). It exists in the staged SQL (`mode = 'block'`), in the admin screen (`GateModes.tsx`) and in one screen test. Since 07 is unapplied there is no live data to migrate. A replacement for the one database refusal the tests use is proposed (section 3.2). 1 day (inside item 1). |
| 3 | **Shared login + Sales Agents vs the five roles** | Path A of `ROLE_MODEL.md`: the shared office login is **one `admin` user**; Sales Agents stay `inside_sales` / `field_sales`; `back_office` and `manager` stay in the database, unused unless you want them. This replaces the open role decision. **But §2.2 implies agents see only their own work, and today every staff member sees everything**: that is a large piece of work not on your list (section 5, 5–8 days). |
| 4 | **Maps provider and key** | Four things need a provider and a key; one does not (section 4). At the volumes assumed, optimization and directions cost **$0** on either Google or Mapbox free tiers; the real cost is **place discovery** (about $0 / $0 / $157 per month for 5 / 15 / 30 agents on Google, $75 / $75 / $150 on the SerpApi route we already use). I need the agent count. |
| 5 | **Paid items, days** | Saved daily routes **12–17**, duplicate/ownership approvals **6–9**, multiple supply points **8–12**, global custom fields **7–10**: total **33–48 days**. Not included: per-agent record visibility (5–8), see section 5. |
| 6 | **Contradictions** | Eleven, in section 7. The most important: §2.2 (agents see only their own) vs §4.5/§5 (agents must be warned about *other* agents' visits), and a shared login vs individual accountability for ID images. |

---

## 1. Requirement → status table (current `main`)

Status: ✅ exists · 🟡 partial · ❌ missing · ⚠️ conflicts with something built or approved.

| Master prompt | Today | Status | Where |
|---|---|---|---|
| **1.1 Lead creation fails** | Root cause reproduced and **fixed** (#44): the CRM form sent `first_name = null` and `client_contact = null` into `NOT NULL` columns. Chatbot and ad webhooks wrote to the legacy `hlektrismos_leads` and never appeared in the CRM: fixed. | ✅ in code · ❓ on production | `src/lib/lead-payload.ts`, `api.ts createLead`, `supabase/tests/lead-create.test.mjs`; section 2 |
| **1.2 Program optional at creation** | Only a name is required; no DB constraint; the provider/product trigger is a no-op when empty. | ✅ | `LeadsPage.tsx`, `20260910000200…` |
| 1.1 Retries do not create duplicates | The form blocks double-clicks (`creating`). **No idempotency** on the server: a retry after a lost response, or two agents entering the same person, creates two rows. Duplicates are only caught at conversion (staged phase4/15). | 🟡 | `LeadsPage.tsx:120`; `phase4/15` |
| **2.1 Shared Admin/Back Office login** | Technically possible (one `admin` user). Loses per-person audit; see 7.2. | ⚠️ | `ROLE_MODEL.md` |
| **2.2 Individual agents; own routes/work** | Attribution fields exist (`owner_id`, `assigned_to_user_id`, …). **Record-level isolation does not**: `is_staff()` lets every staff member read every lead, case, customer, document. | 🟡 | RLS audit C-01 |
| **3 Outcomes and branches** | 5 outcomes fixed **in code** (`OUTCOMES` in `field-day.ts`). No reasons, no configuration, no manager follow-up to Back Office. | 🟡 | `src/lib/field-day.ts` |
| 3.3 Follow-ups (agent, due, reason) | Per case; have owner and due date. | 🟡 | `follow_ups` |
| **4 Saved daily routes, 40–60+ stops** | Nothing is saved. Visits exist only per case (`case_visits`). Client-side ordering + one OSRM polyline. | ❌ | `RoutePanel.tsx`, `routing/` |
| 4.2 Map-discovered businesses | B2B pipeline (Google Maps via SerpApi → review → distribute) is built; staged phase3/08, **not applied**; not connected to routes. | 🟡 | `phase3/08` |
| 4.4 Manual check-in always works | Done and decided 15/10: manual check-in succeeds with a review flag; the «Φτάσατε στο…;» prompt exists in «Ημέρα μου» (its radius setting is staged in phase4/10). Not linked to a saved route stop. | ✅ | `MyDayPage.tsx`, `phase4/10` |
| 4.5 Visit history of a business; works without a case | Visits require a case. | ❌ | `case_visits` |
| **5 Duplicate / ownership approval** | B2B flags duplicates for review; leads have a `duplicate` status; D1/D2 phone matching staged (phase4/15). No owner/visited-by check, **no approval queue**, no server enforcement. | ❌ | — |
| 6.1 Names, ID front/back, home address | `full_name` + first/last (phase4/11 staged); one ID document type; customer-level documents do not exist (documents belong to cases). | 🟡 | `customers`, `case_documents` |
| **6.2 Many supply points (residential + commercial)** | Legacy tables exist but are **not connected to the CRM** (section 6). | 🟡 → ❌ for the CRM | section 6 |
| **6.3 Global custom fields, Sales + Back Office** | Nothing. | ❌ | — |
| 6.4 Provider-specific fields | Provider/product catalog exists; tariff codes (Γ1…Γ23) appear only **inside commercial names**, not as a field. | 🟡 | `20260820100001_comprehensive_market_tariffs.sql` |
| **7 Missing documents never block** | Checklists warn. Gates default to warn (15/10). The staged 07 still offers `block`. | ⚠️ | `GateModes.tsx`, `phase2/07` |
| **8 Non-linear Back Office stages** | 9 stages + lost/cancelled; transitions fixed (UI now, DB after 07); return for correction (07); queue page «Διεκπεραίωση». The stepper shows earlier steps as done from the current stage alone. | ⚠️ | `STAGE_TRANSITIONS`, `case-flow.ts` |
| 8.3 Exception branches | lost/cancelled + return-with-reason; case exception state (phase4/13, staged). Reasons are not configurable. | 🟡 | `phase4/13` |
| 8.4 Back Office queue | Exists (filters, exceptions, check-in review). | ✅ | `BackOfficePage.tsx` |
| 9 Lead → customer → case relationships | Customer folder, lead screen in the folder, redirect and lead/customer sync are built in Part B (#61–#63 merged; #64, #65, #67 open). The link to a specific supply point is missing. | 🟡 | — |

---

## 2. Lead-creation root cause (1.1)

**Confirmed in code and reproduced locally (PGlite with the real `leads` DDL):**
1. `createLead()` inserted `first_name: null`; the table has `first_name`, `client_name`, `client_contact` **NOT NULL** (migration `20260908180001`). A name-only lead failed on `client_contact`; any lead failed on `first_name`.
2. The user saw only «Δεν ήταν δυνατή η δημιουργία του lead.»; the database message went to the console.
3. The chatbot callback and ad webhooks wrote to the legacy `hlektrismos_leads`, which the CRM does not list: those requests never appeared.

**Fix (merged, #44):** derived `first_name`, `client_contact = ''`, mapped Greek errors, diagnostics without row data (`safeDiagnostics`), routing of chatbot/webhooks into `leads`. **Tests:** `supabase/tests/lead-create.test.mjs` (4) reproduces the old payload against the real DDL and proves the new one; part of `npm test` (213/213 on the last branch).

**Not verified (cannot be, from here):**
- Whether production's `leads` table matches the migrations. If it does, the form failed on **every** attempt. The meeting said "sometimes". That would fit a production table where `first_name` is nullable, failing only when phone **and** email are empty. Section 8 has the read-only query that settles it.
- Whether other causes (RLS refusal for a role, an expired session) occurred in production. Production logs would show them; I did not read them.

**Remaining gap against §12.2:** retries are not idempotent (see table). Smallest fix: a client-generated request id stored on the lead with a unique index, or a duplicate check by phone/email inside a lead-create RPC. Fits inside the duplicate-approval item (section 5).

---

## 3. Staged 07 and «Μπλοκάρισμα»

### 3.1 What 07 contains (`supabase/staged-migrations/phase2/07_case_return_and_document_gates.sql`)
A) `document_requirements` and `stage_document_gates` (`mode` = `warn` default, `block` optional) · B) `cases_stage_guard`: refuses a direct stage write unless the pair is in `case_stage_transitions`, **and** refuses when a `block` gate has missing documents · C) `change_case_stage_override` (admin/manager, reason) · D) return for correction / resubmit.

### 3.2 Conflicts with §7 and §8
- **§8.2** "do not assume every pair of stages is valid, but do not force every earlier stage": B's **fixed list** forces the sequence. It is data, not code, so it can change without touching the trigger.
- **§7** "never block": the `block` mode and the guard's document check.
- The app mirrors the list in `STAGE_TRANSITIONS` and `stage-jump.ts`; the stepper (`journeySteps`) derives "done" from the current stage alone, so a case entering at «Αίτηση» would show «Νέο … Προσφορά» as done, which falsifies history.

### 3.3 Proposal
- **Split 07.** **07a** = A (without `block`) + C + D: safe to apply, no behaviour change for stage moves. **07b** = the guard, rewritten:
  - Back Office/admin (and manager) may set **any** stage from any non-final stage through one audited path (`set_case_stage(case, stage, reason?)`), which writes a history entry with who/when/from/to. No document check.
  - Sales roles keep `case_stage_transitions`.
  - `completed` stays final; `lost`/`cancelled` reopen to «Νέο» as today.
- **Remove «Μπλοκάρισμα»:** drop `block` from the `mode` check and from `set_stage_gate_mode`; the admin screen shows only «Προειδοποίηση»; remove the document check from the guard. 07 is unapplied, so nothing live changes.
- **Stepper from history:** `journeySteps` reads the stage history (timeline entries) so steps that were never visited are not shown as done.
- **Tests to change:** `supabase/tests/stage-jump.test.mjs`, `case-workflow.test.mjs`; screen checks 2e/2e2 (the «database refusal is shown, never silent» check currently uses `__gates?mode=block`). **Replacement refusal:** an invalid transition written by a **Sales** role is still refused by the guard, which keeps the "refusals are never silent" test meaningful.
- **Docs to change:** rollback doc, `LIVE_RUNBOOK.md` order.
- **Effort:** 2–3 days (07 split and rewrite 1; app + stepper 1; tests and docs 0.5–1).

---

## 4. Maps: what needs a provider and a key (§4)

### 4.1 What the repository uses today
| Function | Today | Key? | Production-ready? |
|---|---|---|---|
| Basemap | MapLibre; optional `VITE_MAP_STYLE_URL`, `VITE_CARTO_API_KEY`, `VITE_MAPBOX_TOKEN` | optional | yes |
| Route polyline / order | Client nearest-neighbour + **OSRM public demo** (`router.project-osrm.org`); ORS if `VITE_ORS_API_KEY`; straight-line fallback | ORS only | **No.** The OSRM project says the demo is for "reasonable, non-commercial use", ≤1 request/s, "no guarantees" (wiki, last edited Dec 2020). |
| Geocoding | Photon public instance (`photon.komoot.io`) | none | Terms not verified; no SLA |
| Navigation | Google Maps *directions URL* with waypoints (`maps/navigate.ts`) | none | Yes, but Google documents **at most 9 waypoints (3 on mobile browsers)** per link → a 50-stop route needs 6–17 links |
| Map-discovered businesses | B2B pipeline via **SerpApi** (Google Maps results), edge function, phase3/08 staged | SerpApi key (server-side) | not applied |
| **Security note** | `VITE_ORS_API_KEY` is a `VITE_` variable: it is **compiled into the browser bundle**. Provider keys for optimization/directions/geocoding must live in an edge function. | | |

### 4.2 Items that need a provider + key
1. **Stop optimization** (true optimization; today only nearest-neighbour). 2. **Directions / ETAs for segments** (≤25 waypoints per request). 3. **Place discovery** for new candidates. 4. **Geocoding** of new addresses and supply-point addresses. Navigation deep links need no key.

### 4.3 Cost at our scale — assumptions (please correct)
22 working days per month; per agent per day: 2 optimization requests (build + one re-sort), 2 directions requests (50 stops in segments of ≤25), 15 place searches, 10 geocodes. **Agents: 5 / 15 / 30 (I do not know the real number).**

| Per month | 5 agents | 15 agents | 30 agents |
|---|---|---|---|
| Optimization / directions requests | 220 / 220 | 660 / 660 | 1,320 / 1,320 |
| Place searches | 1,650 | 4,950 | 9,900 |
| Geocodes | 1,100 | 3,300 | 6,600 |

| Provider (official page, 17/10/2026) | 5 agents | 15 agents | 30 agents | Notes |
|---|---|---|---|---|
| **Google Maps Platform**: Route Optimization single-vehicle (5,000 free, then $10/1,000), Routes Pro (5,000 free, $10/1,000), Geocoding (10,000 free, $5/1,000), **Places Text Search Pro (5,000 free, then $32/1,000)** | **$0** | **$0** (4,950 searches, just under the cap) | **≈ $157** (4,900 searches over the cap × $32/1,000) | Routes Pro "up to 25 waypoints". Storage: Place ID may be stored indefinitely; other Places content "must not [be] pre-fetch[ed], cache[d], or store[d] beyond the allowed exceptions" (time limits are in the Service Terms; not retrieved). **Importing discovered businesses into the CRM needs legal confirmation.** |
| **Mapbox**: Optimization (100,000 free, then $2/1,000), Directions (100,000 free), Matrix (100,000 elements free), Temporary geocoding (100,000 free), Search Box (25,000 free, then $1.70/1,000) | **$0** | **$0** | **$0** | Optimization v2: up to **1,000 locations** per problem, 300 problems/minute. v1 limits not verified. **Temporary** geocoding results are not for storing; **Permanent** geocoding is $5/1,000 with no free tier: saving geocoded coordinates into CRM records would be ≈ $5.50 / $16.50 / $33 per month. Greek POI coverage unverified. |
| **SerpApi** (discovery we already use): Developer $75 (5,000 searches/month), Production $150 (15,000) | $75 | $75 (4,950 of 5,000) | $150 | Scraped Google Maps results: ToS risk to confirm with counsel. Only successful searches count. |
| **OpenRouteService** (HeiGIT) | not verified | not verified | not verified | The plan and quota pages did not load; check the quotas in your ORS account. |

**Reading:** at these volumes, optimization and directions are **free** on both Google and Mapbox. Choose on **Greek coverage quality and terms**, not on price. **Recommendation:** one provider behind one edge function (key server-side), keep Google deep links for turn-by-turn, keep the existing SerpApi route for discovery until the terms question is answered. Before committing: a **1-day spike** on 50 real Greek addresses, comparing Google Route Optimization and Mapbox Optimization v2.

---

## 5. Paid scope — effort in days

| Item | What is included | Days |
|---|---|---|
| **Saved daily routes** (§4) | Tables `field_routes` / `field_route_stops` (agent, date, order, status, target lead/customer/case/prospect), visits that work **without a case**, build from CRM + due follow-ups + assigned, reorder, resume, carry over, progress, manual check-in linked to the stop, reassignment with audit, Back Office team view, mobile layout. **Provider integration** (edge function, segmentation, key handling) 3–4 days, included. | **12–17** |
| **Duplicate / ownership approvals** (§5) | Matching (phone last-10, name+address, coordinates, supply number), `ownership_requests`, server check inside the lead-create RPC (also for chatbot/webhook/B2B), pending status for the agent, Back Office approval queue, the visit still recorded, notifications, idempotent lead creation (2). PGlite tests for RLS and bypass attempts. | **6–9** |
| **Multiple supply points** (§6.2) | Section 6. | **8–12** |
| **Global custom fields** (§6.3) | Definitions (stable key, label, type, options, section, order, archived), values as JSON on customer **and on each supply point**, validation function, Sales **and** Back Office can create (see contradiction 3), audit of definition changes, archive-only, rendering in the folder and connections, limited search. Earlier estimate in `UNIFIED_CUSTOMER_FOLDER.md` §4 was 6–9 for customer-level, admin-only; now +1 for per-connection values and the extra governance. | **7–10** |
| **Total** | | **33–48** |

**Implied by the prompt but not on your list (please decide):**
| Item | Days |
|---|---|
| **Per-agent record visibility** (§2.2: agents see only their own routes/leads/work): ownership-scoped RLS on leads, customers, cases, documents, follow-ups, visits + PGlite tests + the cross-agent signal for duplicate warnings. | 5–8 |
| Configurable outcomes/reasons/branches (§3.2) + manager follow-up queue | 3–5 |
| Customer-level documents without a case (ID front/back, E9) | 1–2 |
| 07b revision (section 3) | 2–3 |

---

## 6. Multiple supply points (new §6.2 / §12.5)

### 6.1 What exists today
Found in the migrations (applied in August; you report both tables in the live index list). Used by **no screen in the current app**.

| Table | Migration | Shape | Links |
|---|---|---|---|
| `supply_points` | `20260821060000` (RLS reset by `20260822160000`) | `entity_id uuid` + `entity_type` (`lead`/`customer`, **no foreign key**), `supply_number text NOT NULL`, `provider_name`, `program_name`, `sales_agent_id`, `status`, `estimated_commission`, `monthly_cost`. **`UNIQUE (supply_number)` globally.** RPC `upsert_supply_point` with `ON CONFLICT (supply_number) DO UPDATE SET entity_id = EXCLUDED.entity_id …`. | Legacy entity ids; no case, no document |
| `customer_meters` | `20260821030000` | `customer_id` → **`hlektrismos_customers`** (legacy), `supply_number NOT NULL`, `meter_type` (`single_phase` / `three_phase` / `night_meter_G1N`), `property_address`, `is_main_meter` | Legacy customers only |
| `entity_documents`, `customer_documents` | same | document metadata per entity | not per connection |

**UI:** `EntityDetailWindow.tsx` (add/edit/delete supply points, "Αριθμός Παροχής"), reachable only from the old `DashboardPage`, which no route uses. `customers.supply_number` in `CustomersTab`. The CRM's `customers` table (`public.customers`) is a **different table** from `hlektrismos_customers`; nothing maps one to the other. `leads.supplies` (jsonb) exists, unused by the new screens. Cases hold one provider/program.

### 6.2 Coverage of §6.2
| §6.2 requirement | Covered by | Gap |
|---|---|---|
| Many independent connections per customer | `supply_points` (loosely) | no link to CRM customers (no FK; different customer table) |
| Residential / commercial per connection | — | missing |
| Property/supply address | `customer_meters.property_address` only | missing on `supply_points`; wrong parent |
| 11-digit Αριθμός Παροχής | `supply_number text NOT NULL` | no 11-digit check; **NOT NULL**; **global UNIQUE blocks** instead of flagging |
| Meter details distinct from supply number | `customer_meters.meter_type` (a **type**, not an identifier) | no meter serial/identifier field; supply number duplicated in both tables |
| Tariff category/code (Γ1, Γ1Ν, Γ21, Γ22, Γ23) | — | missing. The catalog has the codes only **inside commercial names** (`'Γ1/Γ1Ν Οικιακό Ειδικό (Πράσινο)'`, `'… Γ22 (Μπλε)'`, `'… (Γ21)'`), so equivalent *verified configuration does not exist* → new configurable list |
| Commercial tariff name | `program_name` | usable, but not separated from a code |
| Application date, contract duration | — | missing |
| Documents per connection | — (`entity_documents` is per entity) | missing |
| Related cases/contracts | — | missing |
| Duplicate signal, never silent merge | global UNIQUE + upsert **moves a number to another entity** | **violates "editing one connection must never overwrite another"** |
| Validation / legacy preserved | — | missing |
| Commission fields | `estimated_commission`, `monthly_cost`, `sales_agent_id` | out of scope (earlier decision: no commissions); do not reuse |
| RLS | `sp_auth_all … USING (true)` for **any authenticated** user, full CRUD | weaker than the `is_staff()` standard |

### 6.3 Decision: reuse or add?
The prompt says reuse. I looked for what can be reused **safely** and recommend **not altering the legacy tables**: their parents are the legacy customers, they hold unknown live data, and fixing them would mean dropping a unique constraint and replacing RLS on tables I cannot see. **Reuse = read them as a source** (flag and optionally import), not extend them.

### 6.4 Smallest additive staged SQL (design only, not written)
`phase5/17_customer_supply_points.sql` (idempotent; rollback file; PGlite tests):
- `tariff_categories(code pk, label, usage ('residential'|'commercial'), active, sort)`: seeded with Γ1, Γ1Ν, Γ21, Γ22, Γ23 **as data**; editable by Sales and Back Office; archiving an option never rewrites connections (they store the **code text**, no foreign key).
- `customer_supply_points(id, customer_id → customers, usage, property_address, supply_number text, supply_number_key text generated (digits only), supply_number_ok boolean generated (null or exactly 11 digits), meter_identifier text, meter_note text, tariff_category_code text, tariff_name text, application_date date, contract_months int, provider_id/product_id nullable, case_id nullable, status, created_by, timestamps, archived_at)`. **No unique constraint** on the number; a function `supply_point_duplicates()` and an index on `supply_number_key` give the **duplicate signal**, existing duplicates are listed for review, never merged or blocked.
- Additive columns `supply_point_id` (nullable) on `case_documents` and `cases`: documents and cases link to **the specific connection**.
- RLS: staff read/write through the same helper as other CRM tables (not `USING (true)`); archive instead of delete.
- A read-only view/function listing legacy `supply_points` / `customer_meters` rows that match CRM customers by phone/email (flag, **no automatic import**).
- **Tests (PGlite):** two connections of one customer do not overwrite each other; a duplicate number is flagged, not rejected; 11-digit rule; a legacy value is preserved; RLS for staff vs anon; rollback.

### 6.5 UI plan (inside the customer folder)
A new tab **«Παροχές»** (count badge) after «Cases» — this changes the tab order approved in Part A, so it needs your OK; the alternative is a panel in Σύνοψη. The tab shows a **list of connections** (usage badge Οικιακό/Επαγγελματικό, address, number, category code, tariff name, status), **«+ Νέα παροχή»**, and an editor per connection (own form, own save; nothing shared between rows). The 11-digit rule shows a **warning/error in the form**, never blocking anything else; a number that already exists elsewhere shows «Υπάρχει ήδη σε …» with a link, and a button to flag for review. Έγγραφα gets a connection filter; the case shows its connection.

### 6.6 Effort: **8–12 days**
SQL + RLS + PGlite + rollback 1.5–2 · API, validation, duplicate function 1–1.5 · folder UI (list, add, edit, warnings) 2.5–3.5 · documents/case link and checklist per connection 1.5–2 · category configuration screen 0.5–1 · legacy audit/flag tool 0.5–1 · unit + screen tests 1–1.5.

---

## 7. Contradictions with earlier decisions or inside the prompt

1. **§2.2 vs §4.5/§5.** Agents see only their own work, yet must be warned that a business was visited by *another* agent. Today `is_staff()` shows everything. Needs a database function returning only "exists / owned by someone else", plus real per-agent RLS.
2. **Shared login vs accountability.** One login for the whole office cannot show who handled an ID image; it undercuts the user audit built in #39 (phase2/05), the "last active admin" safeguard, MFA, and GDPR accountability. Individual office accounts with the same role cost nothing and give the same permissions. The prompt itself says not to claim an individual identity.
3. **§6.3 Sales can create global fields** vs Part A's recommendation (admin only, data minimisation). Governance proposed: audit, archive-only, no deletion, stable keys.
4. **§8 vs the stepper.** See 3.2.
5. **§7 vs staged 07** (`block`). See 3.
6. **«Μπλοκάρισμα» removal** removes the only database refusal used by screen test 2e2 (replacement in 3.3).
7. **«Not interested»** (§3.1) vs the contact-objection register (phase3/09). Which one is meant? They should not be conflated; the register is a legal record, the outcome is a sales note.
8. **§3.3 "do not invent an unsolicited-contact policy"** vs phase3/09 (Article 11 / objection checks shown to staff). Already flagged for counsel in the earlier audit.
9. **Legacy `supply_points` commission fields** vs the earlier decision "no commissions".
10. **Your rules vs the prompt:** the prompt says "do not stop after an audit"; your rule is to stop and report. Your rule wins; nothing below is started.
11. **Out-of-scope list vs the prompt.** Saved routes, ownership approvals, multiple supply points and global fields were on the out-of-scope list; the prompt now asks for them. They are treated as paid items awaiting the client's confirmation.

---

## 8. Read-only checks for you to run in production (I did not)

Run in the Supabase SQL editor; they change nothing.

```sql
-- 1. Does the live leads table match the migrations? (nullability of the three columns)
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='leads' and column_name in ('first_name','client_name','client_contact','full_name','phone','email');

-- 2. Leads per source per week since September (did creation work, and from where?)
select date_trunc('week', created_at)::date as week, source, count(*)
from public.leads group by 1,2 order by 1 desc, 2;

-- 3. Legacy supply points: how many, which entities, which number formats
select entity_type, count(*) from public.supply_points group by 1;
select length(regexp_replace(supply_number,'\D','','g')) as digits, count(*) from public.supply_points group by 1 order by 1;
select count(*) as total, count(distinct supply_number) as distinct_numbers from public.supply_points;

-- 4. Do the entities exist, and in which customer table?
select sp.entity_type,
       count(*) filter (where c.id is not null)  as in_crm_customers,
       count(*) filter (where h.id is not null)  as in_legacy_customers,
       count(*) filter (where l.id is not null)  as in_leads
from public.supply_points sp
left join public.customers c on c.id = sp.entity_id and sp.entity_type='customer'
left join public.hlektrismos_customers h on h.id = sp.entity_id and sp.entity_type='customer'
left join public.leads l on l.id = sp.entity_id and sp.entity_type='lead'
group by 1;

-- 5. Legacy meters
select meter_type, count(*) from public.customer_meters group by 1;
select length(regexp_replace(supply_number,'\D','','g')) as digits, count(*) from public.customer_meters group by 1 order by 1;

-- 6. Who can read/write them
select tablename, policyname, cmd, roles, qual from pg_policies
where tablename in ('supply_points','customer_meters','entity_documents','customer_documents');
```
Do not paste personal data back; counts and policy text are enough.

---

## 9. Decisions and questions

1. **Agent count** (and working days) for the cost table.
2. **Per-agent visibility** (§2.2): confirm agents see only their own records. It is the biggest unlisted item (5–8 days).
3. **Shared office login** accepted despite the audit loss, or individual office accounts with the same role?
4. **Keep the `manager` role** (supervisor view) or hide it? Who is the second admin for emergencies?
5. **07 split** as in section 3 and removal of «Μπλοκάρισμα»: approve.
6. **New tab «Παροχές»** (changes the Part A tab order) or a panel in Σύνοψη.
7. **Tariff categories:** who may edit the list (Sales and Back Office, per §6.2)? Seeds Γ1, Γ1Ν, Γ21, Γ22, Γ23 as given; the kVA descriptions stay informational.
8. **Legacy supply data:** flag only, or also import the rows that match a CRM customer (after the section 8 results)?
9. **Maps:** run the 1-day provider spike? Choose the provider after it. Confirm with counsel whether importing Google-sourced businesses into the CRM is allowed.
10. **«Not interested»:** sales note, or contact-objection register, or both?
11. **Paid scope:** confirm items and ranges with the client before any build.

**Nothing is started.** After your answers I can start with the lowest-risk, highest-value pieces: the 07 split (3), the lead-create idempotency (2), and the supply-point staged SQL with its PGlite tests (6).
