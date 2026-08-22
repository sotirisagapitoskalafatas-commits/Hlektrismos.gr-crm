-- ============================================================
-- Migration: 20260821040000_consolidate_tariffs.sql
-- Consolidate legacy market_tariffs into the two-table design:
--   energy_tariffs (product catalog) + energy_tariff_prices (pricing history)
-- Then drop the legacy market_tariffs table.
-- ============================================================

-- ─── Step A: Insert distinct providers from market_tariffs into energy_tariffs
-- Only insert if not already present (energy_tariffs may have rows from
-- the enterprise_tariff_engine migration or from autonomous-tariff-scraper).
INSERT INTO energy_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type,
  official_url, is_active, created_at, updated_at
)
SELECT DISTINCT ON (mt.provider_name, mt.program_name)
  mt.provider_name,
  mt.program_name,
  CASE WHEN mt.customer_type = 'B2B' THEN 'B2B'::tariff_customer_type
       ELSE 'B2C'::tariff_customer_type END,
  CASE
    WHEN mt.tariff_color = 'green'  THEN 'green'::tariff_color_code
    WHEN mt.tariff_color = 'blue'   THEN 'blue'::tariff_color_code
    WHEN mt.tariff_color = 'yellow' THEN 'yellow'::tariff_color_code
    WHEN mt.tariff_color = 'orange' THEN 'orange'::tariff_color_code
    ELSE 'green'::tariff_color_code
  END,
  CASE
    WHEN mt.energy_type = 'gas'   THEN 'gas'::tariff_energy_type
    WHEN mt.energy_type = 'solar' THEN 'solar'::tariff_energy_type
    ELSE 'electricity'::tariff_energy_type
  END,
  COALESCE(NULLIF(mt.source_url, ''), NULL),
  TRUE,
  COALESCE(mt.created_at, NOW()),
  NOW()
FROM market_tariffs mt
ORDER BY mt.provider_name, mt.program_name, mt.validity_month DESC
ON CONFLICT (provider_name, program_name) DO UPDATE SET
  official_url = COALESCE(EXCLUDED.official_url, energy_tariffs.official_url),
  updated_at = NOW();

-- ─── Step B: Insert current pricing into energy_tariff_prices ──
-- Links each market_tariff row to its energy_tariffs.id via provider+program match.
INSERT INTO energy_tariff_prices (
  tariff_id, base_price_day, base_price_night, unit_rate_kwh,
  fixed_fee_monthly, validity_from, verification_status, source_url,
  created_at
)
SELECT
  et.id,
  mt.unit_rate_kwh,
  NULL,                                        -- legacy had no night rate
  mt.unit_rate_kwh,
  mt.fixed_fee_monthly,
  COALESCE((mt.validity_month || '-01')::DATE, CURRENT_DATE),
  'needs_review'::tariff_verification_status,
  NULLIF(mt.source_url, ''),
  COALESCE(mt.created_at, NOW())
FROM market_tariffs mt
JOIN energy_tariffs et
  ON et.provider_name = mt.provider_name
 AND et.program_name  = mt.program_name
ON CONFLICT (tariff_id, validity_from) DO NOTHING;

-- ─── Step C: Drop the legacy market_tariffs table ──────────────
-- Cascade-drop any dependent views/policies.
DROP TABLE IF EXISTS market_tariffs CASCADE;

-- ============================================================
-- Notes for follow-up (manual code changes still needed):
--
-- Frontend (React) files that reference `market_tariffs`:
--   1. src/pages/DashboardPage.tsx (line ~435, ~604)
--      - loadData() SELECT from market_tariffs → use get_active_tariff_prices RPC
--      - updateTariffPrice() UPDATE on market_tariffs → update energy_tariff_prices
--   2. src/components/MarketRagFolders.tsx (line ~103)
--      - Fallback query already exists behind RPC; no change needed
--
-- Edge Functions that reference `market_tariffs`:
--   3. autonomous-tariff-scraper  → remove legacy upsert block (lines ~278-303)
--   4. agent-worker               → change to energy_tariffs / energy_tariff_prices
--   5. ai-orchestrator            → change to energy_tariffs / energy_tariff_prices
--   6. orchestrator               → change get_market_tariffs tool to use RPC
--   7. ask-market-rag             → change to energy_tariffs / energy_tariff_prices
--   8. sync-green-tariffs         → change to energy_tariffs / energy_tariff_prices
--   9. sync-market-tariffs        → change to energy_tariffs / energy_tariff_prices
--  10. chat                       → change to energy_tariffs / energy_tariff_prices
--  11. ai-developer               → update table list in system prompt
-- ============================================================
