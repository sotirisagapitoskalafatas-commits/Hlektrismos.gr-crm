# Hlektrismos CRM — Functional & Architecture Audit

Date: 2026-10-13 · Branch `audit/security-crm-review`. Read together with `SECURITY_AUDIT.md` (access limits are described there).

## 1. How this was tested — and what was not

| Check | Result |
|---|---|
| `npm install` | OK (411 packages) |
| `npm run typecheck` | **24 errors**, all pre-existing, none introduced by this audit (list below) |
| `npm run lint` | **414 problems repo-wide / 313 in `src`** (281 errors: mostly `no-explicit-any`, unused vars) — pre-existing |
| `npm run build` | **Passes** (chunk-size warning only) |
| `node --test src/lib/__tests__/escape-html.test.mjs` | 2/2 pass (new regression test) |
| Edge functions | Syntax-checked with esbuild only. **Deno is not installed here; no runtime tests.** |
| Playwright QA harness (`qa/crm-mobile.spec.ts`, `qa/map-navigation.spec.ts`) | **Not run** (needs browsers + a seeded environment) |
| Interactive CRM testing (CRUD, assignment, search, import/export, concurrency, session expiry) | **Not performed.** The CRM requires an authenticated staff session against a Supabase project I cannot access; I did not create accounts or data in production. Items in §3 marked "static" come from reading the code only. |

Pre-existing typecheck errors by file: `jarvis-tools.ts` 3 (`'case'` is not a `PageKey`), `LeadsPage.tsx` 3, `api.ts` 2, `TabletShell.tsx` 2, `DesktopShell.tsx` 2, `NavigationButton.tsx` 2, `CustomersPage.tsx` 2, `CaseDetailPage.tsx` 2, `AppShell.tsx` 2, `roles.ts` 1 (`'beta'` badge), `OperationalStrip.tsx` 1, `QuickAdd.tsx` 1, `AutomationPage.tsx` 1. The `'case'`/`'beta'` ones are real type-contract mismatches (the code works at runtime only because TS is not enforced in the build). **The build does not run `tsc`, so type errors never block a release.**

## 2. System map (static)

```
Visitor ─► hlektrismos.gr (WordPress + Elementor form)   ──► ??? (no integration found in repo)
        └► React app (landing/contact pages, chatbot "Hlektrismos AI")
              ├─ contact form ─► RPC insert_website_lead (age gate + consent enforced) ─► hlektrismos_leads
              ├─ chatbot ─► edge fn `chat` (Gemini + tariff RAG; callbackRequest ─► lead insert, service role)
              └─ confirmation email ─► edge fn send-lead-confirmation (SMTP from crm_settings)
Staff ─► CRM shell (role-based nav) ─► supabase-js (RLS) ─► customers/cases/…  + edge functions (requireStaff)
Automation: pg_cron ─► edge functions (campaign-scheduler, sync-green-tariffs, win-back, autonomous tariff scraper)
Ad platforms ─► receive-lead-webhook (shared secret) ─► leads
Voice ─► make-voice-call (Vapi) ─► vapi-webhook ─► voice_calls / leads / lead_notes
```

Two parallel data models coexist: legacy `hlektrismos_leads`/`leads`/`hlektrismos_customers` and the newer `customers`/`cases`/`timeline_events`. The earlier repo audit (`docs/CRM-OS-FULL-AUDIT.md`) found the "CRM OS foundation" tables (`organizations`, `teams`, `roles`, `assignments`, `business_events`, `work_items`) **unused by `src/`**; this audit did not re-verify that.

