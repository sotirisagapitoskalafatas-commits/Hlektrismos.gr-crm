-- ============================================================
-- B2B scraper settings + energy provider catalog alignment
--
-- 1. crm_settings holds integration secrets (SMTP, Infobip, and now
--    SerpApi). Restrict it to admin/manager instead of every
--    authenticated user, and expose the scraper config through RPCs so
--    the private key never reaches a browser.
-- 2. Seed the b2b_scraper_config + SERPAPI_KEY rows the scrape-b2b
--    edge function reads.
-- 3. Add the aliases/providers that let the labels in
--    src/constants/energyData.ts resolve to providers rows.
-- ============================================================

-- ─── 1. crm_settings RLS: staff-wide → admin/manager only ───
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_auth_all" ON public.crm_settings;
DROP POLICY IF EXISTS "Authenticated full access crm_settings" ON public.crm_settings;
DROP POLICY IF EXISTS "crm_settings_admin_all" ON public.crm_settings;

CREATE POLICY "crm_settings_admin_all" ON public.crm_settings
  FOR ALL
  USING (public.is_role('admin') OR public.is_role('manager'))
  WITH CHECK (public.is_role('admin') OR public.is_role('manager'));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'crm_settings' AND policyname = 'service_role_settings'
  ) THEN
    CREATE POLICY "service_role_settings" ON public.crm_settings
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ─── 2. Scraper settings rows ───
INSERT INTO public.crm_settings (setting_key, setting_value, category, description) VALUES
  ('b2b_scraper_config',
   '{"max_results":20,"rate_limit_per_minute":10,"auto_import":false,"default_region":"Αττική","default_category":"energy"}'::jsonb,
   'scraper', 'B2B scraper defaults (search page + settings)'),
  ('SERPAPI_KEY', '""'::jsonb, 'scraper', 'SerpApi private key — read server-side by scrape-b2b')
ON CONFLICT (setting_key) DO NOTHING;

-- ─── 3. Scraper settings RPCs (key stays server-side) ───
CREATE OR REPLACE FUNCTION public.crm_scraper_settings()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.is_role('admin') OR public.is_role('manager') THEN jsonb_build_object(
      'key_set', coalesce(btrim(
        (SELECT setting_value #>> '{}' FROM public.crm_settings WHERE setting_key = 'SERPAPI_KEY')
      ), '') <> '',
      'config', coalesce(
        (SELECT setting_value FROM public.crm_settings WHERE setting_key = 'b2b_scraper_config'),
        '{}'::jsonb)
    )
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.crm_set_scraper_config(p_config jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_role('admin') OR public.is_role('manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.crm_settings (setting_key, setting_value, category, description)
  VALUES ('b2b_scraper_config', coalesce(p_config, '{}'::jsonb), 'scraper', 'B2B scraper defaults')
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = excluded.setting_value, updated_at = now();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.crm_set_scraper_key(p_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_role('admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF coalesce(btrim(p_key), '') = '' THEN
    RAISE EXCEPTION 'empty key';
  END IF;
  INSERT INTO public.crm_settings (setting_key, setting_value, category, description)
  VALUES ('SERPAPI_KEY', to_jsonb(btrim(p_key)), 'scraper', 'SerpApi private key — read server-side by scrape-b2b')
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = excluded.setting_value, updated_at = now();
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.crm_scraper_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_set_scraper_config(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_set_scraper_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_scraper_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_set_scraper_config(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_set_scraper_key(text) TO authenticated;

-- ─── 4. Provider catalog: aliases for the labels used in the UI ───
-- resolveProviderId() matches on name, slug or metadata.aliases, so the
-- accented/legacy spellings need to be listed explicitly.
UPDATE public.providers
   SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{aliases}',
        '["ZeniΘ","Zenith","ΖΕΝΙΘ","Ζενιθ"]'::jsonb)
 WHERE slug = 'zenith';

UPDATE public.providers
   SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{aliases}',
        '["ΕΛΙΝ","Ελίν","Ελιν","ELIN"]'::jsonb)
 WHERE slug = 'elin';

UPDATE public.providers
   SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{aliases}',
        '["Φυσικό Αέριο","Φυσικό Αέριο Αττικής","ΦΑ Ελλάδος"]'::jsonb)
 WHERE slug = 'fge';

UPDATE public.providers
   SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{aliases}', '["nrg","NRG Energy"]'::jsonb)
 WHERE slug = 'nrg';

UPDATE public.providers
   SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{aliases}', '["ΔΕΗ","PPC","DEI"]'::jsonb)
 WHERE slug = 'dei';

UPDATE public.providers
   SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{aliases}', '["ΗΡΩΝ","Heron","HERON"]'::jsonb)
 WHERE slug = 'iron';

-- Providers present in the energy catalog but missing from the CRM catalog.
-- providers is read through `organization_id = crm_current_organization_id()`,
-- so new rows join the organization the existing catalog belongs to.
INSERT INTO public.providers (organization_id, name, slug, category, metadata)
SELECT (SELECT organization_id FROM public.providers WHERE organization_id IS NOT NULL LIMIT 1),
       'Enerwave', 'enerwave', 'electricity', '{"aliases":["Enerwave Energy"]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.providers WHERE slug = 'enerwave')
  AND EXISTS (SELECT 1 FROM public.providers WHERE organization_id IS NOT NULL);

INSERT INTO public.providers (organization_id, name, slug, category, metadata)
SELECT (SELECT organization_id FROM public.providers WHERE organization_id IS NOT NULL LIMIT 1),
       'Eunice Power', 'eunice-power', 'electricity', '{"aliases":["Eunice","Eunice Energy Group"]}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.providers WHERE slug = 'eunice-power')
  AND EXISTS (SELECT 1 FROM public.providers WHERE organization_id IS NOT NULL);
