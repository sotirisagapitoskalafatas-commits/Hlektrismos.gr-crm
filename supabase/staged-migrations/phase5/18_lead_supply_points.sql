-- STAGED — NOT APPLIED. Apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 5 / 18: electricity connections («Παροχές») on a LEAD, not only on a customer (owner request 18/10/2026).
-- Needs phase5/17 applied first. Additive and idempotent; no existing row is changed.
--
--   * customer_supply_points can be owned by a LEAD: customer_id becomes nullable and lead_id (nullable) is added;
--     EXACTLY ONE of the two is set (check constraint). Everything else about a connection is the same as in 17
--     (own address, optional 11-digit number, meter, tariff code and name, dates, notes, archive, audit, RLS).
--   * When the lead is converted (leads.converted_case_id goes from null to a case), a trigger MOVES its connections
--     to the case's customer — the same rows, not copies; their ids, so the document tags and history, stay.
--       - If the customer already has an active connection with the same supply number (digits), nothing is
--         duplicated: the lead's row stays on the lead, flagged «Προς έλεγχο», its document tags are re-pointed to the
--         customer's existing connection, and the case is linked to that one.
--       - The case is linked to a connection only when exactly ONE connection results; with several, which one the case
--         is about is for the user to say (the «Παροχές» tab), never guessed.
--     The trigger is on the lead update, so it works with the live convert_lead_to_case() and with the staged
--     phase4/15 version alike; neither function is replaced.
--   * Documents uploaded with a lead live in leads.attached_files (jsonb); an entry may carry "supply_point_id".
--   * An owner can only be changed by the conversion trigger (a guard refuses it for signed-in users).
--   * supply_point_duplicates now also reports lead-owned connections (lead_id, lead_name).
-- Rollback: docs/ops/rollback_phase5_18_lead_supply_points.sql.

