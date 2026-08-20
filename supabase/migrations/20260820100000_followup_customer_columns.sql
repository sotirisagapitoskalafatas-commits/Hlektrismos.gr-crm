-- ============================================================
-- Migration: Add follow-up & customer conversion columns to hlektrismos_leads
-- ============================================================

-- New status values: 'lead' (default), 'follow_up', 'customer', 'lost'
-- Existing statuses (new/contacted/qualified/converted) remain valid
ALTER TABLE hlektrismos_leads
  ADD COLUMN IF NOT EXISTS current_provider text,
  ADD COLUMN IF NOT EXISTS program_name text,
  ADD COLUMN IF NOT EXISTS unit_rate_kwh numeric,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;

-- Indexes for the new filterable columns
CREATE INDEX IF NOT EXISTS idx_leads_current_provider ON hlektrismos_leads(current_provider);
CREATE INDEX IF NOT EXISTS idx_leads_converted_at ON hlektrismos_leads(converted_at);
CREATE INDEX IF NOT EXISTS idx_leads_last_contact ON hlektrismos_leads(last_contact_at);

-- Add a CHECK constraint for valid follow-up statuses (optional — just documents intent)
-- We allow the full range: new, contacted, qualified, converted, lost, lead, follow_up, customer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_lead_status'
  ) THEN
    ALTER TABLE hlektrismos_leads
      ADD CONSTRAINT chk_lead_status CHECK (
        status IN ('new','contacted','qualified','converted','lost','lead','follow_up','customer')
      );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- If constraint fails (e.g. existing data has unexpected status), skip silently
  NULL;
END $$;

-- Comment for documentation
COMMENT ON COLUMN hlektrismos_leads.current_provider IS 'Current energy provider of the customer (e.g. ΔΕΗ, Protergia)';
COMMENT ON COLUMN hlektrismos_leads.program_name IS 'Specific tariff/program the customer is enrolled in';
COMMENT ON COLUMN hlektrismos_leads.unit_rate_kwh IS 'Customer''s unit rate in EUR/kWh from their current contract';
COMMENT ON COLUMN hlektrismos_leads.converted_at IS 'Timestamp when lead was converted to customer';
COMMENT ON COLUMN hlektrismos_leads.last_contact_at IS 'Timestamp of last contact (call, email, meeting)';
