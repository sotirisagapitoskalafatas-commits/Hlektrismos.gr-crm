# Hlektrismos.gr — CRM OS Constitution & Architecture Audit

Status: **v1 draft (data-model audit)** — Project `nonaymiwdayfuulccxrl`, repo `C:\Users\kalaf\hlektrismos-port`, target `origin/main`.
Document purpose: define the canonical entities, relationships, ownership, events, workflows, AI hierarchy, governance and security of the platform, and normalize the duplicate concepts found in the current schema *before* more features are built.

This document is a **constitution**, not a feature list. Every table, column and module below either exists today or is specified as the canonical target. Where a change is required, it is marked **[MIGRATE]**, **[NEW]** or **[NORMALIZE]**.

---

## 1. Non-negotiable rules (carried from the master prompt)

1. Never rebuild the approved visual shell (Liquid Glass, top bar, dashboards, role nav, responsive behavior).
2. Never weaken auth, authorization or RLS. UI filtering is **never** a security boundary.
3. Never fabricate business metrics, customer data, coordinates, or communication delivery.
4. A message (email/SMS/call/WhatsApp/Viber/social) is recorded as **delivered only when the provider confirms it**; otherwise it is `pending` / `failed` / `undelivered`.
5. Never expose or store plaintext secrets (passwords, API keys, tokens, service-role creds, webhook secrets). Encrypted at rest in `integration_credentials` (already column-`encrypted_token`) only.
6. Secrets never enter Git. No force-push, no history rewrite, no production-data destruction.
7. QA uses dedicated test accounts only. Never modify real employee accounts for QA.
8. **CRM database is the source of truth.** AI memory, embeddings and RAG content are derived/secondary and can never silently overwrite CRM truth.
9. AI cannot take unrestricted destructive action. Every agent has explicit permissions, budget, rate limit, approval policy and human override.
10. No automated communication to opted-out/suppressed contacts. Mass communication requires consent + audience validation + approval before send.

---

## 2. Current-state audit (live schema, project `nonaymiwdayfuulccxrl`)

34 public tables. Quick truth check at the time of this audit:

| Domain | Existing tables | Assessment |
|---|---|---|
| Users | `profiles` (single `role` text col) | ❌ no roles/teams/departments/org |
| Leads | `leads` (54 cols), `site_leads` | owner/assignee mix of FK + free-text |
| Customers/Companies/Sites | `customers` (`company` is text) | ❌ no company/site entities |
| Deals | `deals` (`assigned_to` is text, no FK) | orphaned assignment |
| Cases | `cases` (35 cols; 4 typed owners) | richest table; ownership style **not** reused elsewhere |
| Service requests | `service_requests` (`owner` text) | duplicate pipeline concept |
| Visits/Follow-ups | `case_visits`, `follow_ups` | `follow_ups` doubles as task queue |
| Docs/Signatures/Offers | `case_documents`, `case_signatures`, `case_offers` | case-scoped, fine |
| Calendar/Tasks | `calendar_events` (`task_id` self-FK) | tasks conflated with events |
| Communications | `communications` (`comm_type` text), `chat_messages` | no channel registry, no provider delivery state |
| Campaigns | `creative_campaigns/…` (creative-focused), `leads.campaign_id`/`campaign_name` text | no real Campaign entity |
| Automation | `renewal_reminders`, `agent_action_approvals` | ❌ no workflow/trigger engine |
| AI | `agent_sessions`, `agent_audit`, `agent_action_approvals`, `chat_messages`, `knowledge_base` | good seed; no agent registry, no actor typing |
| Logs | `timeline_events`, `activity_log`, `agent_audit`, `consent_log` | 4 overlapping logs, no shared shape |
| Notifications | `notifications` + `app_notifications` | duplicate pair |
| Providers | ❌ none — `provider`/`program` are **text** in `leads` & `cases` | must become an entity |
| Commissions | ❌ none (closest `invoices.type` text) | must be built |
| Tasks | ❌ none | must be built |
| Territories | ❌ none | must be built |
| Suppression/consent | `consent_log`, `leads.gdpr_consent` | needs channel-level suppression registry |
| Payments | ❌ none (only `invoices.paid_at`) | invoice-led, extend |
| Tags | `tags[]` text arrays on several tables | normalize to `tags` + `tag_assignments` |
| Storage | 4 buckets, `case_documents.file_url`, `case_signatures.image_url` | blobs in `storage.*`, fine |

