-- ============================================================
-- Migration: 20260821050000_jwt_rls_policies.sql
-- Enforce JWT-based RLS on hlektrismos_leads, hlektrismos_customers,
-- and campaigns using app_metadata.role from auth.jwt().
--
-- CRITICAL: We never query crm_users inside RLS policies
-- (causes infinite recursion). The role is stored in
-- auth.users.raw_app_meta_data and read via auth.jwt().
-- ============================================================

-- ─── Helper: check if a role is in a given set ────────────────
-- Inline expression: (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','management',...)

-- ============================================================
-- 1. hlektrismos_leads
-- ============================================================
-- Drop ALL existing policies (some were recursive crm_users lookups)
DROP POLICY IF EXISTS "leads_auth_all"          ON hlektrismos_leads;
DROP POLICY IF EXISTS "superuser_leads"         ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_admin_full"        ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_auth_read"         ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_sales_own"         ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_secretary_read"    ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_it_read"           ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_leads_insert"      ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_service_role"      ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_public_insert"     ON hlektrismos_leads;

-- Service role (Edge Functions) — unrestricted
CREATE POLICY "leads_service_role"
  ON hlektrismos_leads FOR ALL
  USING (auth.role() = 'service_role');

-- Admin / Management — full access
CREATE POLICY "leads_admin_full"
  ON hlektrismos_leads FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role')
    IN ('admin', 'management')
  );

-- Sales — full access (assigned_to filtering is done at application layer)
CREATE POLICY "leads_sales_access"
  ON hlektrismos_leads FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  );

-- HR — read-only
CREATE POLICY "leads_hr_read"
  ON hlektrismos_leads FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'hr'
  );

-- IT — read-only
CREATE POLICY "leads_it_read"
  ON hlektrismos_leads FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'it'
  );

-- Secretary — read-only
CREATE POLICY "leads_secretary_read"
  ON hlektrismos_leads FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'secretary'
  );

-- Public insert (landing page contact form — anonymous)
CREATE POLICY "leads_public_insert"
  ON hlektrismos_leads FOR INSERT
  WITH CHECK (auth.role() = 'anon');

-- ============================================================
-- 2. hlektrismos_customers
-- ============================================================
DROP POLICY IF EXISTS "cust_auth_all"           ON hlektrismos_customers;
DROP POLICY IF EXISTS "cust_service"            ON hlektrismos_customers;
DROP POLICY IF EXISTS "customers_admin_full"    ON hlektrismos_customers;
DROP POLICY IF EXISTS "customers_sales_access"  ON hlektrismos_customers;
DROP POLICY IF EXISTS "customers_hr_read"       ON hlektrismos_customers;
DROP POLICY IF EXISTS "customers_it_read"       ON hlektrismos_customers;
DROP POLICY IF EXISTS "customers_secretary_read" ON hlektrismos_customers;

CREATE POLICY "customers_service_role"
  ON hlektrismos_customers FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "customers_admin_full"
  ON hlektrismos_customers FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role')
    IN ('admin', 'management')
  );

CREATE POLICY "customers_sales_access"
  ON hlektrismos_customers FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  );

CREATE POLICY "customers_hr_read"
  ON hlektrismos_customers FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'hr'
  );

CREATE POLICY "customers_it_read"
  ON hlektrismos_customers FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'it'
  );

CREATE POLICY "customers_secretary_read"
  ON hlektrismos_customers FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'secretary'
  );

-- ============================================================
-- 3. campaigns
-- ============================================================
DROP POLICY IF EXISTS "campaigns_auth_all"       ON campaigns;
DROP POLICY IF EXISTS "superuser_campaigns"     ON campaigns;
DROP POLICY IF EXISTS "campaigns_admin_manage"  ON campaigns;
DROP POLICY IF EXISTS "campaigns_read_all"      ON campaigns;
DROP POLICY IF EXISTS "campaigns_service_role"  ON campaigns;

CREATE POLICY "campaigns_service_role"
  ON campaigns FOR ALL
  USING (auth.role() = 'service_role');

-- Admin / Management — full access (create, approve, send)
CREATE POLICY "campaigns_admin_full"
  ON campaigns FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role')
    IN ('admin', 'management')
  );

-- Sales — read only (can view campaigns assigned to them)
CREATE POLICY "campaigns_sales_read"
  ON campaigns FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'sales'
  );

-- Secretary — read only
CREATE POLICY "campaigns_secretary_read"
  ON campaigns FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'secretary'
  );

-- HR — read only
CREATE POLICY "campaigns_hr_read"
  ON campaigns FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'hr'
  );

-- IT — read only
CREATE POLICY "campaigns_it_read"
  ON campaigns FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'it'
  );

-- ============================================================
-- Role Summary (per role):
--
--   admin        → full CRUD on leads, customers, campaigns
--   management   → full CRUD on leads, customers, campaigns
--   sales        → full CRUD on leads + customers; read campaigns
--   hr           → read-only on leads, customers, campaigns
--   it           → read-only on leads, customers, campaigns
--   secretary    → read-only on leads, customers, campaigns
--   anon         → insert-only on leads (landing page form)
--   service_role → unrestricted (Edge Functions)
-- ============================================================
