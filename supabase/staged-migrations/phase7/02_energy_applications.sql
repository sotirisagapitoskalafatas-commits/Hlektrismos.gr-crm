-- STAGED — NOT APPLIED. Apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 7 / 02: the energy-service APPLICATION (a request to start ONE energy service on ONE supply point), its versioned documents, and the operations around it
-- (docs/product/FIELD_VISITS_AND_APPLICATIONS.md §3 and §4). Additive and idempotent. An Application is not a Lead, not a Customer and not a Case.
--
--   * application_service_types  admin-editable list of services (energy, gas, solar, ev, insurance, web: the list convert_lead_to_case already uses).
--                                No provider, tariff or price is invented anywhere.
--   * energy_applications        origin = an existing Customer or a Lead (never both missing); the supply point it concerns; service; free provider /
--                                program / tariff text only when known; wizard_step + service_details so a DRAFT survives closing the browser; status
--                                draft → submitted → in_review → processing → approved → completed, with needs_documents, rejected and withdrawn.
--   * application_documents      one row per VERSION of a document. A replacement inserts version n+1 and marks the previous row superseded; nothing is
--                                overwritten and nothing is deleted. Files live in the private bucket client_documents under applications/<application>/…
--   * cases.application_id       a Case never exists for a draft. Submitting creates the Case (stage «new», exactly like a lead conversion; the Case
--                                workflow is untouched) and links it as primary_case_id; cases.application_id is NOT unique, so a later, separate
--                                operational Case may point at the same Application.
--   * submit_energy_application  one transaction: validate → resolve the customer (a lead is converted by the existing convert_lead_to_case, never a
--                                parallel path) → create / link the Case → re-point the supply references if the conversion took the duplicate branch of
--                                phase5/18 → assign the default Back Office assignee → audit → notify.
--   * Storage                    sales_can_read_object / sales_can_write_object (phase4/21) are extended with an application branch; every earlier branch
--                                is kept. A new RESTRICTIVE policy forbids deleting applications/… objects for everybody signed in (history is evidence).
--   * Access: Admin / Back Office everything; a Sales Agent only applications whose customer or lead is theirs (or that they created / were assigned).
--     Missing documents never block a submit or any stage; Back Office asks for them with request_application_documents() which also creates a follow-up.
-- Requires: phase7/01, phase4/12 (default Back Office assignee), phase4/21 (storage helpers), phase5/17 + 18.
-- Rollback: docs/ops/rollback_phase7_02_energy_applications.sql.

do $$
begin
  if to_regclass('public.case_visits') is null or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'case_visits' and column_name = 'prospect') then
    raise exception 'phase7/02 needs phase7/01_standalone_field_visits applied first';
  end if;
  if to_regprocedure('public.sales_can_read_object(text,text)') is null or to_regprocedure('public.sales_can_write_object(text,text)') is null then
    raise exception 'phase7/02 needs phase4/21_sales_isolation_completion applied first (storage helpers)';
  end if;
  if to_regprocedure('public.default_backoffice_assignee()') is null then
    raise exception 'phase7/02 needs phase4/12_default_backoffice_assignee applied first';
  end if;
end $$;

-- ───────────────────────── service types (configurable) ─────────────────────────
create table if not exists public.application_service_types (
  code text primary key check (btrim(code) <> ''),
  label text not null default '',
  active boolean not null default true,
  sort integer not null default 100,
  notes text not null default '',
  created_at timestamptz not null default now()
);
alter table public.application_service_types enable row level security;
drop policy if exists "staff read service types" on public.application_service_types;
create policy "staff read service types" on public.application_service_types for select to authenticated using (public.is_staff());
drop policy if exists "admin write service types" on public.application_service_types;
create policy "admin write service types" on public.application_service_types for all to authenticated using (public.is_role('admin')) with check (public.is_role('admin'));
revoke all on public.application_service_types from anon, authenticated;     -- Supabase's default privileges grant everything; take it back first
grant select, insert, update on public.application_service_types to authenticated;
insert into public.application_service_types (code, label, sort) values
  ('energy', 'Ρεύμα', 10), ('gas', 'Φυσικό αέριο', 20), ('solar', 'Φωτοβολταϊκά', 30), ('ev', 'Ηλεκτροκίνηση', 40), ('insurance', 'Ασφάλιση', 50), ('web', 'Web', 60)
on conflict (code) do nothing;

