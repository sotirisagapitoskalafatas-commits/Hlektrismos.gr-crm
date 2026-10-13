# ATLAS CRM — Phase 0: Evidence Matrix, Maps and Phase 1 Proposal

Date: 2026-10-14 · Branch `phase0/evidence-and-phase1-plan` (from `main` @ `f56ded5`, which includes merged PR #27).
Scope: **Phase 0 only** — read-only inspection, local checks, documents, and *proposed* SQL. No production change, deployment, secret rotation, or outbound communication was made. Complements `SECURITY_AUDIT.md` and `CRM_AUDIT.md` (same folder) rather than replacing them.

## 0. Limits (unchanged)
Live Supabase (`nonaymiwdayfuulccxrl`), deployed function versions, secrets, WordPress admin/hosting, Vercel settings and backups remain **unverified**: the only Supabase connection available to the tooling belongs to a different project and was not used, and a count-only live probe was blocked by the environment. Every "suspected-live" item needs an owner-run check (`audit-rls-readonly.sql`, `scripts/audit-anon-exposure.mjs`).

## 1. Baseline (re-run on `main`, not copied from history)
| Check | Result |
|---|---|
| `npm run typecheck` | 24 errors (pre-existing; not a release gate) |
| `eslint src` | 313 problems (281 errors, 32 warnings) |
| `npm test` (new) | 2/2 pass |
| `npm run build` | passes (does not run `tsc`) |
| CI workflows | none (`.github/workflows` absent) |
| Edge-function tests | none; Deno not available locally |

## 2. Evidence matrix (new or changed in this phase marked ★)
Status: **S**=source-confirmed · **R**=reproduced in staging · **P**=production verified · **?**=suspected/not verified.

| ID | Finding | Evidence | Sev | Status | Action |
|---|---|---|---|---|---|
| E-01 | `crm_emails` anon-readable | `20260818170000…` policy `crm_emails_select_anon` | Critical | S, live ? | Run audit SQL; apply revision-2 hardening on staging |
| E-02 | `crm_integrations` public read/write | `20260818160000…` `FOR ALL TO public USING (true)` | Critical | S, live ? | Admin-only (revision 2) + status view |
| E-03 ★ | **My PR #27 breaks the monthly tariff cron once deployed** | cron `monthly-tariff-sync` sends the **anon** key (`20260819000009…`); `sync-green-tariffs` now runs `requireStaff` | High (regression) | S | `PROPOSED_cron_repoint_and_pause.sql` **before** deploying that function |
| E-04 ★ | Hourly outreach cron selects **any** `hlektrismos_leads` row with `pipeline_status='new'` and score>0 (website, chatbot, webhook, import, manual alike); no consent/eligibility read; `contact_consent` is referenced by **zero** code | `campaign-scheduler/index.ts` L30-38; grep: `contact_consent` 0 hits in `src`/`functions` | High | S | Unschedule both schedulers until the eligibility gate exists (proposed SQL) |
| E-05 ★ | "voice" cron silently degrades to **email-queue rows** when `AUTO_VOICE_CALLS` is off | L73-74: `channel = "email"`; inserts `campaign_sends` `queued` | Medium | S | Same as E-04; scheduler must fail closed, not degrade |
| E-06 ★ | Scheduler query `.eq("deleted_at", null)` produces `deleted_at=eq.null` (not `IS NULL`), so it likely **selects nothing** — the scheduler is probably inert by accident, not by design | supabase-js semantics; `campaign-scheduler` L36 | Medium | S, live ? | Fix with `.is("deleted_at", null)` only as part of the gated redesign (fixing it alone would *activate* it) |
| E-07 ★ | `rpc("exec_sql", {sql})` called with interpolated ids; **no migration defines `exec_sql`** | `campaign-scheduler` L112; grep migrations = 0 | Critical if it exists live | S, live ? | Query 9 in audit SQL; if present, drop/revoke immediately |
| E-08 | Recipients trusted from request body | `send-campaign-email` L24 `{campaign_id, leads,…}`; `send-sms` L24; `make-voice-call` L20 `{phone,…}` | High | S | Phase 2: server-selected recipients by campaign ID |
| E-09 | `make-voice-call`: no consent/hours/DNC/frequency checks (only a recording notice in the script) | grep: no such logic | High | S | Gate in eligibility service; keep voice off |
| E-10 | SMS has no suppression/eligibility check | `send-sms` | High | S | Central eligibility service |
| E-11 ★ | **Role simulator is client-side and available to every user**; effective `role` = `localStorage` override | `auth.tsx` L40/101; `RoleSwitcher.tsx`; `PreferencesPage.tsx` L78-89 | Medium | S | Admin-only, labelled "view as", never used for writes/authorization |
| E-12 | `requireStaff` = active profile only; no per-action permission | `_shared/guard.ts` | High | S | Capability model (§5) |
| E-13 | Any active staff reads/updates all customers/cases/docs/signatures | `20260909120000…` `is_staff()` policies | High | S, live ? | Ownership/team RLS (Phase 2) |
| E-14 | WordPress form → CRM path unknown; React form → `insert_website_lead` → `public.leads` | `ContactPage.tsx`; live site is WordPress | High | S (React) / ? (WP) | Owner test of both paths |
| E-15 | Secrets in `crm_settings` rows; service-role key read by cron from a table | `20260819000009…` | Medium | S | Vault (Phase 1) |
| E-16 | WordPress hardening gaps (headers, user enumeration, version disclosure) | passive checks, see SECURITY_AUDIT S-08 | High | P (passive) | WP host work |
| E-17 | Scraped prospects are inserted straight into the legacy `leads` table (`scrape-b2b` L226); no provenance/consent fields, so they are indistinguishable from enquiries. The scheduler reads `hlektrismos_leads`, so today scraped rows are *not* in its query — **but consolidating the two lead tables (Phase 2) would put them there unless provenance and eligibility exist first** | `scrape-b2b/index.ts`, `src/lib/scraper.ts` | High | S | Prospect staging (Phase 5) |
| E-18 | Stored XSS / unsigned offer links / unauth functions | fixed in PR #27 | — | S fixed, **deploy ?** | Deploy with E-03 handled |

Corrections to my earlier reports: (1) the claim "pg_cron still works" for guarded functions was wrong for E-03 (erratum added to `SECURITY_AUDIT.md`); (2) my first proposed SQL gave all active staff access to integrations — revised to admin-only.

## 3. Intake and data-model map (from code)

```
WordPress form (Elementor) ──► ??? (not in repo) ───────────────────────────────┐
React ContactPage / LandingPage ─► rpc insert_website_lead ─► public.leads        │  (age gate + consent version)
Chatbot callback (edge `chat`)  ─► service role ─► hlektrismos_leads              │
Ad webhooks (receive-lead-webhook) ─► hlektrismos_leads (lawful_basis default "consent")
fetch-emails (inbound mail)     ─► leads/hlektrismos_leads
B2B scraper (scrape-b2b, server-side insert L226) ─► leads (legacy path)            │
Manual / Excel import / dashboard ─► hlektrismos_leads                              ▼
                                                  CRM screens (readers differ per screen: verify)
```
Table usage (call sites in `src` / `supabase/functions`): `hlektrismos_leads` 17/20 · `leads` 9/2 · `customers` 6/0 · `hlektrismos_customers` 5/0 · `cases` 5/0 · `follow_ups` 5/0 · `campaigns` 6/0 · `consent_records` 5/0 · `timeline_events` 2/0 · `business_events` 1/0 · `activity_log` 1/0 · **`organizations`, `teams`, `assignments`, `work_items`: 0/0 (unwired)** · **`contact_consent`: 0/0**.
Implication: the "shared Case + timeline" foundation exists as DDL only; two lead tables and two customer tables coexist; consent data is stored in places nothing reads at send time.

## 4. Outbound communications map
| Path | Trigger | Recipient source | Checks today | Gap |
|---|---|---|---|---|
| `send-campaign-email` | staff UI / (scheduler queues only) | request body | staff auth, `ai_paused`, email suppression + unsubscribe link | no eligibility/consent, no approval, no rate limit |
| `send-sms` | staff UI | request body | staff auth, `ai_paused` | no suppression/eligibility |
| `make-voice-call` | staff UI / scheduler (gated by `AUTO_VOICE_CALLS`) | request body | staff auth | no consent/hours/DNC/frequency |
| `campaign-scheduler` (2 crons) | pg_cron hourly | DB query (all new leads) | `ai_paused`, env flag for voice | selection ignores consent/source; `exec_sql` |
| `send-lead-confirmation` | public form | lead just created | 15-min recent-lead guard, escaping (PR #27) | fire-and-forget, no retry record |
Launch gate (unchanged): nothing promotional to scraped contacts until counsel approves in writing **and** the owner authorizes.

## 5. Authorization map and capability model (proposal)
Today: UI role (`profiles.role`, overridable client-side) → nav only; DB: `is_staff()` (active profile) for most tables, admin/manager for deletes, admin for `crm_settings`; edge: `requireStaff` (active profile).
Proposed capabilities (server-enforced via `public.has_permission(text)` + `requirePermission(req, cap)`; table `role_permissions(role, capability)`; seeded from the matrix below, editable only by admin, every change audited):

| Capability | admin | manager | inside_sales | field_sales | back_office |
|---|:-:|:-:|:-:|:-:|:-:|
| crm.read.assigned / team / all | all | team | assigned | assigned | cases in processing |
| case.update.sales / .operations | ✔/✔ | ✔/— | ✔/— | ✔/— | —/✔ |
| case.documents.verify | ✔ | — | — | — | ✔ |
| prospecting.search / import | ✔ | ✔ | search | — | — |
| campaign.draft / approve / send | ✔/✔/✔ | ✔/✔/— | draft | — | — |
| communications.email / sms / voice.initiate | ✔ | ✔ | per policy | — | — |
| integrations.manage · users.manage_roles · audit.read | ✔ | — · — · team | — | — | — |
| pii.export | ✔ (logged) | approval | — | — | — |
Decisions needed from the owner are in §7.

## 6. Phase 1 proposal (smallest safe patch; staging first; no production writes)
**Goal:** remove confirmed exposure and make privileged actions authorizable without changing day-to-day workflows.

| # | Change | Files | Staging verification | Rollback |
|---|---|---|---|---|
| 1 | Owner runs audit SQL + exposure script; record results here | `audit-rls-readonly.sql`, `scripts/audit-anon-exposure.mjs` | n/a (read-only) | n/a |
| 2 | Apply revision-2 RLS hardening to staging; confirm non-admin screens use `crm_integrations_status` | `proposed/PROPOSED_audit_rls_hardening.sql` | anon REST returns 0 rows; admin can edit integrations; agent cannot | rollback block in file |
| 3 | Re-point tariff cron; **unschedule both outreach schedulers** | `proposed/PROPOSED_cron_repoint_and_pause.sql` | `select jobname from cron.job`; tariff function returns 200 with service key | re-create jobs from original migration |
| 4 | `role_permissions` + `has_permission()` + `requirePermission()` guard; apply to send-email/SMS/voice, campaign, integrations, export | new migration + `_shared/guard.ts` | synthetic users per role: allowed/denied matrix | feature-flag the guard (log-only mode first) |
| 5 | Restrict role simulator to admin, mark as "view only" | `auth.tsx`, `RoleSwitcher.tsx`, `PreferencesPage.tsx` | non-admin cannot see/use it; writes ignore override | revert commit |
| 6 | Move SMTP/Infobip/Vapi/service-role secrets to Vault/function secrets | migration + function reads | functions work with env-only secrets; table rows removed after verify | keep old rows until verified |
| 7 | Authorization test harness (SQL, synthetic users) + minimal CI (`tsc` baseline, eslint new-code, `npm test`, `npm audit`, secret scan) | `scripts/`, `.github/workflows/ci.yml` | CI green on PR | remove workflow |
| 8 | Prove WordPress and React forms each land a lead; document the WP path | runbook | owner submits one synthetic test per form | n/a |

Estimated effort for Phase 1: 8–11 engineer-days (matches the master plan), assuming staging project and Vault access are provided.

## 7. Decisions / inputs needed from the owner
1. Provide a **staging** Supabase project (or approve creating one) and confirm the production project ref.
2. Run the two read-only checks and share the summary (never keys).
3. How does the WordPress form deliver enquiries today (plugin, email, webhook)?
4. Role policy: may agents see colleagues' leads? may Back Office see ID documents? who approves bulk campaigns and exports?
5. Confirm the PR #27 functions are/aren't deployed yet (affects E-03 urgency).
6. Name the Greek data-protection counsel/process for the outreach launch gate.

## 8. Stop point
Per the master prompt, work stops here for review. Nothing beyond Phase 0 (no schema change, no UI redesign, no outreach code) has been started.
