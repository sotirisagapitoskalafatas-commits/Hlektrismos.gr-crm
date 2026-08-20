-- Fix: infinite recursion in crm_users and leads RLS policies
-- The crm_users policies queried crm_users from within itself, causing recursion.
-- All leads/campaigns/agents/settings/notes policies also queried crm_users, triggering it.
-- Solution: Use auth.role() only, no cross-table queries in RLS policies.

-- 1. crm_users: drop recursive policies
DROP POLICY IF EXISTS "crm_users_admin_manage" ON crm_users;
DROP POLICY IF EXISTS "crm_users_read_all" ON crm_users;
DROP POLICY IF EXISTS "crm_users_self_read" ON crm_users;
DROP POLICY IF EXISTS "crm_users_self_update" ON crm_users;
DROP POLICY IF EXISTS "superuser_crm_users" ON crm_users;
CREATE POLICY "crm_users_self_read" ON crm_users FOR SELECT USING (id = auth.uid());
CREATE POLICY "crm_users_self_update" ON crm_users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "superuser_crm_users" ON crm_users FOR ALL USING (auth.role() = 'service_role');

-- 2. hlektrismos_leads: drop all, rebuild without crm_users queries
DROP POLICY IF EXISTS "leads_admin_full" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_sales_own" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_secretary_read" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_it_read" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_anon_insert" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_auth_read" ON hlektrismos_leads;
DROP POLICY IF EXISTS "leads_auth_all" ON hlektrismos_leads;
DROP POLICY IF EXISTS "superuser_leads" ON hlektrismos_leads;
CREATE POLICY "leads_anon_insert" ON hlektrismos_leads FOR INSERT WITH CHECK (consent = true);
CREATE POLICY "leads_auth_all" ON hlektrismos_leads FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "superuser_leads" ON hlektrismos_leads FOR ALL USING (auth.role() = 'service_role');

-- 3. campaigns
DROP POLICY IF EXISTS "campaigns_admin_manage" ON campaigns;
DROP POLICY IF EXISTS "campaigns_read_all" ON campaigns;
DROP POLICY IF EXISTS "campaigns_auth_all" ON campaigns;
DROP POLICY IF EXISTS "superuser_campaigns" ON campaigns;
CREATE POLICY "campaigns_auth_all" ON campaigns FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "superuser_campaigns" ON campaigns FOR ALL USING (auth.role() = 'service_role');

-- 4. ai_agents
DROP POLICY IF EXISTS "agents_admin_manage" ON ai_agents;
DROP POLICY IF EXISTS "agents_read_all" ON ai_agents;
DROP POLICY IF EXISTS "agents_auth_all" ON ai_agents;
DROP POLICY IF EXISTS "superuser_agents" ON ai_agents;
CREATE POLICY "agents_auth_all" ON ai_agents FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "superuser_agents" ON ai_agents FOR ALL USING (auth.role() = 'service_role');

-- 5. crm_settings
DROP POLICY IF EXISTS "settings_admin_write" ON crm_settings;
DROP POLICY IF EXISTS "settings_read_all" ON crm_settings;
DROP POLICY IF EXISTS "settings_auth_read" ON crm_settings;
DROP POLICY IF EXISTS "superuser_settings" ON crm_settings;
CREATE POLICY "settings_auth_all" ON crm_settings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "superuser_settings" ON crm_settings FOR ALL USING (auth.role() = 'service_role');

-- 6. lead_notes
DROP POLICY IF EXISTS "notes_read_all" ON lead_notes;
DROP POLICY IF EXISTS "notes_insert" ON lead_notes;
DROP POLICY IF EXISTS "notes_auth_all" ON lead_notes;
DROP POLICY IF EXISTS "superuser_notes" ON lead_notes;
CREATE POLICY "notes_auth_all" ON lead_notes FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "superuser_notes" ON lead_notes FOR ALL USING (auth.role() = 'service_role');

-- 7. calendar_events
DROP POLICY IF EXISTS "calendar_read_all" ON calendar_events;
DROP POLICY IF EXISTS "calendar_manage" ON calendar_events;
DROP POLICY IF EXISTS "calendar_auth_all" ON calendar_events;
DROP POLICY IF EXISTS "superuser_calendar" ON calendar_events;
CREATE POLICY "calendar_auth_all" ON calendar_events FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "superuser_calendar" ON calendar_events FOR ALL USING (auth.role() = 'service_role');
