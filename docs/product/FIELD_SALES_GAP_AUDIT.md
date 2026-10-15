# Hlektrismos master prompt — Phase One audit (gap table)

Read-only audit of `main` @ `663ba00` against the master prompt as pasted (v1), plus the v2 changes described in the accompanying note.

**What this audit is based on**
- **Not available:** the v2 file itself (`ATLAS_CRM_Hlektrismos_Master_Prompt_v2.md`) is not on this machine. Without it, the meeting's page 5 transitions and the 8 stage labels are unknown.
- **Not read:** production. Read access was blocked in this session, so statements about the live database are inferred from the migrations.
- **Not changed:** no code.

Status key: ✅ exists · 🟡 partial · ❌ missing · ⚠️ conflicts with something already built or approved.

## 1. Lead creation failure — root cause (confirmed in code, reproduced locally)

> **Update (phase 1, branch `fix/lead-creation-checkin-gates`):**
> - **Fixed:** the CRM form, the chatbot and the webhook. See `PHASE12_LEAD_FIX_CHECKIN_GATES_RESULTS.md`.
> - **Old table (count only):** 130 rows, all from 17–24 Aug 2026; nothing since. They were left untouched for the owner to decide.
> - **Decisions taken on 15/10:**
>   - document gates now warn by default (block is a setting);
>   - manual check-in always succeeds, with a review flag;
>   - the shared office login is **not** built until the client confirms.

