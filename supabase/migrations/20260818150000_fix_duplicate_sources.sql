-- Clean up duplicate lead_sources and add unique constraint
DELETE FROM lead_sources WHERE ctid NOT IN (
  SELECT MIN(ctid) FROM lead_sources GROUP BY name
);

-- Add unique constraint to prevent future duplicates
DO $$ BEGIN
  ALTER TABLE lead_sources ADD CONSTRAINT lead_sources_name_unique UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
