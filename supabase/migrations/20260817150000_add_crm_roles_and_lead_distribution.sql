-- Add user roles to the CRM system
-- Role types: secretary, sales, hr, it, management, admin

DO $$ BEGIN
  CREATE TYPE crm_role AS ENUM ('admin', 'management', 'sales', 'hr', 'it', 'secretary');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add role column to hlektrismos_leads for assignment tracking
ALTER TABLE hlektrismos_leads ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id);
ALTER TABLE hlektrismos_leads ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE hlektrismos_leads ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id);

-- Create a CRM users table to store role-specific info
CREATE TABLE IF NOT EXISTS crm_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role crm_role NOT NULL DEFAULT 'sales',
  full_name TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  max_leads INT DEFAULT 50, -- max leads this user can have assigned
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on crm_users
ALTER TABLE crm_users ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read all CRM users
DROP POLICY IF EXISTS "Authenticated can read CRM users" ON crm_users;
CREATE POLICY "Authenticated can read CRM users" ON crm_users
  FOR SELECT USING (auth.role() = 'authenticated');

-- Policy: authenticated users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON crm_users;
CREATE POLICY "Users can update own profile" ON crm_users
  FOR UPDATE USING (auth.uid() = id);

-- Policy: admins and management can manage all CRM users
DROP POLICY IF EXISTS "Admins can manage CRM users" ON crm_users;
CREATE POLICY "Admins can manage CRM users" ON crm_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM crm_users 
      WHERE id = auth.uid() AND role IN ('admin', 'management')
    )
  );

-- Function to auto-assign leads equally among sales agents
CREATE OR REPLACE FUNCTION distribute_leads_equally()
RETURNS TRIGGER AS $$
DECLARE
  next_agent_id UUID;
  agent_lead_count INT;
  min_leads INT;
BEGIN
  -- Only distribute if no assignment exists
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Find the sales agent with the fewest active leads
  SELECT cu.id, COUNT(hl.id) INTO next_agent_id, agent_lead_count
  FROM crm_users cu
  LEFT JOIN hlektrismos_leads hl ON hl.assigned_to = cu.id AND hl.deleted_at IS NULL
  WHERE cu.role = 'sales' AND cu.is_active = true
  GROUP BY cu.id
  ORDER BY agent_lead_count ASC, RANDOM()
  LIMIT 1;

  IF next_agent_id IS NOT NULL THEN
    NEW.assigned_to := next_agent_id;
    NEW.assigned_at := now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-assign new leads
DROP TRIGGER IF EXISTS auto_distribute_leads ON hlektrismos_leads;
CREATE TRIGGER auto_distribute_leads
  BEFORE INSERT ON hlektrismos_leads
  FOR EACH ROW
  EXECUTE FUNCTION distribute_leads_equally();

-- Function to manually reassign a lead
CREATE OR REPLACE FUNCTION reassign_lead(lead_id UUID, new_agent_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE hlektrismos_leads 
  SET assigned_to = new_agent_id, assigned_at = now(), assigned_by = auth.uid()
  WHERE id = lead_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get lead count per agent
CREATE OR REPLACE FUNCTION get_agent_lead_counts()
RETURNS TABLE(agent_id UUID, agent_name TEXT, lead_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cu.id as agent_id,
    COALESCE(cu.full_name, 'Unknown') as agent_name,
    COUNT(hl.id) as lead_count
  FROM crm_users cu
  LEFT JOIN hlektrismos_leads hl ON hl.assigned_to = cu.id AND hl.deleted_at IS NULL
  WHERE cu.role = 'sales' AND cu.is_active = true
  GROUP BY cu.id, cu.full_name
  ORDER BY lead_count ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add report read tracking
ALTER TABLE agent_reports ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE agent_reports ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE agent_reports ADD COLUMN IF NOT EXISTS read_by UUID REFERENCES auth.users(id);

-- Add file attachments support to reports
ALTER TABLE agent_reports ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE agent_reports ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE agent_reports ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

-- Index for faster lead assignment queries
CREATE INDEX IF NOT EXISTS idx_crm_users_role ON crm_users(role);
CREATE INDEX IF NOT EXISTS idx_hlektrismos_leads_assigned ON hlektrismos_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_agent_reports_read ON agent_reports(is_read);
