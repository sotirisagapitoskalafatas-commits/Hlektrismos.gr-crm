-- ROLLBACK for staged phase5/18 (lead-level connections). Review before running; staging first.
-- Tested locally (PGlite): supabase/tests/lead-supply-points.test.mjs.
-- Restores the phase5/17 behaviour. Connections of a CUSTOMER are never touched.

-- OPTION A — switch the lead side off, KEEP all data (recommended). The app then shows «Η λειτουργία δεν είναι ακόμη διαθέσιμη.»
-- on leads and the lead form works as before. Lead-owned connections stay in the table (lead_id set) but are no longer moved.
drop trigger if exists leads_move_supply_points on public.leads;
drop function if exists public.leads_move_supply_points();
drop trigger if exists customer_supply_points_owner_guard on public.customer_supply_points;
drop function if exists public.customer_supply_points_owner_guard();
-- the phase5/17 audit function (it also refuses to move a connection to another customer):
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

-- the phase5/17 duplicate function (customers only):
drop function if exists public.supply_point_duplicates(text, uuid);
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

-- OPTION B — remove the lead side completely, INCLUDING connections that still belong to a lead. Export first:
--   select * from public.customer_supply_points where lead_id is not null;
-- delete from public.customer_supply_points where lead_id is not null;
-- alter table public.customer_supply_points drop constraint if exists customer_supply_points_one_owner;
-- drop index if exists public.customer_supply_points_lead_idx;
-- alter table public.customer_supply_points drop column if exists lead_id;
-- alter table public.customer_supply_points alter column customer_id set not null;
-- Connections already moved to customers by a conversion stay with their customers.