-- ───────────────────────── applications ─────────────────────────
create sequence if not exists public.energy_application_no_seq;
create table if not exists public.energy_applications (
  id uuid primary key default gen_random_uuid(),
  application_no text not null unique default ('AP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.energy_application_no_seq')::text, 5, '0')),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'in_review', 'needs_documents', 'processing', 'approved', 'rejected', 'withdrawn', 'completed')),
  status_reason text,
  status_changed_at timestamptz not null default now(),
  customer_id uuid references public.customers(id),
  lead_id uuid references public.leads(id),
  supply_point_id uuid references public.customer_supply_points(id),
  service_type_code text references public.application_service_types(code),
  service_details jsonb not null default '{}'::jsonb,
  provider_name text,
  program_name text,
  tariff_name text,
  notes text not null default '',
  wizard_step integer not null default 1 check (wizard_step between 1 and 5),
  assigned_to_user_id uuid references public.profiles(id),
  primary_case_id uuid references public.cases(id),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id),
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint energy_applications_origin check (num_nonnulls(customer_id, lead_id) >= 1)
);
create index if not exists energy_applications_customer_idx on public.energy_applications (customer_id) where customer_id is not null;
create index if not exists energy_applications_lead_idx on public.energy_applications (lead_id) where lead_id is not null;
create index if not exists energy_applications_supply_idx on public.energy_applications (supply_point_id) where supply_point_id is not null;
create index if not exists energy_applications_status_idx on public.energy_applications (status, submitted_at desc);

alter table public.cases add column if not exists application_id uuid references public.energy_applications(id);
create index if not exists cases_application_idx on public.cases (application_id) where application_id is not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'case_visits_application_fk' and conrelid = 'public.case_visits'::regclass) then
    alter table public.case_visits add constraint case_visits_application_fk foreign key (application_id) references public.energy_applications(id);
  end if;
end $$;
create index if not exists case_visits_application_idx on public.case_visits (application_id) where application_id is not null;

alter table public.energy_applications enable row level security;
drop policy if exists "staff read applications" on public.energy_applications;
create policy "staff read applications" on public.energy_applications for select to authenticated using (public.is_staff());
drop policy if exists "staff insert applications" on public.energy_applications;
create policy "staff insert applications" on public.energy_applications for insert to authenticated with check (public.is_staff());
drop policy if exists "staff update applications" on public.energy_applications;
create policy "staff update applications" on public.energy_applications for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- A Sales Agent only ever sees / changes applications of their own customers and leads (restrictive: it can only take rows away).
drop policy if exists "sales own records (restrictive)" on public.energy_applications;
create policy "sales own records (restrictive)" on public.energy_applications as restrictive for all to authenticated
  using (not public.is_sales_agent() or created_by = auth.uid() or assigned_to_user_id = auth.uid()
         or (customer_id is not null and public.sales_owns_customer(customer_id)) or (lead_id is not null and public.sales_owns_lead(lead_id)))
  with check (not public.is_sales_agent() or created_by = auth.uid() or assigned_to_user_id = auth.uid()
         or (customer_id is not null and public.sales_owns_customer(customer_id)) or (lead_id is not null and public.sales_owns_lead(lead_id)));
revoke all on public.energy_applications from anon, authenticated;           -- Supabase's default privileges grant everything; take it back first
grant select, insert, update on public.energy_applications to authenticated;     -- no delete: withdraw instead
grant all on public.energy_applications to service_role;

-- Guard. It binds only what a SIGNED-IN USER does directly (current_user = 'authenticated'); the SECURITY DEFINER operations below run as the owner and
-- are the only way to submit, convert, re-point or withdraw.
create or replace function public.energy_applications_guard()
returns trigger language plpgsql set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sales boolean;
  v_sc uuid; v_sl uuid; v_converted_customer uuid;
  v_ok boolean;
  v_open text[] := array['draft', 'needs_documents'];
