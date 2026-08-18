-- Add new columns to crm_emails
alter table public.crm_emails add column if not exists starred boolean not null default false;
alter table public.crm_emails add column if not exists important boolean not null default false;
alter table public.crm_emails add column if not exists spam boolean not null default false;
alter table public.crm_emails add column if not exists labels text[] default '{}';
alter table public.crm_emails add column if not exists thread_id text;
alter table public.crm_emails add column if not exists cc text default '';
alter table public.crm_emails add column if not exists bcc text default '';
alter table public.crm_emails add column if not exists reply_to text default '';

-- Labels table
create table if not exists public.crm_email_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#0066cc',
  created_at timestamptz not null default now()
);

alter table public.crm_email_labels enable row level security;

create policy "crm_email_labels_select" on public.crm_email_labels for select to authenticated using (true);
create policy "crm_email_labels_insert" on public.crm_email_labels for insert to authenticated with check (true);
create policy "crm_email_labels_update" on public.crm_email_labels for update to authenticated using (true);
create policy "crm_email_labels_delete" on public.crm_email_labels for delete to authenticated using (true);

-- Email settings table
create table if not exists public.crm_email_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text unique not null,
  setting_value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.crm_email_settings enable row level security;

create policy "crm_email_settings_select" on public.crm_email_settings for select to authenticated using (true);
create policy "crm_email_settings_insert" on public.crm_email_settings for insert to authenticated with check (true);
create policy "crm_email_settings_update" on public.crm_email_settings for update to authenticated using (true);

-- Indexes
create index if not exists idx_crm_emails_starred on public.crm_emails (starred) where starred = true;
create index if not exists idx_crm_emails_important on public.crm_emails (important) where important = true;
create index if not exists idx_crm_emails_spam on public.crm_emails (spam) where spam = true;
create index if not exists idx_crm_emails_labels on public.crm_emails using gin (labels);

-- Default labels
insert into public.crm_email_labels (name, color) values
  ('Εργασία', '#0066cc'),
  ('Προσωπικό', '#00c878'),
  ('Επείγον', '#ef4444'),
  ('Αποδοχή', '#f59e0b'),
  ('Πληροφορίες', '#8b5cf6')
on conflict do nothing;

-- Default settings
insert into public.crm_email_settings (setting_key, setting_value) values
  ('general', '{"density": "default", "theme": "light", "inbox_type": "default", "reading_pane": "no_split", "max_page_size": 50, "undo_send": 5, "default_reply": "reply", "hover_actions": true, "send_archive": true, "snippets": true, "conversation_view": true, "keyboard_shortcuts": false, "button_labels": "icons"}'),
  ('signature', '{"enabled": false, "content": ""}'),
  ('vacation', '{"enabled": false, "subject": "", "message": "", "start_date": "", "end_date": "", "contacts_only": false}')
on conflict (setting_key) do nothing;
