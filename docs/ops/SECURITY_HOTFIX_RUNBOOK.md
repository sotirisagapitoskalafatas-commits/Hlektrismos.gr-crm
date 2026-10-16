# Security hotfix runbook: storage exposure (phase1/16) + anonymous table access (phase1/01)

Apply these two files to **live ahead of every other staged file**. You run every step yourself. Nothing here has been applied by Claude Code.

> ## ⚠ Read first: a live `service_role` key is in the public git history
> While listing the tracked `.env` keys (section D), a full scan of git history found a **`service_role` JWT for the live project** (`nonaymiwdayfuulccxrl`). It is in `create-demo.mjs`, committed on **17/08/2026** (`8774da7`, «complete brand migration from PowerFor to Hlektrismos.gr»).
> - Tracking stopped on **10/09/2026** (`9dd0990`), but the file is **still in the history of a public repository**.
> - The key expires in 2036.
> - It was issued at the same moment as the anon key the repo's `.env` still held on 13/10, so the project's JWT secret had **not** been rotated as of 13/10.
>
> **Treat it as valid and public until you rotate it.** That key bypasses **every** RLS policy and storage policy: it can read and change all data and download every file. phase1/16 and phase1/01 do **not** protect against it.
>
> **Recommended:** do step A (rotation) **in the same maintenance window, before or right after** the SQL. The SQL only closes the anonymous holes.

---

## A. Rotate the leaked service-role key (dashboard, you)

1. **Supabase dashboard → Project Settings → JWT Keys / API Keys** (wording depends on the dashboard version). Rotate the **legacy JWT secret**, or move to the new publishable/secret keys and then **disable the legacy JWT-based keys**.
   - Either way, the old `anon` **and** `service_role` keys stop working, and signed-in users are signed out.
2. **Update everything that holds the old anon key:**
   - **Vercel** `powerfor-energy` → Environment Variables → `VITE_SUPABASE_ANON_KEY` (Production + Preview), then **redeploy** (the key is built into the bundle).
   - **Vault / cron:** if phase1/04 is applied later, its `supabase_anon_key` Vault entry gets the **new** key.
   - Any local `.env` on staff machines (not tracked any more).
3. **Edge functions:** `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` are injected by the platform. Check one function after rotation (e.g. the website form → `send-lead-confirmation`).
4. **External callers of the webhook** (`receive-lead-webhook`) authenticate with `LEAD_WEBHOOK_SECRET`, not a Supabase key, so they are unaffected.
5. **Check:** sign in to the CRM again, and submit the website form once in a private window.
6. Use the log queries in **section C2** to look for past use of the service-role key from unknown callers.

---

## B. Apply phase1/16, then phase1/01

### Is phase1/01 safe on its own? Yes.
- It depends only on `is_staff()` and `is_role()`, which are live already. Each table is guarded by `to_regclass`.
- **Website form:** it calls `insert_website_lead`, which is SECURITY DEFINER and keeps its anonymous EXECUTE. Proved locally in `supabase/tests/website-intake-hardening.test.mjs` with the real function.
- **Chatbot:** the `chat` function uses the anon key but calls only `insert_website_lead` and `get_active_tariff_prices`. The tariff tables are not in 01's revoke list.
- **Webhook:** uses the service role, so it is unaffected.
- **Edge functions that read `crm_emails` or `crm_settings`** (`fetch-emails`, `send-email`, `enrich-lead`) forward the **signed-in staff member's** token. 01 keeps `crm_emails` for active staff (`is_staff()`). No function reads `crm_integrations`.
- **App screens:** nothing outside the Admin centre's anonymous probe reads `crm_integrations` (checked in code).

### B0. Before (10 minutes)
1. **Backup:** Database → Backups → confirm last night's backup, or create a PITR restore point. Note the time.
2. **State:** run [`pending_migrations_check.sql`](pending_migrations_check.sql) (read-only). Expect `phase1/01 = false` and `phase1/16 = false`. If either is `true`, stop and tell me.
3. **Policies now** (read-only; save the output as a screenshot or CSV, it is your rollback reference):
   ```sql
   select schemaname, tablename, policyname, roles, cmd
   from pg_policies
   where (schemaname = 'storage' and tablename = 'objects') or tablename in ('crm_integrations', 'crm_emails')
   order by 1, 2, 3;
   ```
4. **Admin centre → Ασφάλεια → «Εκτέλεση ελέγχων».** Note which rows show «Χρειάζεται ενέργεια». Expected:
   - «Ανώνυμος επισκέπτης → Ρυθμίσεις ενσωματώσεων»;
   - «Ανώνυμος επισκέπτης → αρχεία φόρμας (hlektrismos_docs)»;
   - possibly «Email πελατών».
5. **Website upload works today:** submit the website form in a **private window** with a small test PDF and the name «Δοκιμή Hotfix». Expect success.
6. Pick a quiet moment. The change takes seconds, and the website stays up during it.

