-- Add agent_type to sales_agents (employee vs external contractor)
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS agent_type text NOT NULL DEFAULT 'employee'
  CHECK (agent_type IN ('employee', 'contractor'));

-- Add target_providers if missing
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS target_providers jsonb DEFAULT '[]'::jsonb;
