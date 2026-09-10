-- =============================================================================
-- CRM OS — Phase 1 Foundation
-- -----------------------------------------------------------------------------
-- Highest-priority missing foundation for the CRM OS build out:
--   * organizational spine: organizations, departments, teams, territories
--   * canonical role registry: roles + explicit user_roles
--   * market taxonomy: providers, products, provider_regions
--   * canonical ownership: assignments (entity -> user/team/territory + role)
--   * append-only event backbone: business_events
--   * canonical work items: work_items (the name `tasks` is taken by a legacy
--     compatibility VIEW over calendar_events used by the frontend)
--   * campaigns registry (canonical naming for creative/site campaigns)
--
-- Design rules (matching the live applied convention in this project):
--   * ADDITIVE only — no drops, no type changes, no renamed columns on core tables.
--   * IDEMPOTENT — safe to re-run; all DDL guarded, all seeds ON CONFLICT DO NOTHING.
--   * RLS stays ON for every new table, mirroring the existing policy style
--     (service-role full access, authenticated read, admin write, staff CRUD).
--   * Any authenticated user can read reference/catalog data; writes are
--     admin-scoped (is_role('admin'|'manager')) or staff-scoped where the table
--     is an operational work surface.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Organizations
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  tax_id      text,
  phone       text,
  email       text,
  website     text,
  address     text,
  is_active   boolean not null default true,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Roles (canonical registry)
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  description text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Departments
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name            text not null,
  code            text not null unique,
  description     text,
  head_user_id    uuid references public.profiles(id) on delete set null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Territories
-- ---------------------------------------------------------------------------
create table if not exists public.territories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name            text not null,
  external_code   text unique,
  geometry        jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. Teams
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  department_id   uuid references public.departments(id) on delete set null,
  name            text not null,
  code            text unique,
  lead_user_id    uuid references public.profiles(id) on delete set null,
  territory_id    uuid references public.territories(id) on delete set null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. user_roles (explicit many-to-many, supersedes the single profiles.role text)
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role_id         uuid not null references public.roles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  is_primary      boolean not null default false,
  scope           jsonb not null default '{}'::jsonb,
  granted_by      uuid references public.profiles(id) on delete set null,
  granted_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, role_id)
);

-- ---------------------------------------------------------------------------
-- 7. Providers (energy market providers, spec §82)
-- ---------------------------------------------------------------------------
create table if not exists public.providers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name            text not null,
  slug            text not null,
  category        text not null default 'electricity'
                  check (category in ('electricity','gas','solar','ev','insurance','web','other')),
  tint            text,
  metadata        jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, slug)
);

-- ---------------------------------------------------------------------------
-- 8. Products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  provider_id     uuid references public.providers(id) on delete set null,
  name            text not null,
  code            text,
  category        text not null default 'energy'
                  check (category in ('energy','gas','solar','ev','insurance','web','other')),
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code)
);

-- ---------------------------------------------------------------------------
-- 9. provider_regions
-- ---------------------------------------------------------------------------
create table if not exists public.provider_regions (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  region      text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (provider_id, region)
);

-- ---------------------------------------------------------------------------
-- 10. assignments — canonical ownership for every work entity
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
  id                     uuid primary key default gen_random_uuid(),
  entity_type            text not null,
  entity_id              uuid not null,
  assignee_type          text not null default 'user'
                         check (assignee_type in ('user','team','territory')),
  assignee_user_id       uuid references public.profiles(id) on delete cascade,
  assignee_team_id       uuid references public.teams(id) on delete cascade,
  assignee_territory_id  uuid references public.territories(id) on delete cascade,
  role_type              text not null default 'owner'
                         check (role_type in ('owner','inside_sales','field_sales','support','creator')),
  method                 text not null default 'manual'
                         check (method in ('manual','auto','round_robin','territory','rule')),
  reason                 text,
  is_primary             boolean not null default false,
  is_active              boolean not null default true,
  active_since           timestamptz not null default now(),
  active_through         timestamptz,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists assignments_entity_idx        on public.assignments (entity_type, entity_id);
create index if not exists assignments_user_active_idx   on public.assignments (assignee_user_id) where is_active;
create index if not exists assignments_team_active_idx   on public.assignments (assignee_team_id) where is_active;
create unique index if not exists assignments_primary_uq on public.assignments (entity_type, entity_id, role_type) where is_primary and is_active;

