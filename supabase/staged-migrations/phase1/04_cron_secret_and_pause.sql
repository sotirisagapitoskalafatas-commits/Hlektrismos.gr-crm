-- STAGED (Phase 1) — NOT APPLIED. Apply on staging first; production only with owner approval.
--
-- Fixes the PR #27 regression WITHOUT exposing the service-role key:
--   'monthly-tariff-sync' calls sync-green-tariffs, which now requires staff OR a dedicated cron secret.
--   The secret is a random value used for exactly this purpose; it is stored in Vault (not in crm_settings) and as
--   the Edge Function secret CRON_SECRET. The anon key stays in the Authorization header only so the platform's
--   JWT gate lets the request through; the function itself authenticates via x-cron-secret.
--
-- OWNER PRE-STEPS (never paste values into chat or Git):
--   1. Generate a random value >= 32 chars.
--   2. supabase secrets set CRON_SECRET=<value>
--   3. select vault.create_secret('<value>', 'cron_secret');
--      select vault.create_secret('https://<project-ref>.supabase.co', 'supabase_url');
--      select vault.create_secret('<anon key>', 'supabase_anon_key');   -- public key, stored for convenience
--   Requires pg_cron, pg_net and Supabase Vault.

do $$ begin
  if exists (select 1 from cron.job where jobname = 'monthly-tariff-sync') then
    perform cron.unschedule('monthly-tariff-sync');
  end if;
  perform cron.schedule(
    'monthly-tariff-sync', '0 1 1,2 * *',
    $job$select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/sync-green-tariffs',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb
    )$job$);
end $$;

-- Unattended outreach schedulers: OFF until the eligibility gate is proven and legal approval is on file.
-- (The function itself also refuses to run unless OUTREACH_ENABLED=on and LEGAL_APPROVAL_RECORDED=yes.)
do $$ begin
  if exists (select 1 from cron.job where jobname = 'autonomous-campaign-scheduler') then
    perform cron.unschedule('autonomous-campaign-scheduler');
  end if;
  if exists (select 1 from cron.job where jobname = 'voice-outreach-scheduler') then
    perform cron.unschedule('voice-outreach-scheduler');
  end if;
end $$;

-- ROLLBACK: re-create the three jobs from supabase/migrations/20260819000009_pg_cron_autonomous.sql
--           (and drop CRON_SECRET / the vault entries if no longer needed).
