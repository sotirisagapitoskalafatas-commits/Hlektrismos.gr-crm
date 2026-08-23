-- Google Calendar experience upgrade for calendar_events

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS event_kind TEXT NOT NULL DEFAULT 'event', -- event | task | appointment_schedule
  ADD COLUMN IF NOT EXISTS is_all_day BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'none', -- none | daily | weekly | monthly | custom
  ADD COLUMN IF NOT EXISTS time_zone TEXT,
  ADD COLUMN IF NOT EXISTS meeting_platform TEXT NOT NULL DEFAULT 'none', -- none | google_meet | microsoft_teams | whatsapp | vapi_voice
  ADD COLUMN IF NOT EXISTS meeting_link TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#039be5',
  ADD COLUMN IF NOT EXISTS owner_id TEXT,
  ADD COLUMN IF NOT EXISTS busy_status TEXT NOT NULL DEFAULT 'busy', -- busy | free
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'default', -- default | public | private
  ADD COLUMN IF NOT EXISTS notifications JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{type: notification|email, minutes}]
  ADD COLUMN IF NOT EXISTS guests JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{id,name,email,role}]
  ADD COLUMN IF NOT EXISTS guest_permissions JSONB NOT NULL DEFAULT '{"modify_event":false,"invite_others":true,"see_guest_list":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_email_id UUID;