### B1. Apply phase1/16 (storage)
1. SQL editor → paste the full contents of `supabase/staged-migrations/phase1/16_storage_docs_lockdown.sql` → Run. It is idempotent, so running it twice is harmless.
2. **Verify:**
   - Rerun the policy query from B0.3. On `storage.objects` the `hlektrismos_docs_anon_*` and `hlektrismos_docs_auth_*` policies are gone, and «website uploads contact forms», «staff uploads docs», «staff reads lead files» and «service all hlektrismos_docs» exist. Other buckets' policies are unchanged.
   - Admin centre → «Εκτέλεση ελέγχων»: **«Ανώνυμος επισκέπτης → αρχεία φόρμας (hlektrismos_docs)» = «Επαληθεύτηκε»**.
   - **Website upload:** private window → website form with a test PDF → **must succeed**. In the CRM: Leads → the test lead → «Αρχεία από τη φόρμα» → «Άνοιγμα» must open the file (staff signed link).
   - **CRM upload:** on a test case → Έγγραφα → upload one test image. It must succeed.
3. **If the website upload fails:** run the rollback at the end of the 16 file (it re-opens the hole), and tell me the exact error. It is shown in the browser console of the private window.

### B2. Apply phase1/01 (tables)
1. SQL editor → paste the full contents of `supabase/staged-migrations/phase1/01_rls_hardening.sql` → Run.
2. **Verify:**
   - Admin centre → «Εκτέλεση ελέγχων»: **every «Ανώνυμος επισκέπτης → …» row = «Επαληθεύτηκε»**, including «Ρυθμίσεις ενσωματώσεων», «Email πελατών» and «Ρυθμίσεις CRM».
   - **Website form:** private window → submit again (no file) → success. The lead appears in the CRM.
   - **Chatbot:** on the website, ask for a callback with the test name. It must confirm, and the lead appears.
   - **CRM:** as admin, open Διαχείριση → integrations / settings. As a non-admin, normal screens (Leads, Cases) work.
3. **If something legitimate breaks:** use the rollback comment at the end of the 01 file, and tell me which screen or function failed.

### B3. After
- Move the test leads to the Κάδος (or note them for deletion).
- Rerun `pending_migrations_check.sql`. Expect `phase1/01 = true` and `phase1/16 = true`.
- Write down the time of each step (needed for section C: requests before the fix matter).

### Rollback summary

| Step | How | Effect |
|---|---|---|
| A (key rotation) | none: an old key must not come back | — |
| B1 (16) | rollback block at the end of `phase1/16_storage_docs_lockdown.sql` | re-opens the anonymous listing |
| B2 (01) | rollback block at the end of `phase1/01_rls_hardening.sql` | re-opens anonymous table access |
| Either | restore from the B0 backup / PITR point | **loses** every change made since; last resort |

---

## C. Read-only log checks: were files listed or downloaded anonymously, or the service key used?

**Where:** Supabase dashboard → **Logs → Logs Explorer** (source `edge_logs`, the API gateway, which sees every request to `/storage/v1/...` and `/rest/v1/...`). These queries read logs only.

**How far back:** only as far as your plan keeps logs. Supabase retention is short on lower plans (days, not months), so 90 days is possible only on a plan that retains that long. Set the explorer's time range to the maximum it offers and note the earliest timestamp you see: that is the limit of what can be known. Older requests **cannot** be recovered from Supabase.

**Which token tells who called:** every request carries the anon key in the `apikey` header, signed-in or not, so `apikey` cannot tell them apart. The **`Authorization`** token can: its role is `anon` for an anonymous visitor, `authenticated` for a signed-in user, and `service_role` for the service key. The queries below therefore filter on `jwt.authorization`.

**Field names:** the log schema has nested fields (`metadata → request → sb → jwt → … → payload.role`). If a query errors on a field name, run C0 first and adjust the `unnest` path to what C0 shows.

**C0. Look at one storage request, to see the field layout**
```sql
select timestamp, event_message, metadata
from edge_logs
where event_message like '%/storage/v1/object%hlektrismos_docs%'
order by timestamp desc
limit 5
```

**C1. Anonymous listing / download / signed-link requests on `hlektrismos_docs`, per day**
```sql
select
  timestamp_trunc(timestamp, day) as day,
  request.method,
  regexp_extract(request.path, r'^/storage/v1/object/(list|sign|authenticated|info|public)?') as kind,
  response.status_code,
  count(*) as requests
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response
  cross join unnest(request.sb) as sb
  cross join unnest(sb.jwt) as jwt
  cross join unnest(jwt.authorization) as auth
  cross join unnest(auth.payload) as payload
where request.path like '/storage/v1/object%hlektrismos_docs%'
  and payload.role = 'anon'
group by day, request.method, kind, response.status_code
order by day desc
```

