const fs = require('fs');
const path = require('path');

// All provider programs from energyData.ts
const programs = [
  // ΔΕΗ
  { provider: 'ΔΕΗ', program: 'Flex Home', color: 'green', type: 'electricity', cat: 'B2C', url: 'https://www.dei.gr/gr/ekploseis/proionta/flex-home/' },
  { provider: 'ΔΕΗ', program: 'Classic Home', color: 'blue', type: 'electricity', cat: 'B2C', url: 'https://www.dei.gr/gr/ekploseis/proionta/classic-home/' },
  { provider: 'ΔΕΗ', program: 'Variable Home', color: 'yellow', type: 'electricity', cat: 'B2C', url: 'https://www.dei.gr/gr/ekploseis/proionta/variable-home/' },
  { provider: 'ΔΕΗ', program: 'Green Home', color: 'orange', type: 'electricity', cat: 'B2C', url: 'https://www.dei.gr/gr/ekploseis/proionta/green-home/' },
  { provider: 'ΔΕΗ', program: 'Flex Business', color: 'green', type: 'electricity', cat: 'B2B', url: 'https://www.dei.gr/gr/ekploseis/proionta/flex-business/' },
  { provider: 'ΔΕΗ', program: 'Classic Business', color: 'blue', type: 'electricity', cat: 'B2B', url: 'https://www.dei.gr/gr/ekploseis/proionta/classic-business/' },
  { provider: 'ΔΕΗ', program: 'Variable Business', color: 'yellow', type: 'electricity', cat: 'B2B', url: 'https://www.dei.gr/gr/ekploseis/proionta/variable-business/' },
  // Protergia
  { provider: 'Protergia', program: 'Flex Home', color: 'green', type: 'electricity', cat: 'B2C', url: 'https://www.protergia.gr/el/products/flex-home/' },
  { provider: 'Protergia', program: 'Classic Home', color: 'blue', type: 'electricity', cat: 'B2C', url: 'https://www.protergia.gr/el/products/classic-home/' },
  { provider: 'Protergia', program: 'Variable Home', color: 'yellow', type: 'electricity', cat: 'B2C', url: 'https://www.protergia.gr/el/products/variable-home/' },
  { provider: 'Protergia', program: 'Green Home', color: 'orange', type: 'electricity', cat: 'B2C', url: 'https://www.protergia.gr/el/products/green-home/' },
  { provider: 'Protergia', program: 'Flex Business', color: 'green', type: 'electricity', cat: 'B2B', url: 'https://www.protergia.gr/el/products/flex-business/' },
  { provider: 'Protergia', program: 'Classic Business', color: 'blue', type: 'electricity', cat: 'B2B', url: 'https://www.protergia.gr/el/products/classic-business/' },
  // ΗΡΩΝ
  { provider: 'ΗΡΩΝ', program: 'Flex Home', color: 'green', type: 'electricity', cat: 'B2C', url: 'https://www.heron.gr/flex-home/' },
  { provider: 'ΗΡΩΝ', program: 'Classic Home', color: 'blue', type: 'electricity', cat: 'B2C', url: 'https://www.heron.gr/classic-home/' },
  { provider: 'ΗΡΩΝ', program: 'Variable Home', color: 'yellow', type: 'electricity', cat: 'B2C', url: 'https://www.heron.gr/variable-home/' },
  { provider: 'ΗΡΩΝ', program: 'Green Home', color: 'orange', type: 'electricity', cat: 'B2C', url: 'https://www.heron.gr/green-home/' },
  { provider: 'ΗΡΩΝ', program: 'Flex Business', color: 'green', type: 'electricity', cat: 'B2B', url: 'https://www.heron.gr/flex-business/' },
  { provider: 'ΗΡΩΝ', program: 'Classic Business', color: 'blue', type: 'electricity', cat: 'B2B', url: 'https://www.heron.gr/classic-business/' },
  { provider: 'ΗΡΩΝ', program: 'Variable Business', color: 'yellow', type: 'electricity', cat: 'B2B', url: 'https://www.heron.gr/variable-business/' },
  // nrg
  { provider: 'nrg', program: 'Flex Home', color: 'green', type: 'electricity', cat: 'B2C', url: 'https://www.nrg.gr/flex-home/' },
  { provider: 'nrg', program: 'Classic Home', color: 'blue', type: 'electricity', cat: 'B2C', url: 'https://www.nrg.gr/classic-home/' },
  { provider: 'nrg', program: 'Variable Home', color: 'yellow', type: 'electricity', cat: 'B2C', url: 'https://www.nrg.gr/variable-home/' },
  { provider: 'nrg', program: 'Green Home', color: 'orange', type: 'electricity', cat: 'B2C', url: 'https://www.nrg.gr/green-home/' },
  { provider: 'nrg', program: 'Flex Business', color: 'green', type: 'electricity', cat: 'B2B', url: 'https://www.nrg.gr/flex-business/' },
  { provider: 'nrg', program: 'Classic Business', color: 'blue', type: 'electricity', cat: 'B2B', url: 'https://www.nrg.gr/classic-business/' },
  // ZeniΘ
  { provider: 'ZeniΘ', program: 'Flex Home', color: 'green', type: 'electricity', cat: 'B2C', url: 'https://www.zenith.gr/flex-home/' },
  { provider: 'ZeniΘ', program: 'Classic Home', color: 'blue', type: 'electricity', cat: 'B2C', url: 'https://www.zenith.gr/classic-home/' },
  { provider: 'ZeniΘ', program: 'Variable Home', color: 'yellow', type: 'electricity', cat: 'B2C', url: 'https://www.zenith.gr/variable-home/' },
  { provider: 'ZeniΘ', program: 'Green Home', color: 'orange', type: 'electricity', cat: 'B2C', url: 'https://www.zenith.gr/green-home/' },
  { provider: 'ZeniΘ', program: 'Flex Business', color: 'green', type: 'electricity', cat: 'B2B', url: 'https://www.zenith.gr/flex-business/' },
  { provider: 'ZeniΘ', program: 'Classic Business', color: 'blue', type: 'electricity', cat: 'B2B', url: 'https://www.zenith.gr/classic-business/' },
  // Volton
  { provider: 'Volton', program: 'Flex Home', color: 'green', type: 'electricity', cat: 'B2C', url: 'https://www.volton.gr/flex-home/' },
  { provider: 'Volton', program: 'Classic Home', color: 'blue', type: 'electricity', cat: 'B2C', url: 'https://www.volton.gr/classic-home/' },
  { provider: 'Volton', program: 'Variable Home', color: 'yellow', type: 'electricity', cat: 'B2C', url: 'https://www.volton.gr/variable-home/' },
  { provider: 'Volton', program: 'Green Home', color: 'orange', type: 'electricity', cat: 'B2C', url: 'https://www.volton.gr/green-home/' },
  { provider: 'Volton', program: 'Flex Business', color: 'green', type: 'electricity', cat: 'B2B', url: 'https://www.volton.gr/flex-business/' },
  { provider: 'Volton', program: 'Classic Business', color: 'blue', type: 'electricity', cat: 'B2B', url: 'https://www.volton.gr/classic-business/' },
  // Φυσικό Αέριο
  { provider: 'Φυσικό Αέριο', program: 'Flex Home', color: 'green', type: 'gas', cat: 'B2C', url: 'https://www.fysikoaerio.gr/flex-home/' },
  { provider: 'Φυσικό Αέριο', program: 'Classic Home', color: 'blue', type: 'gas', cat: 'B2C', url: 'https://www.fysikoaerio.gr/classic-home/' },
  { provider: 'Φυσικό Αέριο', program: 'Variable Home', color: 'yellow', type: 'gas', cat: 'B2C', url: 'https://www.fysikoaerio.gr/variable-home/' },
  { provider: 'Φυσικό Αέριο', program: 'Flex Business', color: 'green', type: 'gas', cat: 'B2B', url: 'https://www.fysikoaerio.gr/flex-business/' },
  { provider: 'Φυσικό Αέριο', program: 'Classic Business', color: 'blue', type: 'gas', cat: 'B2B', url: 'https://www.fysikoaerio.gr/classic-business/' },
  // Ελίν
  { provider: 'Ελίν', program: 'Flex Home', color: 'green', type: 'electricity', cat: 'B2C', url: 'https://www.elen.gr/flex-home/' },
  { provider: 'Ελίν', program: 'Classic Home', color: 'blue', type: 'electricity', cat: 'B2C', url: 'https://www.elen.gr/classic-home/' },
  { provider: 'Ελίν', program: 'Variable Home', color: 'yellow', type: 'electricity', cat: 'B2C', url: 'https://www.elen.gr/variable-home/' },
  { provider: 'Ελίν', program: 'Green Home', color: 'orange', type: 'electricity', cat: 'B2C', url: 'https://www.elen.gr/green-home/' },
  { provider: 'Ελίν', program: 'Flex Business', color: 'green', type: 'electricity', cat: 'B2B', url: 'https://www.elen.gr/flex-business/' },
  // Enerwave
  { provider: 'Enerwave', program: 'Flex Home', color: 'green', type: 'electricity', cat: 'B2C', url: 'https://www.enerwave.gr/flex-home/' },
  { provider: 'Enerwave', program: 'Classic Home', color: 'blue', type: 'electricity', cat: 'B2C', url: 'https://www.enerwave.gr/classic-home/' },
  { provider: 'Enerwave', program: 'Variable Home', color: 'yellow', type: 'electricity', cat: 'B2C', url: 'https://www.enerwave.gr/variable-home/' },
  { provider: 'Enerwave', program: 'Flex Business', color: 'green', type: 'electricity', cat: 'B2B', url: 'https://www.enerwave.gr/flex-business/' },
  // Eunice Power
  { provider: 'Eunice Power', program: 'Flex Home', color: 'green', type: 'electricity', cat: 'B2C', url: 'https://www.eunicepower.gr/flex-home/' },
  { provider: 'Eunice Power', program: 'Classic Home', color: 'blue', type: 'electricity', cat: 'B2C', url: 'https://www.eunicepower.gr/classic-home/' },
  { provider: 'Eunice Power', program: 'Variable Home', color: 'yellow', type: 'electricity', cat: 'B2C', url: 'https://www.eunicepower.gr/variable-home/' },
  { provider: 'Eunice Power', program: 'Green Home', color: 'orange', type: 'electricity', cat: 'B2C', url: 'https://www.eunicepower.gr/green-home/' },
  { provider: 'Eunice Power', program: 'Flex Business', color: 'green', type: 'electricity', cat: 'B2B', url: 'https://www.eunicepower.gr/flex-business/' },
];

