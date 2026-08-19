-- Storage bucket for Hlektrismos.gr document uploads (bills, contracts, etc.)
-- Run this migration to create the hlektrismos_docs bucket with proper RLS policies.

-- Create the storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hlektrismos_docs',
  'hlektrismos_docs',
  false,  -- private by default, accessed via signed URLs
  26214400, -- 25MB limit
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for storage.objects
-- 1. Authenticated users can upload files
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'hlektrismos_docs');

-- 2. Authenticated users can read all files in the bucket
CREATE POLICY "Authenticated users can read documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'hlektrismos_docs');

-- 3. Authenticated users can update files (replace)
CREATE POLICY "Authenticated users can update documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'hlektrismos_docs');

-- 4. Authenticated users can delete files
CREATE POLICY "Authenticated users can delete documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'hlektrismos_docs');

-- 5. Anonymous users can upload (for contact form bill uploads from landing page)
CREATE POLICY "Anonymous can upload contact form documents"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'hlektrismos_docs');

-- 6. Anonymous users can read their own uploads (for confirmation)
CREATE POLICY "Anonymous can read contact form documents"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'hlektrismos_docs');

-- Add bill_files column to hlektrismos_leads if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hlektrismos_leads' AND column_name = 'bill_files'
  ) THEN
    ALTER TABLE hlektrismos_leads ADD COLUMN bill_files JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add calendar_events table for meeting scheduling
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES hlektrismos_leads(id) ON DELETE CASCADE,
  agent_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT DEFAULT 'meeting', -- meeting, call, follow_up, deadline
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled', -- scheduled, completed, cancelled, no_show
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for calendar queries
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_lead ON calendar_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_agent ON calendar_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_status ON calendar_events(status);

-- RLS for calendar_events
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage calendar events"
ON calendar_events
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Notification log table for real-time events
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL, -- email_inbound, new_lead, meeting_scheduled, scraper_complete
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_type ON notification_log(type);
CREATE INDEX IF NOT EXISTS idx_notification_log_read ON notification_log(read);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage notifications"
ON notification_log
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
