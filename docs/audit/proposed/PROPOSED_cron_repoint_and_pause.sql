-- PROPOSED — NOT APPLIED. Run on staging first. Owner approval required for production.
-- Why:
--  (a) PR #27 added requireStaff() to sync-green-tariffs, but the 'monthly-tariff-sync' cron authenticates with the
--      ANON key, which requireStaff rejects -> the monthly tariff sync would silently stop once that function is deployed.
--  (b) the two outreach schedulers must stay OFF until the central eligibility gate exists (see PHASE0 doc).
-- Requires pg_cron. Job names are from migration 20260819000009_pg_cron_autonomous.sql.

-- (a) Re-point the tariff sync to the service-role header the other cron jobs already use.
--     Interim only: Phase 1 moves that key out of crm_settings into Vault.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'monthly-tariff-sync') then
    perform cron.unschedule('monthly-tariff-sync');
  end if;
  perform cron.schedule(
    'monthly-tariff-sync', '0 1 1,2 * *',
    $job$select net.http_post(
      url := (select setting_value::text from crm_settings where setting_key = 'SUPABASE_URL' limit 1) || '/functions/v1/sync-green-tariffs',
      headers := '{"Authorization": "Bearer ' || (select setting_value::text from crm_settings where setting_key = 'SUPABASE_SERVICE_ROLE_KEY' limit 1) || '"}'::jsonb
    )$job$);
end $$;

-- (b) Pause unattended outreach schedulers until eligibility checks exist.
--     Reversible: re-create the two jobs from the original migration.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'autonomous-campaign-scheduler') then
    perform cron.unschedule('autonomous-campaign-scheduler');
  end if;
  if exists (select 1 from cron.job where jobname = 'voice-outreach-scheduler') then
    perform cron.unschedule('voice-outreach-scheduler');
  end if;
end $$;
