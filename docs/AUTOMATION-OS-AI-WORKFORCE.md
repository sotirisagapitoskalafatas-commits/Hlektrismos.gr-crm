# Automation OS + AI Workforce — Real Production Architecture

> Status: **DESIGNED (v1)** — ground-truth audit of `origin/main` (`103c83e`), 2026-09-15.
> Companion docs (older): `docs/CRM-OS-ARCHITECTURE.md` (v1 constitution), `docs/CRM-OS-FULL-AUDIT.md`, `docs/PHASE-1-PRODUCTION-VERIFICATION.md`.
> Convention used in every status field below:
> - **IMPLEMENTED** — exists in committed migrations / src / edge functions on `origin/main`
> - **PARTIAL** — exists but incomplete vs. the target model
> - **DESIGNED** — specified here only, no code
> - **BLOCKED** — cannot be verified yet (prod access / missing prerequisite)
> - **ABSENT** — does not exist anywhere in the repo

---

## 0. Ground rules (this pass)

1. **Do not rewrite** working CRM systems. Every existing table/RPC below is *kept*; all new objects are **additive + idempotent**, matching the established migration convention (`20260910000100` style: `begin/commit`, `create table if not exists`, `add column if not exists`, `on conflict do nothing`, RLS on, `_updated_at` triggers, `security definer` RPCs with `set search_path = public`).
2. **Name conflicts already settled**: the legacy compatibility VIEW `tasks` blocks the name `tasks` → canonical work table is **`work_items`**. `ai_agents` is a *legacy per-user config table* → the canonical AI Employee model is a **new `ai_employees`** registry; `ai_agents` stays for compat.
3. Latent unverified claims are marked **BLOCKED**, never "PASS". Nothing below is asserted as verified at runtime unless this session verified it (recent prod REST probes + live Photon calls are the only runtime evidence).
4. Maturity levels (1A→5C) are **labels, not permissions**. The deterministic Policy Engine decides; levels only gate *how much is automated* within policy.
5. No chain-of-thought anywhere. Every AI action exposes `reason / evidence / confidence / risk / policy / approval / result` — nothing else.

---

## 1. CURRENT ARCHITECTURE (AS-IS)

```
Browser (React 18 + Vite)  ── supabase-js 2.57 ──►  Supabase (prod ref nonaymiwdayfuulccxrl)
        ▲                                  │
        │ client splits                    │ REST + RPC (SECURITY DEFINER) + RLS
        │                                   ▼
   UX shells (AppShell·Deskt/Tablet/Mobile)   POSTGRES
   roles.ts · jarvis-chat/actions · field-sales/jarvis-tools
        ▲                                   ▲
        └──── edge functions (Deno, 27) ────┘
              chat · orchestrator · ai-orchestrator · agent-worker
              send-email · send-sms · send-campaign-email (Resend) · fetch-emails (IMAP)
              make-voice-call/vapi-webhook (Vapi) · campaign-scheduler
              sync-green-tariffs · sync-market-tariffs · scrape-b2b (SerpApi) · ask-market-rag
              billing-ocr (Gemini) · aade-lookup · accept/send-offer · receive-lead-webhook
```

**DB spine that exists (IMPLEMENTED, committed):**

