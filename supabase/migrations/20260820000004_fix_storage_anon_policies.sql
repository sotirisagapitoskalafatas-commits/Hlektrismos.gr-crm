-- Safety migration: ensure hlektrismos_docs bucket and anon upload policies exist
-- Date: 2026-08-20

-- Ensure bucket exists with correct settings
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hlektrismos_docs',
  'hlektrismos_docs',
  false,
  26214400,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop old policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Anonymous can upload contact form documents" ON storage.objects;
DROP POLICY IF EXISTS "Anonymous can read contact form documents" ON storage.objects;

-- Authenticated full access
CREATE POLICY "hlektrismos_docs_auth_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'hlektrismos_docs');
CREATE POLICY "hlektrismos_docs_auth_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'hlektrismos_docs');
CREATE POLICY "hlektrismos_docs_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'hlektrismos_docs');
CREATE POLICY "hlektrismos_docs_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'hlektrismos_docs');

-- Anonymous can upload (for landing page contact form)
CREATE POLICY "hlektrismos_docs_anon_insert" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'hlektrismos_docs');

-- Anonymous can read own uploads (for confirmation)
CREATE POLICY "hlektrismos_docs_anon_select" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'hlektrismos_docs');

-- Service role full access (for Edge Functions)
CREATE POLICY "hlektrismos_docs_service_all" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'hlektrismos_docs');