### 2.1 Ownership-field inventory (the duplicate-concept risk)

"Who owns / created / assigned this?" is currently expressed in **four inconsistent styles**:

| Style | Example columns | Problem |
|---|---|---|
| A. uuid FK → `profiles` | `cases.owner_id`, `cases.inside_sales_owner`, `cases.field_sales_owner`, `cases.back_office_owner`, `cases.next_action_owner_id`, `leads.created_by_user_id`, `leads.assigned_to_user_id`, `leads.first_contact_user_id`, `leads.converted_by_user_id`, `follow_ups.assignee_id` | correct pattern — reuse it everywhere |
| B. free-text name, no FK | `deals.assigned_to`, `service_requests.owner`, `leads.assigned_agent` | orphan risk, breaks RLS/AI/permissions |
| C. free-text creator/actor | `creative_campaigns.created_by`, `creative_runs.actor`, `social_connections.created_by` | disconnected from user graph |
| D. role semantics | `profiles.role` (text), `timeline_events.role`, `chat_messages.role` | no Roles table to enforce |

**Decision:** one canonical ownership model (Section 4) applied to every business object. All style B/C columns **[NORMALIZE]**; style A becomes the only pattern.

### 2.2 Module map (front end) — no duplicates of these beyond their job

`AppShell` role nav (Admin/Manager/Inside/Field/BackOffice), `DashboardPage` + per-role dashboards, `LeadsPage`, `CasesPage`, `CustomersPage`, `MapPage`(+`RoutePanel`), `MyDayPage`, `FollowUpsPage`, `ReportsPage`, `BackOfficePage`, `SettingsPage` (+`SalesAgentsTab`, `ProvidersCommissionsTab`, `ExcelSyncSettings`), `CalendarView`, `LeadDetailSlideout`, `CaseDetailPage`, `CaptureModal`, `SignaturePad`, `DocumentGenerator`/`DocumentTemplateEditor`, `ChatBot`/`CrmAiAssistantWidget`, `LiveVoiceSupervisor`, `MarketRAGSearch`/`MarketRagFolders`, marketing pages. Map stack is MapLibre + CARTO (authenticated; attribution retained).

---

## 3. Normalization decisions (resolving the "same thing twice" risks)

