# Security audit — master prompt v3 §21 (code and SQL only)

Written 18/10/2026 for the owner. **Scope:** every RLS policy, storage policy, edge function and RPC in the repository; a search for secrets in the working tree **and in git history**; what the anonymous role and sales users can read and write.
**Method:** static review of `supabase/migrations/` (the SQL that built the live database), `supabase/staged-migrations/` (staged, not applied), `supabase/functions/`, `src/`, `supabase/config.toml`, plus `git log --all`. The reproducible inventory is `node scripts/audit/security-inventory.mjs [functions|policies|definer|secrets]` (read-only, prints no secret values).
**Not verified (cannot be from here):** the live database (policies created or changed in the dashboard are invisible to this audit), the identity provider's settings (public sign-up, e-mail confirmation, password policy), the provider consoles for key restrictions, and anything that needs the deployed functions. Nothing was run against live or staging. This earlier audit is still valid and is not repeated: `docs/audit/SECURITY_AUDIT.md` (S-01 … S-18), `docs/ops/SECURITY_LIVE_FINDINGS.md`, `docs/ops/SECURITY_HOTFIX_RUNBOOK.md`.

## 1. Findings

| ID | Severity | Finding | Fix | Status |
|---|---|---|---|---|
| **F-01** | **Critical** | A **service-role key** of the live project (`role=service_role`, project ref `nonaymiwdayfuulccxrl`, expiry 2036) is in the **git history** (file `create-demo.mjs`, 1 commit; the file is no longer tracked). Anon keys of two projects are also in the history (`.env` ×2 commits, `seed-agents.mjs`, `test-invoke.*`, `test-chat.mjs`, and a committed `dist/assets/index-*.js` bundle). A service-role key bypasses every RLS and storage policy. | **Rotate the JWT secret / service-role key** (owner, dashboard) — `docs/ops/SECURITY_HOTFIX_RUNBOOK.md`. Rewriting history does not undo the exposure; rotation does. No code can fix it. | **OPEN — owner action** |
| **F-02** | **Critical** until applied | With the public anon key (shipped in every browser bundle) anyone can **read — and for several tables write —** legacy tables: `agent_provider_commissions`, `customer_agent_attribution` (both «Allow all …» `to public using (true)`), `customer_commissions_ledger`, `customer_documents`, `sales_agents`, `crm_users` (select + update `true`), `crm_tasks` (anon select), `crm_integrations` (all, `true`), `crm_emails` (anon select), legacy `supply_points` / `customer_meters` / `entity_documents` (authenticated `all`), and storage bucket `hlektrismos_docs` (`hlektrismos_docs_anon_select`). | Existing staged: `phase1/01` (integrations, e-mails, anon revokes on 20 tables), `phase1/16` (storage). **New staged, additive:** `phase1/17_anon_restrictive_lockdown.sql` — a RESTRICTIVE «anon: never» policy on 12 tables (nothing dropped, nothing revoked; PGlite 5/5 reproduces the read **and write** by anon, then the fix, then the rollback). | **Staged, not applied** (step 2b of `APPLY_ORDER.md`) |
| **F-03** | **High** | `send-lead-confirmation` is callable with the public anon key and sent **one e-mail per call** to any address that had a website lead in the last 15 minutes (`leads.ack_sent_at` existed but was never read or written). An attacker could submit the form with a victim's address, then call the function repeatedly: unlimited mail from our domain. It also returned SMTP error text to the caller. | **Fixed in this PR (code):** `ack_sent_at` is read and **claimed atomically before sending** (`update … where ack_sent_at is null`), released if the send fails; the caller gets a generic message, the log only the error name. Static guard test `lead-confirmation.test.mjs`. | **Fixed (code)** — needs a function deploy (not done) |
| **F-04** | **High** | **Sales users can read and change every lead, case, customer and document.** The CRM tables use `is_staff()` (any active profile) for read and write: `leads` (read/insert/update), and the case, customer, document, follow-up and timeline policies; there is no per-owner scope. Wanted by the owner: sales see their own records only. | **Staged:** `phase4/18_sales_own_records_scope.sql` — RESTRICTIVE policies on leads, cases, customers, follow-ups, case documents, timeline, visits, connections (and read-scope on the activity log) so Inside/Field Sales see and change only their own records; Back Office / Manager / Admin unchanged. PGlite test `sales-own-records.test.mjs`, rollback file. | **Staged — needs the SQL applied** |
| **F-05** | Medium | Third-party keys are compiled into the browser bundle: `VITE_ORS_API_KEY` (OpenRouteService, paid quota), `VITE_GOOGLE_MAPS_API_KEY`, `VITE_MAPBOX_TOKEN`, `VITE_CARTO_API_KEY`. Anyone can copy them. | Restrict each key by HTTP referrer / URL in the provider console and set a spend cap; or move calls behind an edge function. No code change fixes it. | **OPEN — owner action** |
| **F-06** | Low | `create_crm_user()` is SECURITY DEFINER without `set search_path` (the only one of 82 definer definitions without it). Already limited to the service role by migration `20261001000000`. | `phase1/17` pins `search_path` (an `alter function … set`, not a drop). | **Staged** |
| **F-07** | Medium | The public chatbot function `chat` (`verify_jwt=false`, wildcard CORS, no guard) creates leads through the public RPC with **no rate limit or CAPTCHA**; see `docs/audit/SECURITY_AUDIT.md` S-10. | Needs infrastructure (Cloudflare/Turnstile or a Supabase rate limit); not solvable in the function alone because instances are ephemeral. | **OPEN — needs a decision** |
| **F-08** | Medium | **Deactivating a user does not block the legacy tables.** Legacy policies on 20 tables check only `auth.role() = 'authenticated'` (campaigns, calendar, voice calls, lead notes, tasks …), not `is_staff()`, so a deactivated account with a valid session can still read and write them. The CRM core tables do check `is_staff()`. | **Staged:** `phase4/19_staff_only_legacy_tables.sql` — one RESTRICTIVE «active staff only» policy on the legacy tables. PGlite test `staff-only-legacy.test.mjs`, rollback file. | **Staged — needs the SQL applied** |
| **F-09** | Low | Wildcard CORS (`Access-Control-Allow-Origin: *`) on 24 functions. Tokens are still required, so the risk is low. | Allow-list the production origins in `_shared/cors.ts`. | **OPEN — low** |
| **F-10** | Info | **Good controls verified in code:** every function that spends money, sends messages or reads customer data uses `requireStaff` / `requirePermission` (profile must exist and be active; the anon key is refused); webhooks **fail closed** without their secret (`LEAD_WEBHOOK_SECRET`, `VAPI_WEBHOOK_SECRET` ≥ 16 chars, constant-time compare); `admin-users` verifies the caller's JWT and reads the role from `profiles`; unsubscribe and offer-acceptance are HMAC-signed; `scrape-b2b` checks role and `is_active`; XSS sinks (`OfferModal`, `DocumentGenerator`) escape every substituted value; no `eval`/`innerHTML` assignments in `src/`; no secrets in the working tree (the one `password` literal is a unit-test fixture). | — | verified |