-- ---------------------------------------------------------------------------
-- 11. business_events — append-only event backbone
-- ---------------------------------------------------------------------------
create table if not exists public.business_events (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  text,
  event_type       text not null,
  entity_type      text,
  entity_id        uuid,
  actor_type       text not null default 'user'
                   check (actor_type in ('user','system','agent','webhook')),
  actor_id         uuid references public.profiles(id) on delete set null,
  agent_id         uuid,
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create unique index if not exists business_events_idem_uq   on public.business_events (idempotency_key) where idempotency_key is not null;
create index if not exists business_events_entity_idx      on public.business_events (entity_type, entity_id, created_at);
create index if not exists business_events_type_created_idx on public.business_events (event_type, created_at desc);

create or replace function public.prevent_business_events_mutation()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.idempotency_key is null then
      new.idempotency_key := gen_random_uuid()::text;
    end if;
    return new;
  end if;
  raise exception 'business_events is append-only';
end;
$$;

create trigger business_events_append_only
  before insert or update or delete on public.business_events
  for each row execute function public.prevent_business_events_mutation();

-- ---------------------------------------------------------------------------
-- 12. work_items — canonical work items
-- ---------------------------------------------------------------------------
-- NOTE: the name `tasks` is taken by a legacy compatibility VIEW over
-- calendar_events (event_type task/reminder) that the frontend still selects
-- from. The canonical table is therefore `work_items`.
create table if not exists public.work_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  subject         text not null,
  description     text,
  status          text not null default 'open'
                  check (status in ('open','in_progress','done','cancelled')),
  priority        text not null default 'medium'
                  check (priority in ('low','medium','high','urgent')),
  entity_type     text,
  entity_id       uuid,
  assignee_id     uuid references public.profiles(id) on delete set null,
  due_at          timestamptz,
  completed_at    timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists work_items_assignee_status_idx on public.work_items (assignee_id, status, due_at);
create index if not exists work_items_entity_idx          on public.work_items (entity_type, entity_id);
create index if not exists work_items_due_idx             on public.work_items (due_at) where status in ('open','in_progress');

-- ---------------------------------------------------------------------------
-- 13. campaigns
-- ---------------------------------------------------------------------------
create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name            text not null,
  slug            text not null unique,
  type            text not null default 'creative'
                  check (type in ('creative','site','partner','other')),
  status          text not null default 'draft'
                  check (status in ('draft','active','paused','archived')),
  description     text,
  start_at        timestamptz,
  end_at          timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 14. Extend profiles (ADDITIVE only) — organizational spine on users
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists organization_id   uuid references public.organizations(id) on delete set null,
  add column if not exists department_id     uuid references public.departments(id) on delete set null,
  add column if not exists team_id           uuid references public.teams(id) on delete set null,
  add column if not exists territory_id      uuid references public.territories(id) on delete set null,
  add column if not exists manager_id        uuid references public.profiles(id) on delete set null,
  add column if not exists job_title         text,
  add column if not exists timezone          text not null default 'Europe/Athens',
  add column if not exists language          text not null default 'el',
  add column if not exists availability_status text not null default 'available'
                  check (availability_status in ('available','busy','away','offline')),
  add column if not exists is_active         boolean not null default true,
  add column if not exists last_login_at     timestamptz;

create index if not exists profiles_org_idx     on public.profiles (organization_id);
create index if not exists profiles_team_idx    on public.profiles (team_id);
create index if not exists profiles_manager_idx on public.profiles (manager_id);

-- ---------------------------------------------------------------------------
-- 15. RLS — enable + policies (existing style)
-- ---------------------------------------------------------------------------
alter table public.organizations       enable row level security;
alter table public.roles               enable row level security;
alter table public.departments         enable row level security;
alter table public.territories         enable row level security;
alter table public.teams               enable row level security;
alter table public.user_roles          enable row level security;
alter table public.providers           enable row level security;
alter table public.products            enable row level security;
alter table public.provider_regions    enable row level security;
alter table public.assignments         enable row level security;
alter table public.business_events     enable row level security;
alter table public.work_items          enable row level security;
alter table public.campaigns           enable row level security;

do $$
declare r record;
begin
  for r in select 'organizations'::text as t
         union all select 'roles' union all select 'departments' union all select 'territories'
         union all select 'teams' union all select 'user_roles' union all select 'providers'
         union all select 'products' union all select 'provider_regions' union all select 'assignments'
         union all select 'business_events' union all select 'work_items' union all select 'campaigns'
  loop
    execute format('drop policy if exists %I on public.%I', 'Service role full access on ' || r.t, r.t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)',
                   'Service role full access on ' || r.t, r.t);
    execute format('drop policy if exists %I on public.%I', 'authenticated read ' || r.t, r.t);
    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   'authenticated read ' || r.t, r.t);
  end loop;
