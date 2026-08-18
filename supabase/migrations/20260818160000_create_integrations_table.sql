-- Create integrations table for CRM settings persistence
CREATE TABLE IF NOT EXISTS crm_integrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  connected BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE crm_integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated can manage integrations" ON crm_integrations
    FOR ALL TO public USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed default integrations (only insert if not exists)
INSERT INTO crm_integrations (id, name, connected, config) VALUES
  ('gmail', 'Gmail / Email', false, '{}'::jsonb),
  ('facebook', 'Facebook Pages', false, '{}'::jsonb),
  ('instagram', 'Instagram Business', false, '{}'::jsonb),
  ('linkedin', 'LinkedIn', false, '{}'::jsonb),
  ('whatsapp', 'WhatsApp Business', false, '{}'::jsonb),
  ('viber', 'Viber Business', false, '{}'::jsonb),
  ('sms', 'SMS Gateway', false, '{}'::jsonb),
  ('imap', 'IMAP Email Server', false, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