| Concept | Current state | Canonical resolution |
|---|---|---|
| Owner on lead vs deal vs case | `leads.assigned_agent`(text) + `leads.assigned_to_user_id`; `deals.assigned_to`(text); `cases.owner_id`+3 typed owners; `service_requests.owner`(text) | One **`assignments`** table (entity_id, entity_type, role_type, user_id, team_id, assigned_by, method, reason, from/to, at) + **typed convenience FKs kept only on `cases`** (source of truth = assignments; FKs derive from it) |
| Provider | text `leads.provider`, `cases.provider`, `cases.program` | **[NEW] `providers`** entity; `leads.provider_id`, `cases.provider_id`, `case_offers.provider_id`; `program` becomes `products.name` |
| Customer vs Company vs Site | `customers` (company text), `site_leads` (site text) | **[NEW] `companies`**, `companies_sites`, `contacts`; `customers` keeps personal ledger; `leads.company_id`, `leads.site_id` |
| Lead vs Deal vs Service Request | `leads`, `deals`, `service_requests` (overlapping pipeline) | Lead is pre-sale record; **Deal is the commercial opportunity**; `service_requests` folds into deal->case intake and is eventually **[MIGRATE]** into `deals` + `cases` flow; `cases` is fulfillment |
| Follow-up vs Task | `follow_ups` used as task queue; `calendar_events.task_id` self-FK | **[NEW] `tasks/work_items`** canonical; `follow_ups` becomes a work-item (defer date, owner); `calendar_events` stays calendar |
| Timeline vs Activity Log vs Audit | 4 overlapping logs | One **`business_events`** backbone (Section 6); `timeline_events` becomes a case-scoped view/filter over it; `activity_log` retired after migration; `agent_audit` becomes the `ai_events`/`actor=AI` channel; `consent_log` is its own compliance store |
| Notifications | `notifications` + `app_notifications` | `notifications` remains (channel-agnostic, per-user) — `app_notifications` **[MIGRATE]** into it with `type`, `link`, `read_at` |
| Campaign | `creative_campaigns` (creative) + `leads.campaign_*` text | **[NEW] `campaigns`** (real), `campaign_audiences`, `campaign_journeys`, `campaign_runs`; `creative_campaigns` becomes `campaign_creative` |
| AI agent identity | `agent_sessions` by name, `agent_audit.agent_name`, creative `actor` text | **[NEW] `ai_agents` registry**; all AI actions emit events with `actor_type=AI_AGENT` + `actor_id` |
| Communication identity | `communications.contact_email/phone` + `integration_credentials` | **[NEW] `communication_identities`** (user email/phone/SMS/WhatsApp/social identities), `channel_providers`, `messages` with provider delivery state |
| Tags | `tags[]` arrays | **[NEW] `tags` + `tag_assignments`** (polymorphic) **only if** cross-entity tag queries are needed; otherwise keep arrays (explicitly chosen) |

---

## 4. Canonical ownership & provenance model

For **every** business object (Lead, Customer, Company, Site, Deal, Case, Offer, Visit, Document, Signature, Conversation, Campaign, Work Item, Task):

- `created_by` (actor) — never overwritten; actor may be HUM_USER / AI_AGENT / AI_MANAGER / AI_ORCHESTRATOR / JARVIS / SYSTEM / INTEGRATION / IMPORT.
- `source` — where it originated: WEBSITE, FACEBOOK, INSTAGRAM, GOOGLE, REFERRAL, PARTNER, PHONE, WALK_IN, FIELD_SALES, INSIDE_SALES, IMPORT, WEB_DISCOVERY, AI_AGENT, CAMPAIGN, API, OTHER (text column + optional `campaign_id`, `source_url`).
- **current owner** = `assignments` row with `role_type = CURRENT_OWNER`, `active=true`.
- **departmental owners** = `assignments` rows keyed by `role_type` (`INSIDE_SALES`, `FIELD_SALES`, `BACK_OFFICE`, `MANAGER`, `SUPERVISOR`) — surfaced as convenience FKs on `cases`, derived from the same table everywhere else.
- `next_action`, `next_action_at`, `next_action_owner_id` — every active record must have one where policy requires.
- Every assignment change emits `OWNERSHIP_CHANGED` event (prev owner → new owner, prev team → new team, changed_by, reason, method) and a Timeline entry.

### 4.1 Provenance chain (mandatory)

```
SOURCE → LEAD → (DEAL if commercial) → CASE → VISIT → DOCUMENT → SIGNATURE → BACK OFFICE → PROVIDER → ACTIVATION → COMMISSION → REVENUE
```
`Lead` retains full origin (Section 4). On conversion `lead → case`: `lead_id`, original creator, source, campaign, original owner, `converted_by`, `converted_at` are **copied once** and never lost. Reports must be able to answer: where from, who created, who owns now, which team, who sold, who visited, who handles back office, who manages, which AI processed it, what happens next.

---

## 5. Canonical entity model (target)

**[NEW]** = must be created. Everything else exists and only gets normalized columns.

