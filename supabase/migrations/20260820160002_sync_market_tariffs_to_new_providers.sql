-- ============================================================
-- Migration: 20260820160002_sync_market_tariffs_to_new_providers.sql
-- Sync market_tariffs with energy_tariffs for Volton, ZeniΘ, Eunice Power
-- ============================================================

-- Remove old Volton, ZeniΘ, We Energy from market_tariffs
DELETE FROM market_tariffs WHERE provider_name IN ('Volton', 'ZeniΘ', 'We Energy');

-- Volton (20 programs) — unit_rate_kwh and fixed_fee_monthly are NOT NULL in market_tariffs
INSERT INTO market_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, unit_rate_kwh, fixed_fee_monthly, source_url, validity_month, category, resource)
SELECT et.provider_name, et.program_name,
  et.customer_type::text::customer_type_enum,
  et.tariff_color::text::tariff_color_enum,
  'electricity',
  0.10000, 0.00,
  et.official_url,
  to_char(CURRENT_DATE, 'YYYY-MM'),
  et.customer_type::text,
  'ρεύμα'
FROM energy_tariffs et
WHERE et.provider_name = 'Volton'
  AND NOT EXISTS (SELECT 1 FROM market_tariffs mt WHERE mt.provider_name = et.provider_name AND mt.program_name = et.program_name);

-- ZeniΘ (18 programs)
INSERT INTO market_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, unit_rate_kwh, fixed_fee_monthly, source_url, validity_month, category, resource)
SELECT et.provider_name, et.program_name,
  et.customer_type::text::customer_type_enum,
  et.tariff_color::text::tariff_color_enum,
  'electricity',
  0.10000, 0.00,
  et.official_url,
  to_char(CURRENT_DATE, 'YYYY-MM'),
  et.customer_type::text,
  'ρεύμα'
FROM energy_tariffs et
WHERE et.provider_name = 'ZeniΘ'
  AND NOT EXISTS (SELECT 1 FROM market_tariffs mt WHERE mt.provider_name = et.provider_name AND mt.program_name = et.program_name);

-- Eunice Power (16 programs)
INSERT INTO market_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, unit_rate_kwh, fixed_fee_monthly, source_url, validity_month, category, resource)
SELECT et.provider_name, et.program_name,
  et.customer_type::text::customer_type_enum,
  et.tariff_color::text::tariff_color_enum,
  'electricity',
  0.10000, 0.00,
  et.official_url,
  to_char(CURRENT_DATE, 'YYYY-MM'),
  et.customer_type::text,
  'ρεύμα'
FROM energy_tariffs et
WHERE et.provider_name = 'Eunice Power'
  AND NOT EXISTS (SELECT 1 FROM market_tariffs mt WHERE mt.provider_name = et.provider_name AND mt.program_name = et.program_name);
