-- ============================================================
-- Migration: 20260820100001_comprehensive_market_tariffs.sql
-- Wipes existing mock data and injects comprehensive,
-- deduplicated Greek energy market programs (B2C + B2B)
-- Uses RAEYE 4-color tariff framework
-- Adapted to existing market_tariffs schema
-- ============================================================

-- 1. Add energy_type column if missing
ALTER TABLE market_tariffs
  ADD COLUMN IF NOT EXISTS energy_type TEXT DEFAULT 'electricity';

-- 2. Wipe all existing data — clean slate
TRUNCATE TABLE market_tariffs;

-- 3. Insert comprehensive, deduplicated programs
-- Uses existing schema: provider_name, program_name, customer_type, tariff_color,
-- unit_rate_kwh, fixed_fee_monthly, validity_month, source_url, energy_type

INSERT INTO market_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type,
  unit_rate_kwh, fixed_fee_monthly, validity_month, source_url
) VALUES

-- ================================================================
-- ΔΕΗ (PPC) — Largest provider
-- ================================================================
('ΔΕΗ', 'Γ1/Γ1Ν Οικιακό Ειδικό (Πράσινο)',        'B2C', 'green',  'electricity', 0.1359, 5.00,  '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/'),
('ΔΕΗ', 'myHome Enter 12M (Σταθερό)',               'B2C', 'blue',   'electricity', 0.1452, 7.50,  '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/'),
('ΔΕΗ', 'myHome Online (Σταθερό)',                  'B2C', 'blue',   'electricity', 0.1421, 3.50,  '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/'),
('ΔΕΗ', 'myHome 4All (Κυμαινόμενο)',                'B2C', 'yellow', 'electricity', 0.1373, 5.00,  '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/'),
('ΔΕΗ', 'myHome Νυχτερινό (Σταθερό)',               'B2C', 'blue',   'electricity', 0.1290, 6.00,  '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/'),
('ΔΕΗ', 'Οικιακό Φυσικό Αέριο',                    'B2C', 'green',   'gas',         0.0548, 4.00,  '2026-08', 'https://www.dei.gr/el/gia-to-spiti/aeriou/'),
('ΔΕΗ', 'Γ21 Επαγγελματικό Ειδικό (Πράσινο)',      'B2B', 'green',  'electricity', 0.1415, 12.00, '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/'),
('ΔΕΗ', 'myBusiness Enter 12M (Σταθερό)',           'B2B', 'blue',   'electricity', 0.1498, 15.00, '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/'),
('ΔΕΗ', 'myBusiness Online (Σταθερό)',              'B2B', 'blue',   'electricity', 0.1470, 10.00, '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/'),
('ΔΕΗ', 'myBusiness 4All (Κυμαινόμενο)',            'B2B', 'yellow', 'electricity', 0.1382, 12.00, '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/'),
('ΔΕΗ', 'Μέση Τάση Εταιρικό (Ειδικό)',             'B2B', 'green',  'electricity', 0.1280, 50.00, '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/'),
('ΔΕΗ', 'Επαγγελματικό Φυσικό Αέριο',              'B2B', 'green',   'gas',         0.0612, 8.00,  '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/aeriou/'),

