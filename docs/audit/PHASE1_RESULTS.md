# ATLAS CRM — Phase 1 Results (security & reliability)

Branch `phase1/security-and-reliability` from `main` @ `212fb41` (Phase 0 merged). Date: 2026-10-14.

## Verification levels — read this first
| Level | Meaning | Status |
|---|---|---|
| **Local** | Unit tests, embedded-Postgres RLS tests, type/lint gate, build on the developer machine | ✅ done (below) |
| **Staging** | Applied to a staging Supabase project and exercised | ❌ **not done** — no staging project available |
| **Production** | Verified against the live project/deployment | ❌ **not done** — no authorized access; nothing was changed or deployed |
No claim in this document means "production is secure".

## Actual results (re-run at the end of this phase)
| Check | Result |
|---|---|
| `npm test` | **28 / 28 pass** (escape-html 2, ai-metrics 1, permissions 3, eligibility 8, gate 6, local RLS 8) |
| Quality gate (`scripts/quality-gate.mjs`) | pass at baseline: **24 type errors, 281 lint errors, 32 warnings** (equal to `main`; no new failures) |
| `npm run build` | passes |
| `npm audit --omit=dev --audit-level=high` | **0 vulnerabilities** (after `npm audit fix`: the lockfile changed broadly — ~900 lines of transitive bumps; build, tests and gate re-verified after it) |
| Edge function syntax (esbuild) | all edited functions parse; **not runtime-tested** (no Deno) |
| CI | workflow written and parked at `docs/ci/ci.yml` — the push was rejected because the GitHub token here lacks the `workflow` scope. **CI is NOT active yet.** To enable: `gh auth refresh -s workflow`, then `mkdir -p .github/workflows && git mv docs/ci/ci.yml .github/workflows/ci.yml`, commit, push. Its steps were each run locally (tests, gate, syntax, build, audit) with the results above |

## Findings and what was done
| ID | Sev | Finding | Status after Phase 1 | How verified |
|---|---|---|---|---|
| E-01/E-02 | Critical (source) | `crm_emails` anon read; `crm_integrations` public read/write | Fix **prepared** (`01_rls_hardening.sql`, integrations now admin-only + status view) — **not applied** | Local: vulnerability reproduced from real original migrations, then closed; anon/agent/manager/admin/inactive asserted |
| E-03 | High (my regression) | Tariff cron breaks when `sync-green-tariffs` deploys | Function accepts dedicated `x-cron-secret` (`requireStaffOrCron`); cron SQL prepared (`04`) — **not applied**. No service-role key exposed | Local: syntax; SQL not runnable locally (needs pg_cron/Vault) |
| E-04/05/06 | High/Med | Scheduler ignored consent; voice cron degraded to email; broken `deleted_at` filter | **Fixed in code**: scheduler refuses to run unless `OUTREACH_ENABLED=on` **and** `LEGAL_APPROVAL_RECORDED=yes`; per-recipient gate; no voice→email downgrade; `.is("deleted_at", null)` | Local: gate unit tests; scheduler syntax only |
| E-07 | Critical if live | `exec_sql` RPC called, undefined in Git | Call **removed** from code; drop SQL prepared (`03`) — **not applied** | Local: reproduced "anon can run arbitrary SQL" then removal asserted |
| E-08/09/10 | High | Recipients trusted from request; voice/SMS lacked checks | **Fixed in code**: functions take lead **ids** only, re-read data from DB, run the central gate; voice requires permission evidence, fresh opt-out screening, hours, frequency, voice flag | Local: 13 tests incl. "denied recipient ⇒ zero provider calls", "any lookup failure ⇒ all denied" |
| E-11 | Medium | Client-side role simulator open to everyone | **Fixed**: override honoured only for real admins; hidden for others | typecheck/build; manual UI test **not performed** |
| E-12 | High | Guard = active profile only | **Added** `requirePermission` + conservative capability matrix (admin-overridable via `crm_settings.role_permissions`); applied to campaign email (`campaign.send`), SMS (`communications.sms.send`), voice (`communications.voice.initiate`) | Local: matrix unit tests; guard syntax only |
| — | Medium | AI Workforce shows impossible negative error count | **Fixed**: stray `-1` removed; count via tested helper | Local unit test |
| E-13 | High | Every active staff member reads all customers/cases/docs | **Not yet changed** — needs the owner's ownership/team policy and a staging DB (Phase 2) | — |
| E-14 | High | WordPress form → CRM unverified | **Blocked** — needs owner test (runbook below) | — |
| E-15 | Medium | Secrets in `crm_settings`/`localStorage` | **Not yet changed**; cron path moved to Vault in staged SQL `04` | — |

### Behavior changes reviewers must know
* Campaign email now needs `campaign.send` (default **admin only**); SMS needs `communications.sms.send` (admin, manager); AI voice needs `communications.voice.initiate` (admin). Other roles get 403. The UI does not yet hide those buttons (Part C).
* Until `02` is applied **and** `OUTREACH_ENABLED=on` + `LEGAL_APPROVAL_RECORDED=yes` are set, **no promotional email/SMS/voice is sent** (fail closed). This is intentional. Direct 1:1 staff email (`send-email`) is unchanged.
* A scraped/imported business has no `contact_permissions` row, so it is never eligible; a `granted` row cannot be created without basis + evidence (database constraint).

## SQL: prepared vs applied
**Applied anywhere: none.** Prepared in `supabase/staged-migrations/phase1/` (01–04; see its README).

## Remaining blockers and exact next steps
1. **Staging Supabase project** (or approval to create one) → apply 01–04, run audit SQL, smoke tests.
2. **Owner-run live checks** (read-only): `docs/audit/audit-rls-readonly.sql` + `scripts/audit-anon-exposure.mjs`.
3. **WordPress form test**: submit one synthetic enquiry through the live WordPress form and one through the React form; confirm each appears in the CRM (which table/screen), the confirmation email arrives, and note how WordPress delivers it (plugin/webhook/email). Tell me the result.
4. **Policy decisions** for record-level access (Phase 2): may agents see colleagues' leads? may Back Office see ID documents? who approves exports/campaigns? The provisional defaults used here are in `_shared/permissions.ts`.
5. Set secrets `LINK_SIGNING_SECRET`, `VAPI_WEBHOOK_SECRET`, `CRON_SECRET` before deploying functions (README order matters: `04` before deploying `sync-green-tariffs`).
6. Greek counsel review + written owner approval before ever setting `LEGAL_APPROVAL_RECORDED=yes`.

## Rollback
Code: revert the PR / redeploy previous function versions. SQL: not applied; each staged file contains its own rollback. Dependencies: `git checkout main -- package-lock.json package.json` and `npm ci`.

## Housekeeping note
The disk filled up (`ENOSPC`) while running `npm audit fix`; I cleared the npm download cache (regenerable), the `dist` build folder and my QA screenshots. No source or user data was removed.
