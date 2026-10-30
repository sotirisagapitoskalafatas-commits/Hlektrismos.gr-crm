-- STAGED ONLY — do not apply to Supabase staging/production without an owner-approved change window.
-- Phase 6 / 20: per-user interface preferences (shell theme, compact sidebar, home layout, pipeline lane)
-- and a PRIVATE `avatars` storage bucket. Additive: no existing table or policy is changed.
-- Rollback: docs/ops/rollback_phase6_20_user_preferences.sql.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  shell_theme text not null default 'navy'
    check (shell_theme in ('navy','ocean','graphite','forest','plum','light')),
  sidebar_compact boolean not null default false,
  dashboard_layout jsonb not null default '[]'::jsonb
    check (jsonb_typeof(dashboard_layout) = 'array'),
  pipeline_lane text,
  updated_at timestamptz not null default now()
);

create or replace function public.user_preferences_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists user_preferences_touch on public.user_preferences;
create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function public.user_preferences_touch();

alter table public.user_preferences enable row level security;

-- Own row only. No delete policy: a preference row is never removed by a user (it cascades with the account).
drop policy if exists "preferences select own" on public.user_preferences;
create policy "preferences select own" on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()) and public.is_staff());
drop policy if exists "preferences insert own" on public.user_preferences;
create policy "preferences insert own" on public.user_preferences
  for insert to authenticated with check (user_id = (select auth.uid()) and public.is_staff());
drop policy if exists "preferences update own" on public.user_preferences;
create policy "preferences update own" on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_staff())
  with check (user_id = (select auth.uid()) and public.is_staff());

revoke all on public.user_preferences from public, anon;
revoke all on public.user_preferences from authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant all on public.user_preferences to service_role;

-- Private avatar bucket: {user_id}/avatar.jpg. Never public; the app reads it through signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars read own" on storage.objects;
create policy "avatars read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.is_staff());
drop policy if exists "avatars read office" on storage.objects;
create policy "avatars read office" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (public.is_role('admin') or public.is_role('back_office')));
drop policy if exists "avatars write own" on storage.objects;
create policy "avatars write own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and name = (select auth.uid())::text || '/avatar.jpg' and public.is_staff());
drop policy if exists "avatars replace own" on storage.objects;
create policy "avatars replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.is_staff())
  with check (bucket_id = 'avatars' and name = (select auth.uid())::text || '/avatar.jpg');
drop policy if exists "avatars remove own" on storage.objects;
create policy "avatars remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.is_staff());
