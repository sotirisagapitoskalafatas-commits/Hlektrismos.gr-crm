-- Migration: RBAC RLS policies for role-based access
-- Date: 2026-08-20

-- 1. crm_users policies (id is UUID)
ALTER TABLE crm_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_users_admin_manage" ON crm_users FOR ALL USING (EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role IN ('admin', 'management')));
CREATE POLICY "crm_users_read_all" ON crm_users FOR SELECT USING (true);
CREATE POLICY "superuser_crm_users" ON crm_users FOR ALL USING (auth.role() = 'service_role');

-- 2. hlektrismos_leads policies
ALTER TABLE hlektrismos_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_admin_full" ON hlektrismos_leads FOR ALL USING (EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role IN ('admin', 'management')));
CREATE POLICY "leads_sales_own" ON hlektrismos_leads FOR SELECT USING (EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role = 'sales') AND (assigned_to = auth.uid() OR assigned_to IS NULL));
CREATE POLICY "leads_secretary_read" ON hlektrismos_leads FOR SELECT USING (EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role = 'secretary'));
CREATE POLICY "leads_it_read" ON hlektrismos_leads FOR SELECT USING (EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role = 'it'));
CREATE POLICY "superuser_leads" ON hlektrismos_leads FOR ALL USING (auth.role() = 'service_role');

-- 3. campaigns policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_admin_manage" ON campaigns FOR ALL USING (EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role IN ('admin', 'management')));
CREATE POLICY "campaigns_read_all" ON campaigns FOR SELECT USING (true);
CREATE POLICY "superuser_campaigns" ON campaigns FOR ALL USING (auth.role() = 'service_role');

-- 4. ai_agents policies
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents_admin_manage" ON ai_agents FOR ALL USING (EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role IN ('admin', 'management')));
CREATE POLICY "agents_read_all" ON ai_agents FOR SELECT USING (true);
CREATE POLICY "superuser_agents" ON ai_agents FOR ALL USING (auth.role() = 'service_role');

-- 5. crm_settings policies
ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_admin_write" ON crm_settings FOR ALL USING (EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "settings_read_all" ON crm_settings FOR SELECT USING (true);
CREATE POLICY "superuser_settings" ON crm_settings FOR ALL USING (auth.role() = 'service_role');

-- 6. lead_notes policies
ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes_read_all" ON lead_notes FOR SELECT USING (true);
CREATE POLICY "notes_insert" ON lead_notes FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role IN ('admin', 'management', 'sales', 'secretary')));
CREATE POLICY "superuser_notes" ON lead_notes FOR ALL USING (auth.role() = 'service_role');

-- 7. calendar_events policies
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_read_all" ON calendar_events FOR SELECT USING (true);
CREATE POLICY "calendar_manage" ON calendar_events FOR ALL USING (agent_id::uuid = auth.uid() OR EXISTS (SELECT 1 FROM crm_users WHERE id = auth.uid() AND role IN ('admin', 'management')));
CREATE POLICY "superuser_calendar" ON calendar_events FOR ALL USING (auth.role() = 'service_role');