| Layer | Objects | Status |
|---|---|---|
| Org spine | `organizations`, `departments`, `teams`, `territories`, `divisions` | IMPLEMENTED |
| RBAC | `roles` (5), `user_roles` (multi, scope, is_primary), `crm_grant_role/revoke/set_primary`, `is_role/is_staff/crm_can_view_*` | IMPLEMENTED |
| Ownership | `assignments` (role_type owner/inside_sales/field_sales/support/creator, method, is_primary, active) + backfills | IMPLEMENTED |
| Market | `providers`, `products`, `provider_regions` (+ legacy tariff tables/views) | IMPLEMENTED |
| Events | `business_events` (append-only trigger, idempotency_key unique index) | IMPLEMENTED / PARTIAL (see §4) |
| Work | `work_items`, `campaigns`, `follow_ups`, `app_notifications`, `timeline_events`, `activity_log`, `assignments` | IMPLEMENTED |
| Core entities | `profiles` (+org/department/team/territory/manager/timezone/language/is_active), `customers`, `leads`, `cases` (stage machine + owners + lat/lng), `case_visits/documents/offers/signatures`, `field_checkins` | IMPLEMENTED |
| Field ops | `field_checkin/checkout` (geofence, jsonb result), `field_sales_metrics` | IMPLEMENTED |
| Legacy AI edges | `ai_agents` (per-user: name/channel/status/leads_contacted…), `agent_sessions/messages/memory/conversations/reports`, `chat_threads/messages`, `voice_calls`, `hlektrismos_leads` (ai_paused kill switch) | IMPLEMENTED (legacy model) |
| Finance | `agent_provider_commissions`, `customer_commissions_ledger`, `customer_agent_attribution` (→ **human** sales_agents splits) | IMPLEMENTED |
| Settings | `crm_settings` (key/value JSONB): `ai_agent_governance`, `market_rag_config`, `agent_hub_config`, `email_config`, `RESEND_API_KEY`, `SERPAPI_KEY`, `b2b_scraper_config`, `check_in_radius_m`, `PROVIDER_COMMISSIONS` | IMPLEMENTED |
| Cron/webhooks | pg_cron ×7 schedules (tariff sync, lead scoring, campaign scheduler, winback, expiry scan), pg_net egress, `receive-lead-webhook`, `vapi-webhook` | IMPLEMENTED |

**What the current "AI" actually is (IMPLEMENTED, but not an AI workforce):** a set of Deno edge functions, each a hand-rolled script (Gemini function-calling for `chat`/`orchestrator`, OpenRouter-style tools for `ai-orchestrator`), calling CRM via `SUPABASE_SERVICE_ROLE_KEY` held in the edge runtime, with **no** common task model, **no** policy gate, **no** cost accounting, **no** shadow mode, and a per-pipeline kill switch only (`hlektrismos_leads.ai_paused` → `agent-worker`). Secrets live in edge-function env / `crm_settings` and never in the browser — that part is already correct.

---

## 2. DATABASE OBJECTS NEEDED (TO-BE, all NEW/additive)

All tables get: RLS on, `Service role` + `authenticated read`, staff/admin write per existing style, `_updated_at` trigger, indexes. Grouped by subsystem:

**A. Event Bus (v2)**
- `ALTER public.business_events` ADD: `organization_id uuid`, `event_version int not null default 1`, `correlation_id uuid`, `causation_id uuid`, `source text` (crm|automation|ai|webhook|integration).
- `event_types` — registry (key, version, applies_to, description, is_active).
- `emit_business_event(p_event_type, p_entity_type, p_entity_id, p_payload, p_correlation_id, p_causation_id)` — SECURITY DEFINER, idempotency_key auto, actor detection from `auth.uid()`, `pg_notify('business_event_published', …)`, org derived from actor/entity.
- Trigger `business_event_notify` (after insert).

**B. Policy Engine**
- `policy_rules` (`org_id`, `scope` agent|department|all, `subject` role-key|agent-key|user-id, `resource` tool|action, `action`, `target_pattern`, `effect` ALLOW|REQUIRE_APPROVAL|DENY, `conditions jsonb` (risk ≤, consent ✓, channel, financial_limit, autonomy_level ≤, time window), `priority`, `enabled`, `version`).
- `consent_records` (`customer_id`, `channel`, `grant` granted|revoked|withdrawn, `lawful_basis`, `source`, `granted/revoked_at`).
- `evaluate_policy(subject_type, subject_id, action, target, context jsonb) → jsonb {effect, reasons[], risk, matched_rule, effective_autonomy}` — deterministic PL/pgSQL.

**C. Tool Registry + Gateway**
- `tools` (`key`, `name`, `description`, `category`, `input_schema jsonb`, `handler` (edge fn key), `required_permission`, `cost_model jsonb`, `is_active`).
- `tool_call_log` (`tool_key`, `agent_id`, `task_id`, `input` (redacted), `output_summary`, `ok`, `latency_ms`, `cost`, `created_at`).