// Group by provider for chunked inserts
const byProvider = {};
for (const p of programs) {
  if (!byProvider[p.provider]) byProvider[p.provider] = [];
  byProvider[p.provider].push(p);
}

let sql = `-- ============================================================
-- Migration: 20260822130000_reseed_all_provider_programs.sql
-- Re-seed ALL provider programs into energy_tariffs + energy_tariff_prices.
-- The consolidate_tariffs migration dropped market_tariffs and the
-- data was not preserved in the new tables.
-- ============================================================

-- Ensure tables exist (idempotent)
DO $$ BEGIN
  CREATE TYPE tariff_customer_type AS ENUM ('B2C', 'B2B');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE tariff_color_code AS ENUM ('green', 'blue', 'yellow', 'orange');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE tariff_energy_type AS ENUM ('electricity', 'gas', 'solar');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE tariff_verification_status AS ENUM ('verified', 'needs_review', 'unverified', 'rejected');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_energy_tariffs_provider ON energy_tariffs(provider_name);
CREATE INDEX IF NOT EXISTS idx_energy_tariffs_customer ON energy_tariffs(customer_type);
CREATE INDEX IF NOT EXISTS idx_energy_tariffs_color ON energy_tariffs(tariff_color);
CREATE INDEX IF NOT EXISTS idx_energy_tariffs_active ON energy_tariffs(is_active);
CREATE INDEX IF NOT EXISTS idx_tariff_prices_tariff_id ON energy_tariff_prices(tariff_id);
CREATE INDEX IF NOT EXISTS idx_tariff_prices_validity ON energy_tariff_prices(validity_from, validity_until);

-- RLS
ALTER TABLE energy_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_tariff_prices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated read energy_tariffs" ON energy_tariffs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manage energy_tariffs" ON energy_tariffs FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated read energy_tariff_prices" ON energy_tariff_prices FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manage energy_tariff_prices" ON energy_tariff_prices FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- STEP B: Seed all provider programs (UPSERT)
-- ============================================================
`;

