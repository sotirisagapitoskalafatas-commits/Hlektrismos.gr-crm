create table if not exists public.crm_emails (
  id text primary key,
  from_email text not null,
  to_email text not null,
  subject text not null default '',
  body text not null default '',
  folder text not null default 'inbox',
  is_read boolean not null default false,
  lead_id uuid references public.hlektrismos_leads(id) on delete set null,
  attachments jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.crm_emails enable row level security;

-- Everyone can read
create policy "crm_emails_select"
  on public.crm_emails for select
  to authenticated
  using (true);

-- Authenticated can insert
create policy "crm_emails_insert"
  on public.crm_emails for insert
  to authenticated
  with check (true);

-- Authenticated can update
create policy "crm_emails_update"
  on public.crm_emails for update
  to authenticated
  using (true);

-- Authenticated can delete
create policy "crm_emails_delete"
  on public.crm_emails for delete
  to authenticated
  using (true);

-- Anonymous can read (for chatbot callback emails)
create policy "crm_emails_select_anon"
  on public.crm_emails for select
  to anon
  using (true);

-- Indexes
create index if not exists idx_crm_emails_folder on public.crm_emails (folder);
create index if not exists idx_crm_emails_is_read on public.crm_emails (is_read);
create index if not exists idx_crm_emails_lead_id on public.crm_emails (lead_id);
create index if not exists idx_crm_emails_created_at on public.crm_emails (created_at desc);