**D. Automation OS**
- `automation_definitions` — full spec fields (see §5): id, org, name, version int, status DRAFT/TESTING/PUBLISHED/PAUSED/RETIRED, owner, `trigger jsonb`, `conditions jsonb`, `actions jsonb` (node graph), `waits jsonb`, `branches jsonb`, `approval jsonb`, `escalation jsonb`, `retry_policy jsonb`, `timeout_s`, `idempotency jsonb`, `compensation jsonb`, `kpi jsonb`, published_at, retired_at.
- `automation_versions` — immutable published snapshots (`definition_id, version, snapshot jsonb, published_by, published_at`) → runs pin the version.
- `automation_runs` — instance: `definition_id, version, org, trigger_event_id, triggered_by`, status `running|waiting|awaiting_approval|blocked|completed|failed|compensated|expired|paused`, `context jsonb`, `current_node`, started/finished, `error`, `cost`.
- `automation_execution_nodes` — per-node log: seq, node_type `trigger|condition|action|wait|branch|approval|escalation|verify`, status, `latency_ms`, `result jsonb`, attempted_at.
- `entity_state` (state machines for cases/leads/customers): `entity_type, entity_id, state, machine_key, entered_at, history jsonb`.

**E. Job / Worker runtime**
- `job_queue` — `queue`, `kind`, `priority`, `payload jsonb`, status `queued|running|retrying|done|failed|cancelled`, `attempts/max_attempts`, `run_after`, `locked_at/locked_by`, started/finished, `result/error`.
- RPCs: `job_enqueue(kind, payload, run_after)`, `job_claim(queue, worker) → jsonb`, `job_complete(id, result)`, `job_fail(id, error, retry)`.

**F. AI Workforce**
- `ai_employees` — canonical model (§8): org, `key`, name, title, `department_id`, `manager_id` (self-ref), mission, responsibilities jsonb, role-key, `permissions jsonb`, `policies jsonb`, `skills jsonb`, `tools jsonb`, `knowledge jsonb`, `memory_enabled`, `work_queue_filter jsonb`, `kpis jsonb`, `autonomy_level`, `escalation_rules jsonb`, `approval_rules jsonb`, model, `prompt_version`, `status` (DESIGNED…RETIRED), `performance jsonb`, `cost jsonb`, audit.
- `ai_tasks` — the execution object (§7): task_id, agent_id, parent_task_id, org, requested_by, target_type/id, objective, priority, status, autonomy_level, deadline, `required_approval jsonb`, `tools_allowed jsonb`, context jsonb, result jsonb, error jsonb, `confidence`, `evidence jsonb`, `policy_ref jsonb`, `approval_ref jsonb`, model, prompt_version, `cost_tokens jsonb`, started/finished, `audit_ref`, correlation_id.
- `ai_task_events` — append-only per-task timeline (started/loaded/context_ready/tool_called/validation/retry/escalated/approved/blocked/completed/failed).
- `approval_requests` — (`subject_type/subject_id`, `requested_by`, `requested_action`, `context`, `status` pending/approved/rejected/expired, `decided_by`, `decided_at`, `reason`, `ticket` link) — feed for the Control Room "pending approval" bucket; supersedes legacy per-run creation.

**G. Communications domain**
- `customer_comm_prefs` — per customer: `language`, `timezone`, required `quiet_hours jsonb`, `frequency_caps jsonb`, `preferred_channels jsonb` (ranked), `interaction` consent per channel (mirrors consent_records, denormalized for the governor).
- `comm_outbox` — the send queue: org, customer_id, channel (email|sms|whatsapp|phone|webchat|push|internal), `template_ref`, `payload jsonb`, `status` draft|approved|queued|coalesced|sent|failed, `scheduled_for`, `gov_decision jsonb`, `tied_runs jsonb` (run ids coalesced into ONE message — the anti-spam merge), `attempts`, sent/failed at.
- `comm_gov_decisions` — append-only governor log (ALLOW/DELAY/MERGE/SUPPRESS/ESCALATE + reasons + evidence snapshot).
- `journeys`, `journey_stages`, `journey_enrolments` (customer_id, journey_id, current_stage, entered_at, `stage_history jsonb`) + `journey_rules` (event_type → transition, incl. "pause promotional on complaint").

