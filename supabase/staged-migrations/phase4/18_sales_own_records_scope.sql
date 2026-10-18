-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 4 / 18: sales agents see ONLY their own records (master prompt v3 §2; security audit F-04).
--
-- Two-role model as a MAPPING, not a rewrite: the five database roles stay exactly as they are.
--   «Back Office / Admin» = admin, manager, back_office -> see everything (unchanged).
--   «Πωλητής»             = inside_sales, field_sales    -> see and change only their own leads, cases and customers.
--
-- How: RESTRICTIVE row-level-security policies. They are AND-ed with the permissive policies that already exist, so
-- they can only take rows away from the two sales roles; they never grant anything and nothing is dropped or rewritten.
-- Who is «own»:
--   lead       assigned_to_user_id = me  or  created_by_user_id = me  (unassigned leads are invisible to sales: Back Office assigns)
--   case       owner_id / inside_sales_owner / field_sales_owner / next_action_owner_id / created_by = me
--              (back_office_owner does NOT count: it is not a sales role)
--   customer   created_by = me, or a case of that customer is mine
--   follow-up  assignee_id / created_by = me, or the case is mine;  case documents, timeline, visits: the case is mine
--   supply points (customer_supply_points): the customer or the lead is mine
--   activity_log: READ only, entries of my leads / cases / customers / supply points
-- Everything that runs as SECURITY DEFINER (conversion, Back Office routing, trash, duplicate signal, import) is
-- unaffected: the table owner bypasses row-level security.
-- Idempotent; skips tables that do not exist. Rollback: docs/ops/rollback_phase4_18_sales_own_records_scope.sql
-- Apply after phase2/05 and phase4/17 for a consistent role story.

-- ───────────── helpers (SECURITY DEFINER so they never recurse through RLS) ─────────────
create or replace function public.is_sales_agent()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true) and p.role in ('inside_sales', 'field_sales')) $$;

create or replace function public.sales_owns_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.leads l where l.id = p_lead and (l.assigned_to_user_id = auth.uid() or l.created_by_user_id = auth.uid())) $$;

create or replace function public.sales_owns_case(p_case uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare r boolean;
begin
  if p_case is null then return false; end if;
  execute 'select exists (select 1 from public.cases c where c.id = $1 and ($2 in (c.owner_id, c.inside_sales_owner, c.field_sales_owner, c.created_by)'
       || case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cases' and column_name = 'next_action_owner_id')
               then ' or c.next_action_owner_id = $2' else '' end || '))'
    into r using p_case, auth.uid();
  return coalesce(r, false);
end $$;

create or replace function public.sales_owns_customer(p_customer uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_customer is not null and (
    exists (select 1 from public.customers c where c.id = p_customer and c.created_by = auth.uid())
    or exists (select 1 from public.cases k where k.customer_id = p_customer and public.sales_owns_case(k.id)))
$$;

create or replace function public.sales_owns_entity(p_type text, p_id uuid)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare r boolean := false;
begin
  if p_id is null then return false; end if;
  if p_type = 'lead' then return public.sales_owns_lead(p_id);
  elsif p_type = 'case' then return public.sales_owns_case(p_id);
  elsif p_type = 'customer' then return public.sales_owns_customer(p_id);
  elsif p_type = 'supply_point' and to_regclass('public.customer_supply_points') is not null then
    execute 'select exists (select 1 from public.customer_supply_points s where s.id = $1 and ((s.customer_id is not null and public.sales_owns_customer(s.customer_id))'
         || case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customer_supply_points' and column_name = 'lead_id')
                 then ' or (s.lead_id is not null and public.sales_owns_lead(s.lead_id))' else '' end || '))'
      into r using p_id;
  end if;
  return coalesce(r, false);
end $$;

revoke all on function public.is_sales_agent(), public.sales_owns_lead(uuid), public.sales_owns_case(uuid), public.sales_owns_customer(uuid), public.sales_owns_entity(text, uuid) from public, anon;
grant execute on function public.is_sales_agent(), public.sales_owns_lead(uuid), public.sales_owns_case(uuid), public.sales_owns_customer(uuid), public.sales_owns_entity(text, uuid) to authenticated, service_role;

-- ───────────── the restrictive policies ─────────────
do $$
declare
  spec record;
  expr text;
begin
  for spec in
    select * from (values
      ('leads',                  'leads',      'all'),
      ('cases',                  'cases',      'all'),
      ('customers',              'customers',  'all'),
      ('follow_ups',             'follow_ups', 'all'),
      ('case_documents',         'case_docs',  'all'),
      ('timeline_events',        'case_docs',  'all'),
      ('case_visits',            'visits',     'all'),
      ('customer_supply_points', 'supply',     'all'),
      ('activity_log',           'activity',   'select')
    ) as v(tbl, kind, cmd)
  loop
    if to_regclass('public.' || spec.tbl) is null then continue; end if;
    expr := case spec.kind
      when 'leads'      then '(assigned_to_user_id = auth.uid() or created_by_user_id = auth.uid())'
      when 'cases'      then '(owner_id = auth.uid() or inside_sales_owner = auth.uid() or field_sales_owner = auth.uid() or created_by = auth.uid()'
                          || case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cases' and column_name = 'next_action_owner_id') then ' or next_action_owner_id = auth.uid()' else '' end || ')'
      when 'customers'  then '(created_by = auth.uid() or public.sales_owns_customer(id))'
      when 'follow_ups' then '(assignee_id = auth.uid() or created_by = auth.uid() or public.sales_owns_case(case_id))'
      when 'case_docs'  then 'public.sales_owns_case(case_id)'
      when 'visits'     then '(user_id = auth.uid() or public.sales_owns_case(case_id))'
      when 'supply'     then '((customer_id is not null and public.sales_owns_customer(customer_id)) or (lead_id is not null and public.sales_owns_lead(lead_id)))'
      when 'activity'   then 'public.sales_owns_entity(entity_type, entity_id)'
    end;
    -- the lead_id column of customer_supply_points exists only after phase5/18
    if spec.kind = 'supply' and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = spec.tbl and column_name = 'lead_id') then
      expr := '(customer_id is not null and public.sales_owns_customer(customer_id))';
    end if;
    execute format('alter table public.%I enable row level security', spec.tbl);
    execute format('drop policy if exists %I on public.%I', 'sales own records (restrictive)', spec.tbl);
    if spec.cmd = 'select' then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using (not public.is_sales_agent() or %s)',
        'sales own records (restrictive)', spec.tbl, expr);
    else
      execute format('create policy %I on public.%I as restrictive for all to authenticated using (not public.is_sales_agent() or %s) with check (not public.is_sales_agent() or %s)',
        'sales own records (restrictive)', spec.tbl, expr, expr);
    end if;
  end loop;
end $$;

-- The screen reads this to know whether the scope is active (so it can say so, or show the «not available yet» message).
create or replace function public.sales_scope_status()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'enabled', exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'sales own records (restrictive)' and tablename = 'leads'),
    'tables', coalesce((select jsonb_agg(tablename order by tablename) from pg_policies where schemaname = 'public' and policyname = 'sales own records (restrictive)'), '[]'::jsonb))
$$;
revoke all on function public.sales_scope_status() from public, anon;
grant execute on function public.sales_scope_status() to authenticated, service_role;
