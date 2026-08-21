-- Store SerpApi key reference in crm_settings
-- IMPORTANT: Set the actual key via: supabase secrets set SERPAPI_KEY=your_key
-- This migration creates a placeholder; update crm_settings after deploying secrets
INSERT INTO crm_settings (setting_key, setting_value, category, description) VALUES
  ('SERPAPI_KEY', '""'::jsonb, 'scraper', 'SerpApi Private API Key - set via Supabase Secrets')
ON CONFLICT (setting_key) DO NOTHING;