**Identity & org**
- `organizations` **[NEW]** (currently 1 tenant; `organization_id` exists only as orphan uuid on AI tables)
- `roles` **[NEW]** (ADMIN, MANAGER, INSIDE_SALES, FIELD_SALES, BACK_OFFICE, MARKETING, DIRECTOR, OWNER + custom)
- `departments`, `teams` **[NEW]** (Team A/B, Field Athens/Thessaloniki, Back Office …user-defined)
- `profiles` (add `department_id`, `team_id`, `manager_id`, `timezone`, `language`, `working_hours`, `availability_status`, `is_active`, `last_login_at`)
- `user_roles` **[NEW]** (user ↔ role, effective date, granted_by)
- `territories` **[NEW]** (name, geometry/region, teams)

**Business objects**
- `providers` `products` `provider_regions` **[NEW]** — kills the text `provider`/`program`
- `companies`, `sites`, `contacts` **[NEW]**
- `leads` (`provider_id`, `company_id`, `site_id`, `campaign_id` normalize the text cols; keep `gdpr_consent`, `consent_version`)
- `customers` (+ `company_id`), `cases` (keep typed owners as derived convenience), `deals` (replace `assigned_to` text), `case_offers` (+ `provider_id`)
- `case_visits`, `case_documents`, `case_signatures`, `follow_ups` (kept, becomes a Work Item view)

**Work & execution**
- `work_items / tasks` **[NEW]** (owner, team, priority, due_at, status, SLA, dependency, escalation)
- `assignments` **[NEW]** (Section 4)
- `business_events` **[NEW]** (Section 6)
- `automations` / `automation_runs` / `workflow_triggers` **[NEW]**

**Communications**
- `channel_providers` **[NEW]** (EMAIL/SMS/PHONE/WHATSAPP/VIBER/SOCIAL/IN_APP; status connected/failed/expired; last_success)
- `communication_identities` **[NEW]** (user email/phone; provider-bound; never plaintext creds)
- `messages` **[NEW]** (conversation_id, channel, provider, direction, from/to, body, template_id, status → pending/sent/delivered/failed/bounced, provider_id, provider_message_id, led/case/campaign link, queued)
- `conversations` **[NEW]** (channel, contact identity, customer/lead/case, owner (human or AI), status, assign method)
- `templates / template_versions` **[NEW]** (+ approval status; AI uses only approved templates for automation)
- `suppression_list` **[NEW]** (contact, channel, source, timestamp, action) + `consent_log` (existing)

**Campaign & social**
- `campaigns` **[NEW]** (name, channel(s), audience, status, start/end, owner, budget, goal, approval_state)
- `campaign_audiences`, `campaign_journeys`, `campaign_runs`, `campaign_response` **[NEW]** (attribution linked)
- `social_connections` (normalize `created_by` → FK), `creative_*` folded under campaigns

**AI**
- `ai_agents` **[NEW]** (name, type, manager_id, status, version, model, system_instructions, tool_allowlist, channel_allowlist, communication_level L1–L6, approval_level, budget, rate_limit, max_actions)
- `ai_sessions` (~agent_sessions), `ai_events` (from `agent_audit` + `business_events` actor=AI), `agent_action_approvals` (existing), `knowledge_base` (existing, + source/version/owner/expiry/permissions/citations for RAG governance)

**Finance & ops**
- `commissions` **[NEW]** (agent, case, provider, product, rule, amount, status, payout, adjustments, history)
- `commission_rules` **[NEW]** (provider + service/product + role + qualifying event → rate; versioned, effective_date)
- `invoices` (extend: payments/receipts, `paid_at`)
- `renewal_reminders` (existing; tie into events), `notifications` (single), `activity_log` retired → `business_events`
- `tags`/`tag_assignments` **[NEW]** only if cross-entity queries needed (else keep arrays)

---

## 6. Universal event system (the backbone)

One **`business_events`** table (append-only):

`event_id, occurred_at, actor_type (HUMAN|AI_AGENT|AI_MANAGER|AI_ORCHESTRATOR|JARVIS|SYSTEM|INTEGRATION|IMPORT), actor_id, entity_type, entity_id, event_type, payload (jsonb), request_id, idempotency_key unique, metadata`

Every subsystem writes here once; every consumer reads the same stream:

- **Timeline** → filtered `entity_type/entity_id` view
- **Notifications** → rule on event_type
- **Automation engine** → trigger on event_type
- **AI agents** → subscribe to relevant events (e.g., LEAD_CREATED)
- **Reporting/BI** → materialized aggregations over the stream
- **Audit** → the stream itself (plus auth + consent logs)

**Canonical event types (first version):** `LEAD_CREATED, LEAD_ASSIGNED, LEAD_QUALIFIED, LEAD_CONVERTED, LEAD_LOST, DEAL_CREATED, DEAL_STAGE_CHANGED, OFFER_CREATED, OFFER_ACCEPTED, MEETING_SCHEDULED, CASE_CREATED, CASE_STAGE_CHANGED, VISIT_SCHEDULED, VISIT_CHECKED_IN, VISIT_CHECKED_OUT, DOCUMENT_UPLOADED, SIGNATURE_COMPLETED, PROVIDER_SUBMITTED, PROVIDER_DELAYED, CASE_ACTIVATED, COMMISSION_EARNED, COMMISSION_PAID, EMAIL_SENT, SMS_SENT, WHATSAPP_SENT, MESSAGE_<CHANNEL>_DELIVERED, MESSAGE_FAILED, CONVERSATION_ASSIGNED, CONVERSATION_HANDED_TO_HUMAN, TASK_CREATED, TASK_COMPLETED, SLA_WARNING, SLA_OVERDUE, AUTOMATION_TRIGGERED, AUTOMATION_COMPLETED, AUTOMATION_FAILED, AI_ACTION_EXECUTED, AI_ESCALATION, CAMPAIGN_LAUNCHED, CAMPAIGN_PAUSED, APPROVAL_REQUESTED, APPROVAL_DECIDED, WEBHOOK_RECEIVED, IMPORT_COMMITTED, EXPORT_GENERATED`

**Idempotency:** every external arrival (webhook, provider callback, payment hook) must carry/derive an `idempotency_key` unique-constrained — a duplicate callback must not create a second event/activation/commission.

---

## 7. Work item system & assignment engine

- **Work items** (`tasks`) unify lead-followup, visit-prep, provider jobs, doc requests, AI approvals. Each has `owner`, `team`, `priority`, `due_at`, `status`, `sla`, `dependency`, `escalation`, `next_action`.
- **Assignment engine** distributes Leads/Cases/Follow-ups/Visits/Campaign responses to active eligible humans: ROUND_ROBIN, LEAST_LOADED, SKILL, GEOGRAPHIC, TEAM, AVAILABILITY, CUSTOM — always computed over the live eligible set (active, correct role/team/territory, not over capacity, not disabled, not absent) and **every** assignment logged to `assignments` + event.
- **Capacity** per user: max active leads, daily calls/meetings/visits/follow-ups, working hours, availability, territory, skills. Workload visible to managers.

---

## 8. AI hierarchy & governance

```
JARVIS (Master — coordinates strategy/priorities/exception handling; NO unrestricted power)
   └─ AI ORCHESTRATOR (routes tasks to managers/agents)
         ├─ AI Manager: Sales | Field Sales | Back Office | Marketing | Customer Service | Lead Gen | Providers | Commissions | Reporting
         │     └─ Specialized agents (Lead Research, Qualification, Routing, Coaching, Follow-up, Appointment, Campaign, Email, SMS, Social, Call Prep, Customer Service, Field Route, Visit Prep, Document, Signature, Back Office, Provider, Commission, Reporting, SLA, Data Quality …)
```