**H. Conversation intelligence**
- On `crm_emails`/`chat_messages`: ADD `intent text`, `sentiment text`, `ai_risk text` (none|low|high), `needs_human bool`, `analyzed_at`.
- `conversation_insights` — analysis rows (customer, channel, intent, sentiment, risk, evidence jsonb, analyzer_model).

**I. Cost**
- `ai_cost_log` — org, `department_id`, `agent_id`, `task_id`, `automation_run_id`, model, workflow_key, token counts, model_cost, tool_cost, external_api_cost, total_cost, currency, recorded_at, batch_ref.
- `ai_budgets` — scope (org/department/model), period, `limit_n`, `alert_at`, `hard_limit`; kill switch: global `crm_settings('ai_kill_switch')` + per-agent `ai_employees.status=paused`.

**J. Shadow / evaluation / control room**
- `ai_recommendations` — shadow-mode outputs (no execute): task context, model recommendation, `actual_outcome` (filled after replay), `comparison jsonb`.
- `shadow_evaluations` — org, agent, `replay_window`, metrics jsonb (accuracy, hallucination, tool correctness, permission correctness, cost, latency, approval rate, business outcome, customer outcome).
- `ai_control_room` — read-only aggregated VIEW over `ai_tasks`/`ai_cost_log`/`automation_runs` (running, pending_approval, completed, failed, blocked, escalated, cost, latency, outcome).

**K. Data quality**
- `data_quality_rules` (issue_type, severity, sql/expression, is_active).
- `data_quality_findings` (entity_type/id, issue_type, severity, detail jsonb, status, detected_at, resolved_at).

---

## 3. API / SERVICE LAYERS NEEDED (new)

| Layer | Form | Purpose |
|---|---|---|
| `/events` | RPC `emit_business_event` + edge `event-sink` (optional) | one canonical write path for events |
| `/policy` | RPC `evaluate_policy` | deterministic pre-execution check |
| `/tool-gateway` | edge fn `tool-run` | policy → handle(tool) → validate → redact result; secrets never returned |
| `/automation-engine` | edge fn + pg_cron `worker-tick` | claim due automation triggers, run node graphs, waits/jobs |
| `/job-worker` | edge fn `worker-tick` | claim/hourly drain of `job_queue` |
| `/ai-runtime` | edge fn `agent-execute` | start → load context/memory → plan → simulate → approve → tool-call (via gateway) → verify → learn |
| `/comm-governor` | RPC `comm_governor` + edge `comm-dispatch` | DECIDE → coalesce → outbox → send (existing `send-email`/`send-sms` become handlers) |
| `/intel` | edge `analyze-inbound` | intent/sentiment/risk on inbound messages; high-risk → human handoff |
| `/control-room` | read VIEW + React `AIControlRoomPage` + drawer | operator visibility (rationale only, no CoT) |
| `/sales-ai` | first employee: shadow → active | Sales Development AI skill runner |
| **Reuse as-is** | `send-email`, `send-sms`, `send-campaign-email`, `fetch-emails`, `make-voice-call`, `scrape-b2b`, `orchestrator`, `chat` | become tool handlers / integrations behind the gateway |

---

## 4. EVENT TYPES (registry v1 — DESIGNED)

`business_events` today: `id, idempotency_key, event_type, entity_type?, entity_id?, actor_type (user|system|agent|webhook), actor_id?, agent_id?, payload jsonb, created_at`, append-only, idempotent. **MISSING** (additive): `organization_id`, `event_version`, `correlation_id`, `causation_id`, `source`. Event taxonomy v1:

```
Lead.*            LeadCreated LeadContacted LeadQualified LeadMeetingBooked LeadOfferSent
                  LeadConverted LeadLost LeadReassigned LeadPaused
Customer.*        CustomerCreated CustomerOnboarded CustomerActive CustomerAtRisk
                  CustomerChurned CustomerWinBack ContractRenewalDue ContractExpired
Case.*            CaseCreated CaseStageChanged CaseAssigned CaseResolved CaseEscalated ComplaintOpened
Finance.*         PaymentReceived CommissionPosted RevenueRecorded InvoiceSent
Communication.*   MessagePrepared MessageDraftApproved MessageSent MessageDelivered
                  MessageFailed OptOutReceived ConsentUpdated MessageCoalesced
Field.*           CheckInAccepted CheckInRejected VisitCompleted RoutePlanned
Workflow.*        AutomationTriggered AutomationNodeCompleted AutomationCompleted AutomationPaused
                  AutomationRetried AutomationCompensated ApprovalRequested ApprovalDecision
                  EscalationRaised TaskCreated TaskCompleted
AI.*              AiTaskCreated AiTaskApproved AiTaskBlocked AiTaskEscalated
                  AiRecommendationMade AiRunCosted AiError HumanHandoff
Journey.*         JourneyEnrolled JourneyStageEntered JourneyPaused JourneyExited
System.*          MigrationApplied SchemaChange IntegrationStatusChanged
Market.*          TariffUpdated ProviderCatalogChanged
```

All of these feed **Timeline** (timeline_events), **Automation** (definitions trigger), **Notifications** (app_notifications), **Analytics** (field_sales_metrics + future), **AI** (ai_tasks/ai_recommendations), **Audit** (agent/task/automation audit joins). Message coalescing consumes `Communication.*` + related workflow events.

---

## 5. AUTOMATION MODEL (DESIGNED)

**Object** = `automation_definitions` row carrying the full spec (`§2.D`) and the exact fields the requirement lists: id, name, **version**, **status** (DRAFT → TESTING → PUBLISHED → PAUSED → RETIRED), organization_id, owner, trigger, conditions, actions, waits, branches, approval requirements, escalation rules, retry policy, timeout, idempotency, compensation/rollback, KPI, audit history.

**Node grammar** (mirrors the requested chain): `TRIGGER → CONDITION → ACTION → WAIT → BRANCH → APPROVAL → ESCALATION → VERIFY`; each rendered as a node row in `automation_execution_nodes`.

**Trigger kinds** (all supported):
`event` (business_events type) · `scheduled` (pg_cron + `run_after`) · `lifecycle` (state transition on entities) · `sla` (work_items/cases overdue) · `customer-state` (journey stage / at-risk) · `provider-state` (tariff change / delay flag) · `ai-generated` (recommendation → activation) · `manual` (UI/operator). Trigger config JSONB in the definition; scheduler entries live in `job_queue`/pg_cron.

**Versioning**: `PUBLISHED` writes an immutable snapshot to `automation_versions`. Executions (`automation_runs.version`) **always pin the version they started on** — later publishes never rewrites in-flight runs.

**Lifecycle**: DRAFT (edit) → TESTING (dry-run envs `preview`/`shadow`, fake sends via outbox `status=draft`) → PUBLISHED (live, version-locked) → PAUSED (no new triggers; in-flight runs frozen with resume/park policy) → RETIRED (no new, in-flight drained or compensated).

**Wait/Branch/Approval/Escalation**: waits = resume condition (event/time); branches = declarative conditions tested against context; approvals = `approval_requests` rows (human or manager-rule route); escalation = new `ai_tasks`/`work_items`/notify with deadline; verify = postcondition (query/event), retry policy on failure, `compensation` = compensating actions on DEFINED rollback points only (never silent mutation of core records).

---

## 6. COMMUNICATION MODEL + GOVERNOR (DESIGNED)

**Channels** (first class): email | sms | whatsapp | phone | webchat | push | internal-notification (voice deferred). Existing handlers: `send-email`, `send-sms`, `send-campaign-email`, `make-voice-call`, `chat`, `app_notifications`.