-- ================================================================
-- Protergia — Motor Oil subsidiary
-- ================================================================
('Protergia', 'Value Bright (Κυμαινόμενο)',          'B2C', 'yellow', 'electricity', 0.1195, 5.00,  '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/'),
('Protergia', 'Value Sure 18M (Σταθερό)',            'B2C', 'blue',   'electricity', 0.1410, 11.90, '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/'),
('Protergia', 'Value Safe 6M (Σταθερό)',             'B2C', 'blue',   'electricity', 0.1350, 9.90,  '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/'),
('Protergia', 'Value Lite 2.0 (Κυμαινόμενο)',       'B2C', 'yellow', 'electricity', 0.1880, 0.00,  '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/'),
('Protergia', 'Value Easy (Ειδικό)',                 'B2C', 'green',  'electricity', 0.1390, 4.00,  '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/'),
('Protergia', 'Sunless Solar Net Metering',          'B2C', 'green',   'solar',       0.0950, 0.00,  '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/'),
('Protergia', 'Value Business Ειδικό (Πράσινο)',     'B2B', 'green',  'electricity', 0.1452, 12.00, '2026-08', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/'),
('Protergia', 'Business Safe 18M (Σταθερό)',         'B2B', 'blue',   'electricity', 0.1480, 15.00, '2026-08', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/'),
('Protergia', 'Business Flex (Κυμαινόμενο)',         'B2B', 'yellow', 'electricity', 0.1400, 10.00, '2026-08', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/'),
('Protergia', 'OnePlan Business (Σταθερό)',          'B2B', 'blue',   'electricity', 0.1620, 10.00, '2026-08', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/'),
('Protergia', 'Solar Business Net Metering',         'B2B', 'green',   'solar',       0.0920, 0.00,  '2026-08', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/'),

-- ================================================================
-- ΗΡΩΝ (Heron) — Mytilineos subsidiary
-- ================================================================
('ΗΡΩΝ', 'Basic Home (Ειδικό/Πράσινο)',             'B2C', 'green',  'electricity', 0.1470, 5.00,  '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/'),
('ΗΡΩΝ', 'Blue Smart Home (Σταθερό)',               'B2C', 'blue',   'electricity', 0.1380, 4.50,  '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/'),
('ΗΡΩΝ', 'Protect Home 12M (Σταθερό)',              'B2C', 'blue',   'electricity', 0.0780, 6.00,  '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/'),
('ΗΡΩΝ', 'Simply Generous (Κυμαινόμενο)',           'B2C', 'yellow', 'electricity', 0.1290, 3.00,  '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/'),
('ΗΡΩΝ', 'OnePlan Home 12M (Σταθερό)',              'B2C', 'blue',   'electricity', 0.1890, 5.00,  '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/'),
('ΗΡΩΝ', 'Basic Business (Ειδικό/Πράσινο)',         'B2B', 'green',  'electricity', 0.1480, 12.00, '2026-08', 'https://www.heron.gr/gia-tin-epicheirisi/revma/'),
('ΗΡΩΝ', 'Guarantee Business (Σταθερό)',            'B2B', 'blue',   'electricity', 0.1550, 15.00, '2026-08', 'https://www.heron.gr/gia-tin-epicheirisi/revma/'),
('ΗΡΩΝ', 'Business Flex (Κυμαινόμενο)',             'B2B', 'yellow', 'electricity', 0.1400, 10.00, '2026-08', 'https://www.heron.gr/gia-tin-epicheirisi/revma/'),
('ΗΡΩΝ', 'Enterprise Business (Εταιρικό)',          'B2B', 'blue',   'electricity', 0.1710, 11.00, '2026-08', 'https://www.heron.gr/gia-tin-epicheirisi/revma/'),
('ΗΡΩΝ', 'Business Pro (Σταθερό Μέση Τάση)',        'B2B', 'blue',   'electricity', 0.1620, 25.00, '2026-08', 'https://www.heron.gr/gia-tin-epicheirisi/revma/'),

-- ================================================================
-- Elpedison — HELPE + Edison joint venture
-- ================================================================
('Elpedison', 'Ειδικό Τιμολόγιο (Πράσινο)',         'B2C', 'green',  'electricity', 0.1400, 5.00,  '2026-08', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/'),
('Elpedison', 'Bright Home (Σταθερό)',               'B2C', 'blue',   'electricity', 0.1490, 3.00,  '2026-08', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/'),
('Elpedison', 'Smart Home (Κυμαινόμενο)',            'B2C', 'yellow', 'electricity', 0.1330, 4.00,  '2026-08', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/'),
('Elpedison', 'Green Home Plus (Ειδικό)',            'B2C', 'green',  'electricity', 0.1430, 6.00,  '2026-08', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/'),
('Elpedison', 'Home Plus (Σταθερό)',                 'B2C', 'blue',   'electricity', 0.1810, 4.20,  '2026-08', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/'),
('Elpedison', 'Business Green (Ειδικό/Πράσινο)',    'B2B', 'green',  'electricity', 0.1460, 12.00, '2026-08', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/'),
('Elpedison', 'Business Bright (Σταθερό)',           'B2B', 'blue',   'electricity', 0.1550, 10.00, '2026-08', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/'),
('Elpedison', 'Business Flex (Κυμαινόμενο)',         'B2B', 'yellow', 'electricity', 0.1380, 8.00,  '2026-08', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/'),
('Elpedison', 'Business Plus (Εταιρικό)',            'B2B', 'blue',   'electricity', 0.1680, 10.50, '2026-08', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/'),

-- ================================================================
-- Φυσικό Αέριο Ελλάδος
-- ================================================================
('Φυσικό Αέριο', 'Ειδικό Οικιακό (Πράσινο)',        'B2C', 'green',  'electricity', 0.1380, 5.00,  '2026-08', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/'),
('Φυσικό Αέριο', 'Σταθερό MAX (Σταθερό)',           'B2C', 'blue',   'electricity', 0.1420, 5.00,  '2026-08', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/'),
('Φυσικό Αέριο', 'Κυμαινόμενο Home',                'B2C', 'yellow', 'electricity', 0.1280, 3.00,  '2026-08', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/'),
('Φυσικό Αέριο', 'Home (Σταθερό)',                  'B2C', 'blue',   'electricity', 0.1790, 3.90,  '2026-08', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/'),
('Φυσικό Αέριο', 'Οικιακό Αέριο Πλήρες',            'B2C', 'green',   'gas',         0.0520, 3.00,  '2026-08', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/aeriou/'),
('Φυσικό Αέριο', 'Επαγγελματικό Πράσινο (Ειδικό)',  'B2B', 'green',  'electricity', 0.1440, 10.00, '2026-08', 'https://www.fysikoaeriohellas.gr/gia-tin-epicheirisi/reuma/'),
('Φυσικό Αέριο', 'Business Σταθερό',                'B2B', 'blue',   'electricity', 0.1500, 12.00, '2026-08', 'https://www.fysikoaeriohellas.gr/gia-tin-epicheirisi/reuma/'),
('Φυσικό Αέριο', 'Business (Εταιρικό)',              'B2B', 'blue',   'electricity', 0.1660, 9.80,  '2026-08', 'https://www.fysikoaeriohellas.gr/gia-tin-epicheirisi/reuma/'),

-- ================================================================
-- nrg — Greek-owned independent
-- ================================================================
('nrg', 'nrg Ειδικό (Πράσινο)',                     'B2C', 'green',  'electricity', 0.1410, 5.00,  '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma'),
('nrg', 'nrg Fixed (Σταθερό)',                      'B2C', 'blue',   'electricity', 0.1450, 3.50,  '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma'),
('nrg', 'nrg Flex (Κυμαινόμενο)',                   'B2C', 'yellow', 'electricity', 0.1320, 2.00,  '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma'),
('nrg', 'nrg Green Home+ (Ειδικό)',                 'B2C', 'green',  'electricity', 0.1390, 4.50,  '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma'),
('nrg', 'nrg Green Home (Σταθερό)',                 'B2C', 'blue',   'electricity', 0.1850, 4.80,  '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma'),
('nrg', 'nrg PRO Ειδικό (Πράσινο)',                 'B2B', 'green',  'electricity', 0.1490, 10.00, '2026-08', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma'),
('nrg', 'nrg PRO Fixed (Σταθερό)',                  'B2B', 'blue',   'electricity', 0.1530, 12.00, '2026-08', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma'),
('nrg', 'nrg Business Flex (Κυμαινόμενο)',          'B2B', 'yellow', 'electricity', 0.1720, 11.50, '2026-08', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma'),

-- ================================================================
-- ZeniΘ — Zenith Energy
-- ================================================================
('ZeniΘ', 'Power Home Basic (Ειδικό)',               'B2C', 'green',  'electricity', 0.1390, 5.00,  '2026-08', 'https://zenith.gr/el/for-home/electricity/'),
('ZeniΘ', 'Power Home Direct (Σταθερό)',             'B2C', 'blue',   'electricity', 0.1440, 4.00,  '2026-08', 'https://zenith.gr/el/for-home/electricity/'),
('ZeniΘ', 'Power Home Flex (Κυμαινόμενο)',          'B2C', 'yellow', 'electricity', 0.1300, 3.00,  '2026-08', 'https://zenith.gr/el/for-home/electricity/'),
('ZeniΘ', 'Home Fix (Σταθερό 12M)',                 'B2C', 'blue',   'electricity', 0.1780, 3.80,  '2026-08', 'https://zenith.gr/el/for-home/electricity/'),
('ZeniΘ', 'Power Business Basic (Ειδικό)',           'B2B', 'green',  'electricity', 0.1450, 10.00, '2026-08', 'https://zenith.gr/el/for-business/electricity/'),
('ZeniΘ', 'Power Business Direct (Σταθερό)',         'B2B', 'blue',   'electricity', 0.1520, 12.00, '2026-08', 'https://zenith.gr/el/for-business/electricity/'),
('ZeniΘ', 'Business Pro (Σταθερό Μέση Τάση)',       'B2B', 'blue',   'electricity', 0.1650, 9.50,  '2026-08', 'https://zenith.gr/el/for-business/electricity/'),

-- ================================================================
-- Volton — Greek independent
-- ================================================================
('Volton', 'Volton Ειδικό (Πράσινο)',                'B2C', 'green',  'electricity', 0.1420, 5.00,  '2026-08', 'https://volton.gr/gia-to-spiti/reuma/'),
('Volton', 'Volton Blue (Σταθερό)',                  'B2C', 'blue',   'electricity', 0.1480, 3.90,  '2026-08', 'https://volton.gr/gia-to-spiti/reuma/'),
('Volton', 'Volton Flex (Κυμαινόμενο)',              'B2C', 'yellow', 'electricity', 0.1330, 2.00,  '2026-08', 'https://volton.gr/gia-to-spiti/reuma/'),
('Volton', 'Home Select (Σταθερό 12M)',              'B2C', 'blue',   'electricity', 0.1770, 3.70,  '2026-08', 'https://volton.gr/gia-to-spiti/reuma/'),
('Volton', 'Business Πράσινο (Ειδικό)',              'B2B', 'green',  'electricity', 0.1460, 10.00, '2026-08', 'https://volton.gr/gia-tin-epicheirisi/reuma/'),
('Volton', 'Business Blue (Σταθερό)',                'B2B', 'blue',   'electricity', 0.1540, 12.00, '2026-08', 'https://volton.gr/gia-tin-epicheirisi/reuma/'),
('Volton', 'Business Pro (Σταθερό Μέση Τάση)',       'B2B', 'blue',   'electricity', 0.1640, 9.20,  '2026-08', 'https://volton.gr/gia-tin-epicheirisi/reuma/'),

-- ================================================================
-- Ελίν (Elin) — Hellenic Petroleum subsidiary
-- ================================================================
('Ελίν', 'Power On! Home Green (Ειδικό)',            'B2C', 'green',  'electricity', 0.1370, 5.00,  '2026-08', 'https://energy.elin.gr/gia-to-spiti/reuma/'),
('Ελίν', 'Power On! Home Blue (Σταθερό)',            'B2C', 'blue',   'electricity', 0.1430, 4.30,  '2026-08', 'https://energy.elin.gr/gia-to-spiti/reuma/'),
('Ελίν', 'Power On! Home Flex (Κυμαινόμενο)',       'B2C', 'yellow', 'electricity', 0.1280, 2.50,  '2026-08', 'https://energy.elin.gr/gia-to-spiti/reuma/'),
('Ελίν', 'Home Select (Σταθερό 12M)',               'B2C', 'blue',   'electricity', 0.1830, 4.30,  '2026-08', 'https://energy.elin.gr/gia-to-spiti/reuma/'),
('Ελίν', 'Power On! Business Green (Ειδικό)',        'B2B', 'green',  'electricity', 0.1430, 10.00, '2026-08', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma/'),
('Ελίν', 'Power On! Business Blue (Σταθερό)',        'B2B', 'blue',   'electricity', 0.1500, 10.80, '2026-08', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma/'),
('Ελίν', 'Business Plus (Εταιρικό)',                 'B2B', 'blue',   'electricity', 0.1700, 10.80, '2026-08', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma/'),

-- ================================================================
-- We Energy — Newer market entrant
-- ================================================================
('We Energy', 'We Green (Ειδικό/Πράσινο)',           'B2C', 'green',  'electricity', 0.1400, 5.00,  '2026-08', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/'),
('We Energy', 'We Fixed (Σταθερό)',                  'B2C', 'blue',   'electricity', 0.1450, 4.10,  '2026-08', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/'),
('We Energy', 'We Flex (Κυμαινόμενο)',               'B2C', 'yellow', 'electricity', 0.1310, 2.00,  '2026-08', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/'),
('We Energy', 'Home Fix (Σταθερό 12M)',              'B2C', 'blue',   'electricity', 0.1800, 4.10,  '2026-08', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/'),
('We Energy', 'We Business Green (Ειδικό)',          'B2B', 'green',  'electricity', 0.1450, 10.00, '2026-08', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/'),
('We Energy', 'We Business Fixed (Σταθερό)',         'B2B', 'blue',   'electricity', 0.1520, 10.20, '2026-08', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/'),
('We Energy', 'We Business Flex (Κυμαινόμενο)',      'B2B', 'yellow', 'electricity', 0.1420, 8.00,  '2026-08', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/');

-- ================================================================
-- Verification: ~86 programs across 10 providers
-- B2C: ~48, B2B: ~38
-- ================================================================
