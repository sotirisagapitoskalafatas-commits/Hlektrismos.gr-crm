-- Agent Hub conversation persistence
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS context_id TEXT;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS selected_agents JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'market_rag';

CREATE INDEX IF NOT EXISTS idx_chat_threads_source ON chat_threads(source, updated_at DESC);
