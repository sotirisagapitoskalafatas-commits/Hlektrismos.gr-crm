/*
# Multi-Agent Orchestrator: Memory, Skills, Reports, and Inter-Agent Communication

## 1. ai_agents — new columns
- `custom_api_key` (text, nullable): per-agent Gemini API key override
- `skills` (jsonb, default '[]'): array of skill objects the agent possesses
- `personality` (text, nullable): agent personality description for richer interactions
- `report_summary` (text, nullable): latest auto-generated performance report

## 2. New table: agent_memory
Stores conversation history so agents can "develop and be smarter" over time.
- `id` (uuid, pk)
- `agent_id` (uuid, FK → ai_agents)
- `context_id` (text): conversation/lead session identifier
- `role` (text): 'user' | 'assistant' | 'system'
- `content` (text): message content
- `metadata` (jsonb, nullable): extra data (tokens used, model, etc.)
- `created_at` (timestamptz)

## 3. New table: agent_conversations
Inter-agent communication log — agents talking to each other via the orchestrator.
- `id` (uuid, pk)
- `from_agent_id` (uuid, FK → ai_agents)
- `to_agent_id` (uuid, FK → ai_agents, nullable — null means orchestrator)
- `message` (text)
- `message_type` (text): 'delegation' | 'handoff' | 'query' | 'report' | 'status'
- `context_id` (text): shared conversation thread
- `resolved` (boolean, default false)
- `created_at` (timestamptz)

## 4. New table: agent_reports
Individual agent reports + master orchestrator summary.
- `id` (uuid, pk)
- `agent_id` (uuid, FK → ai_agents, nullable — null for master reports)
- `report_type` (text): 'daily' | 'weekly' | 'on_demand' | 'master'
- `title` (text)
- `content` (text): full report markdown/text
- `metrics` (jsonb): structured data (leads_contacted, replies, meetings, etc.)
- `created_at` (timestamptz)

## Security
- All new tables: RLS enabled, authenticated-only access (dashboard is behind login).
- Edge functions use service_role key, bypass RLS.
*/

-- Add new columns to ai_agents
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS custom_api_key text,
  ADD COLUMN IF NOT EXISTS skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS personality text,
  ADD COLUMN IF NOT EXISTS report_summary text,
  ADD COLUMN IF NOT EXISTS target_region text,
  ADD COLUMN IF NOT EXISTS base_prompt text,
  ADD COLUMN IF NOT EXISTS handoff_condition text;

-- Fix: Drop and recreate the select_all_agents policy to avoid conflicts
DO $$ BEGIN
  DROP POLICY IF EXISTS "select_all_agents" ON ai_agents;
  CREATE POLICY "select_all_agents" ON ai_agents
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Agent memory: conversation history per agent
CREATE TABLE IF NOT EXISTS agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  context_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_agent_context ON agent_memory(agent_id, context_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_created ON agent_memory(created_at DESC);

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_agent_memory" ON agent_memory;
CREATE POLICY "authenticated_all_agent_memory" ON agent_memory
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Agent conversations: inter-agent communication
CREATE TABLE IF NOT EXISTS agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  to_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
  message text NOT NULL,
  message_type text NOT NULL DEFAULT 'query' CHECK (message_type IN ('delegation', 'handoff', 'query', 'report', 'status')),
  context_id text,
  resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_context ON agent_conversations(context_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_from ON agent_conversations(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_unresolved ON agent_conversations(resolved) WHERE resolved = false;

ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_agent_conversations" ON agent_conversations;
CREATE POLICY "authenticated_all_agent_conversations" ON agent_conversations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Agent reports
CREATE TABLE IF NOT EXISTS agent_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL,
  report_type text NOT NULL DEFAULT 'on_demand' CHECK (report_type IN ('daily', 'weekly', 'on_demand', 'master')),
  title text NOT NULL,
  content text NOT NULL,
  metrics jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_reports_agent ON agent_reports(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_reports_type ON agent_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_agent_reports_created ON agent_reports(created_at DESC);

ALTER TABLE agent_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all_agent_reports" ON agent_reports;
CREATE POLICY "authenticated_all_agent_reports" ON agent_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
