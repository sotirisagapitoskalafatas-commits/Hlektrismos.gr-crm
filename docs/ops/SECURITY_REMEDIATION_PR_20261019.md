# Security remediation PR — 19 October 2026

**Branch:** `security/live-api-hardening-20261019`  
**Status:** staged migration and regression test added; **not applied to Supabase staging or production**. No merge or deployment is authorized by this document.

## Why this PR exists

A read-only audit of the connected production Supabase project (`nonaymiwdayfuulccxrl`) reported and verified several risky access paths:

- Anonymous table privileges and permissive public-role policies were present on legacy CRM tables, including `crm_users`, `customer_documents`, `profiles`, `hlektrismos_leads`, `leads`, `customers`, and `cases`.
- The production `profiles update own` policy checked the row owner but did not keep the current role unchanged; the `profiles_guard_privileged` trigger was absent from the inspected production profile-trigger list. Staging had that trigger.
- `public.reassign_lead(uuid,uuid)` and `public.upsert_supply_point(...)` were anonymous-callable `SECURITY DEFINER` RPCs without explicit caller authorization in their inspected definitions. The supply-point upsert could move an existing supply number to another entity in its `ON CONFLICT` branch.
- The security advisor flagged `public.market_tariffs_view` as a security-definer view, mutable default `search_path` settings on some definer functions, additional anonymous-executable definer RPCs, and disabled leaked-password protection.

These are findings from read-only catalog/grant/policy inspection. The PR does not claim that every listed function has been exploited.

## What the staged migration changes

File: `supabase/staged-migrations/phase1/18_live_api_privilege_hardening.sql`

1. Removes direct anonymous privileges from the audited private CRM table set and adds restrictive anonymous-deny policies so legacy `TO public` policies cannot restore access.
2. Keeps public lead-intake paths available with explicit database-side consent/age conditions:
   - `public.insert_website_lead(text,jsonb)` remains executable by anon and authenticated callers.
   - `public.get_active_tariff_prices(text)` remains available for public tariff/chatbot lookup.
   - Anonymous direct inserts into `leads` require `age_confirmed = true`, and website-source records additionally require `gdpr_consent = true`.
   - Anonymous direct inserts into `hlektrismos_leads` require `consent = true` and `age_confirmed = true`.
   - Anonymous SELECT/UPDATE/DELETE of these lead tables is denied by the new restrictive policies.
3. Restores a database trigger protecting the profile identity, role and active status against direct `anon`/authenticated API writes; safe self-profile fields remain editable.
4. Makes the existing legacy `reassign_lead` RPC require an active office identity (admin/back office) or service role, and validates the target is an active Sales Agent.
5. Makes the legacy `upsert_supply_point` RPC office/service-only and prevents an existing supply number from being moved to a different entity through conflict handling.
6. Restricts the legacy role-administration, lead-to-customer conversion, scraper-write and trigger functions in the audited allowlist; it does not indiscriminately rewrite grants for every function in the public schema.
7. Restricts `crm_integrations` and `crm_settings` to the office roles. Confirm ordinary Sales Agent screens still work on staging before any production window.
8. Pins `search_path` on public SECURITY DEFINER functions that have a mutable/default path.
9. Uses `security_invoker = true` on `market_tariffs_view`; the underlying tariff tables retain their existing public SELECT behaviour.

No customer or lead rows are inserted, updated, deleted, or backfilled by this migration. It changes grants, policies, function definitions and view options, so treat it as a security-sensitive migration rather than a no-op/additive-only deployment.

## Automated regression test

File: `supabase/tests/live-api-privilege-hardening.test.mjs`

The test reconstructs the relevant risky grants and policy/function shapes in PGlite and is intended to cover:

- Anonymous users cannot query private legacy CRM tables.
- Valid public website intake and tariff lookup remain callable.
- Invalid age/consent cases are denied.
- Profile role/status self-promotion is denied while safe profile editing remains possible.
- Lead reassignment is denied to anon and Sales, and allowed to an office role.
- A supply number cannot be hijacked from another entity.
- Direct generic role-administration RPCs are service-role-only.
- A guarded case-conversion function remains usable by authenticated staff, not anon.
- Tariff catalogue reads work with the invoker-security view.
- Mutable SECURITY DEFINER search paths are pinned.

**Execution status:** the test file was added, but this session did not execute the PGlite suite or the full repository checks. Do not report those tests as passing until they actually run in the project environment. This is not a staging or production test.

## Required local validation

Run from the repository root after installing the project's lockfile-defined dependencies:

```bash
node --test supabase/tests/live-api-privilege-hardening.test.mjs
npm test
npm run lint
npm run typecheck
npm run build
```

Record the exact output. If any test fails, correct the test fixture or migration before applying this staged SQL anywhere. PGlite verifies only the represented policy/function behaviour; it does not prove real Supabase Auth, Storage, edge-function or deployment behaviour.

## Required read-only preflight and staging verification

1. Read `docs/ops/PENDING_MIGRATIONS.md` and `docs/ops/APPLY_ORDER.md`.
2. Run `docs/ops/pending_migrations_check.sql` on the intended target. Do not assume the live migration state from Git.
3. Before changing staging or production, take a database backup/PITR checkpoint and review the function/table ACLs in the target catalog.
4. Apply **only** this file during its approved change window; do not batch-apply unrelated staged migrations.
5. Re-run the catalog checks in `APPLY_ORDER.md`.
6. Staging smoke-test: website and contact forms (valid and invalid consent/age), chatbot tariff lookup, login, Back Office account provisioning, Sales Agent login, ordinary leads/cases/customers/documents, supply-point actions, and integration status views. Check server and browser logs for permission errors.
7. If any flow fails, stop and diagnose on staging. Do not proceed to production without separate explicit approval and a fresh backup/PITR checkpoint.

## Rollback warning

`docs/ops/rollback_phase1_18_live_api_privilege_hardening.sql` is an emergency-only service-restoration script. It intentionally restores vulnerable access paths and broader grants. Do not use it for routine cleanup. If a rollback is considered, identify the exact broken flow and prefer a targeted forward fix; a rollback must be an incident decision, followed by an immediate security re-audit.

## Not addressed by this PR

- Full Sales Agent row-level isolation across all leads, customers, cases, documents, visits and routes. Some existing permissive authenticated-staff policies remain; changing this safely requires ownership-aware policies and cross-agent positive/negative tests.
- Storage object authorization by record ownership for every customer document.
- All remaining security-advisor findings, including the separate leaked-password protection setting and provider API keys compiled under `VITE_*`.
- Credential rotation. The existing runbooks identify a previously exposed service-role key; rotate it through Supabase/Vercel configuration in a controlled owner-approved window. Never put the replacement key in Git or this document.
- Production/staging application of any migration, deployment, merge, account modification, test write, or customer-data change.

This PR deliberately separates code/configuration hardening from those operational changes. It does not label the CRM fully secure; it creates a testable, staged mitigation for the specific paths described above.