begin
  if current_user <> 'authenticated' or v_uid is null then
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return new;
  end if;
  v_sales := coalesce(public.is_sales_agent(), false);

  if tg_op = 'INSERT' then
    new.status := 'draft'; new.status_reason := null; new.status_changed_at := now();
    new.created_by := v_uid; new.updated_by := v_uid;
    new.submitted_at := null; new.submitted_by := null; new.primary_case_id := null; new.archived_at := null;
    if v_sales then
      new.assigned_to_user_id := coalesce(new.assigned_to_user_id, v_uid);
      if new.assigned_to_user_id <> v_uid then raise exception 'application: a Sales Agent creates applications for themselves' using errcode = '42501'; end if;
    end if;
    if new.customer_id is not null then
      if v_sales and not public.sales_owns_customer(new.customer_id) then raise exception 'application: the customer is not yours' using errcode = '42501'; end if;
    end if;
    if new.lead_id is not null then
      if v_sales and not public.sales_owns_lead(new.lead_id) then raise exception 'application: the lead is not yours' using errcode = '42501'; end if;
    end if;
  else
    new.updated_at := now(); new.updated_by := v_uid;
    if new.application_no is distinct from old.application_no or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
       or new.customer_id is distinct from old.customer_id or new.lead_id is distinct from old.lead_id
       or new.primary_case_id is distinct from old.primary_case_id or new.submitted_at is distinct from old.submitted_at or new.submitted_by is distinct from old.submitted_by then
      raise exception 'application: the number, creator, customer, lead, case link and submission are set by the system' using errcode = '42501';
    end if;
    if old.status in ('rejected', 'withdrawn', 'completed') then
      raise exception 'application: a % application is closed', old.status using errcode = '23514';
    end if;
    if new.assigned_to_user_id is distinct from old.assigned_to_user_id and v_sales then
      raise exception 'application: only Admin / Back Office reassigns an application' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if v_sales then raise exception 'application: a Sales Agent submits or withdraws through the dedicated operations' using errcode = '42501'; end if;
      if not ((old.status = 'submitted' and new.status in ('in_review', 'needs_documents', 'rejected'))
           or (old.status = 'in_review' and new.status in ('processing', 'needs_documents', 'rejected'))
           or (old.status = 'processing' and new.status in ('approved', 'needs_documents', 'rejected'))
           or (old.status = 'needs_documents' and new.status in ('submitted', 'in_review', 'rejected'))
           or (old.status = 'approved' and new.status = 'completed')
           or (new.status = 'withdrawn')) then
        raise exception 'application: % -> % is not allowed', old.status, new.status using errcode = '23514';
      end if;
      if new.status in ('needs_documents', 'rejected', 'withdrawn') and nullif(btrim(coalesce(new.status_reason, '')), '') is null then
        raise exception 'application: a reason is required for %', new.status using errcode = '23514';
      end if;
      new.status_changed_at := now();
    else
      -- the content of an application is editable while it is a draft or waiting for documents (Back Office may always correct it)
      if v_sales and not (old.status = any (v_open)) and (new.supply_point_id is distinct from old.supply_point_id or new.service_type_code is distinct from old.service_type_code
          or new.service_details is distinct from old.service_details or new.provider_name is distinct from old.provider_name or new.program_name is distinct from old.program_name
          or new.tariff_name is distinct from old.tariff_name) then
        raise exception 'application: a submitted application is read-only for the Sales Agent' using errcode = '42501';
      end if;
    end if;
  end if;

  if new.service_type_code is not null and not exists (select 1 from public.application_service_types t where t.code = new.service_type_code and (t.active or (tg_op = 'UPDATE' and new.service_type_code is not distinct from old.service_type_code))) then
    raise exception 'application: unknown or inactive service type %', new.service_type_code using errcode = '23514';
  end if;
  if new.supply_point_id is not null and (tg_op = 'INSERT' or new.supply_point_id is distinct from old.supply_point_id
      or new.customer_id is distinct from old.customer_id or new.lead_id is distinct from old.lead_id) then
    select s.customer_id, s.lead_id into v_sc, v_sl from public.customer_supply_points s where s.id = new.supply_point_id;
    if not found then raise exception 'application: the supply point does not exist or is not visible to you' using errcode = '23514'; end if;
    v_converted_customer := null;
    if new.lead_id is not null then
      select c.customer_id into v_converted_customer
        from public.leads l join public.cases c on c.id = l.converted_case_id
       where l.id = new.lead_id;
    end if;
    if not ((v_sc is not null and v_sc is not distinct from new.customer_id)
        or (v_sl is not null and v_sl is not distinct from new.lead_id)
        or (v_converted_customer is not null and v_sc = v_converted_customer
            and (new.customer_id is null or new.customer_id = v_converted_customer))) then
      raise exception 'application: the supply point belongs to another customer or lead' using errcode = '23514';
    end if;
    if v_sales then
      v_ok := public.sales_owns_entity('supply_point', new.supply_point_id);
      if not coalesce(v_ok, false) then raise exception 'application: the supply point is not yours' using errcode = '42501'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.energy_applications_guard() from public, anon, authenticated;
