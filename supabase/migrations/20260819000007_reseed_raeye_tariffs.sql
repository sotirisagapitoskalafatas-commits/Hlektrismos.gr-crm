BEGIN;

-- 1. CLEAN SLATE FOR CURRENT MONTH
DELETE FROM market_tariffs
WHERE validity_month = TO_CHAR(NOW(), 'YYYY-MM');

-- 2. RESET rag_document_endpoints WITH REAL RAEYE URLS
DELETE FROM rag_document_endpoints;

INSERT INTO rag_document_endpoints (
  provider_name, customer_type, tariff_color, endpoint_label,
  endpoint_url, file_type, sync_frequency, is_active
) VALUES
-- DEH
('ΔΕΗ', 'B2C', 'green',  'ΔΕΗ Ειδικό Οικιακό',         'https://www.dei.gr/el/gia-to-spiti/revma/eidiko-timologio',     'html', 'monthly',  true),
('ΔΕΗ', 'B2C', 'blue',   'ΔΕΗ Σταθερό Οικιακό',         'https://www.dei.gr/el/gia-to-spiti/revma/stathera-timologia',   'html', 'monthly',  true),
('ΔΕΗ', 'B2C', 'yellow', 'ΔΕΗ Κυμαινόμενο Οικιακό',     'https://www.dei.gr/el/gia-to-spiti/revma/kymainom-timologia',   'html', 'monthly',  true),
('ΔΕΗ', 'B2B', 'green',  'ΔΕΗ Ειδικό Επαγγελματικό',    'https://www.dei.gr/el/gia-tin-epixeirisi/revma/eidiko-timologio','html', 'monthly',  true),
('ΔΕΗ', 'B2B', 'blue',   'ΔΕΗ Σταθερό Επαγγελματικό',   'https://www.dei.gr/el/gia-tin-epixeirisi/revma',                'html', 'monthly',  true),
('ΔΕΗ', 'B2C', 'blue',   'ΔΕΗ Τιμοκατάλογος Archive',   'https://www.dei.gr/el/gia-to-spiti/revma/timologia-xreoseis',   'html', 'monthly',  true),
-- PROTERGIA
('Protergia', 'B2C', 'green',  'Protergia Ειδικό Οικιακό',    'https://www.protergia.gr/spiti/oikiako-reuma-proionta/eidiko',         'html', 'monthly', true),
('Protergia', 'B2C', 'blue',   'Protergia Fix 12 Οικιακό',    'https://www.protergia.gr/spiti/oikiako-reuma-proionta',                'html', 'monthly', true),
('Protergia', 'B2C', 'yellow', 'Protergia Dynamiki Οικιακό',  'https://www.protergia.gr/spiti/oikiako-reuma-proionta/dynamiki',       'html', 'monthly', true),
('Protergia', 'B2B', 'green',  'Protergia Ειδικό Επαγγελμ.',  'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/eidiko','html','monthly',true),
('Protergia', 'B2B', 'blue',   'Protergia OnePlan Επαγγελμ.', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta',     'html', 'monthly', true),
('Protergia', 'B2C', 'blue',   'Protergia Ανακοινώσεις Τιμών','https://www.protergia.gr/anakoinoseis-timon',                          'html', 'monthly', true),
-- ΗΡΩΝ
('ΗΡΩΝ', 'B2C', 'green',  'ΗΡΩΝ EN.A Ειδικό',            'https://www.heron.gr/gia-to-spiti/revma/eidiko-timologio',      'html', 'monthly', true),
('ΗΡΩΝ', 'B2C', 'blue',   'ΗΡΩΝ Simply Safe Σταθερό',    'https://www.heron.gr/gia-to-spiti/revma/oikiaka-programmata',   'html', 'monthly', true),
('ΗΡΩΝ', 'B2C', 'yellow', 'ΗΡΩΝ Generous Κυμαινόμενο',   'https://www.heron.gr/gia-to-spiti/revma/kymainom-programmata',  'html', 'monthly', true),
('ΗΡΩΝ', 'B2B', 'green',  'ΗΡΩΝ Ειδικό Επαγγελματικό',   'https://www.heron.gr/gia-tin-epicheirisi/revma/eidiko',         'html', 'monthly', true),
('ΗΡΩΝ', 'B2B', 'blue',   'ΗΡΩΝ Business Pro',            'https://www.heron.gr/gia-tin-epicheirisi/revma',                'html', 'monthly', true),
('ΗΡΩΝ', 'B2C', 'blue',   'ΗΡΩΝ Ανακοινώσεις Τιμών',     'https://www.heron.gr/anakoinoseis/times-xreoseis',              'html', 'monthly', true),
-- ZeniΘ
('ZeniΘ', 'B2C', 'green',  'ZeniΘ Power Home Start',      'https://www.zenith.gr/el/for-home/electricity/special-tariff',  'html', 'monthly', true),
('ZeniΘ', 'B2C', 'blue',   'ZeniΘ Power Home Choice',     'https://www.zenith.gr/el/for-home/electricity',                 'html', 'monthly', true),
('ZeniΘ', 'B2C', 'yellow', 'ZeniΘ Power Home Direct',     'https://www.zenith.gr/el/for-home/electricity/variable',        'html', 'monthly', true),
('ZeniΘ', 'B2B', 'green',  'ZeniΘ Business Ειδικό',       'https://www.zenith.gr/el/for-business/electricity/special',     'html', 'monthly', true),
('ZeniΘ', 'B2B', 'blue',   'ZeniΘ Business Fixed',        'https://www.zenith.gr/el/for-business/electricity',             'html', 'monthly', true),
('ZeniΘ', 'B2C', 'blue',   'ZeniΘ Τιμοκατάλογοι',        'https://www.zenith.gr/el/timokatalogoianakoinoseis',             'html', 'monthly', true),
-- ELPEDISON
('Elpedison', 'B2C', 'green',  'Elpedison Ειδικό Οικιακό',  'https://www.elpedison.gr/gr/gia-to-spiti/reuma/eidiko-timologio','html','monthly',true),
('Elpedison', 'B2C', 'blue',   'Elpedison Bright Σταθερό',  'https://www.elpedison.gr/gr/gia-to-spiti/reuma/oikiaka-programmata','html','monthly',true),
('Elpedison', 'B2C', 'yellow', 'Elpedison Economy Κυμαιν.', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/kymainom',      'html', 'monthly', true),
('Elpedison', 'B2B', 'green',  'Elpedison Ειδικό Επαγγελμ.','https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/eidiko', 'html', 'monthly', true),
('Elpedison', 'B2B', 'blue',   'Elpedison Business Plus',   'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma',         'html', 'monthly', true),
('Elpedison', 'B2C', 'blue',   'Elpedison Ανακοινώσεις',    'https://www.elpedison.gr/gr/anakoinoseis/times-reumatos',      'html', 'monthly', true),
-- nrg
('nrg', 'B2C', 'green',  'nrg Special Ειδικό',            'https://www.nrg.gr/el/gia-to-spiti/reuma/eidiko-timologio',     'html', 'monthly', true),
('nrg', 'B2C', 'blue',   'nrg Prime Σταθερό',             'https://www.nrg.gr/el/gia-to-spiti/reuma',                      'html', 'monthly', true),
('nrg', 'B2C', 'yellow', 'nrg Smart Κυμαινόμενο',         'https://www.nrg.gr/el/gia-to-spiti/reuma/kymainom',             'html', 'monthly', true),
('nrg', 'B2B', 'green',  'nrg Ειδικό Επαγγελματικό',      'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma/eidiko',         'html', 'monthly', true),
('nrg', 'B2B', 'blue',   'nrg Business Flex',             'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma',                'html', 'monthly', true),
('nrg', 'B2C', 'blue',   'nrg Ανακοινώσεις Τιμών',        'https://www.nrg.gr/el/anakoinoseis-timon',                      'html', 'monthly', true),
-- ΦΥΣΙΚΟ ΑΕΡΙΟ
('Φυσικό Αέριο', 'B2C', 'green',  'ΦΑ Ειδικό Οικιακό',       'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/eidiko',   'html', 'monthly', true),
('Φυσικό Αέριο', 'B2C', 'blue',   'ΦΑ MAXI Σταθερό',         'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma',          'html', 'monthly', true),
('Φυσικό Αέριο', 'B2C', 'yellow', 'ΦΑ Dynamic Κυμαινόμενο',  'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/kymainom', 'html', 'monthly', true),
('Φυσικό Αέριο', 'B2B', 'green',  'ΦΑ Ειδικό Επαγγελματικό', 'https://www.fysikoaeriohellas.gr/gia-tin-epixeirisi/reuma',    'html', 'monthly', true),
('Φυσικό Αέριο', 'B2B', 'blue',   'ΦΑ Business Fix',         'https://www.fysikoaeriohellas.gr/gia-tin-epixeirisi/reuma/business','html','monthly',true),
('Φυσικό Αέριο', 'B2C', 'blue',   'ΦΑ Ανακοινώσεις Τιμών',   'https://www.fysikoaeriohellas.gr/xreoseis-anakoinoseis',       'html', 'monthly', true),
-- VOLTON
('Volton', 'B2C', 'green',  'Volton Special Ειδικό',       'https://volton.gr/gia-to-spiti/reuma/eidiko-timologio',          'html', 'monthly', true),
('Volton', 'B2C', 'blue',   'Volton Unique Σταθερό',       'https://volton.gr/gia-to-spiti/reuma',                           'html', 'monthly', true),
('Volton', 'B2C', 'yellow', 'Volton Yellow Κυμαινόμενο',   'https://volton.gr/gia-to-spiti/reuma/kymainom',                  'html', 'monthly', true),
('Volton', 'B2B', 'green',  'Volton Ειδικό Επαγγελματικό', 'https://volton.gr/gia-tin-epicheirisi/reuma/eidiko',             'html', 'monthly', true),
('Volton', 'B2B', 'blue',   'Volton Business Pro',         'https://volton.gr/gia-tin-epicheirisi/reuma',                    'html', 'monthly', true),
('Volton', 'B2C', 'blue',   'Volton Τιμολόγια Archive',    'https://volton.gr/timologia-xreoseis',                           'html', 'monthly', true),
-- WE ENERGY
('We Energy', 'B2C', 'green',  'We Green Ειδικό',           'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/eidiko',    'html', 'monthly', true),
('We Energy', 'B2C', 'blue',   'We Energy Home Fix',        'https://weenergy.gr/gia-to-spiti/ilektriki-energeia',           'html', 'monthly', true),
('We Energy', 'B2C', 'yellow', 'We Energy Flex',            'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/flex',      'html', 'monthly', true),
('We Energy', 'B2B', 'green',  'We Energy Ειδικό Επαγγελμ.','https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/eidiko','html','monthly',true),
('We Energy', 'B2B', 'blue',   'We Energy Business',        'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia',     'html', 'monthly', true),
('We Energy', 'B2C', 'blue',   'We Energy Ανακοινώσεις',    'https://weenergy.gr/anakoinoseis-timon',                        'html', 'monthly', true),
-- ΕΛΙΝ
('Ελίν', 'B2C', 'green',  'Ελίν Power On Green',           'https://energy.elin.gr/gia-to-spiti/reuma/eidiko-timologio',    'html', 'monthly', true),
('Ελίν', 'B2C', 'blue',   'Ελίν Home Select',              'https://energy.elin.gr/gia-to-spiti/reuma',                     'html', 'monthly', true),
('Ελίν', 'B2C', 'yellow', 'Ελίν Home Flex',                'https://energy.elin.gr/gia-to-spiti/reuma/kymainom',            'html', 'monthly', true),
('Ελίν', 'B2B', 'green',  'Ελίν Ειδικό Επαγγελματικό',    'https://energy.elin.gr/gia-tin-epixeirisi/reuma/eidiko',        'html', 'monthly', true),
('Ελίν', 'B2B', 'blue',   'Ελίν Business Plus',            'https://energy.elin.gr/gia-tin-epixeirisi/reuma',               'html', 'monthly', true),
('Ελίν', 'B2C', 'blue',   'Ελίν Ανακοινώσεις Τιμών',      'https://energy.elin.gr/anakoinoseis-timon',                     'html', 'monthly', true),
-- RAEYE CENTRAL HUBS
('RAEYE', 'B2C', 'green', 'EnergyCost.gr - Σύγκριση Τιμών', 'https://www.energycost.gr/',                                  'html', 'monthly', true),
('RAEYE', 'B2C', 'green', 'RAE.gr - Οικιακά Τιμολόγια',     'https://www.rae.gr/oikiaka-timologia/',                       'html', 'monthly', true),
('RAEYE', 'B2B', 'green', 'RAE.gr - Επαγγελματικά Τιμολόγια','https://www.rae.gr/epaggelmatika-timologia/',                'html', 'monthly', true);

-- 3. INSERT COMPREHENSIVE B2C TARIFFS
INSERT INTO market_tariffs (
  provider_name, program_name, customer_type, tariff_color,
  unit_rate_kwh, fixed_fee_monthly, validity_month, source_url
) VALUES
('ΔΕΗ', 'Ειδικό Οικιακό (Πράσινο)',       'B2C', 'green',  0.1558, 0.00, '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/eidiko-timologio'),
('ΔΕΗ', 'myHome Fix 12 (Μπλε)',           'B2C', 'blue',   0.1820, 5.00, '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/stathera-timologia'),
('ΔΕΗ', 'myHome Flex (Μπλε)',             'B2C', 'blue',   0.1950, 3.00, '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/stathera-timologia'),
('ΔΕΗ', 'myHome 4All (Κίτρινο)',          'B2C', 'yellow', 0.1710, 2.50, '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/kymainom-timologia'),
('ΔΕΗ', 'myHome Smart (Πορτοκαλί)',       'B2C', 'orange', 0.1640, 0.00, '2026-08', 'https://www.dei.gr/el/gia-to-spiti/revma/dynamiko-timologio'),
('Protergia', 'Ειδικό Οικιακό (Πράσινο)', 'B2C', 'green',  0.1585, 0.00, '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/eidiko'),
('Protergia', 'Fix 12 Μήνες (Μπλε)',      'B2C', 'blue',   0.1750, 4.50, '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta'),
('Protergia', 'Value Safe 24 (Μπλε)',     'B2C', 'blue',   0.1820, 3.00, '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta'),
('Protergia', 'Dynamiki Online (Κίτρινο)','B2C', 'yellow', 0.1680, 2.00, '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/dynamiki'),
('Protergia', 'Value Dynamic (Κίτρινο)',  'B2C', 'yellow', 0.1710, 1.50, '2026-08', 'https://www.protergia.gr/spiti/oikiako-reuma-proionta/dynamiki'),
('ΗΡΩΝ', 'EN.A Basic Ειδικό (Πράσινο)',   'B2C', 'green',  0.1592, 0.00, '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/eidiko-timologio'),
('ΗΡΩΝ', 'OnePlan Home (Μπλε)',           'B2C', 'blue',   0.1890, 5.00, '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/oikiaka-programmata'),
('ΗΡΩΝ', 'OnePlan 12μηνος (Μπλε)',        'B2C', 'blue',   0.1890, 6.00, '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/oikiaka-programmata'),
('ΗΡΩΝ', 'Generous Home (Κίτρινο)',       'B2C', 'yellow', 0.1720, 3.00, '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/kymainom-programmata'),
('ΗΡΩΝ', 'Solar Home (Κίτρινο)',          'B2C', 'yellow', 0.1680, 2.50, '2026-08', 'https://www.heron.gr/gia-to-spiti/revma/kymainom-programmata'),
('ZeniΘ', 'Power Home Start Ειδικό (Πράσινο)', 'B2C', 'green',  0.1596, 0.00, '2026-08', 'https://www.zenith.gr/el/for-home/electricity/special-tariff'),
('ZeniΘ', 'Power Home Fix (Μπλε)',              'B2C', 'blue',   0.1780, 3.80, '2026-08', 'https://www.zenith.gr/el/for-home/electricity'),
('ZeniΘ', 'Power Home Choice 12 (Μπλε)',        'B2C', 'blue',   0.1820, 5.00, '2026-08', 'https://www.zenith.gr/el/for-home/electricity'),
('ZeniΘ', 'Power Home Direct (Κίτρινο)',        'B2C', 'yellow', 0.1690, 2.00, '2026-08', 'https://www.zenith.gr/el/for-home/electricity/variable'),
('Elpedison', 'Ειδικό Οικιακό (Πράσινο)', 'B2C', 'green',  0.1603, 0.00, '2026-08', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/eidiko-timologio'),
('Elpedison', 'Home Plus (Μπλε)',          'B2C', 'blue',   0.1810, 4.20, '2026-08', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/oikiaka-programmata'),
('Elpedison', 'Bright Fix 12 (Μπλε)',     'B2C', 'blue',   0.1870, 5.50, '2026-08', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/oikiaka-programmata'),
('Elpedison', 'Economy Blue (Κίτρινο)',   'B2C', 'yellow', 0.1730, 2.80, '2026-08', 'https://www.elpedison.gr/gr/gia-to-spiti/reuma/kymainom'),
('nrg', 'nrg Special Ειδικό (Πράσινο)',   'B2C', 'green',  0.1594, 0.00, '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma/eidiko-timologio'),
('nrg', 'nrg Green Home (Μπλε)',          'B2C', 'blue',   0.1850, 4.80, '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma'),
('nrg', 'nrg Prime 12 (Μπλε)',            'B2C', 'blue',   0.1920, 6.00, '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma'),
('nrg', 'nrg Smart (Κίτρινο)',            'B2C', 'yellow', 0.1720, 3.50, '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma/kymainom'),
('nrg', 'nrg Fixed (Πορτοκαλί)',          'B2C', 'orange', 0.1660, 0.00, '2026-08', 'https://www.nrg.gr/el/gia-to-spiti/reuma/dynamiko'),
('Φυσικό Αέριο', 'Ειδικό Οικιακό (Πράσινο)', 'B2C', 'green',  0.1578, 0.00, '2026-08', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/eidiko'),
('Φυσικό Αέριο', 'Home MAXI (Μπλε)',         'B2C', 'blue',   0.1790, 3.90, '2026-08', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma'),
('Φυσικό Αέριο', 'Home Fix 12 (Μπλε)',       'B2C', 'blue',   0.1850, 5.00, '2026-08', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma'),
('Φυσικό Αέριο', 'Dynamic Home (Κίτρινο)',   'B2C', 'yellow', 0.1700, 2.20, '2026-08', 'https://www.fysikoaeriohellas.gr/gia-to-spiti/reuma/kymainom'),
('Volton', 'Volton Special Ειδικό (Πράσινο)', 'B2C', 'green',  0.1588, 0.00, '2026-08', 'https://volton.gr/gia-to-spiti/reuma/eidiko-timologio'),
('Volton', 'Volton Home Select (Μπλε)',       'B2C', 'blue',   0.1770, 3.70, '2026-08', 'https://volton.gr/gia-to-spiti/reuma'),
('Volton', 'Volton Unique 12 (Μπλε)',         'B2C', 'blue',   0.1830, 5.00, '2026-08', 'https://volton.gr/gia-to-spiti/reuma'),
('Volton', 'Volton Yellow (Κίτρινο)',         'B2C', 'yellow', 0.1680, 2.00, '2026-08', 'https://volton.gr/gia-to-spiti/reuma/kymainom'),
('We Energy', 'We Green Ειδικό (Πράσινο)',    'B2C', 'green',  0.1590, 0.00, '2026-08', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/eidiko'),
('We Energy', 'We Energy Home Fix (Μπλε)',    'B2C', 'blue',   0.1800, 4.10, '2026-08', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia'),
('We Energy', 'We Energy Smart 12 (Μπλε)',   'B2C', 'blue',   0.1860, 5.50, '2026-08', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia'),
('We Energy', 'We Flex (Κίτρινο)',            'B2C', 'yellow', 0.1710, 2.50, '2026-08', 'https://weenergy.gr/gia-to-spiti/ilektriki-energeia/flex'),
('Ελίν', 'Power On Green Ειδικό (Πράσινο)',   'B2C', 'green',  0.1581, 0.00, '2026-08', 'https://energy.elin.gr/gia-to-spiti/reuma/eidiko-timologio'),
('Ελίν', 'Ελίν Home Select (Μπλε)',           'B2C', 'blue',   0.1830, 4.30, '2026-08', 'https://energy.elin.gr/gia-to-spiti/reuma'),
('Ελίν', 'Ελίν Home Fixed 12 (Μπλε)',         'B2C', 'blue',   0.1890, 5.50, '2026-08', 'https://energy.elin.gr/gia-to-spiti/reuma'),
('Ελίν', 'Ελίν Home Flex (Κίτρινο)',          'B2C', 'yellow', 0.1720, 2.80, '2026-08', 'https://energy.elin.gr/gia-to-spiti/reuma/kymainom'),

-- 4. COMPREHENSIVE B2B TARIFFS
('ΔΕΗ', 'Ειδικό Επαγγελματικό Γ21 (Πράσινο)', 'B2B', 'green',  0.1452, 0.00,  '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma/eidiko-timologio'),
('ΔΕΗ', 'ΔΕΗ Blue Business Γ22 (Μπλε)',        'B2B', 'blue',   0.1690, 12.00, '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma'),
('ΔΕΗ', 'ΔΕΗ Enterprise B2B Γ23 (Μπλε)',       'B2B', 'blue',   0.1550, 50.00, '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma'),
('ΔΕΗ', 'ΔΕΗ Business Flex (Κίτρινο)',         'B2B', 'yellow', 0.1580, 8.00,  '2026-08', 'https://www.dei.gr/el/gia-tin-epixeirisi/revma'),
('Protergia', 'Ειδικό Επαγγελματικό (Πράσινο)', 'B2B', 'green',  0.1422, 0.00,  '2026-08', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta/eidiko'),
('Protergia', 'OnePlan Business (Μπλε)',         'B2B', 'blue',   0.1620, 10.00, '2026-08', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta'),
('Protergia', 'Fix Business 12 (Μπλε)',          'B2B', 'blue',   0.1680, 15.00, '2026-08', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta'),
('Protergia', 'Business Dynamiki (Κίτρινο)',     'B2B', 'yellow', 0.1550, 5.00,  '2026-08', 'https://www.protergia.gr/epixeirisi/epaggelmatiko-reuma-proionta'),
('Protergia', 'Solar Business B2B (Φωτοβολτ.)', 'B2B', 'green',  0.0920, 0.00,  '2026-08', 'https://www.protergia.gr/epixeirisi/fotovoltaika'),
('ΗΡΩΝ', 'Ειδικό Επαγγελματικό (Πράσινο)', 'B2B', 'green',  0.1438, 0.00,  '2026-08', 'https://www.heron.gr/gia-tin-epicheirisi/revma/eidiko'),
('ΗΡΩΝ', 'ΗΡΩΝ Enterprise (Μπλε)',          'B2B', 'blue',   0.1710, 11.00, '2026-08', 'https://www.heron.gr/gia-tin-epicheirisi/revma'),
('ΗΡΩΝ', 'Business Pro B2B (Μπλε)',         'B2B', 'blue',   0.1620, 25.00, '2026-08', 'https://www.heron.gr/gia-tin-epicheirisi/revma'),
('ΗΡΩΝ', 'Business Flex (Κίτρινο)',         'B2B', 'yellow', 0.1560, 7.00,  '2026-08', 'https://www.heron.gr/gia-tin-epicheirisi/revma'),
('ZeniΘ', 'Ειδικό Επαγγελματικό (Πράσινο)', 'B2B', 'green',  0.1445, 0.00,  '2026-08', 'https://www.zenith.gr/el/for-business/electricity/special'),
('ZeniΘ', 'ZeniΘ Business Fix (Μπλε)',       'B2B', 'blue',   0.1680, 9.50,  '2026-08', 'https://www.zenith.gr/el/for-business/electricity'),
('ZeniΘ', 'ZeniΘ Business Pro 12 (Μπλε)',   'B2B', 'blue',   0.1720, 18.00, '2026-08', 'https://www.zenith.gr/el/for-business/electricity'),
('ZeniΘ', 'ZeniΘ Business Flex (Κίτρινο)',  'B2B', 'yellow', 0.1570, 6.00,  '2026-08', 'https://www.zenith.gr/el/for-business/electricity'),
('Elpedison', 'Ειδικό Επαγγελματικό (Πράσινο)', 'B2B', 'green',  0.1450, 0.00,  '2026-08', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma/eidiko'),
('Elpedison', 'Business Plus Class 21 (Μπλε)',  'B2B', 'blue',   0.1680, 10.50, '2026-08', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma'),
('Elpedison', 'Business Fix 22 (Μπλε)',          'B2B', 'blue',   0.1630, 22.00, '2026-08', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma'),
('Elpedison', 'Business Flex (Κίτρινο)',         'B2B', 'yellow', 0.1570, 7.50,  '2026-08', 'https://www.elpedison.gr/gr/gia-tin-epixeirisi/reuma'),
('nrg', 'Ειδικό Επαγγελματικό (Πράσινο)', 'B2B', 'green',  0.1448, 0.00,  '2026-08', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma/eidiko'),
('nrg', 'nrg Business Flex (Μπλε)',       'B2B', 'blue',   0.1720, 11.50, '2026-08', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma'),
('nrg', 'nrg Business Pro 12 (Μπλε)',    'B2B', 'blue',   0.1650, 30.00, '2026-08', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma'),
('nrg', 'nrg Business Dynamic (Κίτρινο)','B2B', 'yellow', 0.1580, 8.00,  '2026-08', 'https://www.nrg.gr/el/gia-tin-epixeirisi/reuma'),
('Φυσικό Αέριο', 'Ειδικό Επαγγελματικό (Πράσινο)', 'B2B', 'green',  0.1440, 0.00,  '2026-08', 'https://www.fysikoaeriohellas.gr/gia-tin-epixeirisi/reuma'),
('Φυσικό Αέριο', 'Business Fix MAXI (Μπλε)',        'B2B', 'blue',   0.1660, 9.80,  '2026-08', 'https://www.fysikoaeriohellas.gr/gia-tin-epixeirisi/reuma'),
('Φυσικό Αέριο', 'Business Pro 12 (Μπλε)',          'B2B', 'blue',   0.1620, 20.00, '2026-08', 'https://www.fysikoaeriohellas.gr/gia-tin-epixeirisi/reuma'),
('Φυσικό Αέριο', 'Business Dynamic (Κίτρινο)',      'B2B', 'yellow', 0.1550, 6.50,  '2026-08', 'https://www.fysikoaeriohellas.gr/gia-tin-epixeirisi/reuma'),
('Volton', 'Ειδικό Επαγγελματικό (Πράσινο)', 'B2B', 'green',  0.1442, 0.00,  '2026-08', 'https://volton.gr/gia-tin-epicheirisi/reuma/eidiko'),
('Volton', 'Volton Business Pro (Μπλε)',      'B2B', 'blue',   0.1640, 9.20,  '2026-08', 'https://volton.gr/gia-tin-epicheirisi/reuma'),
('Volton', 'Volton Business Select 12 (Μπλε)','B2B', 'blue',  0.1600, 18.00, '2026-08', 'https://volton.gr/gia-tin-epicheirisi/reuma'),
('Volton', 'Volton Business Flex (Κίτρινο)',  'B2B', 'yellow', 0.1560, 6.00,  '2026-08', 'https://volton.gr/gia-tin-epicheirisi/reuma'),
('We Energy', 'Ειδικό Επαγγελματικό (Πράσινο)', 'B2B', 'green',  0.1446, 0.00,  '2026-08', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia/eidiko'),
('We Energy', 'We Energy Business Fix (Μπλε)',  'B2B', 'blue',   0.1670, 10.20, '2026-08', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia'),
('We Energy', 'We Energy Business Pro (Μπλε)',  'B2B', 'blue',   0.1620, 22.00, '2026-08', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia'),
('We Energy', 'We Business Flex (Κίτρινο)',     'B2B', 'yellow', 0.1560, 7.00,  '2026-08', 'https://weenergy.gr/gia-tin-epixeirisi/ilektriki-energeia'),
('Ελίν', 'Ειδικό Επαγγελματικό (Πράσινο)', 'B2B', 'green',  0.1443, 0.00,  '2026-08', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma/eidiko'),
('Ελίν', 'Ελίν Business Plus (Μπλε)',       'B2B', 'blue',   0.1700, 10.80, '2026-08', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma'),
('Ελίν', 'Ελίν Business Pro 12 (Μπλε)',    'B2B', 'blue',   0.1650, 25.00, '2026-08', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma'),
('Ελίν', 'Ελίν Business Flex (Κίτρινο)',   'B2B', 'yellow', 0.1570, 7.20,  '2026-08', 'https://energy.elin.gr/gia-tin-epixeirisi/reuma')

ON CONFLICT (provider_name, program_name, validity_month)
DO UPDATE SET
  unit_rate_kwh      = EXCLUDED.unit_rate_kwh,
  fixed_fee_monthly  = EXCLUDED.fixed_fee_monthly,
  tariff_color       = EXCLUDED.tariff_color,
  customer_type      = EXCLUDED.customer_type,
  source_url         = EXCLUDED.source_url;

-- 5. ADD lead_score COLUMN IF MISSING
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hlektrismos_leads' AND column_name = 'lead_score'
  ) THEN
    ALTER TABLE hlektrismos_leads ADD COLUMN lead_score INT DEFAULT 0;
  END IF;
END $$;

-- 6. GRANT PERMISSIONS
GRANT SELECT ON market_tariffs TO anon, authenticated;
GRANT SELECT ON rag_document_endpoints TO anon, authenticated;

COMMIT;
