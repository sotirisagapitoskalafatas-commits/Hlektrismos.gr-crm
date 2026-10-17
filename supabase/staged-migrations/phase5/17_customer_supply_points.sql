-- STAGED — NOT APPLIED. Apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 5 / 17: several independent electricity connections («Παροχές») per customer (master prompt §6.2 / §12.5).
-- Owner go-ahead 18/10/2026. Additive and idempotent. The legacy tables supply_points and customer_meters are NOT touched
-- and not read here.
--
--   tariff_categories        the configurable list Γ1, Γ1Ν, Γ21, Γ22, Γ23 (admins edit it). A connection stores the code
--                            TEXT, so editing, archiving or deleting an option never rewrites a connection.
--   customer_supply_points   one row per connection: usage (residential / commercial), property address (separate from
--                            the customer's home address), Αριθμός Παροχής (optional; 11 digits when given), the physical
--                            meter (own identifier, separate from the supply number), tariff category code and the
--                            commercial tariff name (two separate fields), application date, contract duration.
--   * NO unique constraint on the supply number. An existing number on another connection is a SIGNAL
--     (supply_point_duplicates, needs_review) — never an error, never a merge, never a move.
--   * A connection never moves to another customer (trigger). Archive instead of delete (no delete grant).
--   * Documents and cases link to the specific connection: nullable supply_point_id on case_documents and cases,
--     checked to belong to the same customer.
--   * Every create / change / archive is written to activity_log with the actor and the NAMES of the changed fields
--     (the old and new supply number are kept, so the history of a number is never lost).
--   * Nothing is mandatory: no supply number, no document, nothing at lead creation or for any stage change.
-- Rollback: docs/ops/rollback_phase5_17_supply_points.sql.

-- ───────────────────────── configurable tariff categories ─────────────────────────
create table if not exists public.tariff_categories (
  code text primary key check (btrim(code) <> ''),
  label text not null default '',
  usage text not null default 'any' check (usage in ('residential', 'commercial', 'any')),
  active boolean not null default true,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tariff_categories enable row level security;
drop policy if exists "staff read tariff categories" on public.tariff_categories;
create policy "staff read tariff categories" on public.tariff_categories for select to authenticated using (public.is_staff());
drop policy if exists "admin write tariff categories" on public.tariff_categories;
create policy "admin write tariff categories" on public.tariff_categories for all to authenticated
  using (public.is_role('admin')) with check (public.is_role('admin'));
grant select, insert, update, delete on public.tariff_categories to authenticated;
-- Seeds as given by the owner; the descriptions (kVA etc.) are informational and left for an admin to fill in.
insert into public.tariff_categories (code, label, usage, sort) values
  ('Γ1', 'Γ1', 'residential', 10), ('Γ1Ν', 'Γ1Ν', 'residential', 20),
  ('Γ21', 'Γ21', 'commercial', 30), ('Γ22', 'Γ22', 'commercial', 40), ('Γ23', 'Γ23', 'commercial', 50)
on conflict (code) do nothing;

-- ───────────────────────── the connections ─────────────────────────
create table if not exists public.customer_supply_points (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  usage text not null check (usage in ('residential', 'commercial')),
  property_address text not null default '',
  supply_number text,
  supply_number_key text generated always as (nullif(regexp_replace(coalesce(supply_number, ''), '\D', '', 'g'), '')) stored,
  -- ok = empty, or only digits (spaces and dashes allowed) that make exactly 11 digits. A flag, not a block: the form
  -- explains it, and the rule can be relaxed without a migration if the real numbers turn out different.
  supply_number_ok boolean generated always as (
    nullif(btrim(coalesce(supply_number, '')), '') is null
    or (btrim(supply_number) ~ '^[0-9][0-9 -]*$' and length(regexp_replace(supply_number, '\D', '', 'g')) = 11)) stored,
  meter_identifier text,
  meter_type text check (meter_type is null or meter_type in ('single_phase', 'three_phase', 'night_meter', 'other')),
  meter_note text,
  tariff_category_code text,
  tariff_name text,
  application_date date,
  contract_months integer check (contract_months is null or contract_months between 1 and 600),
  notes text not null default '',
  needs_review boolean not null default false,
  review_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index if not exists customer_supply_points_customer_idx on public.customer_supply_points (customer_id);
create index if not exists customer_supply_points_key_idx on public.customer_supply_points (supply_number_key) where supply_number_key is not null;

alter table public.customer_supply_points enable row level security;
drop policy if exists "staff read supply points" on public.customer_supply_points;
create policy "staff read supply points" on public.customer_supply_points for select to authenticated using (public.is_staff());
drop policy if exists "staff insert supply points" on public.customer_supply_points;
create policy "staff insert supply points" on public.customer_supply_points for insert to authenticated with check (public.is_staff());
drop policy if exists "staff update supply points" on public.customer_supply_points;
create policy "staff update supply points" on public.customer_supply_points for update to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.customer_supply_points from anon;
grant select, insert, update on public.customer_supply_points to authenticated;   -- no delete: archive instead

-- Guard + audit. SECURITY DEFINER only for the activity_log write; the guard itself never reads other tables.
create or replace function public.customer_supply_points_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed text[] := '{}';
  v_col text;
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := auth.uid();
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('supply_point', new.id, 'supply_point_created', jsonb_build_object('actor_id', auth.uid(), 'customer_id', new.customer_id, 'usage', new.usage, 'supply_number', new.supply_number));
    return new;
  end if;
  if new.customer_id is distinct from old.customer_id then
    raise exception 'supply_point: a connection never moves to another customer' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  foreach v_col in array array['usage', 'property_address', 'supply_number', 'meter_identifier', 'meter_type', 'meter_note', 'tariff_category_code', 'tariff_name',
                               'application_date', 'contract_months', 'notes', 'needs_review', 'review_note', 'archived_at'] loop
    if to_jsonb(new) -> v_col is distinct from to_jsonb(old) -> v_col then v_changed := v_changed || v_col; end if;
  end loop;
  if cardinality(v_changed) > 0 then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('supply_point', new.id,
            case when new.archived_at is not null and old.archived_at is null then 'supply_point_archived'
                 when new.archived_at is null and old.archived_at is not null then 'supply_point_restored'
                 else 'supply_point_updated' end,
            jsonb_build_object('actor_id', auth.uid(), 'customer_id', new.customer_id, 'fields', to_jsonb(v_changed))
              || case when 'supply_number' = any(v_changed) then jsonb_build_object('supply_number_from', old.supply_number, 'supply_number_to', new.supply_number) else '{}'::jsonb end);
  end if;
  return new;
end;
$$;
drop trigger if exists customer_supply_points_audit_ins on public.customer_supply_points;
create trigger customer_supply_points_audit_ins before insert on public.customer_supply_points for each row execute function public.customer_supply_points_audit();
drop trigger if exists customer_supply_points_audit_upd on public.customer_supply_points;
create trigger customer_supply_points_audit_upd before update on public.customer_supply_points for each row execute function public.customer_supply_points_audit();

-- ───────────────────────── duplicate signal (never a block, never a merge) ─────────────────────────
-- Other active connections with the same supply number (digits only), on ANY customer including the same one.
create or replace function public.supply_point_duplicates(p_number text, p_exclude uuid default null)
returns table (id uuid, customer_id uuid, customer_name text, usage text, property_address text, needs_review boolean)
language sql
stable
set search_path = public
as $$
  select s.id, s.customer_id, c.full_name, s.usage, s.property_address, s.needs_review
    from public.customer_supply_points s
    join public.customers c on c.id = s.customer_id
   where s.archived_at is null
     and nullif(regexp_replace(coalesce(p_number, ''), '\D', '', 'g'), '') is not null
     and s.supply_number_key = regexp_replace(p_number, '\D', '', 'g')
     and (p_exclude is null or s.id <> p_exclude)
   order by s.created_at;
$$;
revoke all on function public.supply_point_duplicates(text, uuid) from public, anon;
grant execute on function public.supply_point_duplicates(text, uuid) to authenticated;

-- «Σήμανση για έλεγχο»: staff flag a connection whose number exists elsewhere. Only the flag changes; nothing is moved.
create or replace function public.flag_supply_point_review(p_id uuid, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'supply_point: not allowed' using errcode = '42501'; end if;
  update public.customer_supply_points
     set needs_review = true, review_note = nullif(btrim(coalesce(p_note, '')), ''), reviewed_by = null, reviewed_at = null
   where id = p_id;
  if not found then raise exception 'supply_point: not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.flag_supply_point_review(uuid, text) from public, anon;
grant execute on function public.flag_supply_point_review(uuid, text) to authenticated;

-- «Ελέγχθηκε»: a reviewer (admin, manager, Back Office) closes the flag. Still no merge.
create or replace function public.resolve_supply_point_review(p_id uuid, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not (public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')) then raise exception 'supply_point: not allowed' using errcode = '42501'; end if;
  update public.customer_supply_points
     set needs_review = false, review_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), review_note), reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_id;
  if not found then raise exception 'supply_point: not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.resolve_supply_point_review(uuid, text) from public, anon;
grant execute on function public.resolve_supply_point_review(uuid, text) to authenticated;

-- ───────────────────────── documents and cases link to a specific connection ─────────────────────────
alter table public.case_documents add column if not exists supply_point_id uuid references public.customer_supply_points(id);
alter table public.cases add column if not exists supply_point_id uuid references public.customer_supply_points(id);
create index if not exists case_documents_supply_point_idx on public.case_documents (supply_point_id) where supply_point_id is not null;
create index if not exists cases_supply_point_idx on public.cases (supply_point_id) where supply_point_id is not null;

-- The connection must belong to the same customer as the case (and, for a document, as the document's case).
create or replace function public.supply_point_link_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
  v_customer uuid;
begin
  if new.supply_point_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.supply_point_id is not distinct from old.supply_point_id then return new; end if;
  select s.customer_id into v_owner from public.customer_supply_points s where s.id = new.supply_point_id;
  if tg_table_name = 'cases' then v_customer := new.customer_id;
  else select k.customer_id into v_customer from public.cases k where k.id = new.case_id; end if;
  if v_owner is distinct from v_customer then
    raise exception 'supply_point: the connection belongs to another customer' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists cases_supply_point_guard on public.cases;
create trigger cases_supply_point_guard before insert or update of supply_point_id on public.cases for each row execute function public.supply_point_link_guard();
drop trigger if exists case_documents_supply_point_guard on public.case_documents;
create trigger case_documents_supply_point_guard before insert or update of supply_point_id on public.case_documents for each row execute function public.supply_point_link_guard();
