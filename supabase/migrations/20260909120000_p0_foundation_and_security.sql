-- P0: Foundation + security
-- 1) Least-privilege default role for new profiles (was 'admin' — privilege escalation).
-- 2) Signup trigger now assigns a safe default role.
-- 3) Server-side RBAC: replace permissive "authenticated full access" RLS policies
--    with staff-only policies based on profiles.role.
-- 4) Restore public lead intake (anon INSERT on leads) — the ONLY public write path.
-- 5) Recreate hlektrismos_docs storage bucket (private) for public bill attachments.

-- ── 1) Profiles: safe defaults + role constraint ──────────────────────────────
alter table public.profiles
  alter column role set default 'inside_sales';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('admin', 'manager', 'inside_sales', 'field_sales', 'back_office'));
  end if;
end $$;

-- ── 2) Signup trigger: assign safe role ───────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    'inside_sales'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── 3) Policy helpers (server-side RBAC) ──────────────────────────────────────
drop function if exists public.is_staff();
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

drop function if exists public.is_role(text);
create function public.is_role(r text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select p.role from public.profiles p where p.id = auth.uid()) = r;
$$;

-- ── 4) Replace permissive CRM policies with staff / role-scoped policies ──────
do $$
declare t text;
begin
  foreach t in array array[
    'customers', 'cases', 'timeline_events', 'follow_ups',
    'case_documents', 'case_visits', 'case_signatures', 'case_offers',
    'app_notifications'
  ] loop
    execute format('drop policy if exists "authenticated full access %s" on public.%I', t, t);
    execute format('create policy "staff read %s" on public.%I for select to authenticated using (public.is_staff())', t, t);
    execute format('create policy "staff insert %s" on public.%I for insert to authenticated with check (public.is_staff())', t, t);
    execute format('create policy "staff update %s" on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t, t);
    execute format('create policy "admin delete %s" on public.%I for delete to authenticated using (public.is_role(''admin'') or public.is_role(''manager''))', t, t);
  end loop;
end $$;

-- profiles: own-row read/update; staff can read colleagues; only admin changes roles.
drop policy if exists "authenticated full access profiles" on public.profiles;
create policy "profiles read own or staff" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_staff());
create policy "profiles update own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
create policy "profiles role managed by admin" on public.profiles
  for update to authenticated
  using (public.is_role('admin'))
  with check (public.is_role('admin'));

-- leads: public anon INSERT (website forms) is the ONLY anonymous write.
drop policy if exists "Authenticated read leads" on public.leads;
create policy "public website creates lead" on public.leads
  for insert to anon, authenticated
  with check (true);
create policy "staff read leads" on public.leads
  for select to authenticated
  using (public.is_staff());
create policy "staff update leads" on public.leads
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ── 5) Storage: private hlektrismos_docs bucket (25MB) for public attachments ─
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hlektrismos_docs', 'hlektrismos_docs', false, 26214400, null)
on conflict (id) do nothing;

create policy "public uploads lead files" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'hlektrismos_docs'
    and (storage.foldername(name))[1] in ('leads', 'contact-forms')
  );
create policy "staff reads lead files" on storage.objects
  for select to authenticated
  using (bucket_id = 'hlektrismos_docs');
create policy "service all hlektrismos_docs" on storage.objects
  for all to service_role
  using (bucket_id = 'hlektrismos_docs')
  with check (bucket_id = 'hlektrismos_docs');