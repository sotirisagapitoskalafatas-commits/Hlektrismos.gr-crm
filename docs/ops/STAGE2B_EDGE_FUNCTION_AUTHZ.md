# Stage 2B: Edge Function authorization, SSRF and email hardening (not deployed)

**Status:** code in this PR only. **No function is deployed.** No database change, and no production setting is changed.
**Independent of the staged SQL:** these checks run inside the functions, which use the service role (RLS bypass), so they hold whether or not Stage 1 / 2A SQL has been applied.
**Prerequisite (separate incident, open):** the exposed service-role key must be revoked. Until it is, anyone holding it can bypass these checks by calling the functions or the database directly. Plan, consumer inventory and verification: `SERVICE_KEY_INCIDENT.md`. Note that the `campaign-scheduler` cron job reads that key from a `crm_settings` row, so rotation must update or move it.

## What changed
### Shared modules (`supabase/functions/_shared/`)
| File | Role |
|---|---|
| `access.ts` | Pure record-level rules that mirror `phase4/18` and `21`. **office** (admin, manager, back_office) may act on any record; **sales** (inside_sales, field_sales) may act only on their own leads (assigned/created), cases (owner fields; `back_office_owner` doesn't count) and customers (created, or via an own case). Inactive or unknown roles get nothing. Also `decide()`: 401 no caller, 403 missing capability, 404 not found, 403 not your record. |
| `authz.ts` | `getCaller()` accepts a constant-time service-key match, or an active staff user with a known role (role read from the database, never from the request). `authorizeRecord()` loads the ownership columns with the service role and applies `access.ts`. `requireCapability()`. Refusals are logged without PII. |
| `safe-fetch.ts` | SSRF-safe fetch. https only (http only where explicitly allowed); no credentials in the URL; no non-default ports or local host names. **Every DNS answer must be public**: loopback, RFC 1918, CGNAT, link-local and metadata (169.254.169.254), multicast and reserved ranges are refused, as are IPv6 loopback, ULA and link-local, and IPv4-mapped, NAT64 and 6to4 forms. **Redirects are followed manually, with every hop re-validated.** Total timeout and a streaming size cap. Optional host allowlist. |
| `email-safety.ts` | Rejects CR/LF and control characters in header values. Recipients must be exactly one valid address (no lists or display-name tricks). The From address comes from configuration only, with a sanitised display name. RFC 2047 encoding. Raw SMTP bodies get CRLF line endings and dot-stuffing. |
| `guard.ts` | `requireStaff` now compares the service key in constant time. |

### Functions (22)
| Function | Caller and capability | Record check | Other |
|---|---|---|---|
| send-email | `communications.email.send` | lead / legacy lead / case / customer. Mail goes **only to the stored address**. A free-text address is allowed for office callers only. | `transactional` (suppression bypass) is office-only; headers via `buildHeaders`; dot-stuffing; the blank line before the body is fixed |
| send-offer | `communications.email.send` (+ `communications.sms.send` for Viber/WhatsApp) | legacy lead, checked **before** the accept link is signed | recipients, names and tariffs come from the database |
| send-sms | `communications.sms.send` | every lead in the batch (sales) | per-recipient errors carry only the lead id |
| make-voice-call | `communications.voice.initiate` (admin) | legacy lead | call script, disclosure and recording are **unchanged**; generic error |
| send-campaign-email | `campaign.send` (admin) | per lead, if sales are ever granted the capability | header safety; errors carry no PII |
| campaign-scheduler | service role or `campaign.send` | — | `max_calls` capped at 50 |
| accept-offer | public HMAC link (unchanged) | — | tariff text is HTML-escaped |
| orchestrator | caller is passed to every tool | lead search scoped to sales; get/update/note/meeting/email/appointment are each checked | filter text escaped; SMTP via `buildHeaders`; B2B search forwards the **caller's** token; memory scoped to its owner; `api_key` from the request is ignored |
| ai-orchestrator | caller | sales-scoped search and pipeline | model allowlist (`gpt-4o`); request `api_key` ignored; generic errors |
| agent-worker | service role or `integrations.manage` | — | no lead email/phone stored in `agent_memory` |
| ai-developer | caller | the agent must belong to the caller (or the caller is office) | memory scoped to its owner; message ≤ 20,000 characters |
| ask-market-rag / generate-embedding | caller | thread owner | size limits |
| fetch-emails | service role or `integrations.manage` | — | auto-created content is marked as untrusted external text |
| billing-ocr | caller | legacy lead, before any file read | **Supabase Storage only** (bucket + path, or a storage URL on this project's host via `safeFetch`); sales may read only their own lead's folder or files listed in its `bill_files`; 25 MB cap (the same as uploads); chunked base64 |
| enrich-lead | caller | legacy lead | website and followed links via `safeFetch` (2 MB, 8 s, 3 redirects; http allowed for small-business sites, with the same address rules) |
| scrape-program-details / autonomous-tariff-scraper | service role or `integrations.manage` | — | URLs from the database, the model or pages via `safeFetch`; model URLs validated with `checkUrl` |
| sync-green-tariffs / sync-market-tariffs | `CRON_SECRET` / service role / `integrations.manage` for sync | — | stored endpoints via `safeFetch`; `list` stays open to staff |
| scrape-b2b | unchanged | — | constant-time key compare |
| aade-lookup | unchanged | — | generic error |

## Tests (local; no network, no Supabase)
- `supabase/functions/_shared/__tests__/stage2b-security.test.mjs`, **13 tests**:
  - categories;
  - office vs own vs another agent;
  - capability × record combinations, including admin overrides (which never widen records);
  - blocked IPv4/IPv6 forms; URL rules; DNS answers (rebinding to a private address); redirect SSRF at every hop; redirect limit; size cap (declared and streamed); timeout;
  - header injection, recipient validation, sender identity, dot-stuffing.
- `supabase/tests/stage2b-edge-functions.test.mjs`, **12 handler-level tests of the real function code** (`helpers/edge-harness.mjs`: in-memory database, fake SMTP server, fake DNS, recording fetch):
  - **send-email:** 401/403 cases; a sales user's own lead goes only to the stored address; another agent's lead → 403; free address or suppression bypass by sales → 403; Back Office sends; header injection never reaches SMTP; dot-stuffing.
  - **send-sms:** capability first, then record ownership, even with an admin override.
  - **billing-ocr:** another agent's lead → 403; six SSRF/foreign URLs → 400 with **no outbound request**; foreign paths → 403/400; own bill and Back Office read processed.
  - **enrich-lead:** another agent's lead → 403; private, metadata, IPv6 loopback and DNS-rebinding websites never fetched; a redirect to metadata is not followed.
  - **Service role** keeps working.
  - **orchestrator (stream):** the reply arrives and the saved memory carries the caller as owner. This is a regression test for the `.catch` bug below.
- **Mutation check:** with the original `send-email` and `billing-ocr` from `main`, 10 of the 12 handler tests fail.
- All 28 functions load in the harness; every protected one returns 401 without a token.

### CI: baseline-aware gate (`scripts/ci/diagnostics-gate.mjs`)
The repository has lint and type errors on `main` (382 ESLint, 15 `tsc`, 27 Deno), so a plain `eslint .` fails every PR and says nothing. CI now checks out the **exact base commit** next to the change and runs ESLint, `tsc` and `deno check` (every function, Deno **v2.5.6**, `--node-modules-dir=none --no-lock`) on both trees with the **same binaries**. It fails on any diagnostic the change **introduces**. Diagnostics are compared as a multiset by file + rule/code + message, so a fixed error cannot hide a new one, and a second copy of an existing error still counts as new. It **fails closed** when a tree cannot be checked: a tool crash, a `tsc` configuration error, or a Deno module-graph or resolution error. All pre-existing diagnostics are printed (`--list-existing`). The build must pass outright. Self-tests: `scripts/ci/__tests__/diagnostics-gate.test.mjs` (7, including real `tsc` runs on temporary trees). Mutation check: a planted unused variable and type error in `send-sms` are both reported as NEW and fail the gate.

### Results on the final head (Node 20, the CI runtime)
- `npm test`: **431/431 pass**: the 423 from before, plus 7 gate tests and the orchestrator regression.
- ESLint gate: base 382, head 366, **0 introduced**, 16 fixed. *(Correction: the earlier "none added" was based on counts. The per-diagnostic gate found 2 new `no-unused-vars` in `send-sms` and `send-campaign-email`, both now fixed.)*
- `tsc` gate: 15 and 15, **0 introduced**.
- **Deno gate:** base 27, head 23, **0 introduced**, 4 fixed. It first found 2 new errors in `_shared/authz.ts` (row typing for a runtime column list; types only, since the refusal on a `null` row was already correct); now fixed.
- **Bug found by `deno check` and fixed:** the orchestrator's streaming reply saved memory with `insert(...).catch(...)`. supabase-js query builders have no `.catch`, so this threw a `TypeError` and the streamed reply failed (on `main` too). Now `then(undefined, …)`, with a test.
- `vite build`: OK.
- **Pre-existing Deno errors not touched here (23), worth a follow-up:**
  - **SMTP STARTTLS in `send-email`, `send-lead-confirmation` and `fetch-emails`:** `Deno.connectTls({ transport })` is not a Deno option. On port 587 the "upgrade" opens a new TLS connection to port 443 instead of upgrading. The fix (`Deno.startTls(conn, { hostname })`) needs a real SMTP test in staging.
  - **`sync-green-tariffs`:** the same `.catch` pattern on a query builder at line 237, on the logging path.
  - **`ai-orchestrator`, `fetch-emails`, `sync-market-tariffs`:** type-only errors from an untyped client. The logic, including the sales scoping, was checked.

## Deployment dependencies (do not deploy from this PR without approval)
1. **Auto-deploy on merge: NOT verified.**
   - **What is known:**
     - GitHub Actions doesn't deploy (no deploy step, no secrets).
     - Vercel deploys the **frontend** on merge.
     - The **Supabase GitHub integration is connected** (a "Supabase Preview" check runs on PRs), and the repo docs say it redeploys the functions listed in `supabase/config.toml` on merge: `ai-developer`, `orchestrator`, `agent-worker`, `chat`, `scrape-b2b`, `unsubscribe`.
   - **Why it couldn't be checked:** the integration's settings are only visible in the live project's dashboard, which the assistant cannot reach.
   - **Owner check before merging:** Dashboard (project `nonaymiwdayfuulccxrl`) → **Project Settings → Integrations → GitHub**. Read whether **"Deploy to production"** is on, and for which branch.
   - **If it is on, merging deploys part of Stage 2B to live.** Four of the six listed functions change in this PR. `orchestrator`, `agent-worker` and `ai-developer` import the new `_shared` modules; `scrape-b2b` gets the constant-time key comparison; `chat` and `unsubscribe` are unchanged. A partial deploy would run those four new while the other 18 changed functions stay old. Either turn it off for the merge, or deploy all 22 together to **staging** (`jiencxiapucrexpmzxbo`) first, then to live in one go.
   - **Cross-check:** Edge Functions → each function's "last deployed" time, compared with past merges to `main` (for example #112 at `f3d804c`).
2. **Deploy every changed function together, with `_shared`.** Each one imports the new `_shared/authz.ts`, `access.ts`, `safe-fetch.ts` and `email-safety.ts`. Example: `supabase functions deploy send-email send-offer send-sms make-voice-call send-campaign-email campaign-scheduler accept-offer orchestrator ai-orchestrator agent-worker ai-developer ask-market-rag generate-embedding fetch-emails billing-ocr enrich-lead scrape-program-details autonomous-tariff-scraper sync-green-tariffs sync-market-tariffs scrape-b2b aade-lookup`. Staging first.
3. **Secrets:** no new secrets. `SUPABASE_URL` must be the public https project URL for billing-ocr's URL mode; storage-path mode works everywhere.
4. **Live app impact:** the only live app code that calls a changed function is `src/lib/b2b.ts` → `scrape-b2b`, whose behaviour is unchanged. The other callers are the legacy screens `DashboardPage`, `SettingsPanel`, `LeadDetailSlideout`, `MarketRagFolders`, `MarketRAGSearch` and `CrmAiAssistantWidget`. **No live file imports them.** If they are ever re-enabled:
   - `LeadDetailSlideout` must send `legacy_lead_id` to `send-email`;
   - `SettingsPanel` must call `fetch-emails` with the admin's session, not the anon key;
   - the agent-worker and tariff-scraper buttons become admin-only.
5. **Behaviour changes for staff:**
   - Back Office (`back_office`) has no `communications.email.send` by default, so it can't use `send-email`. Grant it via the admin-editable `role_permissions` override if needed.
   - `field_sales` can't book with a confirmation email.
   - Existing `agent_memory` rows have no owner, so they no longer appear in AI context for user callers.
   - A cron job re-enabled with `x-cron-secret` must use the service key for `campaign-scheduler`.

## Rollback
Redeploy the previous versions from `main` at `f3d804c` (`git checkout f3d804c -- supabase/functions` in a scratch tree, then `supabase functions deploy <name>`), or revert this PR and redeploy. There is no database state to undo.

## Remaining risks (not fixed here)
- **DNS rebinding** between our check and the platform's own lookup: `safeFetch` re-checks every hop but can't pin the IP for TLS. `allowHosts` is used where the destination is known (billing-ocr). `enrich-lead` and the tariff scrapers fetch public sites, so the residual risk remains there.
- The calendar tools in the orchestrator aren't scoped per caller (`calendar_events` has no owner column).
- `accept-offer` links never expire. Changing that would break existing links and needs a product decision.
- `chat` (public) still has no rate limit or CAPTCHA. That's planned with the contact-form work.
- The legacy tables and the legacy screens remain in the repo.
- The browser reads `agent_memory` directly in a legacy screen; that needs the database fix in phase4/19 + 21.
- The shared Back Office login can't attribute actions to individual employees.
