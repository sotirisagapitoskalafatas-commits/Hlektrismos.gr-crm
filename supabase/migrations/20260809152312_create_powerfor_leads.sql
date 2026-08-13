/*
# Create PowerFor lead submissions

1. New Tables
- `powerfor_leads` stores customer contact requests submitted from the public energy consultation form.
- `id` is the unique lead identifier.
- `first_name`, `last_name`, `phone`, `email`, `region`, `customer_type`, `provider`, and `consent` capture the form details.
- `status` tracks follow-up progress and defaults to `new`.
- `created_at` records when the request was received.

2. Security
- Row Level Security is enabled on `powerfor_leads`.
- Anonymous visitors may insert a lead submission.
- Anonymous visitors cannot read, update, or delete lead records.
- Authenticated access is also explicitly denied for direct CRUD access until an admin workflow is added.

3. Important Notes
- This migration is intentionally single-tenant because the public form does not require customer accounts.
- The status field is retained for a future protected CRM/admin view.
*/

CREATE TABLE IF NOT EXISTS public.powerfor_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  region text NOT NULL,
  customer_type text NOT NULL,
  provider text NOT NULL,
  consent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.powerfor_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can submit powerfor leads" ON public.powerfor_leads;
CREATE POLICY "Public can submit powerfor leads"
  ON public.powerfor_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (consent = true);

DROP POLICY IF EXISTS "Leads are not publicly readable" ON public.powerfor_leads;
CREATE POLICY "Leads are not publicly readable"
  ON public.powerfor_leads FOR SELECT
  TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS "Leads are not publicly editable" ON public.powerfor_leads;
CREATE POLICY "Leads are not publicly editable"
  ON public.powerfor_leads FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Leads are not publicly deletable" ON public.powerfor_leads;
CREATE POLICY "Leads are not publicly deletable"
  ON public.powerfor_leads FOR DELETE
  TO anon, authenticated
  USING (false);
