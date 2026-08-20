-- ============================================================
-- Migration: 20260820170000_replace_dei_elin_heron_fysiko.sql
-- Replace ΔΕΗ, Ελίν, ΗΡΩΝ, Φυσικό Αέριο with correct programs + exact URLs
-- 74 programs total (ΔΕΗ 19 + Ελίν 8 + ΗΡΩΝ 26 + Φυσικό Αέριο 21)
-- ============================================================

-- ─── 1. DELETE OLD ENTRIES ───────────────────────────────────
DELETE FROM energy_tariff_prices WHERE tariff_id IN (SELECT id FROM energy_tariffs WHERE provider_name IN ('ΔΕΗ', 'Ελίν', 'ΗΡΩΝ', 'Φυσικό Αέριο'));
DELETE FROM energy_tariffs WHERE provider_name IN ('ΔΕΗ', 'Ελίν', 'ΗΡΩΝ', 'Φυσικό Αέριο');
DELETE FROM market_tariffs WHERE provider_name IN ('ΔΕΗ', 'Ελίν', 'ΗΡΩΝ', 'Φυσικό Αέριο');
DELETE FROM hlektrismos_provider_docs WHERE provider_name IN ('ΔΕΗ', 'Ελίν', 'ΗΡΩΝ', 'Φυσικό Αέριο');

