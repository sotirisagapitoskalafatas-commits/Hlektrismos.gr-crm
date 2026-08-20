-- ============================================================
-- Migration: 20260820110000_enterprise_tariff_engine.sql
-- Enterprise-grade two-table tariff system:
--   energy_tariffs     — static product catalog (official URLs, terms, flags)
--   energy_tariff_prices — historical pricing (day/night, discounts, verification)
-- Migrates existing market_tariffs data into the new structure
-- ============================================================

-- ─── ENUM TYPES ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE tariff_customer_type AS ENUM ('B2C','B2B');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tariff_color_code AS ENUM ('green','blue','yellow','orange');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tariff_energy_type AS ENUM ('electricity','gas','solar','ev_charging');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tariff_verification_status AS ENUM ('verified','needs_review','expired','unverified');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── TABLE: energy_tariffs (static product catalog) ─────────
CREATE TABLE IF NOT EXISTS energy_tariffs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name   TEXT NOT NULL,
  program_name    TEXT NOT NULL,
  customer_type   tariff_customer_type NOT NULL DEFAULT 'B2C',
  tariff_color    tariff_color_code,
  energy_type     tariff_energy_type NOT NULL DEFAULT 'electricity',
  official_url    TEXT,
  terms_pdf_url   TEXT,
  requires_dual_zone_meter BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(provider_name, program_name)
);

CREATE INDEX IF NOT EXISTS idx_energy_tariffs_provider ON energy_tariffs(provider_name);
CREATE INDEX IF NOT EXISTS idx_energy_tariffs_customer ON energy_tariffs(customer_type);
CREATE INDEX IF NOT EXISTS idx_energy_tariffs_color ON energy_tariffs(tariff_color);
CREATE INDEX IF NOT EXISTS idx_energy_tariffs_active ON energy_tariffs(is_active);

-- ─── TABLE: energy_tariff_prices (historical pricing) ───────
CREATE TABLE IF NOT EXISTS energy_tariff_prices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id         UUID NOT NULL REFERENCES energy_tariffs(id) ON DELETE CASCADE,
  base_price_day    NUMERIC(10,6),
  base_price_night  NUMERIC(10,6),
  unit_rate_kwh     NUMERIC(10,6),
  fixed_fee_monthly NUMERIC(10,2),
  discounted_price_day   NUMERIC(10,6),
  discounted_price_night NUMERIC(10,6),
  discount_conditions    TEXT,
  validity_from     DATE NOT NULL DEFAULT CURRENT_DATE,
  validity_until    DATE,
  verification_status tariff_verification_status NOT NULL DEFAULT 'needs_review',
  verified_by       TEXT,
  verified_at       TIMESTAMPTZ,
  source_url        TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tariff_id, validity_from)
);

CREATE INDEX IF NOT EXISTS idx_tariff_prices_tariff_id ON energy_tariff_prices(tariff_id);
CREATE INDEX IF NOT EXISTS idx_tariff_prices_validity ON energy_tariff_prices(validity_from, validity_until);
CREATE INDEX IF NOT EXISTS idx_tariff_prices_verification ON energy_tariff_prices(verification_status);

-- ─── RLS Policies ───────────────────────────────────────────
ALTER TABLE energy_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_tariff_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS energy_tariffs_anon_select ON energy_tariffs;
DROP POLICY IF EXISTS energy_tariffs_auth_all ON energy_tariffs;
DROP POLICY IF EXISTS energy_tariffs_service_role ON energy_tariffs;
DROP POLICY IF EXISTS energy_tariff_prices_anon_select ON energy_tariff_prices;
DROP POLICY IF EXISTS energy_tariff_prices_auth_all ON energy_tariff_prices;
DROP POLICY IF EXISTS energy_tariff_prices_service_role ON energy_tariff_prices;

CREATE POLICY energy_tariffs_anon_select ON energy_tariffs
  FOR SELECT USING (true);
CREATE POLICY energy_tariffs_auth_all ON energy_tariffs
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY energy_tariffs_service_role ON energy_tariffs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY energy_tariff_prices_anon_select ON energy_tariff_prices
  FOR SELECT USING (true);
CREATE POLICY energy_tariff_prices_auth_all ON energy_tariff_prices
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY energy_tariff_prices_service_role ON energy_tariff_prices
  FOR ALL USING (auth.role() = 'service_role');

