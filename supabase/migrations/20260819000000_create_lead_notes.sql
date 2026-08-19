-- lead_notes: Activity timeline and notes for leads
-- Each note tracks who added it, when, and what type it is

CREATE TABLE IF NOT EXISTS lead_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES hlektrismos_leads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'system',
  note_type TEXT NOT NULL DEFAULT 'manual',
  -- note_type: 'manual', 'status_change', 'email_sent', 'ai_summary', 'system'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at ON lead_notes(created_at DESC);

-- RLS
ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated full access lead_notes' AND tablename = 'lead_notes') THEN
    CREATE POLICY "Authenticated full access lead_notes" ON lead_notes FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access lead_notes' AND tablename = 'lead_notes') THEN
    CREATE POLICY "Service role full access lead_notes" ON lead_notes FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE lead_notes IS 'Activity timeline and notes for leads. Tracks manual notes, status changes, emails sent, and AI summaries.';
COMMENT ON COLUMN lead_notes.note_type IS 'Type: manual, status_change, email_sent, ai_summary, system';
