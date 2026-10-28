# Incident: exposed Supabase service-role key (open)

**Status: OPEN, not verified as rotated.** This file contains no key values and must never contain any.
**Owner action required.** Rotation needs Supabase dashboard access to the live project (`nonaymiwdayfuulccxrl`). The repository tooling and the Supabase connector available to the assistant have **no access** to that project; it sees only an unrelated project. So the current key state **could not be checked from here**.

**Why it matters:** the service-role key bypasses every RLS and storage policy. Until it is invalid, the Stage 1 / 2A SQL and the Stage 2B function checks can be bypassed by anyone holding it. Calling the functions with it counts as the trusted "service" caller.

Background and history: `SECURITY_HOTFIX_RUNBOOK.md` §A and its key table. The key appears in public Git history (`create-demo.mjs`, commit `8774da7`). Rewriting history does not help; only rotation does.

## 1. Who uses the service-role key (inventory from the repository)
| Consumer | How it gets the key | After rotation |
|---|---|---|
| Every Edge Function (`serviceClient()`, `getCaller()` service-caller match) | `SUPABASE_SERVICE_ROLE_KEY`, injected by the platform | picked up automatically after rotation; verify (step 4) |
| pg_cron `campaign-scheduler` job (`migrations/20260819000009_pg_cron_autonomous.sql`) | **reads the key from the `crm_settings` row `SUPABASE_SERVICE_ROLE_KEY`** | **breaks unless that row is updated**, or the job is moved to Vault (recommended) |
| pg_cron `sync-green-tariffs` job (same migration) | same `crm_settings` row today; staged `phase1/04` moves it to Vault + `x-cron-secret` with the anon key | apply `phase1/04`, or update the row |
| Operator scripts (`scripts/verify-provider-product-mapping.mjs`, `scripts/audit/*`) | `SUPABASE_SERVICE_ROLE_KEY` from the operator's shell | the operator uses the new key; nothing is stored |
| GitHub Actions | **none** (the workflow uses no secrets) | nothing |
| Browser app (Vercel) | **must be none.** The app uses only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | owner: confirm no `*SERVICE*` variable exists in Vercel project settings |

**A second exposure path:** the `crm_settings` copy is readable through the API by `admin` and `manager` today (policy `crm_settings_admin_all`). Staged `phase2/05` limits credential rows to `admin`. Even so, a service key does not belong in a table that a browser session can read. Move it to Vault (step 3), then delete the row.

## 2. Prepare (no change yet)
1. Choose a quiet window. Back Office and agents may see failed AI, SMS and email actions for a few minutes.
2. List the cron jobs: `select jobid, jobname, schedule, command from cron.job;`. Note every job whose command reads `SUPABASE_SERVICE_ROLE_KEY` from `crm_settings`.
3. Rehearse on **staging** (`jiencxiapucrexpmzxbo`) first, with the same steps.

## 3. Rotate (owner, dashboard)
1. **Project Settings → API Keys.** Create a new **secret key** (`sb_secret_…`). Then **disable the legacy JWT-based `service_role` and `anon` keys**. Alternatively, rotate the legacy **JWT secret**. Either way, the leaked JWT stops validating.
   - Disabling the legacy anon key also changes the browser key: update `VITE_SUPABASE_ANON_KEY` (or the new publishable key) in Vercel and redeploy the frontend in the same window.
2. **Cron jobs:** store the new key in Vault (`select vault.create_secret('<new key>', 'service_role_key');`, typed in the SQL editor, never committed). Change the `campaign-scheduler` job to read it from `vault.decrypted_secrets`. Apply staged `phase1/04` for the tariff sync job. Then `delete from crm_settings where setting_key = 'SUPABASE_SERVICE_ROLE_KEY';`.
3. Edge Functions receive the new key from the platform. No redeploy is needed for that alone. **Do not deploy the Stage 2B functions as part of this incident.**

## 4. Verify (evidence, no key values in chat or tickets)
1. Dashboard → API Keys shows the legacy `service_role` key as **disabled**, or a JWT-secret rotation date after the leak.
2. From a trusted shell, call `GET https://nonaymiwdayfuulccxrl.supabase.co/rest/v1/` with the **old** key as `apikey` and `Authorization`. Expect **401**. Read the old value from the Git history object locally; never paste it anywhere.
3. With the new key, the same request returns 200. The app's sign-in, the website form (`send-lead-confirmation`) and one staff action work.
4. `select * from cron.job_run_details order by start_time desc limit 20;` shows the scheduler jobs succeeding after the change.
5. API / auth logs: no requests authenticated with the old key after the rotation time. Also look for unknown service-role use **before** it (`SECURITY_HOTFIX_RUNBOOK.md` §C2).

## 5. Close
Record the rotation time, who did it, and the evidence from step 4 here. Until then, do **not** describe the project as secured, whatever the state of Stage 1, 2A or 2B.

| Item | State |
|---|---|
| Old key invalid (verified) | **not verified** |
| Cron jobs moved off `crm_settings` | not done |
| `crm_settings` copy deleted | not done |
| Vercel has no service key (verified) | not verified |
| Log review for past misuse | not done |
