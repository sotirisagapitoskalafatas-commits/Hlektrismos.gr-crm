-- CRM base tables (P0 foundation).
-- The modern CRM (profiles, customers, cases, timeline_events, follow_ups,
-- case_* children, app_notifications) was wired up against the reference
-- project but never committed as DDL. This migration backfills the base
-- tables on any environment, idempotently, BEFORE 20260909120000 applies its
-- security hardening (RLS policies, RBAC helpers) on top.
-- Shapes mirror the reference schema exactly (columns, defaults, keys, RLS on).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id),
  full_name text not null default '',
  role text not null default 'inside_sales',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('admin', 'manager', 'inside_sales', 'field_sales', 'back_office'))
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  email text,
  phone text,
  company text,
  address text,
  city text,
  postal_code text,
  lat double precision,
  lng double precision,
  notes text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  case_no text,
  title text not null default '',
  customer_id uuid references public.customers(id),
  source text not null default 'website',
  service_type text not null default 'energy',
  property_type text,
  case_type text,
  current_stage text not null default 'new',
  priority text not null default 'normal',
  status text not null default 'open',
  value numeric not null default 0,
  probability integer not null default 0,
  expected_close_date date,
  owner_id uuid references public.profiles(id),
  inside_sales_owner uuid references public.profiles(id),
  field_sales_owner uuid references public.profiles(id),
  back_office_owner uuid references public.profiles(id),
  next_action text not null default '',
  next_follow_up_at timestamptz,
  location text not null default '',
  address text not null default '',
  lat double precision,
  lng double precision,
  provider text,
  program text,
  application_status text,
  activation_status text,
  notes text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  role text not null default 'system',
  activity_type text not null,
  title text not null default '',
  description text not null default '',
  user_id uuid references public.profiles(id),
  occurred_at timestamptz not null default now(),
  location jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  due_at timestamptz not null,
  channel text not null default 'phone',
  reason text not null default '',
  priority text not null default 'normal',
  assignee_id uuid references public.profiles(id),
  status text not null default 'pending',
  notes text not null default '',
  snoozed_until timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  category text not null default 'other',
  status text not null default 'received',
  file_name text not null default '',
  file_url text not null default '',
  mime_type text not null default '',
  size integer not null default 0,
  uploaded_by uuid references public.profiles(id),
  description text not null default '',
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.case_visits (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  user_id uuid references public.profiles(id),
  purpose text not null default '',
  status text not null default 'planned',
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  check_in jsonb,
  check_out jsonb,
  location jsonb,
  result text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_signatures (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  status text not null default 'requested',
  document_id uuid references public.case_documents(id),
  captured_by uuid references public.profiles(id),
  captured_at timestamptz,
  image_url text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.case_offers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id),
  offer_no text not null default '',
  amount numeric not null default 0,
  status text not null default 'draft',
  valid_until date,
  items jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id),
  notes text not null default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  case_id uuid references public.cases(id),
  title text not null default '',
  body text not null default '',
  type text not null default 'info',
  link text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Row-level security is enabled by default; 20260909120000 installs policies.
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.cases enable row level security;
alter table public.timeline_events enable row level security;
alter table public.follow_ups enable row level security;
alter table public.case_documents enable row level security;
alter table public.case_visits enable row level security;
alter table public.case_signatures enable row level security;
alter table public.case_offers enable row level security;
alter table public.app_notifications enable row level security;

-- Standard Supabase access grants (RLS is the gate, not ACL).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.customers, public.cases,
  public.timeline_events, public.follow_ups, public.case_documents, public.case_visits,
  public.case_signatures, public.case_offers, public.app_notifications
  to anon, authenticated;
grant all privileges on public.profiles, public.customers, public.cases,
  public.timeline_events, public.follow_ups, public.case_documents, public.case_visits,
  public.case_signatures, public.case_offers, public.app_notifications
  to service_role;

-- Common query indexes.
create index if not exists cases_customer_id_idx on public.cases (customer_id);
create index if not exists cases_owner_id_idx on public.cases (owner_id);
create index if not exists cases_field_sales_owner_idx on public.cases (field_sales_owner);
create index if not exists cases_current_stage_idx on public.cases (current_stage);
create index if not exists cases_status_idx on public.cases (status);
create index if not exists timeline_events_case_id_idx on public.timeline_events (case_id);
create index if not exists follow_ups_case_id_idx on public.follow_ups (case_id);
create index if not exists follow_ups_assignee_due_idx on public.follow_ups (assignee_id, due_at);
create index if not exists case_documents_case_id_idx on public.case_documents (case_id);
create index if not exists case_visits_case_id_idx on public.case_visits (case_id);
create index if not exists case_visits_status_idx on public.case_visits (status);
create index if not exists case_signatures_case_id_idx on public.case_signatures (case_id);
create index if not exists case_offers_case_id_idx on public.case_offers (case_id);
create index if not exists app_notifications_user_idx on public.app_notifications (user_id, read_at);