-- Ensure all sales_agents columns exist (table may have been created without some)
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS target_providers jsonb DEFAULT '[]'::jsonb;
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS commission_rate_pct numeric(5,2) DEFAULT 10;
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS agent_type text NOT NULL DEFAULT 'employee'
  CHECK (agent_type IN ('employee', 'contractor'));
