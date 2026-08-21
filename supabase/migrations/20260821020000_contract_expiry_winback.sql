-- ============================================================
-- Migration: 20260821020000_contract_expiry_winback.sql
-- pg_cron jobs to auto-flag expiring/expired contracts
-- + winback campaign creation for 45-day expiring customers
-- ============================================================

-- 1. Daily contract expiry scan: runs at 02:00 UTC every day
-- Flags contracts expiring within 45 days as 'expiring_soon'
-- Marks expired contracts as 'expired'
-- Skips customers already in switching pipeline (docs_pending, submitted_to_provider, deddie_meter_reading)
SELECT cron.schedule(
  'contract-expiry-scan',
  '0 2 * * *',
  $$
  -- A. Flag ACTIVE contracts expiring within 45 days → 'expiring_soon'
  UPDATE public.hlektrismos_customers
  SET contract_status = 'expiring_soon',
      updated_at = NOW()
  WHERE contract_status = 'active'
    AND contract_end_date IS NOT NULL
    AND contract_end_date > CURRENT_DATE
    AND contract_end_date <= CURRENT_DATE + INTERVAL '45 days'
    AND switching_status IS NULL;

  -- B. Mark expired contracts (past end date) → 'expired'
  -- Only if not already in switching pipeline or already expired
  UPDATE public.hlektrismos_customers
  SET contract_status = 'expired',
      updated_at = NOW()
  WHERE contract_end_date IS NOT NULL
    AND contract_end_date < CURRENT_DATE
    AND contract_status IN ('active', 'expiring_soon')
    AND switching_status IS NULL;
  $$
);

-- 2. Auto-create winback email campaign for expiring customers
-- Runs daily at 02:30 UTC (after contract-expiry-scan)
-- Creates one campaign entry per day with all expiring customers as recipients
SELECT cron.schedule(
  'winback-campaign-creator',
  '30 2 * * *',
  $$
  -- Create winback campaign only if expiring_soon customers exist without a recent campaign
  WITH expiring_customers AS (
    SELECT id, full_name, email, active_provider, active_program, contract_end_date
    FROM public.hlektrismos_customers
    WHERE contract_status = 'expiring_soon'
      AND email IS NOT NULL
      AND switching_status IS NULL
  ),
  recent_winback AS (
    SELECT id FROM public.campaigns
    WHERE name LIKE 'Ανανέωση_%'
      AND created_at > NOW() - INTERVAL '7 days'
    LIMIT 1
  )
  INSERT INTO public.campaigns (
    name, channel, status, subject, body, audience_filter, created_at, updated_at
  )
  SELECT
    'Ανανέωση_' || TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'),
    'email',
    'draft',
    'Η σύμβασή σας λήγει σύντομα - Ανανεώστε τώρα',
    'Αγαπητέ/ή {{full_name}}, η σύμβασή σας με τον πάροχο {{active_provider}} (πρόγραμμα {{active_program}}) λήγει στις {{contract_end_date}}. Μην περιμένετε τη λήξη — επικοινωνήστε μαζί μας για να βρούμε την καλύτερη τιμή. Τηλέφωνο: 210 9750816 | Email: info@hlektrismos.gr',
    jsonb_build_object('contract_status', 'expiring_soon'),
    NOW(),
    NOW()
  FROM expiring_customers
  WHERE NOT EXISTS (SELECT 1 FROM recent_winback);
  $$
);