-- ─── 2. ΔΕΗ (10 B2C electricity + 2 B2C solar + 5 B2B electricity + 2 B2B solar = 19) ──
INSERT INTO energy_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, official_url) VALUES
('ΔΕΗ', 'myHome EnterTwo', 'B2C', 'blue', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-entertwo/'),
('ΔΕΗ', 'myHome Plan', 'B2C', 'blue', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-plan/'),
('ΔΕΗ', 'myHome Maxima', 'B2C', 'blue', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-maxima/'),
('ΔΕΗ', 'myHome Dynamic', 'B2C', 'yellow', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-dynamic/'),
('ΔΕΗ', 'myHome Enter', 'B2C', 'blue', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-enter/'),
('ΔΕΗ', 'myHome 4All', 'B2C', 'yellow', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-4all/'),
('ΔΕΗ', 'myHome Online', 'B2C', 'blue', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-online/'),
('ΔΕΗ', 'myHome 4Students', 'B2C', 'yellow', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-4students/'),
('ΔΕΗ', 'myHome 4All OneRate', 'B2C', 'yellow', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/myhome-4all-onerate/'),
('ΔΕΗ', 'Γ1/Γ1Ν Οικιακό Ειδικό', 'B2C', 'green', 'electricity', 'https://www.dei.gr/el/gia-to-spiti/revma/g1-g1n/'),
('ΔΕΗ', 'myEnergy SolarNet', 'B2C', 'green', 'solar', 'https://www.dei.gr/el/gia-to-spiti/myenergy/myenergy-solar/myenergy-solarnet/'),
('ΔΕΗ', 'myEnergy SolarSmart', 'B2C', 'green', 'solar', 'https://www.dei.gr/el/gia-to-spiti/myenergy/myenergy-solar/myenergy-solarsmart/'),
('ΔΕΗ', 'myHotel SmartRate', 'B2B', 'yellow', 'electricity', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/epaggelmaties-epixeiriseis/myhotel-smartrate/'),
('ΔΕΗ', 'myBusiness 4All', 'B2B', 'yellow', 'electricity', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/epaggelmaties-epixeiriseis/mybusiness-4all/'),
('ΔΕΗ', 'myBusiness 4All Plus', 'B2B', 'yellow', 'electricity', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/epaggelmaties-epixeiriseis/mybusiness-4allplus/'),
('ΔΕΗ', 'myBusiness Enter', 'B2B', 'blue', 'electricity', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/epaggelmaties-epixeiriseis/mybusiness-enter/'),
('ΔΕΗ', 'myBusiness Dynamic', 'B2B', 'yellow', 'electricity', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/epaggelmaties-epixeiriseis/mybusiness-dynamic/'),
('ΔΕΗ', 'SolarNet Pro', 'B2B', 'green', 'solar', 'https://www.dei.gr/el/gia-tin-epixeirisi/myenergy/myenergy-solarpro/myenergy-solarnetpro/'),
('ΔΕΗ', 'SolarSmart Pro', 'B2B', 'green', 'solar', 'https://www.dei.gr/el/gia-tin-epixeirisi/myenergy/myenergy-solarpro/myenergy-solarsmartpro/');

-- ─── 3. Ελίν (3 B2C + 5 B2B = 8) ──────────────────────────
INSERT INTO energy_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, official_url) VALUES
('Ελίν', 'Power On! Home Green', 'B2C', 'green', 'electricity', 'https://energy.elin.gr/ilektriki-energeia-new/gia-to-spiti-ilektriko-reyma-on/power-on-home-green-reuma/'),
('Ελίν', 'Power On! Blue 12M', 'B2C', 'blue', 'electricity', 'https://energy.elin.gr/ilektriki-energeia-new/gia-to-spiti-ilektriko-reyma-on/power-on-blue-12m/'),
('Ελίν', 'Power On! Home Zero', 'B2C', 'yellow', 'electricity', 'https://energy.elin.gr/ilektriki-energeia-new/gia-to-spiti-ilektriko-reyma-on/power-on-home-zero-oikiako-reyma/'),
('Ελίν', 'Power On! Business Green', 'B2B', 'green', 'electricity', 'https://energy.elin.gr/ilektriki-energeia-new/gia-tin-epicheirisi-ilektriko-reyma/power-on-business-green-reyma/'),
('Ελίν', 'Power On! Business Blue', 'B2B', 'blue', 'electricity', 'https://energy.elin.gr/ilektriki-energeia-new/gia-tin-epicheirisi-ilektriko-reyma/power-on-business-blue-business/'),
('Ελίν', 'Power On! Business 1 Zero', 'B2B', 'yellow', 'electricity', 'https://energy.elin.gr/ilektriki-energeia-new/gia-tin-epicheirisi-ilektriko-reyma/power-on-business-1-zero-reuma/'),
('Ελίν', 'Power On! Business 2 Zero', 'B2B', 'yellow', 'electricity', 'https://energy.elin.gr/ilektriki-energeia-new/gia-tin-epicheirisi-ilektriko-reyma/power-on-business-2-zero-reuma/'),
('Ελίν', 'Power On! Business 3 Zero', 'B2B', 'yellow', 'electricity', 'https://energy.elin.gr/ilektriki-energeia-new/gia-tin-epicheirisi-ilektriko-reyma/power-on-business-3-zero-reuma/');

-- ─── 4. ΗΡΩΝ (11 B2C + 15 B2B = 26) ───────────────────────
INSERT INTO energy_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, official_url) VALUES
('ΗΡΩΝ', 'Happy Hour Home', 'B2C', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/happy-hour-home/'),
('ΗΡΩΝ', 'Happy Hour For All Home', 'B2C', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/happy-hour-for-all-home/'),
('ΗΡΩΝ', 'Yellow Value Home', 'B2C', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/yellow-value-home/'),
('ΗΡΩΝ', 'Blue Simple Home', 'B2C', 'blue', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/blue-simple-home/'),
('ΗΡΩΝ', 'Blue Generous Max Home', 'B2C', 'blue', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/blue-generous-max-home/'),
('ΗΡΩΝ', 'Blue Generous Home', 'B2C', 'blue', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/blue-generous-home/'),
('ΗΡΩΝ', 'Yellow One Home', 'B2C', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/yellow-one-home/'),
('ΗΡΩΝ', 'Yellow Free Home', 'B2C', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/yellow-free-home/'),
('ΗΡΩΝ', 'Protect Home', 'B2C', 'blue', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/protect-home/'),
('ΗΡΩΝ', 'Basic Home', 'B2C', 'green', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/basic-home/'),
('ΗΡΩΝ', 'Yellow Benefit Home', 'B2C', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/gia-to-spiti/yellow-benefit-home/'),
('ΗΡΩΝ', 'Happy Hour For All Business', 'B2B', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/happy-hour-for-all-business/'),
('ΗΡΩΝ', 'Yellow Free Business', 'B2B', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/yellow-free-business/'),
('ΗΡΩΝ', 'Happy Hour Business', 'B2B', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/happy-hour-business/'),
('ΗΡΩΝ', 'Blue Smart Business', 'B2B', 'blue', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/blue-smart-business/'),
('ΗΡΩΝ', 'Blue Generous Max Business', 'B2B', 'blue', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/blue-generous-max-business/'),
('ΗΡΩΝ', 'Blue Generous Business', 'B2B', 'blue', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/blue-generous-business/'),
('ΗΡΩΝ', 'Yellow One Business Small', 'B2B', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/yellow-one-business-small/'),
('ΗΡΩΝ', 'Yellow Plus Business Small', 'B2B', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/yellow-plus-business-small/'),
('ΗΡΩΝ', 'Basic Business Small', 'B2B', 'green', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/basic-business-small/'),
('ΗΡΩΝ', 'Protect Business Small', 'B2B', 'blue', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/protect-business-small/'),
('ΗΡΩΝ', 'Yellow Benefit Business Small', 'B2B', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/yellow-benefit-business-small/'),
('ΗΡΩΝ', 'Blue Generous Business L', 'B2B', 'blue', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/blue-generous-business-l/'),
('ΗΡΩΝ', 'Happy Hour Business Large', 'B2B', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/happy-hour-business-large/'),
('ΗΡΩΝ', 'Yellow Plus Business Large', 'B2B', 'yellow', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/yellow-plus-business-large/'),
('ΗΡΩΝ', 'Basic Business Large', 'B2B', 'green', 'electricity', 'https://heron.gr/energy/electricity/epixeirisi/basic-business-large/');

-- ─── 5. Φυσικό Αέριο (6 B2C + 15 B2B = 21) ────────────────
INSERT INTO energy_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, official_url) VALUES
('Φυσικό Αέριο', 'Maxi Home Energy Reward', 'B2C', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/home/revma/maxi-home-energy-reward'),
('Φυσικό Αέριο', 'Maxi Home Safe', 'B2C', 'blue', 'electricity', 'https://fysikoaerioellados.gr/el/home/revma/maxi-home-safe'),
('Φυσικό Αέριο', 'Maxi Home 200', 'B2C', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/home/revma/maxi-home-200'),
('Φυσικό Αέριο', 'Maxi Home 10', 'B2C', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/home/revma/maxi-home-10'),
('Φυσικό Αέριο', 'Maxi Home', 'B2C', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/home/revma/maxi-home'),
('Φυσικό Αέριο', 'Ειδικό Οικιακό', 'B2C', 'green', 'electricity', 'https://fysikoaerioellados.gr/el/home/revma/oikiako'),
('Φυσικό Αέριο', 'Maxi Business 1 Secure', 'B2B', 'blue', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/maxi-business-1-secure'),
('Φυσικό Αέριο', 'Maxi Business 24/7 Fixed', 'B2B', 'blue', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/maxi-business-247-fixed'),
('Φυσικό Αέριο', 'Maxi Business 1 Save', 'B2B', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/maxi-business-1-save'),
('Φυσικό Αέριο', 'Maxi Business 1', 'B2B', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/maxi-business-1'),
('Φυσικό Αέριο', 'Maxi Business 2', 'B2B', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/maxi-business-2'),
('Φυσικό Αέριο', 'Επαγγελματικό 1', 'B2B', 'green', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/epaggelmatiko-1'),
('Φυσικό Αέριο', 'Μέσης Τάσης', 'B2B', 'blue', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/mesis-tasis'),
('Φυσικό Αέριο', 'Maxi Night Business', 'B2B', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/maxi-night-business'),
('Φυσικό Αέριο', 'Επαγγελματικό 2', 'B2B', 'green', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/epaggelmatiko-2'),
('Φυσικό Αέριο', 'Επαγγελματικό Νυχτερινό', 'B2B', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/epaggelmatiko-nyhterino'),
('Φυσικό Αέριο', 'Maxi Αγροτικό Τ33', 'B2B', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/maxi-agrotiko-t33'),
('Φυσικό Αέριο', 'Αγροτικό Τ33', 'B2B', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/agrotiko-t33'),
('Φυσικό Αέριο', 'Maxi Φωτισμού', 'B2B', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/maxi-fotismoy'),
('Φυσικό Αέριο', 'Φωτισμού', 'B2B', 'yellow', 'electricity', 'https://fysikoaerioellados.gr/el/business/revma/fotismoy');

-- ─── 6. SEED energy_tariff_prices (placeholder needs_review) ──
INSERT INTO energy_tariff_prices (tariff_id, base_price_day, fixed_fee_monthly, validity_from, verification_status, source_type, notes)
SELECT et.id, NULL, NULL, CURRENT_DATE, 'needs_review', 'scraper', 'Awaiting price extraction'
FROM energy_tariffs et
WHERE et.provider_name IN ('ΔΕΗ', 'Ελίν', 'ΗΡΩΝ', 'Φυσικό Αέριο')
  AND NOT EXISTS (SELECT 1 FROM energy_tariff_prices etp WHERE etp.tariff_id = et.id);

-- ─── 7. SYNC market_tariffs fallback ────────────────────────
INSERT INTO market_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, unit_rate_kwh, fixed_fee_monthly, source_url, validity_month, category, resource)
SELECT et.provider_name, et.program_name,
  et.customer_type::text::customer_type_enum,
  et.tariff_color::text::tariff_color_enum,
  et.energy_type::text,
  0.10000, 0.00,
  et.official_url,
  to_char(CURRENT_DATE, 'YYYY-MM'),
  et.customer_type::text,
  'ρεύμα'
FROM energy_tariffs et
WHERE et.provider_name IN ('ΔΕΗ', 'Ελίν', 'ΗΡΩΝ', 'Φυσικό Αέριο')
  AND NOT EXISTS (SELECT 1 FROM market_tariffs mt WHERE mt.provider_name = et.provider_name AND mt.program_name = et.program_name);
