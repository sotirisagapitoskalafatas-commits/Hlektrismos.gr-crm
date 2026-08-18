-- Restore GDPR consent enforcement on lead INSERT for anonymous users
-- Migration 10 removed this check; we restore it for compliance.
-- Wrapped in DO block for idempotency.

DO $$ BEGIN
  -- Drop the permissive anon INSERT policy (no consent check)
  DROP POLICY IF EXISTS "Allow anonymous inserts" ON hlektrismos_leads;

  -- Re-create with consent enforcement
  CREATE POLICY "Allow anonymous inserts" ON hlektrismos_leads
    FOR INSERT TO anon
    WITH CHECK (consent = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