## 3. Findings (CRM / code health)

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| C-01 | High | **No record-level authorization.** Any active staff member can read/insert/update **every** customer, case, document, signature and offer; only deletes are limited to admin/manager | `20260909120000_p0_foundation_and_security.sql` §4: `using (public.is_staff())` on `customers, cases, timeline_events, follow_ups, case_documents, case_visits, case_signatures, case_offers, app_notifications`; `is_staff()` = "has an (active) profile". Roles only change the UI (nav) and deletes. A field agent can read ID documents and signatures of every customer |
| C-02 | High | Production type-safety is not enforced | Build = `vite build` (no `tsc`); 24 type errors; ~100 `any` |
| C-03 | Medium | God components / spaghetti hotspots | `DashboardPage.tsx` **5,002 lines**, `api.ts` 1,712, `LeadDetailSlideout.tsx` 1,351, `SettingsPanel.tsx` 1,320, `AutomationPage.tsx` 1,105. Business rules, fetching and UI are interleaved; direct `supabase.from(...)` calls appear in components |
| C-04 | Medium | Almost no automated tests | Only 2 Playwright specs + 1 browser script; before this audit no unit/authorization tests. No CI workflow in the repo (`.github/workflows` absent) |
| C-05 | Medium | Leads are split across two tables | The website form (`insert_website_lead`) writes to **`public.leads`**, while the chatbot callback (`chat`), ad webhooks (`receive-lead-webhook`), `accept-offer`, `vapi-webhook` and the dashboard insert use **`hlektrismos_leads`**; `customers`/`hlektrismos_customers` also coexist. Unless the CRM UI merges both, an enquiry can be missed depending on its entry path. (`send-lead-confirmation` correctly queries `leads`.) **Verify in the UI which table each screen reads** |
| C-06 | Medium | Deployment is manual and untracked | `supabase functions deploy` logs were committed; no migration/deploy pipeline; 88 migrations contain many create-then-drop policy cycles (hard to reason about final state) |
| C-07 | Medium | Failure of the confirmation/automation path is silent | `send-lead-confirmation` is fire-and-forget (`.catch(() => {})`) and returns `ok:true` when skipped; no retry/dead-letter, so a failed notification leaves no trace |
| C-08 | Medium | Existing bug found earlier: callback failure still says "Καταχωρήθηκε!" | `src/lib/jarvis-chat.ts` confirm step `catch` returns a success message even when the backend failed (the mascot now shows an error) |
| C-09 | Low | Pre-existing React warning | `LandingPage` passes `fetchPriority` to `<img>` (React 18 prop casing) |
| C-10 | Low | Greek/locale | Not systematically tested; dates use `toLocaleTimeString('el-GR')` in new code only |

## 4. Role & permission matrix

Roles defined in code/DB check constraint: `admin`, `manager`, `inside_sales`, `field_sales`, `back_office` (`src/lib/roles.ts`, `profiles_role_check`).

| Capability (DB level, per source) | admin | manager | inside_sales | field_sales | back_office |
|---|---|---|---|---|---|
| Read all customers/cases/docs/signatures | ✔ | ✔ | ✔ | ✔ | ✔ |
| Insert/update customers & cases | ✔ | ✔ | ✔ | ✔ | ✔ |
| Delete customers/cases | ✔ | ✔ | ✘ | ✘ | ✘ |
| Edit `crm_settings` (SMTP etc.) | ✔ | ✘ | ✘ | ✘ | ✘ (migration `20260911040000`) |
| Send email/SMS, fetch inbox, scrape, run AI functions | ✔ | ✔ | ✔ | ✔ | ✔ (`requireStaff`; **no per-role limit**) |
| Create CRM users / grant roles | RPC-restricted (`20261001000000`) | | | | |

**Gaps:** no ownership/team/territory scoping (C-01), no read-only/auditor role, no marketing-operator vs approver separation, no export permission or audit trail for exports, no per-role limit on bulk actions, no integration service account (functions use the service-role key). The newer `organizations/teams/territories/roles/user_roles` model plus helper functions (`crm_can_view_team`, `crm_can_view_territory`, `crm_has_role`) already exist in migration `20260910103000`; the quickest safe path is to **adopt those in RLS for `customers`/`cases`** instead of inventing a new model.

**Proposed target model** (to be confirmed by the business): Owner, Admin (technical), Sales Manager (team scope), Inside/Field Sales Agent (assigned + team-shared records), Back Office (cases in processing stages), Marketing Manager (approve campaigns, aggregate reporting), Marketing Operator (execute approved campaigns, no PII export), Support (read customer + comms), Auditor (read-only + audit logs), Service accounts (one per integration, scoped). Open policy questions: may agents see colleagues' leads? may back office see ID documents? who approves exports and campaigns? retention periods for lost leads?

## 5. Recommendations for the CRM
1. **C-01 first**: scope RLS on customers/cases/documents by ownership/team using the existing org model; add tests with synthetic users per role (cross-user read must return 0 rows).
2. Add `tsc --noEmit` and `eslint` to CI and fix the 24 type errors; raise lint to blocking for new code only (`--max-warnings` baseline).
3. Break `DashboardPage.tsx` into feature modules; move data access into `lib/api` hooks; add React error boundaries.
4. Pick one lead model, migrate the others behind views, and document it.
5. Workflow improvements (high value, low risk): unified lead inbox with SLA timers and overdue indicators; assignment rules (region/service/capacity); duplicate detection on normalized phone/email/AFM; reassignment history; stale-lead alerts; saved filters; safe exports with audit records; import preview/rollback; role-specific dashboards; metrics (first-response time, contact rate, conversion, overdue follow-ups, duplicate rate, source performance, opt-outs).
6. Website: the WordPress form and the React landing form are two intake paths; consolidate onto the `insert_website_lead` RPC (via a WordPress webhook to a protected edge function) so every enquiry gets age/consent checks, dedupe, assignment and an SLA task.