| Path | What happens | Evidence | Status |
|---|---|---|---|
| CRM «Leads → Νέο Lead» | `createLead()` inserts `first_name: null` (the form only sends a full name) and `client_contact: email ?? phone ?? null`. In the migration both columns are `NOT NULL` (`client_contact` defaults to `''`, but an explicit null does not use the default). | `src/lib/api.ts` createLead; `supabase/migrations/20260908180001…` lines 10–14 | ⚠️ **Bug** |
| Same, reproduced | PGlite with the real `leads` DDL and the exact payload gives: `null value in column "first_name" … violates not-null constraint`. A name-only lead (no phone/email) also fails on `client_contact`. Deriving `first_name` and sending `''` succeeds. | throwaway script, removed | — |
| Error shown to the user | Generic «Δεν ήταν δυνατή η δημιουργία του lead.»; the database message only goes to the console. | `LeadsPage.tsx` submitLead | 🟡 |
| Website form | `insert_website_lead()` fills `first_name`/`client_contact` itself. It fails only on missing consent/18+ (intended). If a file upload fails, it stops and names the file (intended, PR #34). | `20261001000100…`, `LandingPage.tsx` | ✅ |
| Chatbot callback and ad webhooks (`chat`, `receive-lead-webhook`) | Write to the **legacy** `hlektrismos_leads`. The new CRM lists only `leads`, so these requests **never appear** in the CRM. | `supabase/functions/chat/index.ts:39`, `receive-lead-webhook/index.ts:148`, `api.ts` fetchLeads | ⚠️ **Bug** |
| Program at creation | Optional everywhere (UI requires only a name; DB has no requirement; the provider/product trigger is a no-op when empty). | `LeadsPage.tsx:337`, `20260910000200…` | ✅ (blocked only by the bug above) |

**Caveat:** if production's `leads` table matches the migrations, the CRM form fails on every attempt. A report of failures happening only "sometimes" suggests production may have a nullable `first_name`, in which case it fails only when phone and email are both empty. A read-only check of production will settle it.

**Fix**, small and with no schema change:
- send a derived `first_name` and `client_contact ''`;
- show a mapped Greek error message;
- add a PGlite regression test using the real DDL;
- route the chatbot and webhook to `leads` (via the same RPC pattern), plus a one-off visibility path for legacy rows.

## 2. Gap table

| Requirement | Today | Status | Smallest safe approach | Size* |
|---|---|---|---|---|
| **Shared Admin/Back Office login** | Roles admin / manager / back_office are separate users. Phase 2/05 adds user management, role preview (QA admin) and an audit by `auth.uid()`. | ⚠️ | Technically one auth user can be shared. Cost: no per-person audit or MFA, one password across the office, revocation affects everyone. **Decision needed.** Recommendation: individual office accounts (free). | S (config) |
| Individual Sales accounts; ownership | `assigned_to_user_id`, `owner_id`, `inside_sales_owner` exist. But any active staff member can **read every** customer/case/document (record-level RLS missing, audit C-01). | 🟡 | Ownership/team RLS once the visibility policy is decided | M–L |
| Quick lead (name only) vs lead + documents → Back Office, default assignee as a setting (Εύα) | Name-only fails (§1). CRM lead form has no document upload. No Back Office lead assignment. | ❌ | Fix §1. Optional files on the lead form. `crm_settings.default_backoffice_assignee`. | M |
| Lead source dropdown + Συνεργάτης (no commissions) | Source dropdown exists (incl. «Συνεργάτης»). `leads.partner`/`partner_notes` columns exist but are **not in the form**. | 🟡 | Add the field to the form/detail | S |
| Field Sales branching outcomes | 5 fixed outcomes in code (`VISIT_OUTCOMES`), stored as text at check-out. MyDay can create a follow-up. No manager escalation, no configuration, no reasons. | 🟡 | `visit_outcomes` config (key, label, branch, needs_date, needs_reason) + seed; manager follow-up → Back Office queue | M |
| Page-5 transitions (Υποψήφιος / Follow up / Προσφορά) | Unknown (page not available) | ❓ | Seed from the page once provided | S |
| **Daily route, 40–60+ stops, saved per agent/date** | Visits exist only **per case** (`case_visits`); MyDay shows today's case visits. RoutePanel sorts client-side and draws one OSRM route. **Nothing is saved; no route table.** | ❌ | `field_routes` + `field_route_stops` (agent, date, order, target lead/customer/case/prospect, status), RLS by agent / Back Office | L |
| Due follow-ups auto-added to the route | Follow-ups are per case with `due_at` | 🟡 | Include on route build | S |
| Map-discovered businesses | B2B pipeline (Google Maps via SerpApi → screen → review → distribute) is built (phase3/08 staged, not applied). Not connected to routes. | 🟡 | «Add to route» from approved/assigned prospects; candidates never become leads without action (already true) | M |
| Stop optimisation | Client nearest-neighbour sort + **public OSRM demo server** (no SLA, not for production), ORS if a key is set, Haversine fallback | 🟡 | Real optimisation needs a provider decision + key: ORS optimisation, Google Route Optimization or Mapbox. Segment ≥25 stops. | M + provider |
| Navigation | Per-stop deep links to Google/Apple Maps (`external-maps.ts`) | ✅ | Next-stop button; segment multi-stop links | S |
| **Arrival / check-in** | `field_checkin()` **rejects** a check-in more than 150 m from the stored location (`check_in_radius_m`) and when GPS is uncertain or missing. MyDay offers only a labelled fallback note. | ⚠️ | v2: manual check-in always succeeds (flagged `manual`, distance stored). «Φτάσατε στο…;» prompt within 75 m (setting) while the app is open. No background tracking. Point-in-time position only. | S–M |
| Visit history per business; works without a case | Visits require a case; leads and prospects have none | ❌ | Route stops + visits keyed to lead/customer/prospect (part of routes) | (in L) |
| Duplicate / ownership approval | B2B flags duplicates for review. Leads have a `duplicate` status. **No** owner/visited-by check, **no** approval queue. | ❌ | `ownership_requests` + server check in the lead-create RPC; the visit can still be recorded | L |
| Customer: first / last name | `customers.full_name` only | ❌ | Add `first_name`/`last_name` (nullable), keep `full_name` | S |
| Home address vs supply address | One `customers.address` | 🟡 | Keep `address` as home; supply address on the supply point | S |
| ID front / back | One document type «Ταυτότητα / Δικαιολογητικά» | 🟡 | Two document types (`id_front`, `id_back`) | S |
| **Multiple supply points** | Legacy `supply_points` (Aug; keyed to legacy entity ids; `supply_number NOT NULL`; commission fields; old JWT-claim RLS) — **unused** by the new CRM. `leads.supplies` jsonb. Cases hold one provider/program. | 🟡 | New additive `customer_supply_points` (customer, case link, property address, supply no. (11-digit check when given), tariff, application date, contract duration, HEDNO meter no. separate) + documents linked by `supply_point_id` | L |
| Global custom fields (Sales + Back Office) | Nothing | ❌ | `custom_field_defs` (stable key, label, type, options, section, order, archived) + `custom_field_values` (jsonb per record); no per-field migrations | M |
| **Documents never block stage moves** | Checklist warnings exist. **Phase 2/07 (staged, approved by you on 14/10) blocks** document_check/submitted/activation/completed at the server, with an admin override. | ⚠️ | Decision: keep 07 as warning-only (gates become `warn`), or keep blocking. Both versions of the prompt say never block. | S |
| Back Office stages, non-linear | 9 stages + lost/cancelled. Allowed transitions (UI; DB after 07). Return for correction (07). Back Office queue page. | 🟡 | Their 8 labels as display-only mapping (needs the labels). Allow «set current stage» for Back Office (audited). | M |
| Exception branches (declined, no answer, unsigned, provider rejected) | lost/cancelled + return-with-reason | 🟡 | Configurable reason list on lost / return / follow-up | S–M |
| Dashboard tiles + «+ Task» | Home command centre exists. QuickAdd has «Follow Up» but no «Task». | 🟡 | Add the tiles from the meeting page; «+ Task» = follow-up without a channel | S |
| Remove «Προσφορές» block from case overview | Block exists (`CaseDetailPage.tsx:348`). The tab stays. | ❌ | Remove from the overview only | S |

\* Rough engineering size, before any decision: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 5–10 days. These are estimates, not quotes.

## 3. Conflicts with work already approved or built

1. **Document gates (phase2/07):** you approved hard server blocks on 14/10. The new brief says never block. One of the two has to win.
2. **Shared office login vs** the user management, audit and role preview built in #39 (phase2/05).
3. **Check-in geofence rejects** (live since September) vs manual check-in must always work.
4. **Contact rules:** the brief says "do not invent an unsolicited-contact policy". The contact-eligibility work (branch `feat/contact-eligibility`) adds Article 11 / objection checks for sales calls. These are shown as guidance and are configurable, but counsel should confirm them.

## 4. Open decisions (needed before building)

- The 8 stage labels (display only).
- The case type values.
- The page-5 transitions.
- Map/optimisation provider and API key.
- Default Back Office assignee (initially Εύα).
- Shared office login: yes or individual accounts.
- Whether Lead and Case stay separate objects (today: yes; lead → «Μετατροπή σε Case» creates customer + case).
- The supply number format per provider (11 digits?) and whether the HEDNO meter number is stored separately.
- Document gates: block or warn.
- Visibility: may agents see colleagues' customers?

## 5. Proposed phases (each ends with tests, a checkpoint and a PR)

1. **Lead creation fix**: §1 incl. chatbot and webhook → `leads`; regression tests. Bug fix, inside the current offer.
2. Check-in: manual always + 75 m arrival prompt; visit outcomes as configuration; manager follow-up → Back Office.
3. Saved daily routes (40–60+), route stops for leads/customers/prospects, visit history, reassignment.
4. Ownership/duplicate approval queue (server-enforced).
5. Customer folder: names, ID front/back, supply points, custom fields, per-supply-point documents.
6. Back Office: stage labels, set-current-stage, exception reasons, document warnings; dashboard tiles / «+ Task» / offers block.

Phases 3–5 match what your note marks as extensions (map discovery in routes, duplicate approvals, multiple supply points, global custom fields, configurable workflows). They should go through the change request before work starts.
