-- ============================================================
-- Migration: 20260820120000_add_enerwave_provider.sql
-- Adds Enerwave (Mytilineos) with 23 programs + My Wave Daily
-- Exact official URLs per program
-- ============================================================

-- 1. Insert Enerwave B2C programs (13)
INSERT INTO energy_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type, official_url, is_active
) VALUES

-- === ENERWAVE B2C (ΟΙΚΙΑΚΑ) ===
('Enerwave', 'Smart Zero', 'B2C', 'blue', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/smart-zero_133204/', true),
('Enerwave', 'Reward Stable 12M 2.0', 'B2C', 'blue', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/reward-stable-12m-2.0_136067/', true),
('Enerwave', 'Reward Stable Max 12M 2.0', 'B2C', 'blue', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/reward-stable-max-12m-2.0_136069/', true),
('Enerwave', 'Reward Stable Zero 12M', 'B2C', 'blue', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/reward-stable-zero-12m_135820/', true),
('Enerwave', 'Reward Night Saver', 'B2C', 'yellow', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/reward-night-saver_134066/', true),
('Enerwave', 'Reward Saver', 'B2C', 'yellow', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/reward-saver_134068/', true),
('Enerwave', 'Smart', 'B2C', 'yellow', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/smart_133043/', true),
('Enerwave', 'Reward DriveGreen Max', 'B2C', 'green', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/reward-drivegreen-max_135842/', true),
('Enerwave', 'Reward HeatGreen Max', 'B2C', 'green', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/reward-heatgreen-max_135845/', true),
('Enerwave', 'Ειδικό Οικιακό Τιμολόγιο', 'B2C', 'green', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/eidiko-timologio-oikiako_133075/', true),
('Enerwave', 'Dynamic Wave', 'B2C', 'orange', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/dynamic-wave_134943/', true),
('Enerwave', 'Κοινωνικό Οικιακό Τιμολόγιο (ΚΟΤ)', 'B2C', 'green', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/koinoniko-oikiako-timologio-kot-/', true),
('Enerwave', 'Προμήθεια Καθολικής Υπηρεσίας', 'B2C', 'green', 'electricity', 'https://www.enerwave.gr/el/gia-to-spiti/revma/promitheia-katholikis-ypiresias/', true)

ON CONFLICT (provider_name, program_name) DO UPDATE SET
  official_url = EXCLUDED.official_url,
  tariff_color = EXCLUDED.tariff_color,
  is_active = true,
  updated_at = now();

-- 2. Insert Enerwave B2B programs (10)
INSERT INTO energy_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type, official_url, is_active
) VALUES

-- === ENERWAVE B2B (ΕΠΑΓΓΕΛΜΑΤΙΚΑ) ===
('Enerwave', 'Reward Stable 2.0 for Business (Γ21)', 'B2B', 'blue', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/reward-stable-2.0-for-business-g21_136073/', true),
('Enerwave', 'Reward Stable Zero for Business (Γ21)', 'B2B', 'blue', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/reward-stable-zero-for-business-g21_136075/', true),
('Enerwave', 'Reward Stable for Business (Γ22-Γ23)', 'B2B', 'blue', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/reward-stable-for-business-g22-g23_135853/', true),
('Enerwave', 'Reward Saver for Business', 'B2B', 'yellow', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/reward-saver-for-business_134118/', true),
('Enerwave', 'SmartZero for Business', 'B2B', 'yellow', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/smartzero-for-business_133158/', true),
('Enerwave', 'Ειδικό Τιμολόγιο Επιχειρήσεων (Γ21)', 'B2B', 'green', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/eidiko-timologio-gia-epicheiriseis-g21_133154/', true),
('Enerwave', 'Ειδικό Τιμολόγιο Επιχειρήσεων (Γ22-Γ23)', 'B2B', 'green', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/eidiko-timologio-gia-epicheiriseis-g22-g23_133078/', true),
('Enerwave', 'Dynamic Wave for Business', 'B2B', 'orange', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/dynamic-wave-for-business_134945/', true),
('Enerwave', 'Dynamic Wave for Business Plus', 'B2B', 'orange', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/dynamic-wave-for-business-plus_134948/', true),
('Enerwave', 'Προμήθεια Καθολικής Υπηρεσίας Επιχειρήσεων', 'B2B', 'green', 'electricity', 'https://www.enerwave.gr/el/gia-tin-epicheirisi/revma-gia-mikres-mesaies-epicheiriseis/promitheia-katholikis-ypiresias/', true)

ON CONFLICT (provider_name, program_name) DO UPDATE SET
  official_url = EXCLUDED.official_url,
  tariff_color = EXCLUDED.tariff_color,
  is_active = true,
  updated_at = now();

-- 3. Insert default price entries for new Enerwave tariffs
-- (with needs_review status — prices to be filled manually or via scraper)
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
WHERE et.provider_name = 'Enerwave'
  AND NOT EXISTS (
    SELECT 1 FROM energy_tariff_prices etp
    WHERE etp.tariff_id = et.id AND etp.validity_from = CURRENT_DATE
  );

-- 4. Also seed into legacy market_tariffs for backward compat
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
WHERE et.provider_name = 'Enerwave'
  AND NOT EXISTS (
    SELECT 1 FROM market_tariffs mt
    WHERE mt.provider_name = et.provider_name AND mt.program_name = et.program_name
  );

-- ============================================================
-- Summary: 23 Enerwave programs added (13 B2C + 10 B2B)
-- All with exact official URLs from enerwave.gr
-- ============================================================
