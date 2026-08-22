-- ============================================================
-- Migration: 20260821060000_entity_supply_and_docs.sql
-- Supply points (αριθμοί παροχής) per entity + document tracking
-- ============================================================

-- ─── ENUMS ─────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE supply_point_status AS ENUM ('active','pending','inactive','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE entity_document_type AS ENUM ('ID','E9','RENTAL_CONTRACT','CURRENT_BILL','OFFER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── TABLE 1: supply_points (Αριθμοί Παροχής) ─────────────────
-- A single customer/lead can have multiple supply numbers.
-- Each supply number is linked to a specific sales agent for commission tracking.
CREATE TABLE IF NOT EXISTS supply_points (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL,
  entity_type         TEXT NOT NULL CHECK (entity_type IN ('lead','customer')),
  supply_number       TEXT NOT NULL,                          -- Αριθμός Παροχής
  provider_name       TEXT,                                   -- Πάροχος
  program_name        TEXT,                                   -- Πρόγραμμα
  sales_agent_id      UUID REFERENCES public.sales_agents(id) ON DELETE SET NULL,
  status              supply_point_status NOT NULL DEFAULT 'pending',
  estimated_commission NUMERIC(10,2) DEFAULT 0.00,            -- Εκτιμώμενο προμήθεια (€)
  monthly_cost        NUMERIC(10,2),                          -- Εκτίμηση μηνιαίου κόστους
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supply_points_entity ON supply_points(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_supply_points_agent ON supply_points(sales_agent_id);
CREATE INDEX IF NOT EXISTS idx_supply_points_number ON supply_points(supply_number);

ALTER TABLE supply_points ENABLE ROW LEVEL SECURITY;

-- RLS: same pattern as other tables (JWT-based via app_metadata.role)
DROP POLICY IF EXISTS sp_service_role ON supply_points;
CREATE POLICY sp_service_role ON supply_points FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS sp_admin_full ON supply_points;
CREATE POLICY sp_admin_full ON supply_points FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','management'));

DROP POLICY IF EXISTS sp_sales_access ON supply_points;
CREATE POLICY sp_sales_access ON supply_points FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'sales');

DROP POLICY IF EXISTS sp_hr_read ON supply_points;
CREATE POLICY sp_hr_read ON supply_points FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'hr');

DROP POLICY IF EXISTS sp_it_read ON supply_points;
CREATE POLICY sp_it_read ON supply_points FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'it');

DROP POLICY IF EXISTS sp_secretary_read ON supply_points;
CREATE POLICY sp_secretary_read ON supply_points FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'secretary');

-- ─── TABLE 2: entity_documents (Έγγραφα) ──────────────────────
-- Store document metadata per lead/customer (Ταυτότητα, E9, Μισθωτήριο, etc.)
CREATE TABLE IF NOT EXISTS entity_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('lead','customer')),
  document_type   entity_document_type NOT NULL,
  file_name       TEXT,
  file_url        TEXT NOT NULL,
  file_size_bytes INT,
  uploaded_by     UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_docs_entity ON entity_documents(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_docs_type ON entity_documents(document_type);

ALTER TABLE entity_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ed_service_role ON entity_documents;
CREATE POLICY ed_service_role ON entity_documents FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS ed_admin_full ON entity_documents;
CREATE POLICY ed_admin_full ON entity_documents FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','management'));

DROP POLICY IF EXISTS ed_sales_access ON entity_documents;
CREATE POLICY ed_sales_access ON entity_documents FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'sales');

DROP POLICY IF EXISTS ed_hr_read ON entity_documents;
CREATE POLICY ed_hr_read ON entity_documents FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'hr');

DROP POLICY IF EXISTS ed_it_read ON entity_documents;
CREATE POLICY ed_it_read ON entity_documents FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'it');

DROP POLICY IF EXISTS ed_secretary_read ON entity_documents;
CREATE POLICY ed_secretary_read ON entity_documents FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'secretary');

-- ─── RPC: upsert_supply_point ─────────────────────────────────
-- Helper to add or update a supply point for a given entity
CREATE OR REPLACE FUNCTION upsert_supply_point(
  p_entity_id UUID,
  p_entity_type TEXT,
  p_supply_number TEXT,
  p_provider_name TEXT DEFAULT NULL,
  p_program_name TEXT DEFAULT NULL,
  p_sales_agent_id UUID DEFAULT NULL,
  p_estimated_commission NUMERIC DEFAULT 0.00,
  p_monthly_cost NUMERIC DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO supply_points (
    entity_id, entity_type, supply_number, provider_name,
    program_name, sales_agent_id, estimated_commission, monthly_cost
  ) VALUES (
    p_entity_id, p_entity_type, p_supply_number, p_provider_name,
    p_program_name, p_sales_agent_id, p_estimated_commission, p_monthly_cost
  )
  ON CONFLICT (supply_number) DO UPDATE SET
    entity_id = EXCLUDED.entity_id,
    entity_type = EXCLUDED.entity_type,
    provider_name = COALESCE(EXCLUDED.provider_name, supply_points.provider_name),
    program_name = COALESCE(EXCLUDED.program_name, supply_points.program_name),
    sales_agent_id = COALESCE(EXCLUDED.sales_agent_id, supply_points.sales_agent_id),
    estimated_commission = EXCLUDED.estimated_commission,
    monthly_cost = EXCLUDED.monthly_cost,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── unique constraint on supply_number ────────────────────────
-- (ON CONFLICT above requires a unique index)
DO $$ BEGIN
  ALTER TABLE supply_points ADD CONSTRAINT uq_supply_number UNIQUE (supply_number);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Summary:
-- supply_points: Tracks αριθμοί παροχής per entity with agent assignment
-- entity_documents: Ταυτότητα, E9, Μισθωτήριο, Λογαριασμός, Προσφορά
-- upsert_supply_point RPC: Convenience insert/update by supply_number
-- JWT RLS policies for all 6 roles
-- ============================================================
