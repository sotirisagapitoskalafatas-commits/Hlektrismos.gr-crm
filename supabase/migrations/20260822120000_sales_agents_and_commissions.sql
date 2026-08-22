-- Migration: Sales agents and commissions system
-- Adds service/source tracking to leads and customers,
-- creates sales agent, commission, attribution, ledger, and document vault tables.

-- 1. Enhance hlektrismos_leads table
ALTER TABLE hlektrismos_leads ADD COLUMN IF NOT EXISTS service_type text; -- 'Ρεύμα', 'Φυσικό Αέριο', 'Φωτοβολταϊκά', 'Ηλεκτροκίνηση'
ALTER TABLE hlektrismos_leads ADD COLUMN IF NOT EXISTS source text; -- 'website', 'facebook', 'instagram', 'linkedin', 'agent_direct', 'referral', 'google_maps_scrape', etc.
ALTER TABLE hlektrismos_leads ADD COLUMN IF NOT EXISTS government_id text;
ALTER TABLE hlektrismos_leads ADD COLUMN IF NOT EXISTS lead_source_details jsonb;

-- 2. Enhance hlektrismos_customers table
ALTER TABLE hlektrismos_customers ADD COLUMN IF NOT EXISTS service_type text;
ALTER TABLE hlektrismos_customers ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE hlektrismos_customers ADD COLUMN IF NOT EXISTS government_id text;
ALTER TABLE hlektrismos_customers ADD COLUMN IF NOT EXISTS supply_numbers jsonb DEFAULT '[]'::jsonb;

-- 3. Create sales_agents table
CREATE TABLE IF NOT EXISTS sales_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text,
  phone text,
  role text DEFAULT 'πωλητής',
  active boolean DEFAULT true,
  experience_years integer,
  languages text,
  responsibilities text,
  skills text,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sales_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on sales_agents" ON sales_agents FOR ALL USING (true);

-- 4. Create agent_provider_commissions table
CREATE TABLE IF NOT EXISTS agent_provider_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES sales_agents(id) ON DELETE CASCADE,
  provider_name text NOT NULL,
  fixed_rate numeric(10,2) DEFAULT 0, -- B2C fixed per signup
  per_kwh_rate numeric(10,6) DEFAULT 0, -- B2B per kWh
  created_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, provider_name)
);
ALTER TABLE agent_provider_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on agent_provider_commissions" ON agent_provider_commissions FOR ALL USING (true);

-- 5. Create customer_agent_attribution table
CREATE TABLE IF NOT EXISTS customer_agent_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  agent_id uuid REFERENCES sales_agents(id) ON DELETE SET NULL,
  customer_type text NOT NULL DEFAULT 'customer', -- 'lead' or 'customer'
  attribution_type text DEFAULT 'primary', -- 'primary', 'secondary', 'referral'
  commission_pct numeric(5,2) DEFAULT 100.00,
  notes text,
  created_at timestamptz DEFAULT now()
);
-- Add customer_type column if it doesn't exist (table may have been created by earlier migration)
DO $$ BEGIN
  ALTER TABLE customer_agent_attribution ADD COLUMN customer_type text NOT NULL DEFAULT 'customer';
EXCEPTION WHEN duplicate_column THEN null;
END $$;
ALTER TABLE customer_agent_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on customer_agent_attribution" ON customer_agent_attribution FOR ALL USING (true);

-- 6. Create customer_commissions_ledger table
CREATE TABLE IF NOT EXISTS customer_commissions_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  agent_id uuid REFERENCES sales_agents(id) ON DELETE SET NULL,
  provider_name text,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  status text DEFAULT 'pending', -- pending, approved, paid
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);
-- Add missing columns if table was created by earlier migration
DO $$ BEGIN ALTER TABLE customer_commissions_ledger ADD COLUMN status text DEFAULT 'pending'; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE customer_commissions_ledger ADD COLUMN approved_at timestamptz; EXCEPTION WHEN duplicate_column THEN null; END $$;
DO $$ BEGIN ALTER TABLE customer_commissions_ledger ADD COLUMN paid_at timestamptz; EXCEPTION WHEN duplicate_column THEN null; END $$;
ALTER TABLE customer_commissions_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on customer_commissions_ledger" ON customer_commissions_ledger FOR ALL USING (true);

