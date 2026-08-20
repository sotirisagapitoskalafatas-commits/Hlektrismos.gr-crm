-- Fix: Re-add anonymous INSERT policy for landing page form submissions
-- Date: 2026-08-20

-- Drop all existing leads policies to rebuild cleanly
DROP POLICY IF EXISTS "leads_admin_full" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_sales_own" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_secretary_read" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_it_read" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_anon_insert" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_auth_read" ON hlektrismos_leads;
DROP POLICY IF EXISTS "superuser_leads" ON hlektrismos_leads;

-- Admin/management: full CRUD via authenticated users in crm_users
CREATE POLICY "leads_admin_full" ON hlektrismos_leads FOR ALL USING (
  auth.role() = 'authenticated'
  AND EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role IN ('admin', 'management'))
);

-- Anonymous users: INSERT with consent=true (landing page form)
CREATE POLICY "leads_anon_insert" ON hlektrismos_leads FOR INSERT WITH CHECK (consent = true);

-- All authenticated users can read leads
CREATE POLICY "leads_auth_read" ON hlektrismos_leads FOR SELECT USING (auth.role() = 'authenticated');

-- Sales: only their assigned leads (SELECT)
CREATE POLICY "leads_sales_own" ON hlektrismos_leads FOR SELECT USING (
  auth.role() = 'authenticated'
  AND EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role = 'sales')
  AND (assigned_to = auth.uid() OR assigned_to IS NULL)
);

-- Superuser bypass for Edge Functions
CREATE POLICY "superuser_leads" ON hlektrismos_leads FOR ALL USING (auth.role() = 'service_role');
