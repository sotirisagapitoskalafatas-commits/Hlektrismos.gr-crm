-- Marketing-email suppression list (CAN-SPAM opt-out, Greek law 3471/2006 art. 11).
-- Written by the public `unsubscribe` edge function (HMAC-signed links and
-- RFC 8058 one-click POST). Read by _shared/email-compliance.ts before EVERY
-- commercial send, so an unsubscribe takes effect on the very next send.
create table if not exists public.email_suppressions (
  email      text primary key check (email = lower(btrim(email))),
  reason     text not null default 'unsubscribe',
  source     text,
  created_at timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;

-- Staff can see the list and add an address manually (e.g. someone replies
-- "unsubscribe me"). Removing a row re-subscribes, so deletes are admin-only.
drop policy if exists "staff read suppressions" on public.email_suppressions;
create policy "staff read suppressions" on public.email_suppressions
  for select to authenticated using (public.is_staff());
drop policy if exists "staff add suppressions" on public.email_suppressions;
create policy "staff add suppressions" on public.email_suppressions
  for insert to authenticated with check (public.is_staff());
drop policy if exists "admin delete suppressions" on public.email_suppressions;
create policy "admin delete suppressions" on public.email_suppressions
  for delete to authenticated using (public.is_role('admin'));
