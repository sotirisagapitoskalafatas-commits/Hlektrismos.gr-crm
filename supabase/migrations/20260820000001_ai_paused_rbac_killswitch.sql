-- Migration: Add ai_paused kill switch + RBAC role column + campaign approval queue
-- Date: 2026-08-20

-- 1. Kill Switch: ai_paused on leads
ALTER TABLE hlektrismos_leads ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN DEFAULT FALSE;

-- 2. RBAC: role column on crm_users (admin, management, sales, secretary, it)
ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'sales';
CREATE INDEX IF NOT EXISTS idx_crm_users_role ON crm_users(role);

-- 3. Campaign approval queue: status column
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'auto';
-- approval_status: 'auto' (send immediately), 'draft' (needs approval), 'approved' (human approved), 'rejected'
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 4. Seed default crm_settings for RBAC if not exists
INSERT INTO crm_settings (setting_key, setting_value, category, description)
VALUES ('rbac_config', '{"default_role": "sales", "roles": ["admin", "management", "sales", "secretary", "it"]}'::jsonb, 'security', 'RBAC role configuration')
ON CONFLICT (setting_key) DO NOTHING;

-- 5. RLS: sales users can only see their own leads
-- (Applied via application logic, not RLS, since lead assignment is dynamic)