// Generate INSERT statements per provider
for (const [provider, progs] of Object.entries(byProvider)) {
  const values = progs.map(p =>
    `  ('${p.provider.replace(/'/g, "''")}', '${p.program.replace(/'/g, "''")}', '${p.cat}', '${p.color}'::tariff_color_code, '${p.type}'::tariff_energy_type, '${p.url}', true)`
  ).join(',\n');

  sql += `\n-- ${provider} (${progs.length} programs)\n`;
  sql += `INSERT INTO energy_tariffs (provider_name, program_name, customer_type, tariff_color, energy_type, official_url, is_active)\nVALUES\n${values}\n`;
  sql += `ON CONFLICT (provider_name, program_name) DO UPDATE SET\n  official_url = EXCLUDED.official_url,\n  tariff_color = EXCLUDED.tariff_color,\n  energy_type = EXCLUDED.energy_type,\n  is_active = true,\n  updated_at = NOW();\n`;
}

// Step C: Create price records for all tariffs
sql += `
-- ============================================================
-- STEP C: Create price records (one per tariff, current date)
-- ============================================================
INSERT INTO energy_tariff_prices (tariff_id, unit_rate_kwh, fixed_fee_monthly, validity_from, verification_status, source_url)
SELECT
  et.id,
  CASE
    WHEN et.tariff_color = 'green'  THEN 0.0950
    WHEN et.tariff_color = 'blue'   THEN 0.1100
    WHEN et.tariff_color = 'yellow' THEN 0.1250
    WHEN et.tariff_color = 'orange' THEN 0.1400
    ELSE 0.1100
  END AS unit_rate_kwh,
  CASE
    WHEN et.customer_type = 'B2B' THEN 0.00
    ELSE 5.00
  END AS fixed_fee_monthly,
  CURRENT_DATE AS validity_from,
  'needs_review'::tariff_verification_status AS verification_status,
  et.official_url AS source_url
FROM energy_tariffs et
WHERE et.is_active = true
ON CONFLICT (tariff_id, validity_from) DO UPDATE SET
  source_url = EXCLUDED.source_url;

-- ============================================================
-- RPC: get_active_tariff_prices (ensure it exists)
-- ============================================================
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
-- Also recreate market_tariffs as a read-only view for
-- any legacy queries that might still reference it
-- ============================================================
DROP VIEW IF EXISTS market_tariffs_view CASCADE;
CREATE VIEW market_tariffs_view AS
SELECT
  et.id,
  et.provider_name,
  et.program_name,
  et.customer_type::TEXT AS customer_type,
  et.tariff_color::TEXT AS tariff_color,
  et.energy_type::TEXT AS energy_type,
  et.official_url AS source_url,
  et.is_active,
  etp.unit_rate_kwh,
  etp.fixed_fee_monthly,
  etp.validity_from,
  etp.verification_status::TEXT AS verification_status,
  et.created_at
FROM energy_tariffs et
LEFT JOIN LATERAL (
  SELECT * FROM energy_tariff_prices
  WHERE tariff_id = et.id
  ORDER BY validity_from DESC LIMIT 1
) etp ON true
WHERE et.is_active = true;
`;

const outPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260822130000_reseed_all_provider_programs.sql');
fs.writeFileSync(outPath, sql, 'utf-8');
console.log(`Written ${sql.length} bytes to ${outPath}`);
