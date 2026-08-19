-- Store SerpApi key in crm_settings
INSERT INTO crm_settings (setting_key, setting_value, category, description) VALUES
  ('SERPAPI_KEY', '"927a772fac6eee276b4fbed5533819e9449b40ec20f9364d348e31f4d082177c"'::jsonb, 'scraper', 'SerpApi Private API Key for Google Maps scraping')
ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value;