## 2. Edge functions (`supabase/functions/*`, 28)

`verify_jwt = false` is set for **six** (`agent-worker`, `ai-developer`, `orchestrator`, `chat`, `scrape-b2b`, `unsubscribe`); the other 22 keep the default (a valid JWT is required — **the public anon key is a valid JWT**, so the guard in the code is what protects them).

| function | verify_jwt | guard found in code | service-role key | CORS |
|---|---|---|---|---|
| aade-lookup | default (true) | requireStaff | no | `*` |
| accept-offer | default (true) | HMAC | yes | `*` |
| admin-users | default (true) | auth.getUser, role matrix | yes | shared (see _shared/cors.ts) |
| agent-worker | **false** | requireStaff | yes | `*` |
| ai-developer | **false** | requireStaff | yes | `*` |
| ai-orchestrator | default (true) | requireStaff | yes | none |
| ask-market-rag | default (true) | requireStaff | yes | `*` |
| autonomous-tariff-scraper | default (true) | requireStaff, auth.getUser | yes | `*` |
| billing-ocr | default (true) | requireStaff | yes | `*` |
| campaign-scheduler | default (true) | requireStaff | yes | `*` |
| chat | **false** | **none found** ⚠ | no | `*` |
| enrich-lead | default (true) | requireStaff, auth.getUser | yes | `*` |
| fetch-emails | default (true) | requireStaff, auth.getUser | yes | `*` |
| generate-embedding | default (true) | requireStaff | no | `*` |
| make-voice-call | default (true) | requirePermission | yes | `*` |
| orchestrator | **false** | requireStaff | yes | `*` |
| receive-lead-webhook | default (true) | webhook secret | yes | `*` |
| scrape-b2b | **false** | auth.getUser | yes | shared (see _shared/cors.ts) |
| scrape-program-details | default (true) | requireStaff, auth.getUser | yes | `*` |
| send-campaign-email | default (true) | requirePermission | yes | `*` |
| send-email | default (true) | requireStaff, auth.getUser | yes | `*` |
| send-lead-confirmation | default (true) | JWT only | yes | `*` |
| send-offer | default (true) | requireStaff | yes | `*` |
| send-sms | default (true) | requirePermission | yes | `*` |
| sync-green-tariffs | default (true) | requireStaff | yes | `*` |
| sync-market-tariffs | default (true) | requireStaff | yes | `*` |
| unsubscribe | **false** | HMAC | yes | none |
| vapi-webhook | default (true) | webhook secret | yes | `*` |

