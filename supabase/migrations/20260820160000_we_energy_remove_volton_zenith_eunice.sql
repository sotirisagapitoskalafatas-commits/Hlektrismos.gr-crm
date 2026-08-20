-- ============================================================
-- Migration: 20260820160000_we_energy_remove_volton_zenith_eunice.sql
-- 1. Remove We Energy (all tariffs + prices + market_tariffs)
-- 2. Replace Volton with correct 20 programs + exact URLs
-- 3. Replace ZeniΘ with correct 18 programs + exact URLs
-- 4. Add Eunice Power as new provider (16 programs)
-- 5. Update scraper OFFICIAL_URLS (We Energy → Eunice Power)
-- ============================================================

-- ─── 1. REMOVE WE ENERGY ─────────────────────────────────────
DELETE FROM energy_tariff_prices WHERE tariff_id IN (SELECT id FROM energy_tariffs WHERE provider_name = 'We Energy');
DELETE FROM energy_tariffs WHERE provider_name = 'We Energy';
DELETE FROM market_tariffs WHERE provider_name = 'We Energy';
DELETE FROM hlektrismos_provider_docs WHERE provider_name = 'We Energy';

-- ─── 2. REPLACE VOLTON (8 B2C + 12 B2B = 20 programs) ──────
DELETE FROM energy_tariff_prices WHERE tariff_id IN (SELECT id FROM energy_tariffs WHERE provider_name = 'Volton');
DELETE FROM energy_tariffs WHERE provider_name = 'Volton';