-- 7. Create customer_documents table (for document vault)
CREATE TABLE IF NOT EXISTS customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  customer_type text NOT NULL DEFAULT 'customer',
  document_type text NOT NULL, -- 'ID', 'E9', 'RENTAL_CONTRACT', 'OUR_CONTRACT', 'CURRENT_BILL', 'PREVIOUS_BILL'
  file_name text,
  file_url text,
  file_size_bytes bigint,
  uploaded_by text,
  created_at timestamptz DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE customer_documents ADD COLUMN customer_type text NOT NULL DEFAULT 'customer';
EXCEPTION WHEN duplicate_column THEN null;
END $$;
ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on customer_documents" ON customer_documents FOR ALL USING (true);

-- 8. Create indexes (safe - wrap in exception handlers for existing tables)
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_sales_agents_active ON sales_agents(active); EXCEPTION WHEN undefined_column THEN null; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent ON agent_provider_commissions(agent_id); EXCEPTION WHEN undefined_column THEN null; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_customer_attribution_customer ON customer_agent_attribution(customer_id, customer_type); EXCEPTION WHEN undefined_column THEN null; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_commissions_ledger_status ON customer_commissions_ledger(status); EXCEPTION WHEN undefined_column THEN null; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_customer_documents_customer ON customer_documents(customer_id, customer_type); EXCEPTION WHEN undefined_column THEN null; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_hlektrismos_leads_service_type ON hlektrismos_leads(service_type); EXCEPTION WHEN undefined_column THEN null; END $$;
DO $$ BEGIN CREATE INDEX IF NOT EXISTS idx_hlektrismos_leads_source ON hlektrismos_leads(source); EXCEPTION WHEN undefined_column THEN null; END $$;

-- 9. Create calculate_commission_for_customer function
CREATE OR REPLACE FUNCTION calculate_commission_for_customer(
  p_customer_id uuid,
  p_agent_id uuid,
  p_provider_name text,
  p_monthly_kwh numeric DEFAULT 0
) RETURNS numeric AS $$
DECLARE
  v_fixed numeric;
  v_per_kwh numeric;
BEGIN
  SELECT fixed_rate, per_kwh_rate INTO v_fixed, v_per_kwh
  FROM agent_provider_commissions
  WHERE agent_id = p_agent_id AND provider_name = p_provider_name;

  IF NOT FOUND THEN RETURN 0; END IF;

  RETURN COALESCE(v_fixed, 0) + (COALESCE(v_per_kwh, 0) * COALESCE(p_monthly_kwh, 0));
END;
$$ LANGUAGE plpgsql;

-- 10. Seed default provider commissions
INSERT INTO crm_settings (setting_key, setting_value, category, description) VALUES
('provider_commissions', '{"ΔΕΗ":{"B2C":50,"B2B":0.006},"Protergia":{"B2C":90,"B2B":0.012},"ΗΡΩΝ":{"B2C":95,"B2B":0.011},"nrg":{"B2C":85,"B2B":0.010},"ZeniΘ":{"B2C":75,"B2B":0.008},"Volton":{"B2C":80,"B2B":0.010},"Φυσικό Αέριο":{"B2C":70,"B2B":0.008},"Ελίν":{"B2C":60,"B2B":0.007},"Enerwave":{"B2C":65,"B2B":0.008},"Eunice Power":{"B2C":70,"B2B":0.009}}'::jsonb, 'commissions', 'Default provider commission rates per customer type')
ON CONFLICT (setting_key) DO NOTHING;