**Levels → mapping** (labels only):
```
1A AI draft · 1B personalized draft · 1C multi-option draft
2A event-triggered · 2B time-triggered · 2C lifecycle-triggered
3A AI personalization · 3B AI channel selection · 3C AI timing
4A autonomous follow-up · 4B autonomous customer-status · 4C autonomous recovery/delay
5A adaptive follow-up · 5B cross-channel orchestration · 5C strategic customer communication
```

**Communication Governor** — decision each OUTBOUND candidate (RPC `comm_governor`) → one of:
`ALLOW` · `DELAY` (quiet hours/timezone) · `MERGE` (coalesce with an already-pending message) · `SUPPRESS` (consent/opt-out/journey-pause/complaint) · `ESCALATE` (human).

Evaluates BEFORE send: consent, opt-out (incl. existing `dnc_article11_blacklist`), preferences, preferred language, preferred channel, timezone, quiet hours, frequency caps, recent messages, active campaigns, open cases, customer sentiment, urgency, communication risk, current lifecycle stage.

**Anti-spam rule (critical)**: multiple AI employees/workflows may never independently send. Any `comm_outbox` insert is **keyed by (customer_id, channel, coalesce_window)** so `Sales Follow-up + Document Reminder + Provider Delay` collapse into **one** `comm_outbox` row (`status=coalesced`, `tied_runs=[…]`, merged payload). Only a final `comm-dispatch` releases sends.

---

## 7. AI TASK MODEL (DESIGNED)

`ai_tasks` row = the runtime object with exactly the required fields: task_id, agent_id, parent_task_id, organization_id, requested_by, target_type, target_id, objective, priority, status, autonomy_level, deadline, required_approval, tools_allowed, context, result, error, cost, timestamps, audit reference (+ model, prompt_version, confidence, evidence, policy_ref, approval_ref, correlation_id).

Status machine: `queued → start → context_loaded → (shadow: recommend) | (active: plan → simulate → approval? → executing → tool_called → verify) → completed | failed → retry → escalate → blocked`. Failures age into `ai_task_events`; approval/failure/retry/escalation each emit `AI.*` events.

---

## 8. AI EMPLOYEE MODEL (DESIGNED)

New `ai_employees` (canonical, org-scoped); legacy `ai_agents` untouched. Structure = the requested tree exactly:

```
AI Employee = identity · title · department · manager · mission · responsibilities ·
              role · permissions · policies · skills · tools · knowledge · memory ·
              work queue · KPIs · autonomy level · escalation rules · approval rules ·
              model · prompt version · status · performance · cost · audit history
```

Lifecycle: `DESIGNED → CONFIGURED → TESTING → SHADOW → LIMITED PRODUCTION → ACTIVE → PAUSED → SUSPENDED → RETIRED`. A NEW employee **must start in SHADOW** (§P) and can only be promoted to `LIMITED PRODUCTION` after an evaluation gate; `ACTIVE` requires supervisor approval.

---

## 9. POLICY MODEL (DESIGNED, deterministic)

`evaluate_policy(subject_type, subject_id, action, target, context) → {effect, reasons, risk, matched_rule, effective_autonomy}`, pure SQL, no LLM. Inputs: organization, role, user, agent, action, target, risk, scope, customer consent, channel, financial limits, autonomy level. Rule table `policy_rules`; winner = highest-priority enabled match. Example default matrix (to be seeded):

| Action | Effect |
|---|---|
| create task · summarize customer · prepare follow-up · draft email | ALLOW |
| send external communication · change owner · change pricing · cancel appointment · issue financial action · run campaign | REQUIRE_APPROVAL |
| access credentials · extract secrets · arbitrary code execution · cross-tenant access · destructive DB action | **DENY (hard)** |

`effective_autonomy` = min(requested level, org level, agent level, rule bound). No rule set ⇒ DENY (default-deny).

---

## 10. TOOL MODEL / TOOL GATEWAY (DESIGNED)

