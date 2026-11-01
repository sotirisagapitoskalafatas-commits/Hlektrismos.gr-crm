-- ROLLBACK for staged phase7/01 (standalone field visits). Review before running; staging first. Tested locally by supabase/tests/field-visits-standalone.test.mjs' file checks.
-- OPTION A (recommended): switch the feature off and KEEP all data. Visits that were created without a Case stay in the table (case_id null); the app, which probes for the
-- new columns, keeps working. The guard, audit and helper objects are removed and the check-in functions go back to their phase4/10 / geofence versions.
drop trigger if exists case_visits_guard_trg on public.case_visits;
drop trigger if exists case_visits_audit_trg on public.case_visits;
drop trigger if exists follow_ups_link_guard_trg on public.follow_ups;
drop function if exists public.case_visits_guard();
drop function if exists public.case_visits_audit();
drop function if exists public.follow_ups_link_guard();
drop function if exists public.visit_link_check(text, uuid, uuid, boolean, boolean);
drop function if exists public.reschedule_field_visit(uuid, timestamptz, text);
drop function if exists public.cancel_field_visit(uuid, text);
drop function if exists public.mark_visit_no_show(uuid, text);
drop function if exists public.field_prospect_matches(text, text, text);
drop function if exists public.request_lead_ownership(uuid, text);
drop function if exists public.decide_ownership_request(uuid, boolean, text);
-- ownership_requests keeps its rows (history of decisions); drop the table only if it is empty: delete this comment and run  drop table public.ownership_requests;

-- phase4/18 version of the ownership helper (without 'visit' / 'application'):
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

revoke all on function public.sales_owns_entity(text, uuid) from public, anon;
grant execute on function public.sales_owns_entity(text, uuid) to authenticated, service_role;

