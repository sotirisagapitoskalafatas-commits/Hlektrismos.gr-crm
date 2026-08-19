-- 10 Greek Energy Providers with B2B/B2C links and tariff data
-- Adds B2C/B2B URL columns to market_tariffs and seeds all 10 providers

-- Add new columns to market_tariffs for provider links
ALTER TABLE market_tariffs ADD COLUMN IF NOT EXISTS provider_name TEXT;
ALTER TABLE market_tariffs ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'B2C';
ALTER TABLE market_tariffs ADD COLUMN IF NOT EXISTS b2c_url TEXT;
ALTER TABLE market_tariffs ADD COLUMN IF NOT EXISTS b2b_url TEXT;
ALTER TABLE market_tariffs ADD COLUMN IF NOT EXISTS fixed_fee_monthly NUMERIC(10,2) DEFAULT 0;
ALTER TABLE market_tariffs ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ;

-- Clear old seed data and re-seed with 10 providers
DELETE FROM market_tariffs WHERE tariff_name IN (
  'ΔΕΗ Blue Home', 'Protergia Fix 12', 'ΗΡΩΝ OnePlan', 'ΔΕΗ Gas Home', 'Protergia Gas Fix'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. ΔΕΗ (PPC)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'ΔΕΗ Blue Home Fix', 0.1820, '€/kWh', 'ΔΕΗ', 'B2C', 'https://www.dei.gr/el/gia-to-spiti/revma/', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/', 4.50),
  ('Electricity', 'ΔΕΗ Blue Business', 0.1690, '€/kWh', 'ΔΕΗ', 'B2B', 'https://www.dei.gr/el/gia-to-spiti/revma/', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/', 12.00);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Protergia
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'Protergia Fix 12 Home', 0.1750, '€/kWh', 'Protergia', 'B2C', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/', 4.00),
  ('Electricity', 'Protergia OnePlan Business', 0.1620, '€/kWh', 'Protergia', 'B2B', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/', 10.00);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. ΗΡΩΝ (Heron)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'ΗΡΩΝ OnePlan Home', 0.1890, '€/kWh', 'ΗΡΩΝ', 'B2C', 'https://www.heron.gr/gia-to-spiti/revma/', 'https://www.heron.gr/gia-tin-epicheirisi/revma/', 5.00),
  ('Electricity', 'ΗΡΩΝ Enterprise', 0.1710, '€/kWh', 'ΗΡΩΝ', 'B2B', 'https://www.heron.gr/gia-to-spiti/revma/', 'https://www.heron.gr/gia-tin-epicheirisi/revma/', 11.00);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. ZeniΘ (Zenith)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'ZeniΘ Home Fix', 0.1780, '€/kWh', 'ZeniΘ', 'B2C', 'https://zenith.gr/el/for-home/electricity/', 'https://zenith.gr/el/for-business/electricity/', 3.80),
  ('Electricity', 'ZeniΘ Business Pro', 0.1650, '€/kWh', 'ZeniΘ', 'B2B', 'https://zenith.gr/el/for-home/electricity/', 'https://zenith.gr/el/for-business/electricity/', 9.50);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Elpedison
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'Elpedison Home Plus', 0.1810, '€/kWh', 'Elpedison', 'B2C', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/', 4.20),
  ('Electricity', 'Elpedison Business Plus', 0.1680, '€/kWh', 'Elpedison', 'B2B', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/', 10.50);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. nrg
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'nrg Green Home', 0.1850, '€/kWh', 'nrg', 'B2C', 'https://www.nrg.gr/el/gia-to-spiti/reuma', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma', 4.80),
  ('Electricity', 'nrg Business Flex', 0.1720, '€/kWh', 'nrg', 'B2B', 'https://www.nrg.gr/el/gia-to-spiti/reuma', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma', 11.50);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Φυσικό Αέριο Ελληνική Εταιρεία Ενέργειας
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'Φυσικό Αέριο Home', 0.1790, '€/kWh', 'Φυσικό Αέριο', 'B2C', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/', 'https://www.fysikoaeriohellas.gr/gia-tin-epicheirisi/reuma/', 3.90),
  ('Electricity', 'Φυσικό Αέριο Business', 0.1660, '€/kWh', 'Φυσικό Αέριο', 'B2B', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/', 'https://www.fysikoaeriohellas.gr/gia-tin-epicheirisi/reuma/', 9.80);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. Volton
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'Volton Home Select', 0.1770, '€/kWh', 'Volton', 'B2C', 'https://volton.gr/gia-to-spiti/reuma/', 'https://volton.gr/gia-tin-epicheirisi/reuma/', 3.70),
  ('Electricity', 'Volton Business Pro', 0.1640, '€/kWh', 'Volton', 'B2B', 'https://volton.gr/gia-to-spiti/reuma/', 'https://volton.gr/gia-tin-epicheirisi/reuma/', 9.20);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. We Energy
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'We Energy Home Fix', 0.1800, '€/kWh', 'We Energy', 'B2C', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/', 4.10),
  ('Electricity', 'We Energy Business', 0.1670, '€/kWh', 'We Energy', 'B2B', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/', 10.20);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. Elin Energy (Ελίν)
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO market_tariffs (resource, tariff_name, price_eur, unit, provider_name, category, b2c_url, b2b_url, fixed_fee_monthly)
VALUES
  ('Electricity', 'Ελίν Home Select', 0.1830, '€/kWh', 'Ελίν', 'B2C', 'https://energy.elin.gr/gia-to-spiti/reuma/', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma/', 4.30),
  ('Electricity', 'Ελίν Business Plus', 0.1700, '€/kWh', 'Ελίν', 'B2B', 'https://energy.elin.gr/gia-to-spiti/reuma/', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma/', 10.80);

-- Also seed provider_docs for RAG if not already present
INSERT INTO hlektrismos_provider_docs (provider_name, program_name, category, energy_type, price_per_kwh, fixed_fee_monthly, document_title, file_path, source_url)
SELECT v.provider, v.program, v.cat, 'Electricity', v.price, v.fee, v.title, v.path, v.url
FROM (VALUES
  ('ΔΕΗ', 'Blue Home Fix', 'B2C', 0.1820, 4.50, 'ΔΕΗ Blue Home Fix - Οικιακό Πρόγραμμα', 'dei/b2c-blue-home.pdf', 'https://www.dei.gr/el/gia-to-spiti/revma/'),
  ('ΔΕΗ', 'Blue Business', 'B2B', 0.1690, 12.00, 'ΔΕΗ Blue Business - Εταιρικό Πρόγραμμα', 'dei/b2b-blue-business.pdf', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/'),
  ('Protergia', 'Fix 12 Home', 'B2C', 0.1750, 4.00, 'Protergia Fix 12 - Οικιακό', 'protergia/b2c-fix12-home.pdf', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/'),
  ('Protergia', 'OnePlan Business', 'B2B', 0.1620, 10.00, 'Protergia OnePlan - Εταιρικό', 'protergia/b2b-oneplan.pdf', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/'),
  ('ΗΡΩΝ', 'OnePlan Home', 'B2C', 0.1890, 5.00, 'ΗΡΩΝ OnePlan - Οικιακό', 'heron/b2c-oneplan-home.pdf', 'https://www.heron.gr/gia-to-spiti/revma/'),
  ('ΗΡΩΝ', 'Enterprise', 'B2B', 0.1710, 11.00, 'ΗΡΩΝ Enterprise - Εταιρικό', 'heron/b2b-enterprise.pdf', 'https://www.heron.gr/gia-tin-epicheirisi/revma/'),
  ('ZeniΘ', 'Home Fix', 'B2C', 0.1780, 3.80, 'ZeniΘ Home Fix - Οικιακό', 'zenith/b2c-home-fix.pdf', 'https://zenith.gr/el/for-home/electricity/'),
  ('ZeniΘ', 'Business Pro', 'B2B', 0.1650, 9.50, 'ZeniΘ Business Pro - Εταιρικό', 'zenith/b2b-business-pro.pdf', 'https://zenith.gr/el/for-business/electricity/'),
  ('Elpedison', 'Home Plus', 'B2C', 0.1810, 4.20, 'Elpedison Home Plus - Οικιακό', 'elpedison/b2c-home-plus.pdf', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/'),
  ('Elpedison', 'Business Plus', 'B2B', 0.1680, 10.50, 'Elpedison Business Plus - Εταιρικό', 'elpedison/b2b-business-plus.pdf', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/'),
  ('nrg', 'Green Home', 'B2C', 0.1850, 4.80, 'nrg Green Home - Οικιακό', 'nrg/b2c-green-home.pdf', 'https://www.nrg.gr/el/gia-to-spiti/reuma'),
  ('nrg', 'Business Flex', 'B2B', 0.1720, 11.50, 'nrg Business Flex - Εταιρικό', 'nrg/b2b-business-flex.pdf', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma'),
  ('Φυσικό Αέριο', 'Home', 'B2C', 0.1790, 3.90, 'Φυσικό Αέριο Home - Οικιακό', 'fysiko/b2c-home.pdf', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/'),
  ('Φυσικό Αέριο', 'Business', 'B2B', 0.1660, 9.80, 'Φυσικό Αέριο Business - Εταιρικό', 'fysiko/b2b-business.pdf', 'https://www.fysikoaeriohellas.gr/gia-tin-epicheirisi/reuma/'),
  ('Volton', 'Home Select', 'B2C', 0.1770, 3.70, 'Volton Home Select - Οικιακό', 'volton/b2c-home-select.pdf', 'https://volton.gr/gia-to-spiti/reuma/'),
  ('Volton', 'Business Pro', 'B2B', 0.1640, 9.20, 'Volton Business Pro - Εταιρικό', 'volton/b2b-business-pro.pdf', 'https://volton.gr/gia-tin-epicheirisi/reuma/'),
  ('We Energy', 'Home Fix', 'B2C', 0.1800, 4.10, 'We Energy Home Fix - Οικιακό', 'weenergy/b2c-home-fix.pdf', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/'),
  ('We Energy', 'Business', 'B2B', 0.1670, 10.20, 'We Energy Business - Εταιρικό', 'weenergy/b2b-business.pdf', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/'),
  ('Ελίν', 'Home Select', 'B2C', 0.1830, 4.30, 'Ελίν Home Select - Οικιακό', 'elin/b2c-home-select.pdf', 'https://energy.elin.gr/gia-to-spiti/reuma/'),
  ('Ελίν', 'Business Plus', 'B2B', 0.1700, 10.80, 'Ελίν Business Plus - Εταιρικό', 'elin/b2b-business-plus.pdf', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma/')
) AS v(provider, program, cat, price, fee, title, path, url)
WHERE NOT EXISTS (
  SELECT 1 FROM hlektrismos_provider_docs pd WHERE pd.provider_name = v.provider AND pd.program_name = v.program
);
