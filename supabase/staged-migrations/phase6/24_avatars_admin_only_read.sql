-- STAGED ONLY — do not apply to Supabase staging/production without an owner-approved change window.
-- Phase 6 / 24: profile photos under the two-role model. Additive follow-up to phase6/20, which is NOT rewritten (it may already be applied somewhere).
--
-- Why: phase6/20 let `back_office` read every staff avatar ("avatars read office": is_role('admin') OR is_role('back_office')). The final model has no
-- separate back-office access, so only the Admin may read other people's photos. Everything else about the bucket stays: private, one file per user
-- at {user_id}/avatar.jpg, 512 KB, JPEG only, own upload / replace / remove, reads through signed URLs.
--
-- Self-contained for storage: it (re)creates the bucket and all five policies, so it is correct whether or not phase6/20 was applied first. The
-- user_preferences table still comes from phase6/20; apply 20 and 24 in the same window.
-- Production today has no `avatars` bucket, which is why the profile-photo button reports "not available yet". Applying this fixes that too.
-- Idempotent. Rollback: docs/ops/rollback_phase6_24_avatars_admin_only_read.sql

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- The old broad policy goes; the Admin-only one replaces it.
drop policy if exists "avatars read office" on storage.objects;
drop policy if exists "avatars read admin" on storage.objects;
create policy "avatars read admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.is_role('admin') and public.is_staff());

-- The user's own file. Staff only, so an inactive account cannot read, write or remove anything.
drop policy if exists "avatars read own" on storage.objects;
create policy "avatars read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.is_staff());
drop policy if exists "avatars write own" on storage.objects;
create policy "avatars write own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and name = (select auth.uid())::text || '/avatar.jpg' and public.is_staff());
drop policy if exists "avatars replace own" on storage.objects;
create policy "avatars replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.is_staff())
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg' and public.is_staff());
drop policy if exists "avatars remove own" on storage.objects;
create policy "avatars remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.is_staff());