-- phase4/10 check-in and the original check-out:
create or replace function public.field_checkin(
    p_visit_id  uuid,
    p_lat       double precision default null,
    p_lng       double precision default null,
    p_accuracy_m integer default null,
    p_radius_m  integer default null,
    p_notes     text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor    uuid := auth.uid();
    v_visit    public.case_visits%rowtype;
    v_case     public.cases%rowtype;
    v_tlat     double precision;
    v_tlng     double precision;
    v_radius   integer;
    v_acc      integer;
    v_dist     double precision;
    v_cos      double precision;
    v_flag     text;
    v_code     text;
    v_msg      text;
    v_desc     text;
begin
    if v_actor is null then
        raise exception 'auth.uid() is null';
    end if;
    if not public.is_staff() then
        raise exception 'forbidden: staff only';
    end if;

    select * into v_visit from public.case_visits where id = p_visit_id;
    if v_visit is null or v_visit.id is null then
        return jsonb_build_object('accepted', false, 'code', 'NO_VISIT', 'message', 'Η επίσκεψη δεν βρέθηκε.');
    end if;
    if v_visit.user_id is not null and v_visit.user_id <> v_actor
       and not exists (select 1 from public.profiles p where p.id = v_actor and p.role in ('admin', 'manager')) then
        raise exception 'forbidden: not your visit';
    end if;

    select * into v_case from public.cases where id = v_visit.case_id;

    v_tlat := case when v_case.lat is not null then v_case.lat
                   when v_visit.location is not null then (v_visit.location ->> 'lat')::double precision end;
    v_tlng := case when v_case.lng is not null then v_case.lng
                   when v_visit.location is not null then (v_visit.location ->> 'lng')::double precision end;

    v_radius := p_radius_m;
    if v_radius is null then
        select (setting_value #>> '{}')::integer into v_radius from public.crm_settings where setting_key = 'check_in_radius_m';
    end if;
    v_radius := coalesce(v_radius, 150);
    v_acc := p_accuracy_m;

    -- Idempotency: an already-open/completed visit never produces a 2nd check-in.
    if v_visit.status in ('in_progress', 'completed') then
        insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
            latitude, longitude, accuracy_m, radius_m, result, notes)
        values (v_visit.case_id, v_visit.id, v_actor, 'case', v_visit.case_id, p_lat, p_lng, v_acc, v_radius, 'IDEMPOTENT', p_notes);
        return jsonb_build_object('accepted', true, 'code', 'IDEMPOTENT', 'already', true, 'visitId', v_visit.id, 'status', v_visit.status,
            'message', 'Η επίσκεψη έχει ήδη καταχωρηθεί (' || v_visit.status || ').');
    end if;

    if p_lat is null or p_lng is null then
        v_flag := 'no_gps'; v_code := 'NO_GPS';
        v_msg := 'Check In ✓ χωρίς θέση GPS — θα το δει ο υπεύθυνος.';
    elsif v_tlat is null or v_tlng is null then
        v_flag := 'no_target'; v_code := 'NO_TARGET';
        v_msg := 'Check In ✓ — το case δεν έχει αποθηκευμένη διεύθυνση στον χάρτη για σύγκριση.';
    elsif coalesce(v_acc, 0) > v_radius * 2 then
        v_flag := 'gps_uncertain'; v_code := 'GPS_UNCERTAIN';
        v_msg := 'Check In ✓ — χαμηλή ακρίβεια GPS (±' || v_acc || ' μ)· θα το δει ο υπεύθυνος.';
    else
        v_cos := sin(radians(v_tlat)) * sin(radians(p_lat))
                 + cos(radians(v_tlat)) * cos(radians(p_lat)) * cos(radians(p_lng) - radians(v_tlng));
        v_cos := least(1.0, greatest(-1.0, v_cos));
        v_dist := 6371000.0 * acos(v_cos);
        if v_dist <= v_radius then
            v_code := 'INSIDE_RADIUS';
            v_msg := 'Check In ✓';
        else
            v_flag := 'far_from_address'; v_code := 'FAR_FROM_ADDRESS';
            v_msg := 'Check In ✓ — ' || round(v_dist::numeric, 0) || ' μ από την αποθηκευμένη διεύθυνση· θα το δει ο υπεύθυνος.';
        end if;
    end if;

    update public.case_visits
       set status = 'in_progress',
           started_at = coalesce(started_at, now()),
           check_in = jsonb_build_object('at', now(), 'lat', p_lat, 'lng', p_lng, 'accuracy', v_acc,
                          'distance_from_target_m', case when v_dist is null then null else round(v_dist::numeric, 1) end,
                          'radius_m', v_radius, 'result', v_code, 'review_flag', v_flag)
     where id = v_visit.id;

    v_desc := case v_code
        when 'INSIDE_RADIUS' then 'Ο πωλητής έφτασε στον πελάτη — εντός ακτίνας ' || v_radius || ' μ (απόσταση ' || round(v_dist::numeric, 0) || ' μ).'
        when 'FAR_FROM_ADDRESS' then 'Check In ' || round(v_dist::numeric, 0) || ' μ από την αποθηκευμένη διεύθυνση (ακτίνα ' || v_radius || ' μ) — προς έλεγχο.'
        when 'GPS_UNCERTAIN' then 'Check In με χαμηλή ακρίβεια GPS (±' || v_acc || ' μ) — προς έλεγχο.'
        when 'NO_GPS' then 'Check In χωρίς θέση GPS — προς έλεγχο.'
        else 'Check In — το case δεν έχει αποθηκευμένες συντεταγμένες.' end;
    insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, location, metadata)
    values (v_visit.case_id, 'field_sales', 'check_in', 'Check In', v_desc, v_actor,
        case when p_lat is null then null else jsonb_build_object('lat', p_lat, 'lng', p_lng) end,
        jsonb_build_object('visit_id', v_visit.id, 'accuracy_m', v_acc,
            'distance_from_target_m', case when v_dist is null then null else round(v_dist::numeric, 1) end,
            'radius_m', v_radius, 'check_in_result', v_code, 'review_flag', v_flag));

    insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
        latitude, longitude, accuracy_m, distance_from_target_m, radius_m, result, notes, review_flag)
    values (v_visit.case_id, v_visit.id, v_actor, 'case', v_visit.case_id, p_lat, p_lng, v_acc,
        case when v_dist is null then null else round(v_dist::numeric, 1) end, v_radius, v_code, p_notes, v_flag);

    return jsonb_build_object('accepted', true, 'code', v_code, 'flag', v_flag, 'visitId', v_visit.id, 'caseId', v_visit.case_id,
        'distanceMeters', case when v_dist is null then null else round(v_dist::numeric, 1) end,
        'radiusM', v_radius, 'accuracyM', v_acc, 'message', v_msg);
