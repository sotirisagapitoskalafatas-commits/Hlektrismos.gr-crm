# Prioritised Remediation Checklist

Legend: ✅ done in this branch (not deployed) · 🔲 to do · 🔐 needs owner/Supabase/hosting access or approval

## P0 — do first (this week)
- [ ] 🔐 Run `docs/audit/audit-rls-readonly.sql` (Supabase SQL editor) and `scripts/audit-anon-exposure.mjs`; confirm/dismiss **S-01 `crm_emails`** and **S-02 `crm_integrations`**.
- [ ] 🔐 If exposed: test then apply `docs/audit/proposed/PROPOSED_audit_rls_hardening.sql` on a staging copy first; then production in a maintenance window (rollback block included). If emails/integration tokens were readable, treat them as disclosed: rotate integration tokens, review access logs, assess GDPR breach notification with counsel.
- [ ] 🔐 Set Supabase secrets `LINK_SIGNING_SECRET`, `VAPI_WEBHOOK_SECRET` (+ set the same secret in Vapi), then deploy the edge functions to **staging**, run the smoke tests below, then production.
- [ ] 🔐 Supabase Auth: sign-ups OFF, email confirmation ON, MFA for admins, JWT expiry ≤ 1 h, redirect-URL allow-list.
- [ ] 🔐 Backups: confirm PITR; perform and document one restore test (DB + Storage).
- [ ] 🔐 WordPress: login rate-limit + 2FA, hide user enumeration, remove `readme.html`, security headers, CAPTCHA on the Elementor form, update core/Elementor/Pro/Cookie-Law plugins.

## P1 — next 2 weeks
- [x] ✅ S-03/S-04 staff-only guards on 8 functions; secret on `vapi-webhook`; constant-time compares
- [x] ✅ S-05 stored XSS escaped (OfferModal, DocumentGenerator) + regression test
- [x] ✅ S-06 signed + POST-confirmed offer links
- [x] ✅ S-07 confirmation-email injection
- [x] ✅ S-08 (CRM app) security headers in `vercel.json` (CSP report-only)
- [ ] 🔲 Promote CSP from Report-Only to enforcing after preview validation
- [ ] 🔲 C-01 record-level RLS for customers/cases/documents; synthetic-user authorization tests per role
- [ ] 🔲 S-10 Turnstile + rate limit on `chat` and the lead RPC; CORS allow-list
- [ ] 🔲 S-12 document and fix the WordPress→CRM lead path (webhook to protected function); confirm no leads are stranded in WordPress/email
- [ ] 🔲 S-13 `npm audit fix`; enable Dependabot + secret scanning + branch protection
- [ ] 🔲 C-08 stop claiming "Καταχωρήθηκε" when the callback request failed

## P2 — within 30 days
- [ ] 🔲 S-09 move SMTP/Infobip/service-role secrets from `crm_settings` and `localStorage` to Vault/function secrets
- [ ] 🔲 S-11 stop defaulting `lawful_basis` to "consent" in `receive-lead-webhook`; require evidence field
- [ ] 🔲 S-14 calling-hours / do-not-call / AI-disclosure checks in `make-voice-call`
- [ ] 🔲 C-02/C-04 CI: `tsc --noEmit`, eslint, `node --test`, `npm audit`, `deno check` for functions; fix 24 type errors
- [ ] 🔲 C-03 split `DashboardPage.tsx`; C-05 unify lead tables behind a view
- [ ] 🔲 `automation_runs`/dead-letter + failed-job alerts; daily health summary; campaign pause switch
- [ ] 🔲 Prospect staging + compliance review queue (see AUTOMATION_ROADMAP)

## Smoke tests after deploying the function changes (staging)
1. Anonymous `curl` with only the anon key to `send-email`, `fetch-emails`, `sync-market-tariffs`, `generate-embedding`, `ask-market-rag`, scrapers → expect **401/403**.
2. Signed-in **active staff** user → CRM Settings "test email", "fetch emails", Lead slide-out scrape, Market RAG search, tariff sync all still work; pg_cron tariff job still runs (service-role key accepted).
3. `vapi-webhook` without `x-vapi-secret` → 401; with secret → 200; a real test call logs to `voice_calls`.
4. Send an offer → email link has `&t=`; GET shows confirm page and changes nothing; POST converts the lead; tampered `t` → 403 page; old unsigned link → 403.
5. Create a test lead named `<img src=x onerror=alert(1)>` → open Offer and Document generator → text shown literally, no alert.
6. Website form → confirmation email arrives; injected `service`/`first_name` HTML is rendered inert.

## Rollback
Edge functions: redeploy previous version from Git tag/`supabase functions deploy <name>` of the prior commit. Proposed SQL: rollback block at the bottom of the file. Front-end: Vercel "Instant Rollback". Headers: delete `vercel.json` entries.

> **Phase 1 update (2026-10-14):** see `PHASE1_RESULTS.md` for what is fixed in code (not deployed), what SQL is staged (not applied) in `supabase/staged-migrations/phase1/`, and the remaining blockers. UX plan: `docs/product/ATLAS_UX_BLUEPRINT.md`.