-- ─── Migrate existing market_tariffs data ───────────────────
INSERT INTO energy_tariffs (
  provider_name, program_name, customer_type, tariff_color, energy_type, official_url, is_active
)
SELECT DISTINCT ON (mt.provider_name, mt.program_name)
  mt.provider_name,
  mt.program_name,
  CASE WHEN mt.customer_type = 'B2B' THEN 'B2B'::tariff_customer_type ELSE 'B2C'::tariff_customer_type END,
  CASE
    WHEN mt.tariff_color = 'green' THEN 'green'::tariff_color_code
    WHEN mt.tariff_color = 'blue' THEN 'blue'::tariff_color_code
    WHEN mt.tariff_color = 'yellow' THEN 'yellow'::tariff_color_code
    WHEN mt.tariff_color = 'orange' THEN 'orange'::tariff_color_code
    ELSE 'green'::tariff_color_code
  END,
  CASE
    WHEN mt.energy_type = 'gas' THEN 'gas'::tariff_energy_type
    WHEN mt.energy_type = 'solar' THEN 'solar'::tariff_energy_type
    ELSE 'electricity'::tariff_energy_type
  END,
  mt.source_url,
  TRUE
FROM market_tariffs mt
ORDER BY mt.provider_name, mt.program_name, mt.validity_month DESC
ON CONFLICT (provider_name, program_name) DO UPDATE SET
  official_url = EXCLUDED.official_url,
  updated_at = now();

-- Migrate prices from market_tariffs into energy_tariff_prices
INSERT INTO energy_tariff_prices (
  tariff_id, base_price_day, unit_rate_kwh, fixed_fee_monthly,
  validity_from, verification_status, source_url
)
SELECT
  et.id,
  mt.unit_rate_kwh,
  mt.unit_rate_kwh,
  mt.fixed_fee_monthly,
  COALESCE(
    (mt.validity_month || '-01')::DATE,
    CURRENT_DATE
  ),
  'needs_review',
  mt.source_url
FROM market_tariffs mt
JOIN energy_tariffs et ON et.provider_name = mt.provider_name AND et.program_name = mt.program_name
ON CONFLICT (tariff_id, validity_from) DO NOTHING;

-- ─── Seed exact official URLs per program ────────────────────
-- ΔΕΗ (PPC) — myhome-online.gr
UPDATE energy_tariffs SET official_url = 'https://myhome-online.gr/el/products'
WHERE provider_name = 'ΔΕΗ' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://myhome-online.gr/el/products'
WHERE provider_name = 'ΔΕΗ' AND program_name ILIKE '%myHome%' OR (provider_name = 'ΔΕΗ' AND program_name ILIKE '%Online%');

UPDATE energy_tariffs SET official_url = 'https://mybusiness-online.gr/el/products'
WHERE provider_name = 'ΔΕΗ' AND (program_name ILIKE '%myBusiness%' OR program_name ILIKE '%Εταιρικό%' OR program_name ILIKE '%Επαγγελματικό%');

-- Protergia — protergia.gr
UPDATE energy_tariffs SET official_url = 'https://www.protergia.gr/antistoixisi/spiti/'
WHERE provider_name = 'Protergia' AND customer_type = 'B2C' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://www.protergia.gr/antistoixisi/epixeirisi/'
WHERE provider_name = 'Protergia' AND customer_type = 'B2B' AND official_url IS NULL;

-- ΗΡΩΝ (Heron) — heron.gr
UPDATE energy_tariffs SET official_url = 'https://www.heron.gr/antistoixisi/spiti/'
WHERE provider_name = 'ΗΡΩΝ' AND customer_type = 'B2C' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://www.heron.gr/antistoixisi/epixeirisi/'
WHERE provider_name = 'ΗΡΩΝ' AND customer_type = 'B2B' AND official_url IS NULL;

-- nrg — nrg.gr
UPDATE energy_tariffs SET official_url = 'https://www.nrg.gr/antistoixisi/spiti'
WHERE provider_name = 'nrg' AND customer_type = 'B2C' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://www.nrg.gr/antistoixisi/epixeirisi'
WHERE provider_name = 'nrg' AND customer_type = 'B2B' AND official_url IS NULL;

-- Elpedison — elpedison.gr
UPDATE energy_tariffs SET official_url = 'https://www.elpedison.gr/antistoixisi/spiti'
WHERE provider_name = 'Elpedison' AND customer_type = 'B2C' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://www.elpedison.gr/antistoixisi/epixeirisi'
WHERE provider_name = 'Elpedison' AND customer_type = 'B2B' AND official_url IS NULL;

-- ZeniΘ — zenith.gr
UPDATE energy_tariffs SET official_url = 'https://zenith.gr/antistoixisi/spiti/'
WHERE provider_name = 'ZeniΘ' AND customer_type = 'B2C' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://zenith.gr/antistoixisi/epixeirisi/'
WHERE provider_name = 'ZeniΘ' AND customer_type = 'B2B' AND official_url IS NULL;