end;
$$;

create or replace function public.field_checkout(
    p_visit_id   uuid,
    p_lat        double precision default null,
    p_lng        double precision default null,
    p_accuracy_m integer default null,
    p_notes      text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor uuid := auth.uid();
    v_visit public.case_visits%rowtype;
begin
    if v_actor is null then
        raise exception 'auth.uid() is null';
    end if;
    if not public.is_staff() then
        raise exception 'forbidden: staff only';
    end if;

    select * into v_visit from public.case_visits where id = p_visit_id;
    if v_visit is null or v_visit.id is null then
        return jsonb_build_object('accepted', false, 'code', 'NO_VISIT', 'message', 'Η επίσκεψη δεν βρέθηκε.');
    end if;
    if v_visit.user_id is not null and v_visit.user_id <> v_actor
       and not exists (select 1 from public.profiles p where p.id = v_actor and p.role in ('admin', 'manager')) then
        raise exception 'forbidden: not your visit';
    end if;

    -- Idempotent completion.
    if v_visit.status = 'completed' then
        return jsonb_build_object('accepted', true, 'code', 'IDEMPOTENT', 'already', true,
            'visitId', v_visit.id, 'message', 'Η επίσκεψη έχει ήδη ολοκληρωθεί.');
    end if;

    update public.case_visits
       set status = 'completed',
           ended_at = now(),
           check_out = jsonb_build_object('at', now(), 'lat', p_lat, 'lng', p_lng,
                              'accuracy', p_accuracy_m),
           notes = coalesce(nullif(p_notes, ''), notes)
     where id = p_visit_id;

    insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
        latitude, longitude, accuracy_m, result, notes)
    values (v_visit.case_id, v_visit.id, v_actor, 'case', v_visit.case_id,
        p_lat, p_lng, p_accuracy_m, 'CHECKOUT', p_notes);

    insert into public.timeline_events (case_id, role, activity_type, title, description,
        user_id, location, metadata)
    values (v_visit.case_id, 'field_sales', 'check_out', 'Check Out',
        coalesce(nullif(p_notes, ''), 'Η επίσκεψη ολοκληρώθηκε.'),
        v_actor, case when p_lat is not null then jsonb_build_object('lat', p_lat, 'lng', p_lng) else null end,
        jsonb_build_object('visit_id', v_visit.id, 'accuracy_m', p_accuracy_m));

    return jsonb_build_object('accepted', true, 'code', 'CHECKOUT',
        'visitId', v_visit.id, 'message', 'Check Out ✓ — η επίσκεψη ολοκληρώθηκε.');
end;
$$;

revoke all on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) from public;
grant execute on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) to authenticated;
revoke all on function public.field_checkout(uuid, double precision, double precision, integer, text) from public;
grant execute on function public.field_checkout(uuid, double precision, double precision, integer, text) to authenticated;

-- OPTION B (destructive; only on a database where NO visit without a Case and NO follow-up without a Case exists):
--   select count(*) from public.case_visits where case_id is null;   select count(*) from public.follow_ups where case_id is null;   -- both must be 0
--   alter table public.case_visits drop constraint if exists case_visits_anchor, drop constraint if exists case_visits_prospect_shape;
--   alter table public.follow_ups drop constraint if exists follow_ups_anchor;
--   alter table public.case_visits alter column case_id set not null;  alter table public.follow_ups alter column case_id set not null;
--   (the new nullable columns can then be dropped; do that only after a backup)