- **`ai_agents` registry**: agent_id, description, type, manager_id, status, version, model, system instructions, allowed toolkit, allowed channels, allowed roles, L1–L6 level, approval level, budget, rate limit, max actions. Each capability is explicit; agents do NOT inherit unrestricted user permissions.
- **Tool allowlist** per agent: CRM read/write (scoped), search/web research, email, SMS, phone, WhatsApp, social, calendar, map, routing, documents, reporting. High-risk tools require approval.
- **Communication levels** are enforced config: L1 internal only; L2 draft for human; L3 approved-template low-risk send; L4 personalized within strict rules; L5 multi-step execution with monitoring; L6 high-autonomy orchestration inside explicit policy/budget/approval boundaries — **never** unrestricted destructive actions.
- **Approvals**: `agent_action_approvals` (existing) as the universal queue — campaign launch, high-volume messaging, unusual pricing, sensitive comms, bulk lead updates, major customer changes, high-value actions → APPROVE / REJECT / PAUSE / STOP; decisions logged.
- **Escalation to humans** on: customer requests human, low confidence, sensitive topic, pricing exception, legal/complaint/provider dispute, unusual request, high-value customer, policy violation, repeated failure — handoff carries full context (conversation, lead/case, prior AI responses, promises, next action).
- **Cost & loop protection**: budgets, per-agent/month usage, rate limits, max depth, max retries, time limit, execution_id, loop detection — no AI→Manager→Agent→Manager runaway.
- **Memory & RAG governance**: memory entries carry source, confidence, timestamp, scope, sensitivity, expiry, correction, deletion; CRM truth > memory > inference. RAG content: source, version, owner, effective date, expiry, department, permissions, citations; retrieved content is **data, not instructions**.
- **AI factuality**: must label CRM fact vs external research vs inference vs recommendation vs unknown; never invent prices, contracts, history, provider status, commission, appointments, GPS.
- **Control Room** (Admin): agents active/paused/failed, managers activity, orchestrator jobs, automations running/failed, comms sent/failed/pending, costs, approvals waiting, escalations, errors.
- **Role-scoped AI**: Assistant shown to a user respects their role/team/permissions/data visibility; Field AI only exposed permitted customer/case data; Back Office AI never touches privileged Admin settings.

---

## 9. Communication OS

1. **Channel abstraction** (`channel_providers`, `communication_identities`, `messages`, `conversations`): business logic never hard-codes a provider. `Communication intent → policy → channel → provider → delivery → CRM event`.
2. **Unified Inbox** over conversations (email/SMS/WhatsApp/Viber/social/call activity) — channel, sender, customer/lead/case, owner, status, priority, last activity, next action, AI involvement. Assignment to human/team/AI; human takeover immediate.
3. **Identities**: each user has email/phone/SMS/WhatsApp/social identities via OAuth/provider-bound storage; personal numbers never auto-exposed; privacy controls.
4. **Consent & suppression**: `consent_log` (existing) + `suppression_list` — automation must not message opted-out contacts; per-channel opt-out, quiet hours, DNC. Mass-send gate checks audience, suppression, consent, frequency/rate limit, preview, approval, campaign status; supports pause/stop/emergency-stop.
5. **Templates** versioned + approved; AI automates only approved templates.
6. **Deliverability/reputation**: delivery, bounce, complaints, unsubscribe, response, spam risk tracking once providers are connected.
7. **Phone/calls**: `telephony` provider abstraction; call records, missed calls, outcomes, callbacks, Timeline — only claim completion when the provider confirms. No auto call-recording/transcription without consent/config.
8. **Email/SMS/WhatsApp/Viber/Social**: provider integrations; truthful state (available/configured/not-configured/failed/disabled); never fake delivery. WhatsApp requires official provider + browser/API test before claiming active.

---

## 10. Campaign OS

- `campaigns` (channel: EMAIL/SMS/PHONE/WHATSAPP/SOCIAL/WEB/MULTI), status lifecycle (draft→approved→active→paused→stopped→ended), owner, budget, goal, approval_state.
- Audiences built from **real CRM data** (source, campaign, customer type, status, geography, service/provider interest, engagement, consent, channels, tags) — never send to non-eligible contacts.
- Journeys: `DAY 0 EMAIL → wait → SMS → wait → phone task → wait → WhatsApp → human follow-up`; each step configurable; no simultaneous multi-channel unless the rule allows.
- Responses return to CRM (lead link + Timeline); attribution preserved: campaign→lead→deal→won→case→revenue.
- Lead discovery (web/social research) is **separate from campaign send**: a controlled pipeline `discovery → validate → dedupe → qualify → [eligibility/consent/policy check] → campaign audience → approval → send`; respects robots/ToS/API terms/APIs; no bypass of auth; prefer official APIs; never indiscriminate scraping of private data.

