-- ============================================================
-- Migration: 20260820140000_replace_protergia_programs.sql
-- Replace old Protergia programs with 26 correct programs
-- (11 B2C + 15 B2B) with exact official URLs
-- ============================================================

-- 1. Remove old Protergia programs
DELETE FROM energy_tariff_prices
WHERE tariff_id IN (
  SELECT id FROM energy_tariffs WHERE provider_name = 'Protergia'
);

DELETE FROM energy_tariffs WHERE provider_name = 'Protergia';

DELETE FROM market_tariffs WHERE provider_name = 'Protergia';

-- 2. Insert correct Protergia B2C programs (11)
INSERT INTO energy_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type, official_url, is_active
) VALUES
('Protergia', 'Protergia Picasso', 'B2C', 'yellow', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-picasso/', true),
('Protergia', 'Value Sure 12M', 'B2C', 'blue', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-oikiako-value-sure-12m-30/', true),
('Protergia', 'Value Sure 18M', 'B2C', 'blue', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-oikiako-value-sure-18m-30/', true),
('Protergia', 'Student Plan', 'B2C', 'yellow', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-oikiako-student-plan/', true),
('Protergia', 'Picasso Student', 'B2C', 'yellow', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-picasso-student/', true),
('Protergia', 'Dynamic One', 'B2C', 'orange', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-oikiako-dynamic-one/', true),
('Protergia', 'Value Bright', 'B2C', 'yellow', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-oikiako-value-bright/', true),
('Protergia', 'Helios Value', 'B2C', 'green', 'solar', 'https://www.protergia.gr/spiti/energeiakes-luseis/protergia-oikiako-helios-value/', true),
('Protergia', 'Value Lite 2.0', 'B2C', 'yellow', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-oikiako-value-lite-2-0/', true),
('Protergia', 'Value Standard', 'B2C', 'yellow', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-oikiako-value-standard/', true),
('Protergia', 'Value Special (Ειδικό)', 'B2C', 'green', 'electricity', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/protergia-oikiako-value-special/', true)

ON CONFLICT (provider_name, program_name) DO UPDATE SET
  official_url = EXCLUDED.official_url,
  tariff_color = EXCLUDED.tariff_color,
  energy_type = EXCLUDED.energy_type,
  is_active = true,
  updated_at = now();

-- 3. Insert correct Protergia B2B programs (15)
INSERT INTO energy_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type, official_url, is_active
) VALUES
('Protergia', 'Protergia Picasso Business', 'B2B', 'yellow', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-picasso/', true),
('Protergia', 'Επαγγελματικό 1 Value Sure 12M', 'B2B', 'blue', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-1-value-sure-12m-3-0/', true),
('Protergia', 'Επαγγελματικό 1 Value Special', 'B2B', 'green', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-1-value-special/', true),
('Protergia', 'Επαγγελματικό 1 Dynamic One', 'B2B', 'orange', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-1-dynamic-one/', true),
('Protergia', 'Επαγγελματικό 2 Dynamic One', 'B2B', 'orange', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-2-dynamic-one/', true),
('Protergia', 'Επαγγελματικό Value Power', 'B2B', 'blue', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-value-power/', true),
('Protergia', 'Επαγγελματικό 3 Value Sure 12M', 'B2B', 'blue', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-3-value-sure-12m-20/', true),
('Protergia', 'Επαγγελματικό 1 Value Simple 2.0', 'B2B', 'yellow', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-1-value-simple-2-0/', true),
('Protergia', 'Επαγγελματικό 1 Value Standard', 'B2B', 'yellow', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-1-value-standard/', true),
('Protergia', 'Επαγγελματικό 2 Value Special', 'B2B', 'green', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-2-value-special/', true),
('Protergia', 'Επαγγελματικό 2 Value Simple 2.0', 'B2B', 'yellow', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-2-value-simple-2-0/', true),
('Protergia', 'Επαγγελματικό 2 Value Standard', 'B2B', 'yellow', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-2-value-standard/', true),
('Protergia', 'Επαγγελματικό 3 Value Special', 'B2B', 'green', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-3-value-special/', true),
('Protergia', 'Επαγγελματικό 3 Value Simple 2.0', 'B2B', 'yellow', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-3-value-simple-2-0/', true),
('Protergia', 'Επαγγελματικό 3 Value Standard', 'B2B', 'yellow', 'electricity', 'https://www.protergia.gr/epixeirhsh/epaggelmatiko-reuma/protergia-epaggelmatiko-3-value-standard/', true)

ON CONFLICT (provider_name, program_name) DO UPDATE SET
  official_url = EXCLUDED.official_url,
  tariff_color = EXCLUDED.tariff_color,
  is_active = true,
  updated_at = now();

-- 4. Insert default price entries (needs_review)
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
WHERE et.provider_name = 'Protergia'
  AND NOT EXISTS (
    SELECT 1 FROM energy_tariff_prices etp
    WHERE etp.tariff_id = et.id AND etp.validity_from = CURRENT_DATE
  );

-- 5. Seed into legacy market_tariffs
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
WHERE et.provider_name = 'Protergia'
  AND NOT EXISTS (
    SELECT 1 FROM market_tariffs mt
    WHERE mt.provider_name = et.provider_name AND mt.program_name = et.program_name
  );