Reading the table: every function with `verify_jwt=false` has its own guard except `chat`, which is public by design (F-07). Functions marked «JWT only» rely on the default check alone; the only one is `send-lead-confirmation` (public by design; F-03 fixed).

## 3. What the anonymous role can read and write (from the migrations; live may differ)

| Surface | Anonymous | Evidence | Fixed by |
|---|---|---|---|
| `hlektrismos_leads` | **insert only** with `consent = true` (website form) | `leads_anon_insert` | intended |
| `insert_website_lead(text, jsonb)` | execute (public intake; age gate and consent enforced) | `20261001000100_age_gate_public_leads.sql` | intended |
| `crm_emails`, `crm_tasks`, `crm_users` | **select** (`using (true)`); `crm_users` also **update** | policies listed in §4 | phase1/01, **phase1/17** |
| `crm_integrations` | **all** (`for all to public using (true)`) — config may hold tokens | `20260818160000` | phase1/01, **phase1/17** |
| `agent_provider_commissions`, `customer_agent_attribution`, `customer_commissions_ledger`, `sales_agents`, `customer_documents` | **all** | «Allow all on …» to `public` | **phase1/17** (+ phase1/01 for the last three) |
| tariffs (`energy_tariffs`, `energy_tariff_prices`, `document_templates`) | select | public data | intended |
| storage `hlektrismos_docs` | **select** (`hlektrismos_docs_anon_select`) and insert | `20260820000004` | **phase1/16** |
| new CRM tables (`leads`, `customers`, `cases`, `case_documents`, `customer_supply_points`, `tariff_categories`) | **nothing** (policies are `to authenticated` with `is_staff()`; anon revoked) | staged and live migrations; PGlite `rls.test.mjs`, `supply-points.test.mjs` | — |

## 4. What sales users can read and write