How to read it:
- `POST …/object/list/hlektrismos_docs` = **listing**.
- `POST …/object/sign/hlektrismos_docs/…` = **a signed download link was created**. An anonymous visitor could do this before 16, which counts as a download.
- `GET …/object/sign/…?token=` = a signed link was **used**. That can be legitimate staff use: the CRM opens files this way, and the token hides who created it. Compare with the `sign` creations above.
- `GET …/object/hlektrismos_docs/…` or `…/authenticated/…` = a direct download.
- Status `200` = it worked; `400` / `403` = refused.

**Expected false positives:** the Admin centre's own probe. Every «Εκτέλεση ελέγχων» run sends **one anonymous list of `contact-forms/` with limit 1**. Match those against the times an admin pressed the button. Anything else, especially `sign` requests or lists of other folders, is a real anonymous access.

**C1b. Who made the anonymous requests (IP and user agent), only for rows found in C1**
```sql
select
  timestamp,
  request.method,
  request.path,
  response.status_code,
  h.cf_connecting_ip as ip,
  h.user_agent
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response
  cross join unnest(request.headers) as h
  cross join unnest(request.sb) as sb
  cross join unnest(sb.jwt) as jwt
  cross join unnest(jwt.authorization) as auth
  cross join unnest(auth.payload) as payload
where request.path like '/storage/v1/object%hlektrismos_docs%'
  and payload.role = 'anon'
  and request.path not like '%/list/hlektrismos_docs%'   -- remove this line to include listings
order by timestamp desc
limit 500
```
These rows contain IP addresses (personal data). Keep the export internal.

**C1c. Signed links used, per day (any caller)**

A signed link carries its own token, not a role, so it is counted separately here. Compare the days with the `sign` creations in C1.
```sql
select timestamp_trunc(timestamp, day) as day, response.status_code, count(*) as downloads
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response
where request.path like '/storage/v1/object/sign/hlektrismos_docs/%' and request.method = 'GET'
group by day, response.status_code
order by day desc
```

**C2. Use of the `service_role` key that did not come from your own edge functions**
```sql
select
  timestamp_trunc(timestamp, day) as day,
  h.user_agent,
  h.cf_connecting_ip as ip,
  count(*) as requests
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(request.headers) as h
  cross join unnest(request.sb) as sb
  cross join unnest(sb.jwt) as jwt
  cross join unnest(jwt.authorization) as auth
  cross join unnest(auth.payload) as payload
where payload.role = 'service_role'
group by day, h.user_agent, ip
order by day desc, requests desc
```
- Your edge functions show a Deno / supabase-js user agent from Supabase's own network.
- Anything else, such as a browser, curl, python or an unknown IP, deserves a closer look: run C1b with `payload.role = 'service_role'` and without the path filter.
- Requests made with the leaked key are indistinguishable from your own server's except by **who** sent them.

**What to send me** (no personal data needed): the C1 table (day, kind, status, count), the earliest timestamp available, and whether C2 shows any user agent other than the edge functions'.

---

## D. Keys that were in the tracked `.env` (names only)

`.env` was tracked from **14/08/2026** (`748fdb3` «Create .env») until **13/10/2026** (`57f5720` «Stop tracking .env»). Every version held exactly two keys:

| Key | Project | Kind | Rotate? |
|---|---|---|---|
| `VITE_SUPABASE_URL` | first version `ufnpandsjhvvzpbuhzgq` (14/08, an earlier project); from 17/08 the live `nonaymiwdayfuulccxrl` | the project's address, public by design | no |
| `VITE_SUPABASE_ANON_KEY` | the same two projects (decoded role claim: `anon`) | **browser-public by design**: it ships in every page of the app | not required on its own, but **step A rotates it anyway** |

No other key was ever in the tracked `.env`.

**Found by the same scan, outside `.env`** (role claims decoded, values not shown):

| File | Commit | Key | Action |
|---|---|---|---|
| `create-demo.mjs` | `8774da7` 17/08 | **`service_role`**, live project | **Rotate now (step A)** |
| `seed-agents.mjs`, `test-invoke.mjs`, `test-invoke.cjs` | `8774da7` 17/08 | `anon`, live project | covered by step A |
| `test-chat.mjs` | `b387df6` | `anon`, live project | covered by step A |
| `dist/assets/index-*.js` | `83ad6d8` | `anon`, earlier project `ufnpandsjhvvzpbuhzgq` | if that project still exists, rotate there or delete the project |

The scan also searched for Stripe, OpenAI/Anthropic, Resend and AWS key patterns in the full history. The only match was the secret-scanning **regex** inside `.github/workflows/ci.yml`, not a key.

**What rotation does not fix:** the old keys stay in the public history forever. Rotation makes them useless. Rewriting history (or making the repository private) is optional, and secondary once the keys are rotated.

---

## Not claimed
After A, B1 and B2 the anonymous holes and the leaked key are closed. This does **not** make the system "fully secure". The other items in `PENDING_MIGRATIONS.md` (05 self-promotion fix first) and the Admin centre's «Δεν έχει επαληθευτεί ζωντανά» list still apply.
