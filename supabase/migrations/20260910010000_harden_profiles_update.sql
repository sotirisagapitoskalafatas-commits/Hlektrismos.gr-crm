-- Security hardening: close the self-promotion hole in profiles.
--
-- 20260909120000 created "profiles update own" with `with check (auth.uid() = id)`,
-- which lets any authenticated user rewrite their own `role` column. UPDATE
-- policies are OR'ed, so the admin-only role policy does not stop it.
--
-- Fix: an UPDATE on own row may only write rows whose role equals the role that
-- already exists (snapshot sees the pre-update row), so a non-admin can edit
-- name/phone/avatar but never elevate. Admins still change any role through the
-- separate "profiles role managed by admin" policy.

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );