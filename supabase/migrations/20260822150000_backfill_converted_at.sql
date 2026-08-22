-- Backfill converted_at for any leads that have status='customer' but no converted_at set
-- This ensures they appear in the Πελάτες tab
UPDATE hlektrismos_leads
SET converted_at = created_at
WHERE status = 'customer'
  AND converted_at IS NULL;

-- Also set converted_at for leads with customer-like pipeline stages that were already converted
-- (intro, active, awaiting_offer etc. are only set via EntityDetailWindow for leads-as-customers)
UPDATE hlektrismos_leads
SET converted_at = created_at,
    status = 'customer'
WHERE status IN ('intro', 'active', 'awaiting_offer', 'awaiting_signature', 'accepted', 'sent_to_provider', 'rejected')
  AND converted_at IS NULL;

-- Update CHECK constraint to allow all pipeline stage values used by EntityDetailWindow
DO $$
BEGIN
  ALTER TABLE hlektrismos_leads
    DROP CONSTRAINT IF EXISTS chk_lead_status;

  ALTER TABLE hlektrismos_leads
    ADD CONSTRAINT chk_lead_status CHECK (
      status IN (
        'new','contacted','qualified','converted','lost','lead','follow_up','customer',
        'intro','awaiting_offer','awaiting_signature','accepted','sent_to_provider','active','rejected',
        'docs_pending','submitted_to_provider','deddie_meter_reading',
        'proposal','won','follow_up'
      )
    );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
