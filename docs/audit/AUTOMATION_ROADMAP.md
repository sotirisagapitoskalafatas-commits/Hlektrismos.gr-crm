# Automation, B2B Prospecting & Campaign Roadmap

Date: 2026-10-13. This is a design and recommendation document. **Nothing here has been built, deployed or run.** It is a technical plan, not legal advice: have a Greek data-protection/ePrivacy lawyer validate §5 before any outbound marketing.

## 1. What already exists in the repo (reuse it, don't rebuild)

| Capability | Where | Assessment |
|---|---|---|
| B2B discovery | `functions/scrape-b2b` (staff-only) + `src/components/app/ProspectingPage.tsx` | Uses **SerpApi Google Maps search** (a paid, API-based source, not page scraping) over 14 Greek regions × 20 categories. Good basis. Gaps: no source registry/terms record, no checkpointing, no dedupe by registry ID (ΓΕΜΗ/ΑΦΜ), no quality score, no per-source budget, no pause switch, writes straight to leads |
| Enrichment | `enrich-lead`, `aade-lookup` | AADE lookup for ΑΦΜ is a good, official enrichment step |
| Email campaigns | `send-campaign-email`, `_shared/email-compliance.ts`, `unsubscribe`, `email_suppressions` | **Strong start**: suppression check, signed one-click unsubscribe, List-Unsubscribe, postal address |
| Campaign orchestration | `campaign-scheduler` (pg_cron), tables `campaigns`, `campaign_sends`, `voice_calls`, `contact_consent` | Checks consent for automated calls. Gaps: no approval stage, no send-window/timezone control, no per-channel pacing, no stop switch, no idempotency key |
| SMS / WhatsApp | `send-sms` (Infobip) | Staff-only; header comment already notes opt-in requirement |
| Voice AI | `make-voice-call` + `vapi-webhook` | **No** calling-hours, do-not-call, or recording-disclosure checks (SECURITY_AUDIT S-14); webhook was unauthenticated (fixed in branch) |
| Automations | `AutomationPage.tsx` (1,105 lines), `ai-orchestrator`, `orchestrator`, `agent-worker`, 7 `cron.schedule` jobs, `business_events` (append-only) | Real pieces, but no common run history, retry policy, dead-letter or alerting; service-role key read from a table by cron |

## 2. Target architecture (incremental, no rewrite)

```
 Sources (approved only) ─► adapters ─► raw_prospects (staging) ─► validate ─► dedupe/merge ─► score
                                                                                   │
                         human compliance review queue ◄───────────────────────────┘
                                   │ approved
                                   ▼
        prospects (company-level) ─► assignment rules ─► CRM lead + follow-up task (SLA)
                                   │
                                   ▼  (only if eligible_channel = true AND not suppressed)
        campaign engine: audience ─► approval ─► test send ─► paced send ─► webhooks ─► suppression
```

### 2.1 Tables (new, additive; all with RLS, `organization_id`, audit columns)
* `prospect_sources(id, name, kind[api|licensed|manual_import|website], terms_url, allowed_use, rate_limit, daily_budget, enabled, reviewed_by, reviewed_at)` — a source cannot run until a human marks it reviewed.
* `prospects(id, company_name, gemi_no, afm, website, category_code, address, region, municipality, source_id, source_url, collected_at, last_verified_at, quality_score, score_factors jsonb, status, assigned_to, merged_into)` — **company-level**; natural-person contact fields live in a separate `prospect_contacts` table with `purpose`, `necessity_note`, `retention_until`.
* `contact_permissions(contact_id, channel, basis[consent|legitimate_interest|existing_customer|none], evidence, captured_at, objected_at, expires_at)` — never defaulted to consent.
* `prospect_events` (append-only, reuse the `business_events` pattern).
* `automation_runs(id, workflow, version, correlation_id, trigger_event_id UNIQUE, status, attempts, started_at, finished_at, error_class, payload_redacted)` + `dead_letters` — gives every workflow idempotency, history and a failure queue.

### 2.2 Pipeline statuses
`discovered → validated → deduplicated → qualified → compliance_review → approved → assigned → in_progress → converted | disqualified | suppressed` (configurable list; transitions enforced in a SQL function, not in the UI).

### 2.3 Scraper/ingestion rules
One adapter per approved source behind a common interface (`fetchPage(cursor) → items`), run as a **scheduled worker with checkpoints** (not inside a request handler), with rate limit + jitter + exponential backoff, idempotent upsert on (`source_id`, `external_id`), SSRF-safe fetch (allow-list hosts, block private IP ranges, no redirects off-host), a global pause flag, per-source daily budget, and synthetic-fixture tests. **Never** bypass logins, CAPTCHAs, paywalls or robots/terms restrictions.

### 2.4 Source options for Greece (verify each one's terms before enabling)
| Source | Use | Notes |
|---|---|---|
| ΓΕΜΗ (General Commercial Registry) | Company identity, legal form, address, KAD codes | Check the official open-data/API access conditions and reuse licence |
| AADE ΑΦΜ lookup (already integrated) | Validate ΑΦΜ / activity | Official service; respect its credentials/limits |
| Google Maps via SerpApi (already integrated) | Local business discovery, phone, website | Paid provider; check SerpApi and Google terms on storage/reuse; store provenance |
| Chambers of commerce / trade associations | Member directories | Often restricted — ask for a licensed export |
| Licensed B2B data providers (e.g. ICAP, Kompass, Dun & Bradstreet) | Rich firmographics + verified contacts | Highest compliance confidence; compare price, Greek coverage, data-protection terms |
| Manual/CSV import of lists you own | Existing relationships | Needs documented basis and import preview/rollback |
| Company websites | Public company contact page | Only company-level details, subject to site terms and robots.txt |

