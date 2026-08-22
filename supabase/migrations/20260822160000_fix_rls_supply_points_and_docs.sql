-- Fix RLS for supply_points and entity_documents
-- All authenticated CRM users should be able to CRUD these tables

-- supply_points: drop restrictive policies, add authenticated full access
DO $$ BEGIN DROP POLICY IF EXISTS sp_admin_full ON supply_points; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS sp_sales_access ON supply_points; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS sp_hr_read ON supply_points; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS sp_it_read ON supply_points; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS sp_secretary_read ON supply_points; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS sp_service_role ON supply_points; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sp_auth_all' AND tablename = 'supply_points') THEN
    CREATE POLICY sp_auth_all ON supply_points
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- entity_documents: drop restrictive policies, add authenticated full access
DO $$ BEGIN DROP POLICY IF EXISTS ed_admin_full ON entity_documents; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS ed_sales_access ON entity_documents; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS ed_hr_read ON entity_documents; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS ed_it_read ON entity_documents; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS ed_secretary_read ON entity_documents; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS ed_service_role ON entity_documents; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'ed_auth_all' AND tablename = 'entity_documents') THEN
    CREATE POLICY ed_auth_all ON entity_documents
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