Today the answer is **everything in the CRM** (F-04): `is_staff()` is true for any active profile of any of the five roles, and `can()` in `src/lib/roles.ts` only hides buttons. Admin-only: `profiles` role changes, `crm_settings` (credentials), trash purge, tariff list edits, staff administration (`staff_admin_can` matrix). Sales cannot call admin functions (`admin-users` refuses by role; tested in `supabase/functions/_shared/__tests__/staff-admin.test.mjs`). **Own-records-only for sales is not enforced anywhere** — the next queue items.

### Policies with `using (true)` or anon access (net effect of the live migrations, from `security-inventory.mjs policies`)
Tables whose raw policy is `true` for `public`/`anon`: agent_provider_commissions, crm_emails, crm_integrations, crm_tasks, crm_users, customer_agent_attribution, customer_commissions_ledger, customer_documents, document_templates, energy_tariff_prices, energy_tariffs, sales_agents. Tables where any signed-in user (active or not) can write: agent_conversations, agent_memory, agent_reports, ai_agents, calendar_events, chat_messages, chat_threads, crm_documents, crm_email_labels, crm_email_settings, doc_templates, entity_documents, hlektrismos_leads (update/delete), lead_sources, market_tariffs, notification_log, powerfor_leads, supply_points; and, through `auth.role() = 'authenticated'`: agent_provider_commissions, agent_sessions, campaign_sends, campaigns, contact_consent, crm_tasks, customer_meters, dnc_article11_blacklist, hlektrismos_provider_docs, lead_notes, sales_agents, tariff_audit_log, voice_calls. Parser limits: policies created in `DO` blocks or by `ALTER POLICY` are not seen.

## 5. Secrets

- **Working tree** (524 tracked files): no key, private-key block or provider token. One `password` literal, in `supabase/functions/_shared/__tests__/staff-admin.test.mjs` (a test fixture).
- **Git history, all branches** (451 commits): JWT-like strings in 7 files — `.env` (2 commits; `role=anon`, two project refs), `create-demo.mjs` (**`role=service_role`**, live project ref), `seed-agents.mjs`, `test-invoke.cjs`, `test-invoke.mjs`, `test-chat.mjs` (`role=anon`), and `dist/assets/index-BDGB97IY.js` (`role=anon`, the earlier project). Env/log files ever added: `.env`, `.env.example`, `deploy_output1.txt`, `deploy_output2.txt`. Values are not reproduced here; only the decoded role and project reference are.
- **Server-only keys:** `SUPABASE_SERVICE_ROLE_KEY` is read only inside edge functions (`Deno.env`); `src/` uses only `VITE_SUPABASE_ANON_KEY`. `.env.example` lists names only. `crm_settings` rows hold SMTP and Infobip credentials (S-09; `crm_settings` is admin-only after phase2/05).

## 6. What changed in this PR and what is next

| Item | Where |
|---|---|
| F-03 fixed | `supabase/functions/send-lead-confirmation/index.ts` + `supabase/functions/_shared/__tests__/lead-confirmation.test.mjs` (**needs `supabase functions deploy send-lead-confirmation` — not done**) |
| F-02, F-06 staged | `supabase/staged-migrations/phase1/17_anon_restrictive_lockdown.sql`, rollback `docs/ops/rollback_phase1_17_anon_restrictive_lockdown.sql`, test `supabase/tests/anon-restrictive-lockdown.test.mjs`; `APPLY_ORDER.md` step 2b; `PENDING_MIGRATIONS.md`; `pending_migrations_check.sql` |
| Inventory tool | `scripts/audit/security-inventory.mjs` |
| F-04, F-08 | queue item 5: `phase4/18` (own-records scope) and `phase4/19` (staff-only legacy tables), staged; tests above |
| F-01, F-05, F-07, F-09 | owner / provider / infrastructure decisions (listed above) |

## 7. Residual risk, stated plainly
Until `phase1/01`, `phase1/16` and `phase1/17` are applied **on live**, the anonymous findings in F-02 are live. Until the key is rotated, F-01 makes every policy irrelevant. The tests prove the staged SQL against reconstructed tables in PGlite; they do not prove the live database.