alter table public.customer_supply_points alter column customer_id drop not null;
alter table public.customer_supply_points add column if not exists lead_id uuid references public.leads(id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customer_supply_points_one_owner' and conrelid = 'public.customer_supply_points'::regclass) then
    alter table public.customer_supply_points add constraint customer_supply_points_one_owner check (num_nonnulls(customer_id, lead_id) = 1);
  end if;
end $$;
create index if not exists customer_supply_points_lead_idx on public.customer_supply_points (lead_id) where lead_id is not null;

-- Audit: same as 17, owner-agnostic (the "never moves" check is now the separate guard below).
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
    values ('supply_point', new.id, 'supply_point_created', jsonb_build_object('actor_id', auth.uid(), 'customer_id', new.customer_id, 'lead_id', new.lead_id, 'usage', new.usage, 'supply_number', new.supply_number));
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  foreach v_col in array array['usage', 'property_address', 'supply_number', 'meter_identifier', 'meter_type', 'meter_note', 'tariff_category_code', 'tariff_name',
                               'application_date', 'contract_months', 'notes', 'needs_review', 'review_note', 'archived_at', 'customer_id', 'lead_id'] loop
    if to_jsonb(new) -> v_col is distinct from to_jsonb(old) -> v_col then v_changed := v_changed || v_col; end if;
  end loop;
  if cardinality(v_changed) > 0 then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('supply_point', new.id,
            case when new.customer_id is distinct from old.customer_id and old.customer_id is null then 'supply_point_moved_from_lead'
                 when new.archived_at is not null and old.archived_at is null then 'supply_point_archived'
                 when new.archived_at is null and old.archived_at is not null then 'supply_point_restored'
                 else 'supply_point_updated' end,
            jsonb_build_object('actor_id', auth.uid(), 'customer_id', new.customer_id, 'lead_id', coalesce(new.lead_id, old.lead_id), 'fields', to_jsonb(v_changed))
              || case when 'supply_number' = any(v_changed) then jsonb_build_object('supply_number_from', old.supply_number, 'supply_number_to', new.supply_number) else '{}'::jsonb end);
  end if;
  return new;
end;
$$;

-- SECURITY INVOKER: current_user is 'authenticated' for browser writes, the function owner inside the SECURITY DEFINER conversion.
create or replace function public.customer_supply_points_owner_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and (new.customer_id is distinct from old.customer_id or new.lead_id is distinct from old.lead_id) then
    raise exception 'supply_point: a connection never moves to another customer' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists customer_supply_points_owner_guard on public.customer_supply_points;
create trigger customer_supply_points_owner_guard before update on public.customer_supply_points for each row execute function public.customer_supply_points_owner_guard();

-- Duplicates: any other active connection with the same digits, on a customer OR on a lead.
drop function if exists public.supply_point_duplicates(text, uuid);
create or replace function public.supply_point_duplicates(p_number text, p_exclude uuid default null)
returns table (id uuid, customer_id uuid, customer_name text, lead_id uuid, lead_name text, usage text, property_address text, needs_review boolean)
language sql
stable
set search_path = public
as $$
  select s.id, s.customer_id, c.full_name,
         s.lead_id, coalesce(nullif(btrim(coalesce(l.full_name, '')), ''), nullif(btrim(coalesce(l.client_name, '')), '')),
         s.usage, s.property_address, s.needs_review
    from public.customer_supply_points s
    left join public.customers c on c.id = s.customer_id
    left join public.leads l on l.id = s.lead_id
   where s.archived_at is null
     and nullif(regexp_replace(coalesce(p_number, ''), '\D', '', 'g'), '') is not null
     and s.supply_number_key = regexp_replace(p_number, '\D', '', 'g')
     and (p_exclude is null or s.id <> p_exclude)
   order by s.created_at;
$$;
revoke all on function public.supply_point_duplicates(text, uuid) from public, anon;
grant execute on function public.supply_point_duplicates(text, uuid) to authenticated;

-- ───────────────────────── conversion: the lead's connections move to the customer ─────────────────────────
create or replace function public.leads_move_supply_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer uuid;
  sp record;
  v_existing uuid;
  v_targets uuid[] := '{}';
begin
  select k.customer_id into v_customer from public.cases k where k.id = new.converted_case_id;
  if v_customer is null then return new; end if;
  for sp in select * from public.customer_supply_points where lead_id = new.id order by created_at, id loop
    v_existing := null;
    if sp.archived_at is null and sp.supply_number_key is not null then
      select c.id into v_existing from public.customer_supply_points c
       where c.customer_id = v_customer and c.archived_at is null and c.supply_number_key = sp.supply_number_key
       order by c.created_at limit 1;
    end if;
    if v_existing is not null then
      -- the customer already has this connection: no copy. The lead's row stays on the lead, flagged for the office.
      update public.customer_supply_points
         set needs_review = true, review_note = coalesce(review_note, 'Ο αριθμός υπάρχει ήδη στον πελάτη (ίδια παροχή;)')
       where id = sp.id;
      update public.leads
         set attached_files = (select coalesce(jsonb_agg(case when e ->> 'supply_point_id' = sp.id::text then jsonb_set(e, '{supply_point_id}', to_jsonb(v_existing::text)) else e end order by ord), '[]'::jsonb)
                                 from jsonb_array_elements(attached_files) with ordinality t(e, ord))
       where id = new.id and jsonb_typeof(attached_files) = 'array' and attached_files::text like '%' || sp.id::text || '%';
      v_targets := v_targets || v_existing;
      insert into public.activity_log (entity_type, entity_id, action, details)
      values ('supply_point', sp.id, 'supply_point_duplicate_linked', jsonb_build_object('lead_id', new.id, 'case_id', new.converted_case_id, 'customer_id', v_customer, 'existing_supply_point_id', v_existing));
    else
      update public.customer_supply_points set customer_id = v_customer, lead_id = null where id = sp.id;
      if sp.archived_at is null then v_targets := v_targets || sp.id; end if;
    end if;
  end loop;
  -- the case is about one connection only when there is exactly one (never guessed)
  if (select count(distinct t) from unnest(v_targets) t) = 1 then
    update public.cases set supply_point_id = v_targets[1] where id = new.converted_case_id and supply_point_id is null;
  end if;
  return new;
end;
$$;
drop trigger if exists leads_move_supply_points on public.leads;
create trigger leads_move_supply_points after update of converted_case_id on public.leads
  for each row when (old.converted_case_id is null and new.converted_case_id is not null) execute function public.leads_move_supply_points();
