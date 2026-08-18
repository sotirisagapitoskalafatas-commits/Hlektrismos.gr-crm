-- Add bill_files JSONB column to support multiple file uploads per lead
-- Format: [{ path: string, name: string, type: string, size: number }]

ALTER TABLE hlektrismos_leads ADD COLUMN IF NOT EXISTS bill_files JSONB DEFAULT NULL;

-- Migrate existing single-file data to bill_files array format
UPDATE hlektrismos_leads
SET bill_files = jsonb_build_array(
  jsonb_build_object(
    'path', bill_file_path,
    'name', bill_file_name,
    'type', 'application/pdf',
    'size', 0
  )
)
WHERE bill_file_path IS NOT NULL AND bill_files IS NULL;

-- Add index for querying bill_files
CREATE INDEX IF NOT EXISTS idx_hlektrismos_leads_bill_files ON hlektrismos_leads USING gin (bill_files) WHERE bill_files IS NOT NULL;

-- RLS: authenticated can view bill_files (already covered by existing policies)
COMMENT ON COLUMN hlektrismos_leads.bill_files IS 'JSONB array of uploaded files: [{path, name, type, size}]';
