/*
# Add energy bill upload support to lead form

## What changes
1. `powerfor_leads` table: add new columns for the simplified contact form
   - `property_type` (text) — "Σπίτι" or "Επιχείρηση" (home or business)
   - `comments` (text) — optional free-text comments
   - `bill_file_path` (text) — path to uploaded energy bill in Supabase Storage
   - `bill_file_name` (text) — original filename of the uploaded bill

2. Storage bucket:
   - Create `energy-bills` bucket (private) for storing customer-uploaded energy bills
   - Allow public uploads (anon can upload) since customers submit from the public form
   - No public read access — only authenticated dashboard users can read bills

3. Storage policies:
   - INSERT (upload): anon + authenticated can upload to `energy-bills/`
   - SELECT (read): authenticated only (dashboard users reviewing bills)
   - UPDATE/DELETE: authenticated only

## Important Notes
- The existing `provider` column is reused to store the selected service (Ρεύμα / Αέριο / Φωτοβολταϊκά / Ηλεκτροκίνηση)
- The new columns are nullable so existing leads are not affected
- Bill files are stored with a unique path to prevent collisions
*/

-- ===== Add columns to powerfor_leads =====
ALTER TABLE public.powerfor_leads
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS comments text,
  ADD COLUMN IF NOT EXISTS bill_file_path text,
  ADD COLUMN IF NOT EXISTS bill_file_name text;

-- ===== Create energy-bills storage bucket =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('energy-bills', 'energy-bills', false)
ON CONFLICT (id) DO NOTHING;

-- ===== Storage policies for energy-bills bucket =====
-- Allow anon + authenticated to upload bills
DROP POLICY IF EXISTS "Public can upload energy bills" ON storage.objects;
CREATE POLICY "Public can upload energy bills"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'energy-bills');

-- Allow authenticated dashboard users to read bills
DROP POLICY IF EXISTS "Authenticated can read energy bills" ON storage.objects;
CREATE POLICY "Authenticated can read energy bills"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'energy-bills');

-- Allow authenticated to update/delete bills
DROP POLICY IF EXISTS "Authenticated can update energy bills" ON storage.objects;
CREATE POLICY "Authenticated can update energy bills"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'energy-bills')
  WITH CHECK (bucket_id = 'energy-bills');

DROP POLICY IF EXISTS "Authenticated can delete energy bills" ON storage.objects;
CREATE POLICY "Authenticated can delete energy bills"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'energy-bills');
