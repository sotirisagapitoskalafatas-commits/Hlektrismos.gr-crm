/*
# Add authenticated read access to leads + dashboard tables for AI agents

1. Modified Tables
- `powerfor_leads` — no schema changes. Added a SELECT policy so authenticated business users can read leads for the dashboard.

2. New Tables
- `ai_agents` — stores AI sales agent configurations created by business users.
  - `id` (uuid, primary key)
  - `name` (text, agent display name)
  - `channel` (text: email / sms / voice)
  - `status` (text: active / paused / draft, default draft)
  - `leads_contacted` (integer, default 0)
  - `replies` (integer, default 0)
  - `meetings_booked` (integer, default 0)
  - `created_at` (timestamptz)
- `lead_sources` — GDPR-compliant lead source channels.
  - `id` (uuid, primary key)
  - `name` (text, source name)
  - `type` (text: opt-in / partner / first-party)
  - `lawful_basis` (text: consent / legitimate-interest)
  - `leads_this_month` (integer, default 0)
  - `status` (text: active / paused, default active)
  - `created_at` (timestamptz)

3. Security
- Enable RLS on both new tables.
- `ai_agents`: authenticated users can read, insert, update, delete their own agents.
- `lead_sources`: authenticated users can read, insert, update, delete their own sources.
- `powerfor_leads`: authenticated users can SELECT (read) leads for the dashboard. INSERT stays public (consent required). UPDATE/DELETE stay denied publicly, but authenticated users can update lead status for follow-up tracking.

4. Important Notes
- This is a multi-tenant setup: each business user sees only their own agents and sources (via user_id).
- Leads are shared (all authenticated users can see all leads) since this is a single-business tool.
- All agent/source operations are owner-scoped via auth.uid().
*/

-- ===== powerfor_leads: allow authenticated SELECT =====
DROP POLICY IF EXISTS "Leads are not publicly readable" ON public.powerfor_leads;
CREATE POLICY "Authenticated can read leads"
  ON public.powerfor_leads FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Leads are not publicly editable" ON public.powerfor_leads;
CREATE POLICY "Authenticated can update lead status"
  ON public.powerfor_leads FOR UPDATE
  TO authenticated
  USING (true) WITH CHECK (true);

-- ===== ai_agents table =====
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'draft',
  leads_contacted integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  meetings_booked integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_agents" ON public.ai_agents;
CREATE POLICY "select_own_agents" ON public.ai_agents FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_agents" ON public.ai_agents;
CREATE POLICY "insert_own_agents" ON public.ai_agents FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_agents" ON public.ai_agents;
CREATE POLICY "update_own_agents" ON public.ai_agents FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_agents" ON public.ai_agents;
CREATE POLICY "delete_own_agents" ON public.ai_agents FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ===== lead_sources table =====
CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'opt-in',
  lawful_basis text NOT NULL DEFAULT 'consent',
  leads_this_month integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sources" ON public.lead_sources;
CREATE POLICY "select_own_sources" ON public.lead_sources FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sources" ON public.lead_sources;
CREATE POLICY "insert_own_sources" ON public.lead_sources FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sources" ON public.lead_sources;
CREATE POLICY "update_own_sources" ON public.lead_sources FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sources" ON public.lead_sources;
CREATE POLICY "delete_own_sources" ON public.lead_sources FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
