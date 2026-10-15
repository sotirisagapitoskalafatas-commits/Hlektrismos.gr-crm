# Staged migration — phase 3 (NOT applied)

## 08 — B2B pipeline: Discover → Screen → Review → Distribute

`08_b2b_prospects_review_distribution.sql` + the rewritten `scrape-b2b` edge function. Apply on staging first, then production with the owner's approval and a backup; deploy the function **after** the SQL (it needs the new tables).

- **Discover:** `scrape-b2b` takes several categories, regions, cities and keywords; plans one search per (term × place), capped per run and by a **daily quota** (`b2b_scraper_config.daily_query_limit`, default 100; per-run cap = `rate_limit_per_minute`). Every run is a `b2b_search_jobs` row (who, parameters, counts, errors). Callers: admin, manager, inside sales, back office (role read from the database) or the service role (AI orchestrator; its old `{category, region}` body still works).
- **Screen (database trigger):** locale-independent name key (accents, final ς, legal forms Α.Ε./ΕΠΕ/ΙΚΕ… removed), phone key (last 10 digits), domain, quality flags, and a **duplicate flag** against leads, customers and earlier prospects. Duplicates are flagged for the reviewer, never merged automatically. The same Google listing seen again only updates `last_seen_at`.
- **Review** (`b2b_review`, Back Office/admin/manager): approve, exclude (reason), duplicate (reason), reopen. Exclusion keeps only what prevents re-import (name, phone, reason); address, website and coordinates are cleared. Audited in `activity_log`.
- **Distribute** (`b2b_distribute`, same roles): manual / round-robin / least workload over active Inside or Field Sales agents. Each approved prospect becomes **one lead** (source `import`, type B2B) assigned to the agent, who is notified. **Internal work only — nothing is sent to the business.** The lead notes that the phone has **not** been screened against the Article 11 opt-out registers.
- **Before:** the scraper inserted results straight into `leads` (client import, or `importToDb` with the service role). That path is removed.
- Local evidence: `node --test supabase/tests/b2b-pipeline.test.mjs` — 5/5; `supabase/functions/_shared/__tests__/b2b-search.test.mjs` — 4/4.

### Needs legal / business confirmation
- Retention of excluded/duplicate prospects (minimal data kept to avoid re-import) — Greek privacy counsel.
- Article 11 register screening before any promotional call (the `phone_screening` field exists; no screening integration yet).
- Daily quota and SerpApi plan limits.

## 09 — Contact eligibility: objections, consent with evidence, Article 11 screening

`09_contact_eligibility.sql`. Apply **after** phase1/01–04 and phase3/08, on staging first, then production with the owner's approval and a backup.

- **Keyed to the contact point, not the record.** Phone → last 10 digits; email → lower-cased (the website's `not-provided@hlektrismos.local` placeholder is ignored). The same rules live in `supabase/functions/_shared/contact-keys.ts`, and a test checks that both give the same result. A «no» recorded on one lead therefore applies to the same number or email on every lead, customer, B2B prospect and legacy row.
- **Tables** (no write policies; reads only for admin / manager / back office):
  - `contact_objections`: scope «marketing» or «all», per channel or all channels, with reason, source and batch. Lifting is admin-only with a reason.
  - `contact_consents`: per channel, `granted` / `withdrawn`. A grant is impossible without a basis, an evidence reference and a date.
  - `article11_screenings`: history of register checks; the latest one wins.
- **Functions:**

  | Function | Who may run it | What it does |
  |---|---|---|
  | `contact_facts(phone, email)` | any active staff member | Returns flags and records, never the address |
  | `record_contact_objection` | any staff member | Records an objection. Also adds the email to `email_suppressions` |
  | `withdraw_contact_consent` | any staff member | Withdraws consent for a channel |
  | `record_contact_consent` | admin / manager / back office | Records consent; evidence is required and the date may not be in the future |
  | `record_article11_screening` | admin / manager / back office | Records a register check. The date must be within the last year. Also sets `b2b_prospects.phone_screening` when 08 is present |
  | `lift_contact_objection` | admin | Lifts the whole recorded «no» and removes the suppression it created. Suppressions from an unsubscribe link stay |

  Every change is written to `activity_log`.
- **The decision is code, not SQL:** `supabase/functions/_shared/eligibility.ts`.
  - **Enforced** by the outreach gate (`outreach-gate.ts` + `outreach-loaders.ts`, which now read these tables) before any SMS, email or voice send.
  - **Shown** in the CRM by «Επικοινωνία & συγκαταθέσεις» on lead and customer pages.
  - **New channel `call`** (a person phoning for sales):
    - not subject to the campaign master switches;
    - needs no objection and a fresh (≤30 days) «not listed» Article 11 screening, unless there is consent for calls with evidence;
    - a «listed» number is always refused;
    - contact hours are 09:00–20:00 Athens time.
  - Automated channels keep every earlier rule (master switch, legal approval, consent with evidence, suppression, frequency, hours). They now also check objections, and voice also checks the Article 11 screening.
- **Replaces** phase1/02's `contact_permissions`, which was keyed to the legacy `hlektrismos_leads` table and had never been applied anywhere. phase1/02 now holds only `outreach_decisions`.
- **Local evidence:**
  - `node --test supabase/tests/contact-eligibility.test.mjs`: 6/6.
  - `supabase/functions/_shared/__tests__/contact-eligibility.test.mjs`: 6/6.
  - `gate.test.mjs`: 8/8.
- **Rollback:** at the end of the file. It drops the recorded objections, consents and screenings, so export them first.

### Needs legal / business confirmation (the rules are conservative engineering defaults, not legal advice)
- Whether consent for calls with evidence may replace the Article 11 screening (currently yes, except for a «listed» number).
- Screening validity (30 days) and contact hours (09:00–20:00).
- How the register is checked in practice: provider lists, a vendor, or manual. Today a person records the result.
- Whether «existing customer» is an acceptable basis per channel (soft opt-in for similar products), and the wording and version of consent texts.
- Whether B2B email to a company's generic address needs consent (currently yes: no consent, no promotional email).
