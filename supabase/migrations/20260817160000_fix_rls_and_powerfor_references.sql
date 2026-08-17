-- Fix RLS policies for hlektrismos_leads (update/insert blocked by RLS)
-- Fix remaining PowerFor references

-- Allow authenticated users to UPDATE leads (needed for soft delete, status changes, assignment)
DROP POLICY IF EXISTS "Authenticated can update leads" ON public.hlektrismos_leads;
CREATE POLICY "Authenticated can update leads"
  ON public.hlektrismos_leads
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to INSERT leads (needed for B2B scraper import)
DROP POLICY IF EXISTS "Authenticated can insert leads" ON public.hlektrismos_leads;
CREATE POLICY "Authenticated can insert leads"
  ON public.hlektrismos_leads
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow anon to INSERT leads (needed for landing page form)
DROP POLICY IF EXISTS "Anon can insert leads" ON public.hlektrismos_leads;
CREATE POLICY "Anon can insert leads"
  ON public.hlektrismos_leads
  FOR INSERT
  TO anon
  WITH CHECK (true);
