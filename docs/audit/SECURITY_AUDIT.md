# Hlektrismos — Security Audit

Date: 2026-10-13 · Branch: `audit/security-crm-review` · Auditor: Claude (Sonnet 5.5)

## 0. Scope, access and what is NOT verified

| Area | Access | Status |
|---|---|---|
| Git repository (code, 88 migrations, 27 edge functions, full history) | Full | **Reviewed** |
| Public website `hlektrismos.gr` | Passive GET requests only | **Reviewed (passive)** |
| Live Supabase project `nonaymiwdayfuulccxrl` | **None.** The connected Supabase account only contains a different project (`Home88-Real-Estate`), which was deliberately not touched. A count-only anon probe was attempted and blocked by the environment's production-read policy; it was not retried or worked around. | **UNVERIFIED** |
| Live RLS policies, grants, storage buckets, auth settings, backups | None | **UNVERIFIED** — use `docs/audit/audit-rls-readonly.sql` and `scripts/audit-anon-exposure.mjs` |
| Deployed edge-function versions and secrets | None | **UNVERIFIED** |
| CRM deployment URL / hosting config | Not found in repo | **UNVERIFIED** (Vercel assumed from `@vercel/analytics`) |

Every finding is labelled **confirmed-in-source** (the code/SQL does this) or **suspected-live** (source says it is exploitable, live state not checked). Nothing here certifies the production system as secure.

**Key architectural fact:** `hlektrismos.gr` is a **WordPress/Elementor site on LiteSpeed**, not this React app. The public contact form is an Elementor form. This repo contains the CRM, the chatbot and the Supabase backend. How WordPress enquiries reach the CRM is **not visible in the repo** (see S-12).

## 1. Executive summary

* No privileged secret (service-role key, SMTP password, API key) was found in tracked files or in Git history. A `.env` was once committed (3 commits) but contained only the **anon-role** key and URL (verified by decoding the JWT `role` claim; values not printed). The anon key is public by design, so no rotation is needed for that reason.
* Because the anon key is public, **Row Level Security is the only database boundary**. The first migrations created many `USING (true)` / `TO anon` policies; later migrations fixed several but **two sensitive tables were never revisited** (S-01, S-02).
* Edge functions are the largest hole: with `verify_jwt` left at its default, **the public anon key passes the gateway check**, and 7 functions had no further authentication, 4 more only checked "any signed-in user" (S-03, S-04).
* Two code-level vulnerabilities were confirmed and **fixed in this branch**: stored XSS from public form fields into the agent's session (S-05), and unsigned one-click offer acceptance (S-06).
* The WordPress front has **no HTTP security headers**, exposes the admin username and version (S-08).

## 2. Findings

Severity: Critical / High / Medium / Low / Info. Status: confirmed, suspected-live, **fixed (in branch, not deployed)**, blocked.

