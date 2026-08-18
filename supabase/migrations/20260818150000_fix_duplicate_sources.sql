-- Clean up duplicate lead_sources and add unique constraint
DELETE FROM lead_sources WHERE ctid NOT IN (
  SELECT MIN(ctid) FROM lead_sources GROUP BY name
);

-- Add unique constraint to prevent future duplicates (guard against already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_sources_name_unique'
  ) THEN
    ALTER TABLE lead_sources ADD CONSTRAINT lead_sources_name_unique UNIQUE (name);
  END IF;
END $$;