end $$;

-- operational work surfaces: staff CRUD + admin delete (matches cases/leads/etc.)
do $$
declare r record;
begin
  for r in select 'assignments'::text as t
         union all select 'work_items' union all select 'campaigns'
  loop
    execute format('drop policy if exists %I on public.%I', 'staff insert ' || r.t, r.t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_staff())',
                   'staff insert ' || r.t, r.t);
    execute format('drop policy if exists %I on public.%I', 'staff update ' || r.t, r.t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())',
                   'staff update ' || r.t, r.t);
    execute format('drop policy if exists %I on public.%I', 'admin delete ' || r.t, r.t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_role(''admin'') or public.is_role(''manager''))',
                   'admin delete ' || r.t, r.t);
  end loop;
end $$;

-- business_events: append via insert only for staff; no update/delete for authenticated
do $$
begin
  execute 'drop policy if exists "staff insert business_events" on public.business_events';
  execute 'create policy "staff insert business_events" on public.business_events for insert to authenticated with check (public.is_staff())';
end $$;

-- reference/catalog tables: admin writes, authenticated read (created above)
do $$
declare r record;
begin
  for r in select 'organizations'::text as t
         union all select 'roles' union all select 'departments' union all select 'territories'
         union all select 'teams' union all select 'user_roles' union all select 'providers'
         union all select 'products' union all select 'provider_regions'
  loop
    execute format('drop policy if exists %I on public.%I', 'admin insert ' || r.t, r.t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_role(''admin'') or public.is_role(''manager''))',
                   'admin insert ' || r.t, r.t);
    execute format('drop policy if exists %I on public.%I', 'admin update ' || r.t, r.t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_role(''admin'') or public.is_role(''manager'')) with check (public.is_role(''admin'') or public.is_role(''manager''))',
                   'admin update ' || r.t, r.t);
    execute format('drop policy if exists %I on public.%I', 'admin delete ' || r.t, r.t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_role(''admin'') or public.is_role(''manager''))',
                   'admin delete ' || r.t, r.t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 16. updated_at triggers for the new tables
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['organizations','roles','departments','territories','teams','user_roles','providers','products','provider_regions','assignments','work_items','campaigns']
  loop
    if not exists (
      select 1 from pg_trigger
      where tgrelid = ('public.' || t)::regclass and not tgisinternal and tgname = t || '_updated_at'
    ) then
      execute format('create trigger %I before update on public.%I for each row execute function public.update_updated_at()',
                     t || '_updated_at', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 17. Seeds — idempotent
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug, email, website)
values ('00000000-0000-0000-0000-00000000c001', 'Hlektrismos.gr', 'hlektrismos', 'info@hlektrismos.gr', 'https://hlektrismos.gr')
on conflict (slug) do nothing;

insert into public.roles (key, name, description, sort_order) values
  ('admin',         'Admin',         'Πλήρης πρόσβαση διαχείρισης',             1),
  ('manager',       'Manager',       'Διαχείριση ομάδας και λειτουργικών ροών', 2),
  ('inside_sales',  'Inside Sales',  'Εσωτερικές πωλήσεις (leads & cases)',     3),
  ('field_sales',   'Field Sales',   'Πωλήσεις πεδίου (χάρτης, επισκέψεις)',   4),
  ('back_office',   'Back Office',   'Υποστήριξη/παρασκήνιο',                    5)
on conflict (key) do nothing;

