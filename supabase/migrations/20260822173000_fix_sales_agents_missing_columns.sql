-- Fix: ensure sales_agents has all required columns
-- The table was created without some columns that the frontend expects

ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS target_providers jsonb DEFAULT '[]'::jsonb;
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS commission_rate_pct numeric(5,2) DEFAULT 10;
ALTER TABLE sales_agents ADD COLUMN IF NOT EXISTS agent_type text DEFAULT 'employee';
ALTER TABLE sales_agents DROP CONSTRAINT IF EXISTS sales_agents_agent_type_check;
ALTER TABLE sales_agents ADD CONSTRAINT sales_agents_agent_type_check CHECK (agent_type IN ('employee', 'contractor'));