---

## 11. Automation OS

- Triggers (any `business_events` type + schedule) → conditions → actions (assign, create task/follow-up, send via approved channel/template, meeting, notify/AI-call, tag, stage change, campaign start/pause, escalate, create case, Timeline) with delays, branches, approvals, escalations, exit.
- Builder rules versioned: active/inactive, owner, last_run, success/failure counts. Monitoring: running/completed/failed/paused/waiting/approval-required with per-run steps/errors/duration.
- High-risk actions require approval; every run writes `automation_runs` + events (idempotent).

---

## 12. Field operations (Map becomes one module — "Field Operations")

- **Live team map** for permitted Managers/Directors/Back Office + **My Day/My Route** for Field agents.
- **Location privacy**: no continuous surveillance; explicit business-purpose location capture tied to active field/work sessions and visits; states: ENABLED / DISABLED / PERMISSION_DENIED / UNAVAILABLE / LAST_KNOWN / OFFLINE; off-duty follows organization policy; limited history with retention.
- `case_visits` extended: gps (lat/lng/accuracy/timestamp), check_in/check_out jsonb (already), arrival/departure with geofence/confirmation rules (never auto-complete on proximity alone).
- **Daily route planning**: MY ROUTE / PLAN MY DAY; manual order + optimize respecting fixed appointments; route states DRAFT→PLANNED→CONFIRMED→IN_PROGRESS→PAUSED→COMPLETED→CANCELLED; publish → agent notified; active-route changes notify not silently mutate; route conflicts (overlap/impossible travel/overload/outside hours) detected pre-publish; external navigation per stop; offline shows last synced route.
- **Workforce planning shares one state**: territory, availability, capacity, skills, schedule, location → assignment + routing both read the same source.
- **AI field ops**: recommend sequence, at-risk visits, agent near lead assignment ("Maria is 4.2 km away and has capacity") — always respecting permissions/schedule/territory and requiring human accept/edit/reject; never silently overwrite a human route.
- **TODAY**: keep the working MapLibre + authenticated CARTO (no watermark, attribution retained) + GPS/markers/search/filters/routes/navigation/MyDay/check-in/out/offline/mobile.

---

## 13. Security, RLS & data privacy

- **Server-side enforcement everywhere.** RLS policies must gate by: auth.uid() → profile → role/team/territory/assignment; AI agents get the **same** data boundary as their role/scope (no bypass).
- Actor model (`actor_type`) is first-class so audits distinguish human vs AI vs integration.
- Separation: customer data / internal notes / AI context / communications / employee private info / auth data; user private info (location, personal numbers) only on explicit need.
- Consent & GDPR: `consent_log` (existing) continues; suppression enforceable at DB level (send gate queries suppression_list + consent_log).
- Integration secrets: `integration_credentials.encrypted_token` only; webhooks authenticated/validated/idempotent/logged/retryable.
- No secrets in Git; `git status/diff` hygiene enforced for every commit (Section 17).

---

## 14. Reporting & attribution

- Reports reconcile the **same event stream**: leads by source/campaign/creator/sales agent/team/field/back office; conversion by source/campaign/agent/team; revenue/pipeline by campaign/provider/service/agent; deal velocity (Lead→Qualified→Proposal→Negotiation→Won), win rate, stage conversion; commission earned/paid; campaign cost vs revenue; provider activation rate; SLA compliance.
- No hard-coded numbers anywhere. Every figure must resolve to real rows.

---

## 15. Phased roadmap (sequenced; each phase has acceptance gate)