| ID | Sev | Title | Evidence | Status |
|---|---|---|---|---|
| S-01 | Critical | `crm_emails` readable by anonymous role | `20260818170000_create_crm_emails_table.sql`: `crm_emails_select_anon … to anon using (true)`; no later migration changes it. Customer email bodies (`from_email,to_email,subject,body,attachments`) | suspected-live · fix proposed |
| S-02 | Critical | `crm_integrations` readable **and writable** by anonymous/public | `20260818160000…`: `FOR ALL TO public USING (true) WITH CHECK (true)`; column `config jsonb` stores integration settings (may hold tokens) | suspected-live · fix proposed |
| S-03 | High | Edge functions with **no authentication** | `vapi-webhook` (service-role writes to `voice_calls`, `hlektrismos_leads`, `lead_notes` from any POST), `accept-offer`, `ask-market-rag`, `generate-embedding`, `sync-green-tariffs`, `sync-market-tariffs` (service-role upserts into tariff tables: price poisoning), `send-lead-confirmation` (public by design, see S-07) | confirmed-in-source · **fixed in branch** |
| S-04 | High | "Any signed-in user" instead of staff on privileged functions | `send-email` (company SMTP), `fetch-emails` (company IMAP inbox), `autonomous-tariff-scraper`, `scrape-program-details` used `auth.getUser()` only | confirmed-in-source · **fixed in branch** (`requireStaff`) |
| S-05 | High | **Stored XSS**: public form → CRM | `OfferModal.tsx` rendered lead names, company, provider and scraped `discount_conditions` unescaped via `dangerouslySetInnerHTML`; `DocumentGenerator.tsx` same into `document.write`. A visitor types `<img onerror=…>` as first name; it runs in the agent's authenticated session (session theft, CRM actions) | confirmed-in-source · **fixed in branch** + regression test |
| S-06 | High | Unsigned, GET-triggered offer acceptance | `accept-offer` converted any `lead_id` to customer from a plain GET; mail scanners/link previews and anyone with a lead UUID could trigger it | confirmed-in-source · **fixed in branch** (HMAC token + POST confirm) |
| S-07 | Medium | HTML injection in confirmation email | `send-lead-confirmation` interpolated body `first_name`/`service` into HTML sent from the company domain (phishing content to an address that just submitted the form) | confirmed-in-source · **fixed in branch** |
| S-08 | High | WordPress: no security headers; user enumeration; version disclosure | `curl -I`: no HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy. `/wp-json/wp/v2/users` → 200 and `/?author=1` redirect disclose admin slug; `readme.html` 200; generator meta shows WordPress 7.1.3 / Elementor 4.0.8; `wp-login.php` reachable (no evidence of rate limit or 2FA) | confirmed (passive) · config change needed |
| S-09 | Medium | Secrets stored in database rows | `crm_settings` holds `smtp_password`, `INFOBIP_API_KEY`; `20260819000009_pg_cron_autonomous.sql` reads the **service-role key from `crm_settings`** to call functions. RLS is now admin-only (`20260911040000`), but any SQL-injection/admin-account compromise yields full backend control. `hub_api_key` and a Gemini key live in browser `localStorage` (readable by any XSS) | confirmed-in-source · recommendation |
| S-10 | Medium | Public chatbot: no rate limit, CAPTCHA or origin check | `supabase/functions/chat`: `verify_jwt=false`, CORS `*`, creates leads with the service role from `callbackRequest`, calls paid Gemini. Spam leads and AI-cost abuse possible | confirmed-in-source · recommendation |
| S-11 | Medium | Webhook asserts consent it cannot prove | `receive-lead-webhook` defaults `lawful_basis: "consent"` for ad-platform leads without evidence; LinkedIn defaults `legitimate_interest` | confirmed-in-source · recommendation |
| S-12 | Medium | WordPress contact form → CRM path undocumented | Form is Elementor (`<form class="elementor-form">`); no integration found in repo. Leads may be sitting only in WordPress/email | unknown · **needs owner input** |
| S-13 | Medium | Dependency: `cross-spawn` ReDoS | `npm audit --omit=dev`: 1 high (transitive) | confirmed · `npm audit fix` |
| S-14 | Medium | Voice calling lacks call-hours / do-not-call / disclosure checks | `make-voice-call` has no time-window, DNC or recording-disclosure logic | confirmed-in-source · recommendation |
| S-15 | Low | Wildcard CORS on all functions | `Access-Control-Allow-Origin: *` (tokens required, so low) | confirmed · allow-list recommended |
| S-16 | Low | Build logs tracked in Git | `deploy_output1.txt`, `deploy_output2.txt` (ignored by `.gitignore` but force-added) | **fixed in branch** (untracked) |
| S-17 | Info | Early-migration permissive policies | ~25 `USING (true)` / `TO anon` policies in migrations 20260809–20260819; most superseded by `20260820000002`, `…0005`, `20260909120000`, `20260910103000`, `20261001000000`, but final state can only be confirmed live | unverified |
| S-18 | Info | Good controls already present | `requireStaff` guard; HMAC-signed unsubscribe + suppression list; signup lockdown (new users inactive, `create_crm_user` restricted); age gate + consent on public RPC; append-only `business_events` | n/a |

## 3. What was changed in this branch (nothing is deployed)

