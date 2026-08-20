-- ============================================================
-- Migration: 20260820150000_smart_scraping_recommendations.sql
-- 1. source_type + audit on energy_tariff_prices
-- 2. monthly_kwh + consumption_kwh on hlektrismos_leads
-- 3. tariff_audit_log table
-- 4. tasks table for offer follow-ups
-- 5. RPC: recommend_tariffs(customer_type, monthly_kwh)
-- ============================================================

-- 1. Add source_type + edited_by to energy_tariff_prices
ALTER TABLE energy_tariff_prices
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual'
  CHECK (source_type IN ('manual', 'scraper')),
  ADD COLUMN IF NOT EXISTS edited_by TEXT;

-- 2. Add monthly_kwh + consumption_kwh to leads
ALTER TABLE hlektrismos_leads
  ADD COLUMN IF NOT EXISTS monthly_kwh NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consumption_kwh NUMERIC DEFAULT 0;

-- 3. tariff_audit_log
CREATE TABLE IF NOT EXISTS tariff_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_id UUID REFERENCES energy_tariffs(id) ON DELETE CASCADE,
  price_id UUID REFERENCES energy_tariff_prices(id) ON DELETE SET NULL,
  changed_by TEXT,
  old_price_day NUMERIC,
  new_price_day NUMERIC,
  old_fixed_fee NUMERIC,
  new_fixed_fee NUMERIC,
  change_reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tariff_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tal_auth_all ON tariff_audit_log;
CREATE POLICY tal_auth_all ON tariff_audit_log FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS tal_service ON tariff_audit_log;
CREATE POLICY tal_service ON tariff_audit_log FOR ALL USING (auth.role() = 'service_role');

-- 4. tasks table
CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES hlektrismos_leads(id) ON DELETE CASCADE,
  tariff_id UUID REFERENCES energy_tariffs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TIMESTAMPTZ DEFAULT (now() + interval '1 day'),
  assigned_to UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_auth_all ON crm_tasks;
CREATE POLICY tasks_auth_all ON crm_tasks FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS tasks_service ON crm_tasks;
CREATE POLICY tasks_service ON crm_tasks FOR ALL USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS tasks_anon_select ON crm_tasks;
CREATE POLICY tasks_anon_select ON crm_tasks FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_tasks_lead ON crm_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON crm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON crm_tasks(due_date);

-- 5. RPC: recommend_tariffs(p_customer_type, p_monthly_kwh)
-- Returns top 5 cheapest verified/active programs sorted by estimated monthly cost
CREATE OR REPLACE FUNCTION recommend_tariffs(
  p_customer_type TEXT DEFAULT 'B2C',
  p_monthly_kwh NUMERIC DEFAULT 300
)
RETURNS TABLE (
  tariff_id UUID,
  provider_name TEXT,
  program_name TEXT,
  tariff_color TEXT,
  energy_type TEXT,
  official_url TEXT,
  base_price_day NUMERIC,
  base_price_night NUMERIC,
  fixed_fee_monthly NUMERIC,
  discounted_price_day NUMERIC,
  discount_conditions TEXT,
  verification_status TEXT,
  estimated_monthly_cost NUMERIC,
  savings_vs_current NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    et.id,
    et.provider_name,
    et.program_name,
    et.tariff_color::TEXT,
    et.energy_type::TEXT,
    et.official_url,
    etp.base_price_day,
    etp.base_price_night,
    etp.fixed_fee_monthly,
    etp.discounted_price_day,
    etp.discount_conditions,
    etp.verification_status::TEXT,
    ROUND(
      (p_monthly_kwh * COALESCE(etp.discounted_price_day, etp.base_price_day, etp.unit_rate_kwh, 0))
      + COALESCE(etp.fixed_fee_monthly, 0),
      2
    ) AS estimated_monthly_cost,
    0::NUMERIC AS savings_vs_current
  FROM energy_tariffs et
  LEFT JOIN LATERAL (
    SELECT * FROM energy_tariff_prices
    WHERE tariff_id = et.id
      AND verification_status IN ('verified', 'needs_review')
    ORDER BY validity_from DESC
    LIMIT 1
  ) etp ON true
  WHERE et.is_active = true
    AND et.customer_type::TEXT = p_customer_type
    AND et.energy_type = 'electricity'
    AND etp.id IS NOT NULL
    AND etp.base_price_day IS NOT NULL
  ORDER BY estimated_monthly_cost ASC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;
