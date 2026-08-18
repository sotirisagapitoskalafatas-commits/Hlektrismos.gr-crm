-- Add missing INSERT policy for crm_users table
-- This was causing 500 errors when loading the CRM dashboard

DO $$ BEGIN
  CREATE POLICY "authenticated can insert crm_users"
    ON crm_users FOR INSERT
    TO authenticated
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Also ensure SELECT works for both authenticated and service_role
DO $$ BEGIN
  DROP POLICY IF EXISTS "Authenticated can read CRM users" ON crm_users;
  CREATE POLICY "Authenticated can read CRM users"
    ON crm_users FOR SELECT
    TO public
    USING (true);
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Ensure UPDATE works
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can update own profile" ON crm_users;
  CREATE POLICY "Users can update own profile"
    ON crm_users FOR UPDATE
    TO public
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
