-- STAGED (Phase 1) — NOT APPLIED. Apply on staging first. Read README.md in this folder.
-- Purpose: an append-only audit of every outreach gate decision (written by edge functions with the service role).
-- The per-channel permission evidence that used to live here (`contact_permissions`, keyed to the legacy
-- `hlektrismos_leads` table) is superseded by phase3/09_contact_eligibility.sql, which keys consent, objections and
-- Article 11 screenings to the contact point (phone / email) so they follow the person across every record.

create table if not exists public.outreach_decisions (
  id         bigint generated always as identity primary key,
  lead_id    uuid not null,
  channel    text not null,
  purpose    text not null,
  allowed    boolean not null,
  reasons    text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.outreach_decisions enable row level security;
revoke all on public.outreach_decisions from anon, public;
revoke insert, update, delete on public.outreach_decisions from authenticated;

drop policy if exists "audit readers read outreach_decisions" on public.outreach_decisions;
create policy "audit readers read outreach_decisions" on public.outreach_decisions
  for select to authenticated using (public.is_role('admin') or public.is_role('manager'));

create or replace function public.outreach_decisions_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'outreach_decisions is append-only';
end $$;
drop trigger if exists outreach_decisions_no_change on public.outreach_decisions;
create trigger outreach_decisions_no_change before update or delete on public.outreach_decisions
  for each row execute function public.outreach_decisions_append_only();

-- ROLLBACK: drop table public.outreach_decisions; drop function public.outreach_decisions_append_only();