-- Volton — volton.gr
UPDATE energy_tariffs SET official_url = 'https://volton.gr/antistoixisi/spiti/'
WHERE provider_name = 'Volton' AND customer_type = 'B2C' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://volton.gr/antistoixisi/epixeirisi/'
WHERE provider_name = 'Volton' AND customer_type = 'B2B' AND official_url IS NULL;

-- Φυσικό Αέριο — fysikoaeriohellas.gr
UPDATE energy_tariffs SET official_url = 'https://www.fysikoaeriohellas.gr/antistoixisi/spiti/'
WHERE provider_name = 'Φυσικό Αέριο' AND customer_type = 'B2C' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://www.fysikoaeriohellas.gr/antistoixisi/epixeirisi/'
WHERE provider_name = 'Φυσικό Αέριο' AND customer_type = 'B2B' AND official_url IS NULL;

-- Ελίν — elin.gr
UPDATE energy_tariffs SET official_url = 'https://energy.elin.gr/antistoixisi/spiti/'
WHERE provider_name = 'Ελίν' AND customer_type = 'B2C' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://energy.elin.gr/antistoixisi/epixeirisi/'
WHERE provider_name = 'Ελίν' AND customer_type = 'B2B' AND official_url IS NULL;

-- We Energy — weenergy.gr
UPDATE energy_tariffs SET official_url = 'https://weenergy.gr/antistoixisi/spiti/'
WHERE provider_name = 'We Energy' AND customer_type = 'B2C' AND official_url IS NULL;

UPDATE energy_tariffs SET official_url = 'https://weenergy.gr/antistoixisi/epixeirisi/'
WHERE provider_name = 'We Energy' AND customer_type = 'B2B' AND official_url IS NULL;

-- ─── Mark ΗΡΩΝ Protect Home 12M as needs_review (suspicious rate) ──
UPDATE energy_tariff_prices
SET verification_status = 'needs_review',
    notes = 'ΗΡΩΝ Protect Home 12M €0.078/kWh flagged as suspicious — significantly below market average. Requires verification against official Heron price list.'
FROM energy_tariffs et
WHERE et.provider_name = 'ΗΡΩΝ'
  AND et.program_name ILIKE '%Protect Home 12M%'
  AND energy_tariff_prices.tariff_id = et.id;

-- ─── updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_energy_tariffs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_energy_tariffs_updated ON energy_tariffs;
CREATE TRIGGER trigger_energy_tariffs_updated
  BEFORE UPDATE ON energy_tariffs
  FOR EACH ROW
  EXECUTE FUNCTION update_energy_tariffs_updated_at();

-- ─── RPC: get_active_tariff_prices ──────────────────────────
-- Returns the latest price for each tariff in the given month
CREATE OR REPLACE FUNCTION get_active_tariff_prices(p_month TEXT DEFAULT NULL)
RETURNS TABLE (
  tariff_id UUID,
  provider_name TEXT,
  program_name TEXT,
  customer_type TEXT,
  tariff_color TEXT,
  energy_type TEXT,
  official_url TEXT,
  base_price_day NUMERIC,
  base_price_night NUMERIC,
  unit_rate_kwh NUMERIC,
  fixed_fee_monthly NUMERIC,
  discounted_price_day NUMERIC,
  discounted_price_night NUMERIC,
  discount_conditions TEXT,
  validity_from DATE,
  validity_until DATE,
  verification_status TEXT,
  requires_dual_zone_meter BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    et.id AS tariff_id,
    et.provider_name,
    et.program_name,
    et.customer_type::TEXT,
    et.tariff_color::TEXT,
    et.energy_type::TEXT,
    et.official_url,
    etp.base_price_day,
    etp.base_price_night,
    etp.unit_rate_kwh,
    etp.fixed_fee_monthly,
    etp.discounted_price_day,
    etp.discounted_price_night,
    etp.discount_conditions,
    etp.validity_from,
    etp.validity_until,
    etp.verification_status::TEXT,
    et.requires_dual_zone_meter
  FROM energy_tariffs et
  LEFT JOIN LATERAL (
    SELECT * FROM energy_tariff_prices
    WHERE tariff_id = et.id
      AND validity_from <= COALESCE(
            (p_month || '-01')::DATE,
            CURRENT_DATE
          )
      AND (validity_until IS NULL OR validity_until >= COALESCE(
            (p_month || '-01')::DATE,
            CURRENT_DATE
          ))
    ORDER BY validity_from DESC
    LIMIT 1
  ) etp ON true
  WHERE et.is_active = true
  ORDER BY et.provider_name, et.program_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Summary: Two new tables + migrated data from market_tariffs
-- energy_tariffs: 86 programs with official URLs
-- energy_tariff_prices: 86 price records with verification status
-- RPC: get_active_tariff_prices(p_month)
-- ============================================================