## 3. Automation engine (workflows)

Build on `pg_cron` + edge functions + the new `automation_runs` table (don't add a new orchestration product yet). Every workflow = trigger + conditions + actions + permission scope + idempotency key + max attempts (3, exponential backoff) + timeout + dead-letter + metrics + version + dry-run mode.

| Workflow | Trigger | Key actions |
|---|---|---|
| **New enquiry** (website, chatbot, WordPress, ads) | row inserted | assign by rule → create SLA task (e.g. 15 min working hours) → notify owner → send acknowledgement (retryable, deduped by event id) |
| Unassigned escalation | cron 5 min | notify manager if lead unassigned > X min |
| Overdue follow-up | cron hourly | reminder → escalate after 24 h |
| Duplicate review | on insert | normalized phone/email/ΑΦΜ match → merge-review task |
| Status-change notifications | `business_events` | notify customer/agent per template |
| Contract-expiry win-back | existing cron | add approval + suppression checks |
| Failed-integration alert | cron | any dead-letter or provider error rate spike → email/Slack to admin |
| Daily CRM health summary | cron 08:00 | leads by status, SLA breaches, failed jobs, opt-outs |
| Stale prospect requalification | weekly | refresh verification, retire expired data |

Guard against automation storms: per-record trigger cooldown, max 1 automatic message per lead per 24 h, recursion depth limit, global kill switch (`crm_settings.automation_paused`, which `20260820000001_ai_paused_rbac_killswitch.sql` already hints at — reuse it).

## 4. Channels: email, SMS, calls

**Provider choice (present, then decide):** Email — Amazon SES (eu-central), Brevo, Postmark, Mailgun EU; SMS — Infobip (already in repo), Twilio, Vonage, Greek aggregators; voice — Vapi (already used) on top of Twilio/Telnyx or a Greek SIP carrier. Compare: Greek sender-ID/caller-ID rules, delivery webhooks, EU data residency and DPA/sub-processors, price, opt-out handling. Keep one adapter per *selected* provider only.

**Hard guardrails in code** (before any live send): suppression + objection check at send time; channel eligibility from `contact_permissions`; two-person rule (author ≠ approver); test-send; send windows in Europe/Athens; per-channel rate limit and daily spend cap; idempotency key per (campaign, contact); bounce/complaint/STOP webhook handlers writing to suppression; immutable audit event per send; pause/cancel/emergency stop. **Calls:** distinguish internal reminders and click-to-call by an agent (low risk) from automated/AI/prerecorded calls (need prior consent and disclosure under Greek rules; add calling-hours and do-not-call checks and an AI-disclosure line).

## 5. Greek/EU compliance checklist (for lawyer validation)
* B2B ≠ exempt: business emails/phones of sole traders and named employees are personal data (GDPR). Record lawful basis and purpose per contact; apply data minimisation and retention.
* Electronic marketing (email/SMS/automated calls) needs prior opt-in for natural persons under Law 3471/2006 art. 11 (existing soft opt-in only for own customers' similar products); live agent calls require checking the national do-not-call register (art. 11/Hellenic DPA guidance) — **confirm current rules with counsel**.
* Provide Art. 13/14 privacy notice at collection or first contact for scraped/third-party data; easy objection; data-subject request workflow (access, erasure, objection) with SLAs.
* Records of processing, DPAs with every processor (Supabase, SerpApi, Infobip, Vapi, Google, OpenAI, email provider), transfer assessment (US sub-processors), breach-response playbook (72 h to the Hellenic DPA).
* The age gate/consent capture already built into `insert_website_lead` is a good pattern to reuse.

## 6. Phased plan (effort = engineering days for one developer, assumptions in brackets)

| Phase | Scope | Effort | Notes |
|---|---|---|---|
| 0 | Deploy audit fixes to staging then prod; run RLS/anon audit; secrets; backup restore test | 3–5 d | needs Supabase access + owner approvals |
| 1 | Unified enquiry intake (WordPress webhook → RPC), assignment rules, SLA tasks, acknowledgement with retries, `automation_runs` + alerting | 8–12 d | biggest immediate business value: no lost leads |
| 2 | RLS by ownership/team (C-01), role matrix, audit log | 8–10 d | uses existing org model |
| 3 | Prospect staging tables, dedupe/merge, scoring, compliance review queue, source registry; harden `scrape-b2b` | 10–15 d | reuse SerpApi + AADE; add ΓΕΜΗ adapter after terms check |
| 4 | Campaign engine v2: approvals, pacing, windows, webhooks, suppression, kill switch (email first) | 10–15 d | SMS/voice after legal sign-off |
| 5 | Reporting dashboards (funnel, SLA, source ROI, opt-outs) + CI (tests, tsc, lint, audit) | 6–8 d | |

Dates are deliberately not promised; they depend on provider onboarding (sender IDs, DPAs) and legal review.

## 7. Ideas for growth (low risk first)
Click-to-call and call-outcome logging for agents; WhatsApp click-to-chat from the website; lead scoring from bill upload (kWh, current provider, contract end) to prioritise callbacks; referral and customer-win-back flows to **existing customers** (stronger lawful basis); bill-analysis landing pages per service (PV, EV charging, storage); local SEO + Google Business Profile reviews; UTM/source attribution into leads for channel ROI.