**Phase 0 (gate: unblock current production)**
- Finish P0 CARTO fix verification (set `CRM_VITE_CARTO_API_KEY` — the CARTO key, using the private non-public-framework-prefix name — on the production Vercel env for the project serving `hlektrismos-crm.vercel.app`, redeploy the latest main, re-run `scripts/browser-prod-map.mjs` + `scripts/browser-prod-full.mjs`; PRODUCTION = PASS). Until then nothing else ships to production.

**Phase 1 — Data foundation [MIGRATE]/[NEW] (biggest rework stabilizer)**
1. `organizations`, `roles`, `departments`, `teams`, `user_roles`, `profiles` (dept/team/manager/timezone/language/availability/is_active/last_login).
2. `providers`, `products`, `provider_regions`; convert `leads.provider/program` and `cases.provider/program` to FKs (data backfill idempotent, preserve text display).
3. `companies`, `sites`, `contacts`; normalize `leads`/`customers` company/site text columns.
4. `assignments` + migrate `deals.assigned_to` (text) and `service_requests.owner` (text) → FK-based; keep `cases` typed owners derived from assignments.
5. `business_events` backbone + wire existing Timeline writes to it; retire `activity_log` after a parity period; consolidate `app_notifications`→`notifications`.
6. `work_items/tasks`; re-base `follow_ups` and `calendar_events.task_id` on it.
7. `campaigns` + `campaign_audiences/journeys/runs`; fold `creative_*` under campaigns; link `leads.campaign_id` (FK).
8. `ai_agents` registry; normalize `agent_audit`→`ai_events`; actor-typing everywhere.
9. `suppression_list` + channel-level consent on `consent_log`.
10. `commissions` + `commission_rules`; extend `invoices` (payments, receipts).
11. `territories`; `tags`/`tag_assignments` only if cross-entity queries prove necessary.
12. `automations`/`automation_runs`; `channel_providers`/`communication_identities`/`messages`/`conversations`/`templates`.

Each migration: migration file + idempotent backfill + RLS policies + advisors (`supabase_get_advisors` security & performance) + no fake data.

**Phase 2 — OS surfaces** (UI over Phase 1 foundations):
Teams/admin & user management; unified Inbox + Work Center; Campaign/Creative UI; Automation builder + monitoring; AI Control Room + agent registry config; Leads Operations Center (Pipeline tabs, provenance panel, bulk ops, Kanban); Pipeline OS (deal pipeline + operations pipeline + funnel); Field Operations (team map, route planner, publish, progress); Reports (event-driven); Global Search.

**Phase 3 — Connectors** (real provider bindings, each behind the channel abstraction): email/SMS/telephony/WhatsApp/Viber/social connectors → browser/API-tested, truthful states; webhooks; lead discovery sources (API-first, consent-aware); AI provider routing with budgets.

**Acceptance**: every phase ends with the QA checklist from the master prompt. Unconfigured connectors report **NOT TESTED**, not PASS. No "100%" until real workflows are actually exercised on production-grade wiring.

---

## 16. Definition of done (test matrix)

Use `PASS / FAIL / NOT TESTED`. NOT TESTED requires the reason. The initial user-facing fork is exactly: authentication, multi-user roles, permissions, password mgmt, leads, customers, cases, timeline, tasks, calendar, documents, signatures, energy providers, back office, map, GPS, routing, check-in/out, commissions, reporting, search, social/email/sms/phone/whatsapp/viber (or NOT TESTED), campaigns, lead discovery (or NOT TESTED), automation, AI agents/managers/orchestrator/JARVIS, audit, data integrity, security/RLS, mobile.

Distinguish LOCAL / PREVIEW / PRODUCTION on the same gates (the map P0 is currently the only PRODUCTION FAIL and it is blocked on the deployment env var, not on code).

---

## 17. Git / deployment guardrails

Before any commit: `git status`, `git diff`, `git diff --cached`; secret scan (`git grep 'cb1_'`, staged-blob scan). Commit only intended files. Push only `origin HEAD:main` fast-forward. Verify remote HEAD (e.g., `git ls-remote origin main`). Never force-push, never rewrite history. `.env.local`, QA secrets file, `scripts/.browser-out/` never committed.