drop trigger if exists energy_applications_guard_trg on public.energy_applications;
create trigger energy_applications_guard_trg before insert or update on public.energy_applications for each row execute function public.energy_applications_guard();

create or replace function public.energy_applications_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_base jsonb := jsonb_build_object('actor_id', auth.uid(), 'application_no', new.application_no, 'customer_id', new.customer_id, 'lead_id', new.lead_id,
                                     'supply_point_id', new.supply_point_id, 'primary_case_id', new.primary_case_id);
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (entity_type, entity_id, action, details) values ('application', new.id, 'application_created', v_base || jsonb_build_object('service', new.service_type_code));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('application', new.id, 'application_' || new.status, v_base || jsonb_build_object('from', old.status, 'reason', new.status_reason));
  end if;
  if new.assigned_to_user_id is distinct from old.assigned_to_user_id then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('application', new.id, 'application_reassigned', v_base || jsonb_build_object('from_user_id', old.assigned_to_user_id, 'to_user_id', new.assigned_to_user_id));
  end if;
  if new.supply_point_id is distinct from old.supply_point_id or new.service_type_code is distinct from old.service_type_code then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('application', new.id, 'application_changed', v_base || jsonb_build_object('supply_from', old.supply_point_id, 'service_from', old.service_type_code));
  end if;
  return new;
end $$;
revoke all on function public.energy_applications_audit() from public, anon, authenticated;
drop trigger if exists energy_applications_audit_trg on public.energy_applications;
create trigger energy_applications_audit_trg after insert or update on public.energy_applications for each row execute function public.energy_applications_audit();

-- ───────────────────────── documents with version history ─────────────────────────
create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.energy_applications(id),
  supply_point_id uuid references public.customer_supply_points(id),
  customer_id uuid references public.customers(id),
  doc_type text not null check (btrim(doc_type) <> ''),
  version integer not null check (version >= 1),
  is_current boolean not null default true,
  supersedes_id uuid references public.application_documents(id),
  superseded_at timestamptz,
  superseded_by uuid references public.profiles(id),
  storage_bucket text not null default 'client_documents' check (storage_bucket = 'client_documents'),
  storage_path text not null check (btrim(storage_path) <> ''),
  file_name text not null default '',
  mime_type text not null default '',
  size integer not null default 0 check (size >= 0),
  status text not null default 'received' check (status in ('received', 'verified', 'rejected')),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint application_documents_path check (storage_path like 'applications/' || application_id::text || '/%')
);
create unique index if not exists application_documents_version_uq on public.application_documents (application_id, doc_type, coalesce(supply_point_id, '00000000-0000-0000-0000-000000000000'::uuid), version);
create unique index if not exists application_documents_current_uq on public.application_documents (application_id, doc_type, coalesce(supply_point_id, '00000000-0000-0000-0000-000000000000'::uuid)) where is_current;
create unique index if not exists application_documents_path_uq on public.application_documents (storage_path);
create index if not exists application_documents_app_idx on public.application_documents (application_id, created_at desc);

alter table public.application_documents enable row level security;
drop policy if exists "staff read application documents" on public.application_documents;
create policy "staff read application documents" on public.application_documents for select to authenticated using (public.is_staff());
drop policy if exists "sales own records (restrictive)" on public.application_documents;
create policy "sales own records (restrictive)" on public.application_documents as restrictive for select to authenticated
  using (not public.is_sales_agent() or public.sales_owns_entity('application', application_id));
revoke all on public.application_documents from anon, authenticated;
grant select on public.application_documents to authenticated;               -- writes only through the functions below (versions are never edited in place)
grant all on public.application_documents to service_role;