insert into public.providers (organization_id, slug, name, category) values
  ('00000000-0000-0000-0000-00000000c001', 'dei',       'ΔΕΗ',                    'electricity'),
  ('00000000-0000-0000-0000-00000000c001', 'protergia', 'Protergia',              'electricity'),
  ('00000000-0000-0000-0000-00000000c001', 'iron',      'ΗΡΩΝ',                   'electricity'),
  ('00000000-0000-0000-0000-00000000c001', 'elpedison', 'Elpedison',              'electricity'),
  ('00000000-0000-0000-0000-00000000c001', 'nrg',       'NRG',                    'electricity'),
  ('00000000-0000-0000-0000-00000000c001', 'volton',    'Volton',                 'electricity'),
  ('00000000-0000-0000-0000-00000000c001', 'zenith',    'Ζενίθ',                  'electricity'),
  ('00000000-0000-0000-0000-00000000c001', 'fge',       'Φυσικό Αέριο Ελλάδος',  'gas'),
  ('00000000-0000-0000-0000-00000000c001', 'wattvolt',  'Watt+Volt',              'electricity'),
  ('00000000-0000-0000-0000-00000000c001', 'elin',      'Elin',                   'electricity'),
  ('00000000-0000-0000-0000-00000000c001', 'solar',     'Φωτοβολταϊκά (Solar)',  'solar'),
  ('00000000-0000-0000-0000-00000000c001', 'other',     'Άλλος πάροχος',          'other')
on conflict (organization_id, slug) do nothing;

insert into public.products (organization_id, code, category, name) values
  ('00000000-0000-0000-0000-00000000c001', 'energy',    'energy',     'Ηλεκτρικό ρεύμα'),
  ('00000000-0000-0000-0000-00000000c001', 'gas',       'gas',        'Φυσικό αέριο'),
  ('00000000-0000-0000-0000-00000000c001', 'solar',     'solar',      'Φωτοβολταϊκά'),
  ('00000000-0000-0000-0000-00000000c001', 'ev',        'ev',         'Ηλεκτροκίνηση'),
  ('00000000-0000-0000-0000-00000000c001', 'insurance', 'insurance',  'Ασφάλιση'),
  ('00000000-0000-0000-0000-00000000c001', 'web',       'web',        'Υπηρεσίες web')
on conflict (organization_id, code) do nothing;

-- backfill existing profiles into the org spine
update public.profiles p
set organization_id = '00000000-0000-0000-0000-00000000c001'
where p.organization_id is null;

-- mirror profiles.role into user_roles (primary), one per user
insert into public.user_roles (user_id, role_id, organization_id, is_primary)
select p.id, r.id, '00000000-0000-0000-0000-00000000c001', true
from public.profiles p
join public.roles r on r.key = p.role
where p.role is not null and p.role <> ''
on conflict (user_id, role_id) do nothing;

-- backfill canonical ownership from existing owner columns (cases, leads)
insert into public.assignments (entity_type, entity_id, assignee_type, assignee_user_id, role_type, method, reason, is_primary, is_active, created_by)
select 'case', c.id, 'user', c.owner_id, 'owner', 'auto', 'backfill from cases.owner_id', true, true, c.owner_id
from public.cases c
where c.owner_id is not null
  and not exists (
    select 1 from public.assignments a
    where a.entity_type = 'case' and a.entity_id = c.id and a.role_type = 'owner' and a.assignee_type = 'user' and a.is_active
  )
on conflict do nothing;

insert into public.assignments (entity_type, entity_id, assignee_type, assignee_user_id, role_type, method, reason, is_primary, is_active, created_by)
select 'case', c.id, 'user', c.inside_sales_owner, 'inside_sales', 'auto', 'backfill from cases.inside_sales_owner', true, true, c.inside_sales_owner
from public.cases c
where c.inside_sales_owner is not null
  and not exists (
    select 1 from public.assignments a
    where a.entity_type = 'case' and a.entity_id = c.id and a.role_type = 'inside_sales' and a.assignee_type = 'user' and a.is_active
  )
on conflict do nothing;

insert into public.assignments (entity_type, entity_id, assignee_type, assignee_user_id, role_type, method, reason, is_primary, is_active, created_by)
select 'lead', l.id, 'user', l.assigned_to_user_id, 'owner', 'auto', 'backfill from leads.assigned_to_user_id', true, true, l.assigned_to_user_id
from public.leads l
where l.assigned_to_user_id is not null
  and not exists (
    select 1 from public.assignments a
    where a.entity_type = 'lead' and a.entity_id = l.id and a.role_type = 'owner' and a.assignee_type = 'user' and a.is_active
  )
on conflict do nothing;

commit;