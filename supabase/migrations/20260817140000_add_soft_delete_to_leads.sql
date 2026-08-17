-- Add soft delete support to hlektrismos_leads
-- Applied manually via supabase db query --linked

ALTER TABLE public.hlektrismos_leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_hlektrismos_leads_deleted_at ON public.hlektrismos_leads (deleted_at);

-- Update RLS: replace restrictive delete policy with authenticated delete
DROP POLICY IF EXISTS "Leads are not publicly deletable" ON public.hlektrismos_leads;

CREATE POLICY "Authenticated can delete leads"
  ON public.hlektrismos_leads
  FOR DELETE
  TO authenticated
  USING (true);
