-- ============================================================
-- Migration: 20260820160001_seed_new_tariff_prices.sql
-- Insert placeholder energy_tariff_prices for Volton, ZeniΘ, Eunice Power
-- so they appear in the CRM UI (needs_review status)
-- ============================================================

-- Volton prices (20 programs)
INSERT INTO energy_tariff_prices (tariff_id, base_price_day, fixed_fee_monthly, validity_from, verification_status, source_type, notes)
SELECT et.id, NULL, NULL, CURRENT_DATE, 'needs_review', 'scraper', 'Awaiting price extraction from volton.gr'
FROM energy_tariffs et
WHERE et.provider_name = 'Volton'
  AND NOT EXISTS (SELECT 1 FROM energy_tariff_prices etp WHERE etp.tariff_id = et.id);

-- ZeniΘ prices (18 programs)
INSERT INTO energy_tariff_prices (tariff_id, base_price_day, fixed_fee_monthly, validity_from, verification_status, source_type, notes)
SELECT et.id, NULL, NULL, CURRENT_DATE, 'needs_review', 'scraper', 'Awaiting price extraction from zenith.gr'
FROM energy_tariffs et
WHERE et.provider_name = 'ZeniΘ'
  AND NOT EXISTS (SELECT 1 FROM energy_tariff_prices etp WHERE etp.tariff_id = et.id);

-- Eunice Power prices (16 programs)
INSERT INTO energy_tariff_prices (tariff_id, base_price_day, fixed_fee_monthly, validity_from, verification_status, source_type, notes)
SELECT et.id, NULL, NULL, CURRENT_DATE, 'needs_review', 'scraper', 'Awaiting price extraction from eunice-power.gr'
FROM energy_tariffs et
WHERE et.provider_name = 'Eunice Power'
  AND NOT EXISTS (SELECT 1 FROM energy_tariff_prices etp WHERE etp.tariff_id = et.id);

-- Also seed any other tariffs that have no price entries (safety net)
INSERT INTO energy_tariff_prices (tariff_id, base_price_day, fixed_fee_monthly, validity_from, verification_status, source_type, notes)
SELECT et.id, NULL, NULL, CURRENT_DATE, 'needs_review', 'scraper', 'Auto-seeded placeholder'
FROM energy_tariffs et
WHERE et.is_active = true
  AND NOT EXISTS (SELECT 1 FROM energy_tariff_prices etp WHERE etp.tariff_id = et.id);