INSERT INTO energy_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, official_url) VALUES
-- B2C
('Volton', 'Volton Blue Flat 18M', 'B2C', 'blue', 'electricity', 'https://volton.gr/gia-to-spiti/revma/volton-blue-flat-18m/'),
('Volton', 'Volton Blue Flat', 'B2C', 'blue', 'electricity', 'https://volton.gr/gia-to-spiti/revma/volton-blue-flat/'),
('Volton', 'Volton Blue Student', 'B2C', 'blue', 'electricity', 'https://volton.gr/gia-to-spiti/revma/volton-blue-student/'),
('Volton', 'Volton Blue Smart', 'B2C', 'blue', 'electricity', 'https://volton.gr/gia-to-spiti/revma/volton-blue-smart/'),
('Volton', 'Volton Stay & Win', 'B2C', 'yellow', 'electricity', 'https://volton.gr/gia-to-spiti/revma/volton-stay-win/'),
('Volton', 'Volton Yellow Zero', 'B2C', 'yellow', 'electricity', 'https://volton.gr/gia-to-spiti/revma/volton-yellow-zero/'),
('Volton', 'Volton Yellow Simple', 'B2C', 'yellow', 'electricity', 'https://volton.gr/gia-to-spiti/revma/volton-yellow-simple/'),
('Volton', 'Volton Green Ειδικό', 'B2C', 'green', 'electricity', 'https://volton.gr/gia-to-spiti/revma/volton-green-eidiko/'),
-- B2B
('Volton', 'Volton Blue Flat 18M Business (Γ21)', 'B2B', 'blue', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-blue-flat-18m-business-21/'),
('Volton', 'Volton Blue Flat Business (Γ21)', 'B2B', 'blue', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-blue-flat-business-21/'),
('Volton', 'Volton Stay & Win Business (Γ21)', 'B2B', 'yellow', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-stay-win-business-21/'),
('Volton', 'Volton Stay & Win Business (Γ22)', 'B2B', 'yellow', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-stay-win-business-22/'),
('Volton', 'Volton Stay & Win Business (Γ23)', 'B2B', 'yellow', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-stay-win-business-23/'),
('Volton', 'Volton Yellow Zero Business (Γ21)', 'B2B', 'yellow', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-yellow-zero-business-21/'),
('Volton', 'Volton Yellow Simple Business (Γ21)', 'B2B', 'yellow', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-yellow-simple-business-21/'),
('Volton', 'Volton Yellow Simple Business (Γ22)', 'B2B', 'yellow', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-yellow-simple-business-22/'),
('Volton', 'Volton Yellow Simple Business (Γ23)', 'B2B', 'yellow', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-yellow-simple-business-23/'),
('Volton', 'Volton Green Ειδικό Business (Γ21)', 'B2B', 'green', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-green-eidiko-business-21/'),
('Volton', 'Volton Green Ειδικό Business (Γ22)', 'B2B', 'green', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-green-eidiko-business-22/'),
('Volton', 'Volton Green Ειδικό Business (Γ23)', 'B2B', 'green', 'electricity', 'https://volton.gr/gia-tin-epicheirisi/revma/volton-green-eidiko-business-23/');

-- ─── 3. REPLACE ZENIΘ (12 B2C + 6 B2B = 18 programs) ───────
DELETE FROM energy_tariff_prices WHERE tariff_id IN (SELECT id FROM energy_tariffs WHERE provider_name = 'ZeniΘ');
DELETE FROM energy_tariffs WHERE provider_name = 'ZeniΘ';

INSERT INTO energy_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, official_url) VALUES
-- B2C
('ZeniΘ', 'Power Home Fixed 1Y', 'B2C', 'blue', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/power-home-fixed-1y/'),
('ZeniΘ', 'Power Home Light', 'B2C', 'yellow', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/power-home-light/'),
('ZeniΘ', 'Power Home Fixed 2Y', 'B2C', 'blue', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/power-home-fixed-2y/'),
('ZeniΘ', 'Power Home Pair 2.0', 'B2C', 'yellow', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/power-home-pair-2-0/'),
('ZeniΘ', 'Power Home Save', 'B2C', 'yellow', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/power-home-save/'),
('ZeniΘ', 'Power Home Student', 'B2C', 'yellow', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/el-for-the-home-electricity-power-home-student/'),
('ZeniΘ', 'Zenergy', 'B2C', 'green', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/zenergy/'),
('ZeniΘ', 'Power Home Select', 'B2C', 'yellow', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/power-home-select/'),
('ZeniΘ', 'Power Home Start', 'B2C', 'yellow', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/power-home-start/'),
('ZeniΘ', 'My Pet My Home', 'B2C', 'yellow', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/my-pet-my-home/'),
('ZeniΘ', 'Power Home Go Electric Plus', 'B2C', 'blue', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/power-home-go-electric-plus/'),
('ZeniΘ', 'Power Home Flow', 'B2C', 'yellow', 'electricity', 'https://zenith.gr/el/for-the-home/electricity/power-home-flow/'),
-- B2B
('ZeniΘ', 'Power Business Direct Plus', 'B2B', 'blue', 'electricity', 'https://zenith.gr/el/services-for-the-business/electricity/power-business-direct-plus/'),
('ZeniΘ', 'Power Business Basic', 'B2B', 'green', 'electricity', 'https://zenith.gr/el/services-for-the-business/electricity/power-business-basic/'),
('ZeniΘ', 'Power Business Basic 3.0', 'B2B', 'green', 'electricity', 'https://zenith.gr/el/services-for-the-business/electricity/power-business-basic-3-0/'),
('ZeniΘ', 'Power Business Smart', 'B2B', 'yellow', 'electricity', 'https://zenith.gr/el/services-for-the-business/electricity/power-business-smart/'),
('ZeniΘ', 'Power Business Start', 'B2B', 'yellow', 'electricity', 'https://zenith.gr/el/services-for-the-business/electricity/power-business-start/'),
('ZeniΘ', 'Power Business Flow 2', 'B2B', 'yellow', 'electricity', 'https://zenith.gr/el/services-for-the-business/electricity/power-business-flow-2/');

-- ─── 4. ADD EUNICE POWER (6 B2C + 10 B2B = 16 programs) ────
INSERT INTO energy_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, official_url) VALUES
-- B2C
('Eunice Power', 'Eunice Home Secure', 'B2C', 'blue', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-to-spiti/eunice-home-secure/'),
('Eunice Power', 'Eunice Home Balance', 'B2C', 'blue', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-to-spiti/eunice-home-balance/'),
('Eunice Power', 'Eunice Home Flex', 'B2C', 'yellow', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-to-spiti/eunice-home-flex/'),
('Eunice Power', 'Eunice Home Dynamic', 'B2C', 'yellow', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-to-spiti/eunice-home-dynamic/'),
('Eunice Power', 'Ειδικό Τιμολόγιο Home', 'B2C', 'green', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-to-spiti/eidiko-timologio-home/'),
('Eunice Power', 'Βασικός Τιμοκατάλογος Home', 'B2C', 'blue', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-to-spiti/vasikos-timokatalogos-home/'),
-- B2B
('Eunice Power', 'Small Business Secure (8-25kVA)', 'B2B', 'blue', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/eunice-small-business-secure-8-25kva/'),
('Eunice Power', 'Small Business Balance (8-25kVA)', 'B2B', 'blue', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/eunice-small-business-balance-8-25kva/'),
('Eunice Power', 'Business Flex (8-250kVA)', 'B2B', 'yellow', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/eunice-business-flex-8-250kva/'),
('Eunice Power', 'Small Business Dynamic (8-25kVA)', 'B2B', 'yellow', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/eunice-small-business-dynamic-8-25kva/'),
('Eunice Power', 'Large Business Secure (25-250kVA)', 'B2B', 'blue', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/eunice-large-business-secure-25-250kva/'),
('Eunice Power', 'Large Business Balance (25-250kVA)', 'B2B', 'blue', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/eunice-large-business-balance-25-250kva/'),
('Eunice Power', 'Business Synergy (25-250kVA)', 'B2B', 'blue', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/eunice-business-synergy-25-250kva/'),
('Eunice Power', 'Large Business Dynamic (25-250kVA)', 'B2B', 'yellow', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/eunice-large-business-dynamic-25-250kva/'),
('Eunice Power', 'Ειδικό Τιμολόγιο Business', 'B2B', 'green', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/eidiko-timologio-business/'),
('Eunice Power', 'Βασικός Τιμοκατάλογος Business', 'B2B', 'blue', 'electricity', 'https://eunice-power.gr/hlektrikh-energeia/gia-tin-epixeirhsh/basikos-timokatalogos-business/');
