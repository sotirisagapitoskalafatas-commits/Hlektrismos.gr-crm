-- crm_settings: Persistent key-value store for all CRM configuration
-- Each setting is a JSONB value keyed by a unique string

CREATE TABLE IF NOT EXISTS crm_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_settings_key ON crm_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_crm_settings_category ON crm_settings(category);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_crm_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_crm_settings_updated_at ON crm_settings;
CREATE TRIGGER trigger_update_crm_settings_updated_at
  BEFORE UPDATE ON crm_settings
  FOR EACH ROW EXECUTE FUNCTION update_crm_settings_updated_at();

-- RLS
ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated full access crm_settings' AND tablename = 'crm_settings') THEN
    CREATE POLICY "Authenticated full access crm_settings" ON crm_settings FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access crm_settings' AND tablename = 'crm_settings') THEN
    CREATE POLICY "Service role full access crm_settings" ON crm_settings FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Seed default settings for all 15 categories
INSERT INTO crm_settings (setting_key, setting_value, category, description) VALUES
-- 1. Dashboard
('dashboard_widget_layout', '{"kpi_cards": true, "recent_leads": true, "agent_status": true, "quick_actions": true, "refresh_interval": 30}', 'dashboard', 'Widget layout and refresh rates'),
('dashboard_kpi_targets', '{"monthly_leads": 100, "conversion_rate": 15, "meetings_per_week": 10}', 'dashboard', 'Default KPI targets'),

-- 2. AI Agents
('ai_agent_governance', '{"default_model": "gemini-3.6-flash", "max_tokens_per_agent": 4096, "temperature": 0.7, "greek_language_only": true, "spending_cap_monthly": 500}', 'agents', 'Global AI agent governance rules'),

-- 3. Leads Pipeline
('leads_pipeline_config', '{"stages": ["new","contacted","qualified","converted","lost"], "auto_assign": true, "dedup_enabled": true, "sla_hours": 48, "assignment_strategy": "round_robin"}', 'leads', 'Pipeline stages and auto-assignment'),

-- 4. Lead Sources
('lead_sources_config', '{"webhook_enabled": true, "quality_scoring": true, "auto_tag": true}', 'sources', 'Lead ingestion settings'),

-- 5. Market RAG
('market_rag_config', '{"embedding_model": "text-embedding-3-small", "index_schedule": "daily", "sources": ["DAPEEP","PX","provider_websites"]}', 'market', 'Knowledge base and vector settings'),

-- 6. Agent Hub
('agent_hub_config', '{"mcp_tools_enabled": true, "memory_limit_messages": 100, "session_timeout_minutes": 60, "streaming_enabled": true}', 'hub', 'Agent Hub capabilities'),

-- 7. Orchestrator
('orchestrator_config', '{"autonomy_level": "supervised", "human_in_loop": true, "kill_switch": false, "max_parallel_agents": 5}', 'orchestrator', 'Master orchestrator settings'),

-- 8. General Business
('business_profile', '{"company_name": "Hlektrismos.gr", "afm": "", "gemi": "", "doy": "", "vat_rate": 24, "phone": "+30 210 1234567", "email": "info@hlektrismos.gr", "address": "Αθήνα, Ελλάδα", "operating_hours": "Δευ-Παρ 09:00-17:00"}', 'general', 'Company details and business info'),

-- 9. Reports
('reports_config', '{"auto_dispatch": true, "dispatch_day": "monday", "export_format": "pdf", "metrics": ["leads","conversion","revenue","agent_performance"]}', 'reports', 'Report generation settings'),

-- 10. Users & RBAC
('users_rbac_config', '{"default_role": "sales", "two_factor_enabled": false, "session_timeout_minutes": 30, "max_login_attempts": 5}', 'users', 'User roles and access control'),

-- 11. B2B Scraper
('b2b_scraper_config', '{"apify_token": "", "google_maps_key": "", "custom_search_id": "", "max_results": 20, "rate_limit_per_minute": 10, "auto_import": false}', 'scraper', 'B2B scraping engine config'),

-- 12. Appearance & Branding
('appearance_config', '{"primary_color": "#0066cc", "secondary_color": "#00c878", "bg_color": "#ffffff", "surface_color": "#f8fafc", "theme_mode": "light", "logo_url": "", "favicon_url": "", "layout_density": "comfortable"}', 'appearance', 'Theme and UI customization'),

-- 13. Energy Tariffs & Suppliers
('energy_tariffs_config', '{"providers": ["ΔΕΗ","Protergia","ΗΡΩΝ","Elpedison","NRG","Volton"], "regulated_charges": {"DEDDIE": 0.00452, "ADMIE": 0.003, "ETMEAR": 0.001}, "price_tiers": {"green": 0.08, "blue": 0.10, "yellow": 0.12, "orange": 0.15}}', 'tariffs', 'Energy suppliers and tariff formulas'),

-- 14. Communications (SMS/Viber/PBX)
('communications_config', '{"sms_gateway": "", "sms_api_key": "", "viber_enabled": false, "viber_api_key": "", "pbx_provider": "", "pbx_sip_server": "", "email_smtp_host": "", "email_smtp_port": 587, "email_dkim_enabled": false}', 'communications', 'Telephony and messaging gateways'),

-- 15. Security & GDPR
('security_config', '{"gdpr_auto_anonymize": true, "audit_log_enabled": true, "ip_whitelist": [], "consent_log_retention_days": 730, "right_to_be_forgotten": true}', 'security', 'Security audit and GDPR compliance')

ON CONFLICT (setting_key) DO NOTHING;
