-- ============================================================
-- Migration: pg_cron jobs for autonomous tariff sync + outreach
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Monthly tariff sync: runs on 1st and 2nd of each month at 01:00 UTC
-- Greek providers publish new green/yellow tariffs on the 1st of each month
SELECT cron.schedule(
  'monthly-tariff-sync',
  '0 1 1,2 * *',
  $$SELECT net.http_post(
    url := (SELECT setting_value::text FROM crm_settings WHERE setting_key = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/sync-green-tariffs',
    headers := '{"Authorization": "Bearer ' || (SELECT setting_value::text FROM crm_settings WHERE setting_key = 'SUPABASE_ANON_KEY' LIMIT 1) || '"}'::jsonb
  )$$
);

-- 2. Autonomous campaign scheduler: runs hourly Mon-Sat 07:00-18:00 UTC (09:00-20:00 Greek)
SELECT cron.schedule(
  'autonomous-campaign-scheduler',
  '0 7-18 * * 1-6',
  $$SELECT net.http_post(
    url := (SELECT setting_value::text FROM crm_settings WHERE setting_key = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/campaign-scheduler',
    headers := '{"Authorization": "Bearer ' || (SELECT setting_value::text FROM crm_settings WHERE setting_key = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1) || '"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- 3. Lead scoring: daily at 06:00 UTC
SELECT cron.schedule(
  'lead-scoring-daily',
  '0 6 * * *',
  $$UPDATE hlektrismos_leads SET
    lead_score = COALESCE(
      (CASE WHEN pipeline_status = 'new' THEN 10 ELSE 0 END) +
      (CASE WHEN customer_category = 'B2B_Corporate' THEN 20 ELSE 5 END) +
      (CASE WHEN bill_file_path IS NOT NULL THEN 25 ELSE 0 END) +
      (CASE WHEN EXTRACT(DAY FROM now() - created_at) < 7 THEN 20 ELSE 0 END) +
      (CASE WHEN deleted_at IS NULL THEN 0 ELSE -100 END),
      0
    )
  WHERE deleted_at IS NULL$$
);

-- 4. Voice outreach: Tue-Sat 08:00-17:00 UTC (10:00-19:00 Greek)
SELECT cron.schedule(
  'voice-outreach-scheduler',
  '30 8-17 * * 2-6',
  $$SELECT net.http_post(
    url := (SELECT setting_value::text FROM crm_settings WHERE setting_key = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/campaign-scheduler',
    headers := '{"Authorization": "Bearer ' || (SELECT setting_value::text FROM crm_settings WHERE setting_key = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1) || '"}'::jsonb,
    body := '{"channel_filter": "voice", "max_calls": 10}'::jsonb
  )$$
);