| File | Change | Finding |
|---|---|---|
| `supabase/functions/_shared/signed-link.ts` (new) | Fail-closed HMAC link signer + constant-time compare | S-06 |
| `accept-offer`, `send-offer` | Signed `t=` token; GET shows confirm page, POST performs the action | S-06 |
| `vapi-webhook` | Requires `x-vapi-secret` = `VAPI_WEBHOOK_SECRET` (fails closed) | S-03 |
| `receive-lead-webhook` | Constant-time secret compare | S-03 |
| `send-email`, `fetch-emails`, `autonomous-tariff-scraper`, `scrape-program-details`, `sync-market-tariffs`, `sync-green-tariffs`, `generate-embedding`, `ask-market-rag` | `requireStaff(req)` after CORS preflight. pg_cron still works (guard accepts the service-role key) | S-03, S-04 |
| `send-lead-confirmation` | Escapes/limits `first_name`, `service` | S-07 |
| `src/lib/escape-html.ts` (new), `OfferModal.tsx`, `DocumentGenerator.tsx` | Escape all lead/tariff values before HTML rendering | S-05 |
| `src/lib/__tests__/escape-html.test.mjs` (new) | Regression test (2 passing) | S-05 |
| `vercel.json` (new) | HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP; CSP in **Report-Only** | S-08 (CRM app) |
| `docs/audit/proposed/PROPOSED_audit_rls_hardening.sql` (new, **not in migrations/**) | Staff-only policies for `crm_emails`, `crm_integrations`; revoke anon read/write on 20 sensitive tables | S-01, S-02 |
| `docs/audit/audit-rls-readonly.sql`, `scripts/audit-anon-exposure.mjs` (new) | Read-only live-state checks for the owner to run | S-17 |
| `deploy_output*.txt` | Untracked | S-16 |

### Required before/with deployment (otherwise features break)
1. Set Supabase secrets: `LINK_SIGNING_SECRET` (≥16 random chars) and `VAPI_WEBHOOK_SECRET`; put the same secret in Vapi's server-URL secret. Without them `accept-offer`/`send-offer` and `vapi-webhook` **fail closed by design**.
2. Offer links already emailed (unsigned) will stop working; re-send offers after deploy.
3. Deploy edge functions to **staging first**; verify CRM flows that call them (Settings → email test/fetch, Market RAG search, tariff sync, Lead slide-out scrape). `MarketRAGSearch` must be used by a signed-in staff user.
4. Preview-deploy `vercel.json`, watch the browser console for CSP report-only violations, then promote CSP to enforcing.

## 4. Secrets and credentials review

* Searched tracked files and all history for JWTs, `sk-`, `AIza`, `re_`, `ghp_`, `AKIA`, PEM blocks, `service_role`: **only environment-variable references**, no values.
* `.env` history: commits `748fdb3`, `0ae57f7`, `9008966` contain `VITE_SUPABASE_URL` and an **anon** key (role claim `anon`, expiry 2036) for `nonaymiwdayfuulccxrl` (and one for another ref). Not a privileged leak. Optional hygiene: regenerate the anon/JWT secret only if you also want to invalidate old client builds.
* Privileged keys are read from `Deno.env` only (`SUPABASE_SERVICE_ROLE_KEY`, `LEAD_WEBHOOK_SECRET`, `UNSUBSCRIBE_SECRET`, AI keys). **Whether they exist in Supabase secrets, and whether any were ever pasted elsewhere, cannot be verified from here.**
* If you ever pasted the service-role key into chat tools, tickets or `crm_settings` rows other than as designed, rotate it (Supabase → Settings → API → regenerate, then update edge secrets and the pg_cron rows). Do this in a maintenance window; I did not rotate anything.

## 5. Recommendations (beyond the fixes)

**Immediately (owner actions, no code):**
1. Run `docs/audit/audit-rls-readonly.sql` in the Supabase SQL editor and `scripts/audit-anon-exposure.mjs`; confirm or dismiss S-01/S-02/S-17. Share only the summary counts with me, never keys.
2. Supabase Auth: disable public sign-ups, enable email confirmation, set short JWT expiry (e.g. 1 h), enable MFA (TOTP) and require it for admins; add redirect-URL allow-list; enable leaked-password protection.
3. WordPress: install a security plugin (Wordfence / Solid Security) with login rate-limiting + 2FA; block `/wp-json/wp/v2/users` for anonymous users; remove `readme.html`; rename the admin user (not `hlektrismos`); keep WordPress/Elementor/Pro/Cookie-Law plugins patched; add a reCAPTCHA/Turnstile + honeypot to the Elementor form; add headers (LiteSpeed `.htaccess`: HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy).
4. Confirm Supabase backups: Point-in-Time Recovery on, and **perform one test restore** into a scratch project; document RPO/RTO. Same for the Storage buckets (bills uploaded by customers).

**Next 30 days:**
5. Move SMTP/Infobip/service-role secrets out of `crm_settings` into Supabase Vault / function secrets; pg_cron should use Vault (`vault.decrypted_secrets`).
6. Add Cloudflare Turnstile + per-IP rate limiting (Upstash/Redis or a Postgres counter) to `chat` and `insert_website_lead`; restrict CORS to your own origins.
7. Replace `localStorage` API keys with server-side secrets.
8. Add authorization tests (pgTAP or the existing `scripts/verify_phase11.sql` style) with synthetic users per role to the CI.
9. GitHub: branch protection on `main`, required review, secret scanning + push protection, Dependabot, `npm audit` in CI.
10. Add Sentry (EU region) with PII scrubbing, and audit-log access for admin actions.

## 6. Roles, tenant isolation
See `CRM_AUDIT.md` §4 (role matrix) — the live enforcement is unverified.