Path: `AI → Skill → Tool → Policy check → Integration Gateway / CRM service → result → validation`. `tools` registry = declarative contracts (input_schema, required_permission, handler ref, cost_model). Edge `tool-run` is the **only** path to integrations; it: (1) `evaluate_policy`, (2) invokes the existing handler edge fn (send-email, send-sms, orchestrator, etc., all currently holding secrets in env/`crm_settings` — unchanged), (3) validates/redacts, (4) logs to `tool_call_log`. Agents/tasks never receive secrets or raw DB service-role access — the gateway holds both. Result validation = schema check + deny-list + cost clipping.

---

## 11. FIRST AI EMPLOYEE: SALES DEVELOPMENT AI (DESIGNED)

- **Mission**: convert qualified opportunities into meetings and revenue.
- **Skills** (exact list): `find_unworked_leads`, `prioritize_leads`, `qualify_lead`, `analyze_customer`, `recommend_next_action`, `prepare_follow_up`, `schedule_meeting`, `create_task`, `escalate`, `measure_outcome`.
- **Tools** (exact list): `getLead`, `getCustomer360`, `getPipeline`, `getTodayWork`, `searchCRM`, `createTask`, `createFollowUp`, `createApproval`, `sendMessage` — each declaratively registered in `tools`, each policy-mapped, `sendMessage` ⇒ REQUIRE_APPROVAL.
- **Autonomy**: starts `level 2A`-class work (assisted/rule) but expressed as `autonomy_level=2` + `approved_actions=[read tools, createTask]`; promotion to 3… only via evaluation.
- **Deployment**: SHADOW first (writes `ai_recommendations`, zero execution) → replay vs historical `business_events`/`timeline_events` → evaluation gate → LIMITED PRODUCTION.

---

## 12. MIGRATION PLAN (ordered, additive, every file idempotent)

| # | File (new) | Contents | Applies via |
|---|---|---|---|
| M1 | `*_crm_os_ai_event_bus.sql` | ALTER `business_events` (+org_id, event_version, correlation_id, causation_id, source) · `event_types` registry + seeds · `emit_business_event()` RPC · pg_notify trigger | `supabase db push` after review |
| M2 | `*_crm_os_ai_policy.sql` | `policy_rules`, `consent_records`, `evaluate_policy()`, `tools`, `tool_call_log`, default policy seeds | same |
| M3 | `*_crm_os_automation_os.sql` | `automation_definitions/versions/runs/execution_nodes`, `entity_state`, `approval_requests` | same |
| M4 | `*_crm_os_job_queue.sql` | `job_queue` + enqueue/claim/complete/fail RPCs + global kill-switch config seed | same |
| M5 | `*_crm_os_ai_workforce.sql` | `ai_employees`, `ai_tasks`, `ai_task_events`, `ai_recommendations`, `shadow_evaluations`, `ai_cost_log`, `ai_budgets` | same |
| M6 | `*_crm_os_communications.sql` | `customer_comm_prefs`, `comm_outbox`, `comm_gov_decisions`, `journeys/stages/enrolments/rules`, `comm_governor()` RPC, enrich `crm_emails/chat_messages` (intent/sentiment/risk) | same |
| M7 | `*_crm_os_ai_ops.sql` | `ai_control_room` view, `data_quality_rules/findings`, `conversation_insights` | same |

Rules: never touch committed legacy tables destructively; RLS mirrors existing style; every file ships as `begin; … commit;` with `if not exists`/`on conflict` guards (re-run safe) — exactly like the migrations applied this month.

---

## 13. IMPLEMENTATION PHASES (code, after doc + migration review)

Following the mandated order (event bus → state/workflow → automation → jobs → policy → tool gateway → agent runtime → AI task → shadow → employee → manager → atlas):

- **P0 (this pass)**: architecture + statuses + migration plan. ✅
- **P1**: apply M1; move existing writers to `emit_business_event` (agent-worker, campaign-scheduler, offer/lead flows); require event write-path everywhere.
- **P2**: M2; edge `tool-run` gateway; route `send-email`/`send-sms`/`orchestrator` through policy gate.
- **P3**: M3; `automation-engine` + `worker-tick` (cron) + definition/runs browser UI + version pinning.
- **P4**: M4; job worker runtime + kill switch.
- **P5**: M5; `agent-execute` runtime + AI Task model + shadow framework.
- **P6**: M6; Sales Development AI in SHADOW → evaluations → LIMITED PRODUCTION (first real employee).
- **P7**: communication governor + journeys + conversation intelligence (inbound).
- **P8**: control room UI + cost budgets + data quality + outcome attribution + AI Managers (Sales Manager only) + Atlas/JARVIS handoff.

