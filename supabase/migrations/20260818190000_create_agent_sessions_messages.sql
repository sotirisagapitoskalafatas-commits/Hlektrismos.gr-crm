-- Create agent_sessions and agent_messages for persistent chat history
-- Enables session-based chat with message persistence

CREATE TABLE IF NOT EXISTS agent_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  title TEXT NOT NULL DEFAULT 'Νέα Συνομιλία',
  selected_agents TEXT[] DEFAULT '{}',
  model TEXT DEFAULT 'gemini-3.6-flash',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  agent_id TEXT,
  model TEXT,
  token_count INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user ON agent_sessions(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_deleted ON agent_sessions(deleted_at) WHERE deleted_at IS NULL;

-- Updated at trigger for sessions
CREATE OR REPLACE FUNCTION update_agent_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_agent_sessions_updated_at ON agent_sessions;
CREATE TRIGGER trigger_update_agent_sessions_updated_at
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_agent_sessions_updated_at();

-- RLS policies (use IF NOT EXISTS to be idempotent)
ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view all sessions' AND tablename = 'agent_sessions') THEN
    CREATE POLICY "Users can view all sessions" ON agent_sessions FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create sessions' AND tablename = 'agent_sessions') THEN
    CREATE POLICY "Users can create sessions" ON agent_sessions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update sessions' AND tablename = 'agent_sessions') THEN
    CREATE POLICY "Users can update sessions" ON agent_sessions FOR UPDATE USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete sessions' AND tablename = 'agent_sessions') THEN
    CREATE POLICY "Users can delete sessions" ON agent_sessions FOR DELETE USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view messages' AND tablename = 'agent_messages') THEN
    CREATE POLICY "Users can view messages" ON agent_messages FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert messages' AND tablename = 'agent_messages') THEN
    CREATE POLICY "Users can insert messages" ON agent_messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access sessions' AND tablename = 'agent_sessions') THEN
    CREATE POLICY "Service role full access sessions" ON agent_sessions FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access messages' AND tablename = 'agent_messages') THEN
    CREATE POLICY "Service role full access messages" ON agent_messages FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
