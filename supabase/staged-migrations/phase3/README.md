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