create or replace function public.add_application_document(p_application uuid, p_doc_type text, p_storage_path text, p_file_name text, p_mime text, p_size integer, p_supply uuid default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  a public.energy_applications%rowtype;
  v_prev public.application_documents%rowtype;
  v_id uuid; v_ver integer;
  v_sales boolean := coalesce(public.is_sales_agent(), false);
begin
  if not public.is_staff() then raise exception 'document: staff only' using errcode = '42501'; end if;
  select * into a from public.energy_applications where id = p_application for update;
  if a.id is null then raise exception 'document: application not found' using errcode = 'P0002'; end if;
  if v_sales and not public.sales_owns_entity('application', a.id) then raise exception 'document: the application is not yours' using errcode = '42501'; end if;
  if a.status in ('rejected', 'withdrawn', 'completed') then raise exception 'document: the application is % (closed)', a.status using errcode = '23514'; end if;
  if nullif(btrim(coalesce(p_doc_type, '')), '') is null then raise exception 'document: the document type is required' using errcode = '22023'; end if;
  if p_storage_path is null or p_storage_path not like 'applications/' || a.id::text || '/%' then raise exception 'document: the file must be stored under applications/<application>/' using errcode = '22023'; end if;
  if p_supply is not null and p_supply is distinct from a.supply_point_id then
    if not exists (
      select 1 from public.customer_supply_points s
       where s.id = p_supply
         and (
           (s.customer_id is not null and s.customer_id = a.customer_id)
           or (s.lead_id is not null and s.lead_id = a.lead_id)
           or exists (
             select 1 from public.leads l join public.cases c on c.id = l.converted_case_id
              where l.id = a.lead_id and c.customer_id = s.customer_id and s.customer_id is not null
           )
         )
    ) then
      raise exception 'document: the supply point does not belong to this application''s customer' using errcode = '23514';
    end if;
  end if;
  select * into v_prev from public.application_documents
   where application_id = a.id and doc_type = p_doc_type and supply_point_id is not distinct from coalesce(p_supply, a.supply_point_id) and is_current for update;
  v_ver := coalesce((select max(version) from public.application_documents where application_id = a.id and doc_type = p_doc_type
                       and supply_point_id is not distinct from coalesce(p_supply, a.supply_point_id)), 0) + 1;
  if v_prev.id is not null then
    update public.application_documents set is_current = false, superseded_at = now(), superseded_by = auth.uid() where id = v_prev.id;
  end if;
  insert into public.application_documents (application_id, supply_point_id, customer_id, doc_type, version, is_current, supersedes_id, storage_path, file_name, mime_type, size, uploaded_by)
  values (a.id, coalesce(p_supply, a.supply_point_id), a.customer_id, p_doc_type, v_ver, true, v_prev.id, p_storage_path, coalesce(p_file_name, ''), coalesce(p_mime, ''), coalesce(p_size, 0), auth.uid())
  returning id into v_id;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('application', a.id, case when v_prev.id is null then 'application_document_added' else 'application_document_replaced' end,
          jsonb_build_object('actor_id', auth.uid(), 'document_id', v_id, 'doc_type', p_doc_type, 'version', v_ver, 'supersedes_id', v_prev.id, 'supply_point_id', coalesce(p_supply, a.supply_point_id)));
  -- Documents delivered while Back Office was waiting for them put the application back in the queue.
  if a.status = 'needs_documents' then
    update public.energy_applications set status = 'submitted', status_reason = null where id = a.id;
  end if;
  return v_id;
end $$;

create or replace function public.set_application_document_status(p_id uuid, p_status text, p_note text default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare d public.application_documents%rowtype;
begin
  if not public.is_role('admin') then raise exception 'document: only Admin / Back Office verifies documents' using errcode = '42501'; end if;
  if p_status not in ('received', 'verified', 'rejected') then raise exception 'document: unknown status' using errcode = '22023'; end if;
  select * into d from public.application_documents where id = p_id;
  if d.id is null then return false; end if;
  if not d.is_current then raise exception 'document: only the current version is reviewed' using errcode = '23514'; end if;
  update public.application_documents set status = p_status, verified_by = auth.uid(), verified_at = case when p_status = 'verified' then now() else null end where id = p_id;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('application', d.application_id, 'application_document_' || p_status, jsonb_build_object('actor_id', auth.uid(), 'document_id', p_id, 'doc_type', d.doc_type, 'version', d.version, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  return true;
end $$;
revoke all on function public.add_application_document(uuid, text, text, text, text, integer, uuid), public.set_application_document_status(uuid, text, text) from public, anon;
grant execute on function public.add_application_document(uuid, text, text, text, text, integer, uuid), public.set_application_document_status(uuid, text, text) to authenticated, service_role;

-- ───────────────────────── storage: the application branch (all earlier branches kept) ─────────────────────────
create or replace function public.sales_can_read_object(p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  id_text text := parts[2];
begin
  if p_bucket = 'hlektrismos_docs' then
    if parts[1] = 'leads' and id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return public.sales_owns_lead(id_text::uuid);
    end if;
    if parts[1] = 'contact-forms' then
      return exists (select 1 from public.leads l
                     where l.attached_files @> jsonb_build_array(jsonb_build_object('path', p_name)) and public.sales_owns_lead(l.id))
          or exists (select 1 from public.case_documents d
                     where d.file_url = 'hlektrismos_docs/' || p_name and public.sales_owns_case(d.case_id)); -- lib/lead-files leadFileRef()
    end if;
    return false;
  end if;
  if p_bucket = 'client_documents' then
    return exists (select 1 from public.case_documents d where d.file_url = p_name and public.sales_owns_case(d.case_id))
        or exists (select 1 from public.application_documents ad where ad.storage_path = p_name and public.sales_owns_entity('application', ad.application_id));
  end if;
  return p_bucket not in ('energy-bills');
end;
$$;

create or replace function public.sales_can_write_object(p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if p_bucket = 'hlektrismos_docs' then
    return parts[1] = 'leads' and parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and public.sales_owns_lead(parts[2]::uuid);
  end if;
  if p_bucket = 'client_documents' then
    return parts[1] = 'cases' -- case uploads carry no case id; reading them back is limited above
        or (parts[1] = 'applications' and parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and public.sales_owns_entity('application', parts[2]::uuid));
  end if;
  return p_bucket not in ('energy-bills');
end;
$$;
revoke all on function public.sales_can_read_object(text, text) from public, anon;
revoke all on function public.sales_can_write_object(text, text) from public, anon;
grant execute on function public.sales_can_read_object(text, text) to authenticated, service_role;
grant execute on function public.sales_can_write_object(text, text) to authenticated, service_role;

-- Application evidence is never deleted through the API, by anybody signed in (a replacement is a new version). service_role is unaffected.
drop policy if exists "application files are not deleted (restrictive)" on storage.objects;
create policy "application files are not deleted (restrictive)" on storage.objects as restrictive for delete to authenticated
  using (not (bucket_id = 'client_documents' and name like 'applications/%'));

-- ───────────────────────── operations ─────────────────────────
create or replace function public.submit_energy_application(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $
declare
  a public.energy_applications%rowtype;
  v_lead public.leads%rowtype;
  v_existing_case public.cases%rowtype;
  v_sales boolean := coalesce(public.is_sales_agent(), false);
  v_case uuid; v_customer uuid; v_service text; v_title text; v_assignee uuid;
  v_target_sp uuid; v_case_supply uuid; v_docs integer;
  v_fresh_conversion boolean := false;
begin
  if not public.is_staff() then raise exception 'application: staff only' using errcode = '42501'; end if;
  select * into a from public.energy_applications where id = p_id for update;
  if a.id is null then raise exception 'application: not found' using errcode = 'P0002'; end if;
  if v_sales and not public.sales_owns_entity('application', a.id) then raise exception 'application: not yours' using errcode = '42501'; end if;

  -- Network retries return the original submission; they do not create or attach another Case.
  if a.status <> 'draft' then
    if a.submitted_at is not null and a.primary_case_id is not null
       and exists (select 1 from public.cases c where c.id = a.primary_case_id and c.application_id = a.id) then
      return jsonb_build_object('application_id', a.id, 'application_no', a.application_no, 'case_id', a.primary_case_id,
        'customer_id', a.customer_id, 'status', a.status, 'idempotent', true);
    end if;
    raise exception 'application: only a draft is submitted (it is %)', a.status using errcode = '23514';
  end if;
  if a.supply_point_id is null then raise exception 'Επιλέξτε την παροχή της αίτησης πριν την υποβολή.' using errcode = '23514'; end if;
  if a.service_type_code is null then raise exception 'Επιλέξτε την υπηρεσία της αίτησης πριν την υποβολή.' using errcode = '23514'; end if;

  v_service := a.service_type_code;
  v_customer := a.customer_id;
  v_target_sp := a.supply_point_id;

  if a.lead_id is not null then
    select * into v_lead from public.leads where id = a.lead_id for update;
    if v_lead.id is null then raise exception 'application: lead not found' using errcode = 'P0002'; end if;
    if v_lead.converted_case_id is null then
      v_case := public.convert_lead_to_case(a.lead_id);
      v_fresh_conversion := true;
      select * into v_lead from public.leads where id = a.lead_id;
    end if;
    if v_lead.converted_case_id is null then raise exception 'application: the Lead has no converted Case' using errcode = '23514'; end if;

    select * into v_existing_case from public.cases where id = v_lead.converted_case_id for update;
    if v_existing_case.id is null then raise exception 'application: the converted Case no longer exists' using errcode = '23514'; end if;
    if v_customer is not null and v_customer is distinct from v_existing_case.customer_id then
      raise exception 'application: the selected Customer does not match the converted Lead' using errcode = '23514';
    end if;
    v_customer := v_existing_case.customer_id;
    if v_customer is null then raise exception 'application: the converted Case has no Customer' using errcode = '23514'; end if;

    -- phase5/18 duplicate branch: repoint only this Application and its linked visit/documents.
    if v_existing_case.supply_point_id is not null
       and v_existing_case.supply_point_id is distinct from a.supply_point_id
       and exists (select 1 from public.customer_supply_points s where s.id = a.supply_point_id and s.lead_id = a.lead_id and s.customer_id is null)
       and exists (select 1 from public.customer_supply_points s where s.id = v_existing_case.supply_point_id and s.customer_id = v_customer) then
      v_target_sp := v_existing_case.supply_point_id;
      update public.energy_applications set supply_point_id = v_target_sp where id = a.id;
      update public.case_visits set supply_point_id = v_target_sp
       where application_id = a.id and supply_point_id = a.supply_point_id;
      update public.application_documents set supply_point_id = v_target_sp
       where application_id = a.id and supply_point_id = a.supply_point_id;
      insert into public.activity_log (entity_type, entity_id, action, details)
      values ('application', a.id, 'application_supply_repointed', jsonb_build_object('actor_id', auth.uid(), 'from', a.supply_point_id, 'to', v_target_sp));
    end if;

    update public.application_documents set customer_id = v_customer where application_id = a.id and customer_id is null;
    update public.case_visits set customer_id = v_customer where application_id = a.id and customer_id is null;

    if v_fresh_conversion then
      -- The existing conversion created this Case for this Application: use the selected service code.
      v_case := v_existing_case.id;
      update public.cases set service_type = v_service
       where id = v_case and lead_id = a.lead_id and application_id is null;
    elsif v_existing_case.application_id is null
       and v_existing_case.service_type is not distinct from v_service
       and (v_existing_case.supply_point_id is null or v_existing_case.supply_point_id is not distinct from v_target_sp) then
      -- Reuse only a matching, unclaimed Case. Never overwrite another Application or different service.
      v_case := v_existing_case.id;
    else
      v_case := null;
    end if;

    if v_case is null then
      select coalesce(nullif(btrim(full_name), ''), 'Πελάτης') into v_title from public.customers where id = v_customer;
      insert into public.cases (title, customer_id, source, service_type, property_type, current_stage, status, lead_id,
        owner_id, inside_sales_owner, created_by, stage_entered_at, notes)
      values (v_title, v_customer, coalesce(v_lead.source, 'field_sales'), v_service, v_lead.property_type, 'new', 'open', a.lead_id,
        auth.uid(), coalesce(v_lead.assigned_to_user_id, auth.uid()), auth.uid(), now(),
        coalesce(nullif(coalesce(v_lead.comments, v_lead.notes), ''), '') || E'\nΑίτηση ' || a.application_no)
      returning id into v_case;
      insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, metadata)
      values (v_case, 'system', 'created', 'Case δημιουργήθηκε από Αίτηση', 'Υποβολή αίτησης ' || a.application_no, auth.uid(),
        jsonb_build_object('application_id', a.id, 'application_no', a.application_no, 'lead_id', a.lead_id));
    end if;
  else
    select coalesce(nullif(btrim(full_name), ''), 'Πελάτης') into v_title from public.customers where id = v_customer;
    insert into public.cases (title, customer_id, source, service_type, current_stage, status, owner_id, inside_sales_owner, created_by, stage_entered_at, notes)
    values (v_title, v_customer, 'field_sales', v_service, 'new', 'open', auth.uid(), coalesce(a.assigned_to_user_id, auth.uid()), auth.uid(), now(),
      'Αίτηση ' || a.application_no)
    returning id into v_case;
    insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, metadata)
    values (v_case, 'system', 'created', 'Case δημιουργήθηκε από Αίτηση', 'Υποβολή αίτησης ' || a.application_no, auth.uid(),
      jsonb_build_object('application_id', a.id, 'application_no', a.application_no));
  end if;

  -- A Case can only receive its Customer-owned supply point. Duplicate Lead rows remain Lead-owned.
  select s.id into v_case_supply from public.customer_supply_points s where s.id = v_target_sp and s.customer_id = v_customer;
  update public.cases set application_id = a.id, supply_point_id = coalesce(v_case_supply, supply_point_id),
    next_action = 'Παραλαβή από Sales — Αίτηση ' || a.application_no
   where id = v_case and application_id is null;
  if not found and not exists (select 1 from public.cases c where c.id = v_case and c.application_id = a.id) then
    raise exception 'application: selected Case is already linked to another Application' using errcode = '23514';
  end if;

  select nullif(setting_value #>> '{}', '')::uuid into v_assignee from public.crm_settings where setting_key = 'default_backoffice_assignee';
  if v_assignee is not null and exists (select 1 from public.profiles p where p.id = v_assignee and p.role = 'admin' and coalesce(p.is_active, true)) then
    update public.cases set back_office_owner = v_assignee where id = v_case;
    insert into public.app_notifications (user_id, case_id, title, body, type)
    values (v_assignee, v_case, 'Νέα αίτηση από το πεδίο', a.application_no, 'case');
  else
    v_assignee := null;
  end if;

  update public.energy_applications set status = 'submitted', status_reason = null, customer_id = v_customer,
    primary_case_id = v_case, submitted_at = now(), submitted_by = auth.uid(), wizard_step = 5
   where id = a.id;
  update public.application_documents set customer_id = v_customer where application_id = a.id and customer_id is null;
  select count(*)::int into v_docs from public.application_documents where application_id = a.id and is_current;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('application', a.id, 'application_submitted',
    jsonb_build_object('actor_id', auth.uid(), 'case_id', v_case, 'customer_id', v_customer, 'service_type', v_service,
      'current_documents', v_docs, 'backoffice_assignee', v_assignee));
  return jsonb_build_object('application_id', a.id, 'application_no', a.application_no, 'case_id', v_case,
    'customer_id', v_customer, 'service_type_code', v_service, 'backoffice_assignee', v_assignee,
    'current_documents', v_docs, 'idempotent', false);
end $;

create or replace function public.withdraw_energy_application(p_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare a public.energy_applications%rowtype;
begin
  if not public.is_staff() then raise exception 'application: staff only' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'application: a reason is required' using errcode = '22023'; end if;
  select * into a from public.energy_applications where id = p_id for update;
  if a.id is null then return false; end if;
  if coalesce(public.is_sales_agent(), false) and not public.sales_owns_entity('application', a.id) then raise exception 'application: not yours' using errcode = '42501'; end if;
  if a.status in ('rejected', 'withdrawn', 'completed') then return false; end if;
  update public.energy_applications set status = 'withdrawn', status_reason = btrim(p_reason) where id = a.id;
  return true;
end $$;

-- Back Office asks for missing documents: the application waits, and the agent gets a follow-up on the Case (it appears in their own list).
create or replace function public.request_application_documents(p_id uuid, p_note text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare a public.energy_applications%rowtype;
begin
  if not public.is_role('admin') then raise exception 'application: only Admin / Back Office asks for documents' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'application: say which documents are missing' using errcode = '22023'; end if;
  select * into a from public.energy_applications where id = p_id for update;
  if a.id is null or a.status not in ('submitted', 'in_review', 'processing') then return false; end if;
  update public.energy_applications set status = 'needs_documents', status_reason = btrim(p_note) where id = a.id;
  if a.primary_case_id is not null then
    insert into public.follow_ups (case_id, due_at, channel, reason, priority, assignee_id, created_by)
    values (a.primary_case_id, now() + interval '1 day', 'other', 'Λείπουν έγγραφα (' || a.application_no || '): ' || btrim(p_note), 'high', coalesce(a.assigned_to_user_id, a.created_by), auth.uid());
    insert into public.app_notifications (user_id, case_id, title, body, type)
    select coalesce(a.assigned_to_user_id, a.created_by), a.primary_case_id, 'Λείπουν έγγραφα από την αίτηση', a.application_no, 'case'
     where coalesce(a.assigned_to_user_id, a.created_by) is not null;
  end if;
  return true;
end $$;
revoke all on function public.submit_energy_application(uuid), public.withdraw_energy_application(uuid, text), public.request_application_documents(uuid, text) from public, anon;
grant execute on function public.submit_energy_application(uuid), public.withdraw_energy_application(uuid, text), public.request_application_documents(uuid, text) to authenticated, service_role;
