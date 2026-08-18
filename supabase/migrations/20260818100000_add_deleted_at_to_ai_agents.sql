-- Add soft delete support to ai_agents (mirrors hlektrismos_leads pattern)
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_agents_deleted_at ON ai_agents (deleted_at);
