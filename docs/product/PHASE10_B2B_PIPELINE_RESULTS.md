# ATLAS CRM — B2B prospecting pipeline (Discover → Screen → Review → Distribute)

Branch `feat/b2b-review-distribution` (from `main` @ `a96b230`). **No production change, no deployment, no message sent.** Server part: `supabase/staged-migrations/phase3/08` + rewritten `scrape-b2b` (both need the owner's approval to apply/deploy).

## Audit of what existed
| Finding | Evidence | Now |
|---|---|---|
| Search results went straight into `leads` as new leads (no review) | `scrape-b2b` `importToDb` + `lib/scraper.ts` `importScrapedBusinesses` | Removed; results land in `b2b_prospects` (review queue) |
| One category + one region per search; no saved searches, no job record, quota settings unused | `scrape-b2b` body `{category, region}` | Multi-select categories/regions/cities/keywords, saved searches, `b2b_search_jobs`, daily quota + per-run cap enforced server-side |
| Duplicate check only inside one result set (name+phone) | `scrape-b2b` | Database trigger flags duplicates against leads, customers and earlier prospects |
| Any staff member could spend SerpApi quota | `requireStaff` | Only admin, manager, inside sales, back office (role from DB) or the service role |

## The pipeline (CRM → B2B Prospecting)
| Tab | Who | What |
|---|---|---|
| Αναζήτηση | admin, manager, inside sales, back office | categories × regions/cities × keywords; preview of how many searches it costs; saved searches; result summary (found / new / possible duplicates) |
| Έλεγχος | all four see it; back office / admin / manager act | duplicate and data-quality flags; approve; exclude (reason, data minimised); duplicate (reason); reopen; CSV |
| Ανάθεση | back office / admin / manager | manual, round-robin, least workload (open leads shown); each prospect becomes one lead for the agent, who is notified |
| Ιστορικό αναζητήσεων | all four | who searched what, counts, errors |

A permanent notice states that finding a business is not permission to contact it and that Article 11 screening is required before promotional calls.

## Validation (local)
| Check | Result |
|---|---|
| `npm test` | **112 / 112** (+5 PGlite tests for 08, +4 search-planning tests) |
| Quality gate | 18 / 281 / 32 — unchanged |
| `npm run build` | passes |
| `npm run qa:ui` (mock; synthetic search results, never SerpApi) | see PR (B2B section 11/11) |

Screenshots: `docs/product/screenshots/after/b2b-search-1440.jpg`, `b2b-review-1440.jpg`, `b2b-assign-1440.jpg`.

## Next phases (not in this PR)
1. Central contact-eligibility engine (consent / objection / Article 11 screening per channel) — prerequisite for any outreach.
2. Campaign Center (audience preview, approval, dry run, scheduling, emergency stop) — stays disabled until legal approval.
3. Greek AI voice prototype (provider evaluation with native speakers; internal test environment only).
