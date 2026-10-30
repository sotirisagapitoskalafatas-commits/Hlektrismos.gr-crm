-- Rollback of supabase/staged-migrations/phase6/20_user_preferences.sql.
-- DESTRUCTIVE: drops every user's saved theme / home layout. Avatar FILES are not deleted here (remove them in the Dashboard if wanted).
drop policy if exists "avatars read own" on storage.objects;
drop policy if exists "avatars read office" on storage.objects;
drop policy if exists "avatars write own" on storage.objects;
drop policy if exists "avatars replace own" on storage.objects;
drop policy if exists "avatars remove own" on storage.objects;
drop table if exists public.user_preferences;
drop function if exists public.user_preferences_touch();
