-- STAGED (Phase 1) — NOT APPLIED. Apply on staging first. Read README.md in this folder.
-- Purpose: provenance + channel-specific permission evidence per lead (read by the outreach gate), and an
-- append-only audit of every gate decision. Discovery/scraping NEVER creates a 'granted' row by itself.

create table if not exists public.contact_permissions (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.hlektrismos_leads(id) on delete cascade,
  channel        text not null check (channel in ('email','sms','whatsapp','viber','voice')),
  status         text not null default 'none' check (status in ('none','granted','withdrawn')),
  basis          text check (basis in ('consent','existing_customer','other')),
  evidence_ref   text,                      -- e.g. form submission id, signed document id, recording id
  evidence_at    timestamptz,
  source         text not null default 'unknown',   -- provenance: website_form | chatbot | scraper | import | manual | webhook
  classification text not null default 'unknown' check (classification in ('business','personal','unknown')),
  dnc_screened_at timestamptz,              -- last telephone opt-out register screening
  recorded_by    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (lead_id, channel),
  -- A grant is impossible without a sufficient basis AND evidence (no fabricated consent).
  constraint grant_requires_evidence check (
    status <> 'granted'
    or (basis in ('consent','existing_customer') and evidence_ref is not null and evidence_at is not null)
  )
);

alter table public.contact_permissions enable row level security;
revoke all on public.contact_permissions from anon, public;

drop policy if exists "managers read contact_permissions" on public.contact_permissions;
create policy "managers read contact_permissions" on public.contact_permissions
  for select to authenticated using (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "managers write contact_permissions" on public.contact_permissions;
create policy "managers write contact_permissions" on public.contact_permissions
  for insert to authenticated with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "managers update contact_permissions" on public.contact_permissions;
create policy "managers update contact_permissions" on public.contact_permissions
  for update to authenticated
  using (public.is_role('admin') or public.is_role('manager'))
  with check (public.is_role('admin') or public.is_role('manager'));
drop policy if exists "admin delete contact_permissions" on public.contact_permissions;
create policy "admin delete contact_permissions" on public.contact_permissions
  for delete to authenticated using (public.is_role('admin'));

-- Append-only audit of outreach gate decisions (written by edge functions with the service role).
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
--           drop table public.contact_permissions;
