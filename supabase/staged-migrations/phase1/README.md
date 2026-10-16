# Phase 1 staged SQL — NOT APPLIED ANYWHERE

These files are deliberately **outside `supabase/migrations/`** so `supabase db push` cannot apply them by accident.
Nothing here has been run against staging or production. Local behavior is verified by `supabase/tests/rls.test.mjs`
(embedded Postgres, uses the repo's real original migrations for the vulnerable starting state) — local only.

## Order
| File | What | Needs |
|---|---|---|
| `01_rls_hardening.sql` | Remove anonymous access to `crm_emails`/`crm_integrations`; integrations admin-only + `crm_integrations_status` view; revoke anon read/write on 20 sensitive tables | **Before applying:** check non-admin screens read the status view, not the table |
| `02_outreach_decisions_audit.sql` | Append-only `outreach_decisions` (one row per gate decision). Per-channel consent evidence moved to `phase3/09_contact_eligibility.sql` (keyed by phone/email, not by the legacy lead id) | none |
| `03_drop_exec_sql.sql` | Drop a hand-made `exec_sql` RPC if one exists | Save its definition first (audit SQL query 9) |
| `04_cron_secret_and_pause.sql` | Tariff cron authenticates with a dedicated cron secret from Vault; unschedule the two outreach schedulers | `CRON_SECRET` function secret + Vault entries (steps in the file) |
| `16_storage_docs_lockdown.sql` | Anonymous visitors can no longer list or download files in `hlektrismos_docs`; anon may upload only into `contact-forms/`; inactive accounts lose access (legacy permissive policies from `20260820000004` dropped) | After applying: incognito website upload test in `docs/ops/SECURITY_LIVE_FINDINGS.md` |

## Procedure (owner/operator)
1. Run `docs/audit/audit-rls-readonly.sql` on **staging**, save the output (queries 1–11).
2. Apply 01 → 02 → 03 → 04 on staging, in that order. Re-run the audit SQL; run `scripts/audit-anon-exposure.mjs` (anon key only).
3. Walk the smoke tests in `docs/audit/REMEDIATION_CHECKLIST.md` with one synthetic user per role.
4. Only then, with explicit approval and a maintenance window, repeat on production.

## Secrets / switches (Supabase Edge Function secrets — never in Git or chat)
`LINK_SIGNING_SECRET`, `VAPI_WEBHOOK_SECRET`, `CRON_SECRET` (≥24 chars; use ≥32).
Outreach stays OFF unless **all** are deliberately set: `OUTREACH_ENABLED=on` and `LEGAL_APPROVAL_RECORDED=yes`
(only after written counsel + owner approval are on file). `AUTO_VOICE_CALLS=on` additionally for AI voice (keep off).

## Deploy order for edge functions (important)
1. Apply `04` (or otherwise make the cron send `x-cron-secret`) **before** deploying `sync-green-tariffs`.
2. Deploy `_shared` consumers together (`send-campaign-email`, `send-sms`, `make-voice-call`, `campaign-scheduler`). They
   now require `outreach_decisions` (02) and the contact-eligibility tables (phase3/09). Without them the gate **fails closed**: nothing is sent.

## Rollback
Each file ends with its rollback. Functions: redeploy the previous commit's versions. Cron: re-create jobs from
`supabase/migrations/20260819000009_pg_cron_autonomous.sql`.
