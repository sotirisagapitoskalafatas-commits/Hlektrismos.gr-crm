-- ============================================================
-- Migration: Autonomous Campaign + Voice + Consent Infrastructure
-- ============================================================

BEGIN;

-- 1. CAMPAIGNS TABLE
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','viber','whatsapp','voice')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','scheduled','running','paused','completed')),
  subject TEXT,
  body TEXT NOT NULL,
  audience_filter JSONB,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  total_sends INT DEFAULT 0,
  total_delivered INT DEFAULT 0,
  total_opened INT DEFAULT 0,
  total_replied INT DEFAULT 0,
  total_failed INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_channel ON campaigns(channel);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage campaigns" ON campaigns
  FOR ALL USING (auth.role() = 'authenticated');

-- 2. CAMPAIGN_SENDS TABLE
CREATE TABLE IF NOT EXISTS campaign_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES hlektrismos_leads(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','opened','clicked','replied','failed','unsubscribed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  error_message TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_lead ON campaign_sends(lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_status ON campaign_sends(status);

ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage campaign_sends" ON campaign_sends
  FOR ALL USING (auth.role() = 'authenticated');

-- 3. VOICE_CALLS TABLE
CREATE TABLE IF NOT EXISTS voice_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES hlektrismos_leads(id),
  campaign_id UUID REFERENCES campaigns(id),
  vapi_call_id TEXT UNIQUE,
  direction TEXT CHECK (direction IN ('inbound','outbound')),
  status TEXT DEFAULT 'initiated',
  duration_seconds INT,
  recording_url TEXT,
  transcript TEXT,
  sentiment TEXT,
  outcome TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_calls_lead ON voice_calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_vapi ON voice_calls(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_status ON voice_calls(status);

ALTER TABLE voice_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage voice_calls" ON voice_calls
  FOR ALL USING (auth.role() = 'authenticated');

-- 4. CONTACT_CONSENT TABLE (GDPR)
CREATE TABLE IF NOT EXISTS contact_consent (
  lead_id UUID REFERENCES hlektrismos_leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  opted_in BOOLEAN DEFAULT true,
  opted_in_at TIMESTAMPTZ DEFAULT now(),
  opted_out_at TIMESTAMPTZ,
  PRIMARY KEY (lead_id, channel)
);

ALTER TABLE contact_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage contact_consent" ON contact_consent
  FOR ALL USING (auth.role() = 'authenticated');

-- 5. Add email_config keys for Resend, Infobip, Twilio, Vapi
INSERT INTO crm_settings (setting_key, setting_value, category, description) VALUES
  ('RESEND_API_KEY',   '""', 'email', 'Resend API key for bulk email campaigns'),
  ('INFOBIP_API_KEY',  '""', 'sms', 'Infobip API key for SMS/Viber/WhatsApp'),
  ('INFOBIP_BASE_URL', '"https://api.infobip.com"', 'sms', 'Infobip base URL'),
  ('TWILIO_ACCOUNT_SID', '""', 'sms', 'Twilio Account SID'),
  ('TWILIO_AUTH_TOKEN',  '""', 'sms', 'Twilio Auth Token'),
  ('TWILIO_PHONE_NUMBER', '""', 'sms', 'Twilio phone number'),
  ('VAPI_API_KEY',     '""', 'voice', 'Vapi.ai API key for AI voice calls'),
  ('VAPI_PHONE_NUMBER_ID', '""', 'voice', 'Vapi phone number ID'),
  ('ELEVENLABS_API_KEY', '""', 'voice', 'ElevenLabs API key for Greek TTS voices')
ON CONFLICT (setting_key) DO NOTHING;

-- 6. GRANT PERMISSIONS
GRANT SELECT ON campaigns TO anon, authenticated;
GRANT SELECT ON campaign_sends TO anon, authenticated;
GRANT SELECT ON voice_calls TO anon, authenticated;
GRANT SELECT ON contact_consent TO anon, authenticated;

COMMIT;
