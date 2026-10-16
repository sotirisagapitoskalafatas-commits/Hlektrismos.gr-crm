-- STAGED (Phase 1 / 16) — NOT APPLIED. Idempotent. Security. Rollback at the end of this file.
--
-- Finding (Admin centre, live): an anonymous visitor can LIST the files in the private bucket `hlektrismos_docs`
-- (ID cards, bills, contracts uploaded through the website form).
--
-- Exact cause: storage.objects policies are PERMISSIVE, so they are OR-ed together. Migration 20260820000004 created
--   "hlektrismos_docs_anon_select"   FOR SELECT TO anon          USING (bucket_id = 'hlektrismos_docs')
--   "hlektrismos_docs_anon_insert"   FOR INSERT TO anon          (any path)
--   "hlektrismos_docs_auth_select/insert/update/delete" TO authenticated (any signed-in account, even inactive)
-- and no later migration dropped them. The stricter policies added later (20260909120000 "public uploads lead files",
-- 20261001000100 "staff reads lead files" = active staff only) therefore never took effect: the old ones still allow.
-- The bucket itself is private (public = false), so there is no public URL; but SELECT on storage.objects is what
-- the Storage API uses for list() and for creating signed download links, so an anonymous visitor could list
-- and download.
--
-- Fix (smallest): drop the legacy policies; keep the narrow ones.
--   anon            INSERT only into contact-forms/ (the website form). No SELECT, UPDATE or DELETE.
--   active staff    SELECT (existing "staff reads lead files"), INSERT anywhere in the bucket (CRM uploads under
--                   leads/<id>/ and the legacy customer/provider screens), UPDATE/DELETE: none for staff;
--                   the admin delete for the Κάδος comes from staged phase2/06.
--   service_role    unchanged ("service all hlektrismos_docs") — edge functions / webhook.
-- Website form: uploadDocument() uses upsert:false, which needs INSERT only (Supabase Storage: upsert additionally
-- needs SELECT + UPDATE). Verify on staging with the incognito upload test in docs/ops/SECURITY_LIVE_FINDINGS.md.

-- 1) legacy policies (both generations, by name; no-ops if already gone)
drop policy if exists "hlektrismos_docs_anon_select" on storage.objects;
drop policy if exists "hlektrismos_docs_anon_insert" on storage.objects;
drop policy if exists "hlektrismos_docs_auth_select" on storage.objects;
drop policy if exists "hlektrismos_docs_auth_insert" on storage.objects;
drop policy if exists "hlektrismos_docs_auth_update" on storage.objects;
drop policy if exists "hlektrismos_docs_auth_delete" on storage.objects;
drop policy if exists "Anonymous can read contact form documents" on storage.objects;
drop policy if exists "Anonymous can upload contact form documents" on storage.objects;
drop policy if exists "Authenticated users can read documents" on storage.objects;
drop policy if exists "Authenticated users can upload documents" on storage.objects;
drop policy if exists "Authenticated users can update documents" on storage.objects;
drop policy if exists "Authenticated users can delete documents" on storage.objects;

-- 2) uploads: replace the combined anon+authenticated policy with two narrow ones
drop policy if exists "public uploads lead files" on storage.objects;
drop policy if exists "website uploads contact forms" on storage.objects;
create policy "website uploads contact forms" on storage.objects
  for insert to anon
  with check (bucket_id = 'hlektrismos_docs' and (storage.foldername(name))[1] = 'contact-forms');
drop policy if exists "staff uploads docs" on storage.objects;
create policy "staff uploads docs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'hlektrismos_docs' and public.is_staff());

-- 3) reads: active staff only (same definition as 20261001000100; re-created so this file is self-contained)
drop policy if exists "staff reads lead files" on storage.objects;
create policy "staff reads lead files" on storage.objects
  for select to authenticated
  using (bucket_id = 'hlektrismos_docs' and public.is_staff());

-- ROLLBACK (re-opens the finding; only to restore service in an emergency):
--   drop policy if exists "website uploads contact forms" on storage.objects;
--   drop policy if exists "staff uploads docs" on storage.objects;
--   create policy "public uploads lead files" on storage.objects for insert to anon, authenticated
--     with check (bucket_id = 'hlektrismos_docs' and (storage.foldername(name))[1] in ('leads', 'contact-forms'));
--   create policy "hlektrismos_docs_auth_insert" on storage.objects for insert to authenticated with check (bucket_id = 'hlektrismos_docs');
--   create policy "hlektrismos_docs_auth_select" on storage.objects for select to authenticated using (bucket_id = 'hlektrismos_docs');
--   create policy "hlektrismos_docs_auth_update" on storage.objects for update to authenticated using (bucket_id = 'hlektrismos_docs');
--   create policy "hlektrismos_docs_auth_delete" on storage.objects for delete to authenticated using (bucket_id = 'hlektrismos_docs');
--   create policy "hlektrismos_docs_anon_insert" on storage.objects for insert to anon with check (bucket_id = 'hlektrismos_docs');
--   create policy "hlektrismos_docs_anon_select" on storage.objects for select to anon using (bucket_id = 'hlektrismos_docs');