---

## 14. WHAT ALREADY EXISTS IN THE REPO

| Item | Status | Where |
|---|---|---|
| Postgres + RLS + SECURITY DEFINER RPC convention | IMPLEMENTED | migrations (org spine, roles, assignments, events, work) |
| Append-only `business_events` + idempotency + actor model | IMPLEMENTED (PARTIAL vs v2 shape) | `20260910000100:201-239` |
| RBAC roles/user_roles/is_role/is_staff + org scoping | IMPLEMENTED | `20260910103000` |
| Ownership model `assignments` | IMPLEMENTED | phase1 |
| Field-sales policy gating (client + RPC side) | IMPLEMENTED | `src/lib/field-sales/policy.ts`, `field_checkin` |
| Legacy per-user agent config + sessions/memory + visitor chat | IMPLEMENTED | `ai_agents` + `agent_*` + `chat` edge |
| Several hand-rolled AI edge functions (orchestrator, chat, agent-worker, campaign-scheduler) | IMPLEMENTED (not a workforce) | `supabase/functions/*` |
| Sending channels (SMTP/Resend/Infobip/Vapi) + email inbox | IMPLEMENTED | `send-email`, `send-sms`, `fetch-emails`, `crm_emails` |
| Coalescing-adjacent objects (campaign_sends, follow_ups, dnc blacklist) | IMPLEMENTED | migrations |
| Attributed outcome tables | IMPLEMENTED but **human-sales-only** | `customer_agent_attribution`→`sales_agents` |
| Jarvis UI layers (intent → nav/tools) in-app | IMPLEMENTED | `jarvis-chat/actions`, `field-sales/jarvis-tools.ts` |
| pg_cron schedules + pg_net webhooks | IMPLEMENTED | 7 schedules, 8 egress |

## 15. WHAT IS MISSING

Event v2 fields & registry · Policy Engine (table+RPC) · Tool Registry & gateway · Automation OS (defs/versions/runs/nodes) · State machine objects (`entity_state`) · Job queue runtime · AI Employee canonical registry · AI Task runtime & task-events · Approval inbox · Communication Governor + outbox + coalescing + prefs · Customer Journeys · Conversation intelligence (intent/sentiment/handoff) · AI control room (view+UI) · Shadow/evaluation framework · Cost accounting & budgets & global kill switch · AI business-outcome attribution (event-linked) · Data-quality layer · org-scoped agent identity (ai_agents is per-user).

## 16. WHAT SHOULD BE IMPLEMENTED NOW

1. **M1 Event Bus v2** (event_types registry + `emit_business_event` + v2 columns + notify) — everything else subscribes to it.
2. **M2 Policy + Tool foundation** (default-deny, `evaluate_policy`, tools registry, tool-call log).
3. Then M3 automation-engine / M4 job queue (state + workflow before agents), then M5-runtime + shadow, then the first employee — **in that order**.

## 17. WHAT SHOULD WAIT

Large-scale agent creation (ignore the 20-agent hierarchy for now) · AI Managers beyond the first · Atlas/JARVIS deep integration · Control-room UI polish · Voice channel · cost/budgets enforcement · data-quality remediation runs — until the event/policy/automation/runtime foundation from §16 is implemented and verified.

---

### Attachments / inputs consumed
- `docs/CRM-OS-ARCHITECTURE.md` (constitution), `docs/CRM-OS-FULL-AUDIT.md` (prod BLOCKED evidence)
- Ground-truth inventory: 27 edge functions, ~60 `src/lib/api.ts` exports, full committed DB DDL
- The user blueprint (AI workforce: levels 1A–5C, Automation OS, Governor, Orchestrator, Shadow/eval, cost, attribution, data quality) — this doc is its concrete, repo-grounded instantiation.