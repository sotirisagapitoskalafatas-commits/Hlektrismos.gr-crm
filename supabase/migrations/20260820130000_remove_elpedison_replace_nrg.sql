-- ============================================================
-- Migration: 20260820130000_remove_elpedison_replace_nrg.sql
-- 1. Remove Elpedison from energy_tariffs + energy_tariff_prices
-- 2. Replace old nrg programs with 41 correct programs
--    (24 B2C + 17 B2B) with exact official URLs
-- ============================================================

-- 1. Remove Elpedison (cascade to prices)
DELETE FROM energy_tariff_prices
WHERE tariff_id IN (
  SELECT id FROM energy_tariffs WHERE provider_name = 'Elpedison'
);

DELETE FROM energy_tariffs WHERE provider_name = 'Elpedison';

-- Also remove from legacy market_tariffs
DELETE FROM market_tariffs WHERE provider_name = 'Elpedison';

-- 2. Remove old nrg programs
DELETE FROM energy_tariff_prices
WHERE tariff_id IN (
  SELECT id FROM energy_tariffs WHERE provider_name = 'nrg'
);

DELETE FROM energy_tariffs WHERE provider_name = 'nrg';

DELETE FROM market_tariffs WHERE provider_name = 'nrg';

-- 3. Insert correct nrg B2C programs (24)
-- 'none' color mapped to 'green' (PostgreSQL enum workaround)
INSERT INTO energy_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type, official_url, is_active
) VALUES
('nrg', 'nrg Οικιακό (Γενική Σελίδα)', 'B2C', 'green', 'electricity', 'https://www.nrg.gr/el/idiotes/revma', true),
('nrg', 'Συνεργασία nrg & Nova', 'B2C', 'green', 'electricity', 'https://www.nrg.gr/el/synergasia-nrg-nova', true),
('nrg', 'nrg on time 4U', 'B2C', 'yellow', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-ontime-4u', true),
('nrg', 'nrg free', 'B2C', 'yellow', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-free', true),
('nrg', 'nrg smart start', 'B2C', 'yellow', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-smart-start', true),
('nrg', 'nrg adjust 1.0 promo', 'B2C', 'yellow', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-adjust-1.0-promo', true),
('nrg', 'nrg simple 3.0', 'B2C', 'yellow', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-simple-3.0', true),
('nrg', 'nrg fixed on time 1.0 18M promo', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-fixed-on-time-1.0-18M-promo', true),
('nrg', 'nrg fixed on time business2', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-fixed-on-time-business2', true),
('nrg', 'nrg packs', 'B2C', 'green', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-packs', true),
('nrg', 'nrg fixed on time advanced 3.0', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-fixed-on-time-advanced-3.0', true),
('nrg', 'nrg fixed 12M', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-fixed-12M', true),
('nrg', 'nrg pack S 12M', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-pack-S-12M', true),
('nrg', 'nrg pack S 24M', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-pack-S-24M', true),
('nrg', 'nrg pack M 12M', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-pack-M-12M', true),
('nrg', 'nrg pack M 24M', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-pack-M-24M', true),
('nrg', 'nrg pack L 12M', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-pack-L-12M', true),
('nrg', 'nrg pack L 24M', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-pack-L-24M', true),
('nrg', 'nrg pack XL 12M', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-pack-XL-12M', true),
('nrg', 'nrg pack XL 24M', 'B2C', 'blue', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-pack-XL-24M', true),
('nrg', 'nrg prime 4u', 'B2C', 'yellow', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-prime-4u', true),
('nrg', 'nrg @ cost+', 'B2C', 'yellow', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-at-cost-plus', true),
('nrg', 'nrg hybrid 50-50', 'B2C', 'yellow', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/nrg-hybrid-50-50', true),
('nrg', 'nrg Ειδικό Τιμολόγιο', 'B2C', 'green', 'electricity', 'https://www.nrg.gr/el/idiotes/revma/eidiko-timologio-nrg', true)

ON CONFLICT (provider_name, program_name) DO UPDATE SET
  official_url = EXCLUDED.official_url,
  tariff_color = EXCLUDED.tariff_color,
  is_active = true,
  updated_at = now();

-- 4. Insert correct nrg B2B programs (17)
INSERT INTO energy_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type, official_url, is_active
) VALUES
('nrg', 'nrg Επιχειρήσεις (Γενική Σελίδα)', 'B2B', 'green', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma', true),
('nrg', 'nrg simple 1.0 BUSINESS1', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-simple-1.0-business1', true),
('nrg', 'nrg simple BUSINESS2', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-simple-business2', true),
('nrg', 'nrg free BUSINESS1', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-free-business1', true),
('nrg', 'nrg free BUSINESS2', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-free-business2', true),
('nrg', 'nrg on time 4U BUSINESS1', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-ontime-4ubusiness1', true),
('nrg', 'nrg on time 4U BUSINESS2', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-ontime-4ubusiness2', true),
('nrg', 'nrg prime 4U BUSINESS 1 promo', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-prime-4Ubusiness1-promo', true),
('nrg', 'nrg prime 4U BUSINESS 1', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-prime-4Ubusiness1', true),
('nrg', 'nrg prime 4U BUSINESS 2', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-prime-4ubusiness2', true),
('nrg', 'nrg fixed on time 1.0 business1 18m', 'B2B', 'blue', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-fixed-on-time-1.0-business1-18m', true),
('nrg', 'nrg fixed on time advanced 3.0 business1', 'B2B', 'blue', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-fixed-on-time-advanced-3.0-business1', true),
('nrg', 'nrg adjust 1.0 business1 promo', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-adjust-1.0-business1-promo', true),
('nrg', 'nrg @ cost+ BUSINESS1', 'B2B', 'yellow', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-at-cost-plus-business1', true),
('nrg', 'Ειδικό Τιμολόγιο nrg Επαγγελματικό ≤25kVA', 'B2B', 'green', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/eidiko-timologio-nrg-epaggelmatiko-1', true),
('nrg', 'Ειδικό Τιμολόγιο nrg Επαγγελματικό >25kVA', 'B2B', 'green', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/eidiko-timologio-nrg-epaggelmatiko-2', true),
('nrg', 'nrg CONNECT', 'B2B', 'green', 'electricity', 'https://www.nrg.gr/el/epixiriseis/revma/nrg-connect', true)

ON CONFLICT (provider_name, program_name) DO UPDATE SET
  official_url = EXCLUDED.official_url,
  tariff_color = EXCLUDED.tariff_color,
  is_active = true,
  updated_at = now();

-- 5. Insert default price entries for new nrg tariffs
INSERT INTO energy_tariff_prices (
  tariff_id, base_price_day, unit_rate_kwh, fixed_fee_monthly,
  validity_from, verification_status, source_url
)
SELECT
  et.id,
  NULL,
  NULL,
  0,
  CURRENT_DATE,
  'needs_review',
  et.official_url
FROM energy_tariffs et
WHERE et.provider_name = 'nrg'
  AND NOT EXISTS (
    SELECT 1 FROM energy_tariff_prices etp
    WHERE etp.tariff_id = et.id AND etp.validity_from = CURRENT_DATE
  );

-- 6. Seed into legacy market_tariffs for backward compat
INSERT INTO market_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type,
  unit_rate_kwh, fixed_fee_monthly, validity_month, source_url
)
SELECT
  et.provider_name,
  et.program_name,
  et.customer_type::text::customer_type_enum,
  et.tariff_color::text::tariff_color_enum,
  et.energy_type,
  0,
  0,
  TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
  et.official_url
FROM energy_tariffs et
WHERE et.provider_name = 'nrg'
  AND NOT EXISTS (
    SELECT 1 FROM market_tariffs mt
    WHERE mt.provider_name = et.provider_name AND mt.program_name = et.program_name
  );

-- ============================================================
-- Summary: Elpedison removed, nrg replaced with 41 programs
-- (24 B2C + 17 B2B) with exact official URLs from nrg.gr
-- ============================================================
