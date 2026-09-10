-- Legacy-compatible core tables that the P0/P1 migrations assume exist:
-- public.leads (lead intake / pipeline) and public.activity_log (audit trail).
-- Mirrors the reference schema (columns/defaults/keys); RLS enabled; no
-- status/source CHECK constraints here — 20260909200000 installs the canonical
-- ones. Create-and-run BEFORE 20260909120000 so its leads policies apply.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  client_name text not null,
  client_contact text not null default '',
  project_details text,
  status text default 'new',
  first_name text not null default '',
  last_name text default '',
  email text,
  phone text,
  property_type text,
  region text,
  service_category text default 'Ρεύμα',
  comments text,
  attached_files jsonb default '[]'::jsonb,
  gdpr_consent boolean default false,
  notes text default '',
  full_name text,
  company text,
  source text default 'website',
  tags text[] default '{}'::text[],
  updated_at timestamptz default timezone('utc', now()),
  address text,
  id_number text,
  provider text,
  program text,
  lead_type text,
  partner text,
  partner_notes text,
  assigned_agent text,
  renewal_date date,
  supplies jsonb default '[]'::jsonb,
  consent_version text not null default 'v1',
  consent_granted_at timestamptz,
  consent_source text,
  ack_sent_at timestamptz,
  idempotency_key uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  referrer text,
  landing_path text,
  campaign_id text,
  campaign_name text,
  source_label text,
  created_by_user_id uuid references public.profiles(id),
  assigned_to_user_id uuid references public.profiles(id),
  first_contact_user_id uuid references public.profiles(id),
  referred_by_user_id uuid references public.profiles(id),
  converted_by_user_id uuid references public.profiles(id),
  converted_at timestamptz,
  converted_case_id uuid references public.cases(id)
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.leads enable row level security;
alter table public.activity_log enable row level security;

grant select, insert, update, delete on public.leads, public.activity_log
  to anon, authenticated;
grant all privileges on public.leads, public.activity_log to service_role;

create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_assigned_to_idx on public.leads (assigned_to_user_id);
create index if not exists leads_source_idx on public.leads (source);
create index if not exists leads_created_at_idx on public.leads (created_at);
create index if not exists activity_log_entity_idx on public.activity_log (entity_type, entity_id);