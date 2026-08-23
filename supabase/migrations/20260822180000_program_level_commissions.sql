-- Per-program commissions: each agent can have different rates per provider AND per program
-- program_name NULL = provider-level default

ALTER TABLE agent_provider_commissions ADD COLUMN IF NOT EXISTS program_name text;

-- Replace old unique constraint with one that treats NULL program as ''
ALTER TABLE agent_provider_commissions DROP CONSTRAINT IF EXISTS agent_provider_commissions_agent_id_provider_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_provider_program
  ON agent_provider_commissions(agent_id, provider_name, COALESCE(program_name, ''));
