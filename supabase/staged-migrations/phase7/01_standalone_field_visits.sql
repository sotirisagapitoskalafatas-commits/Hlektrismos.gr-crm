-- STAGED — NOT APPLIED. Apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 7 / 01: field visits that exist BEFORE any Case (docs/product/FIELD_VISITS_AND_APPLICATIONS.md §2).
-- Additive and idempotent. Nothing is dropped, no row is rewritten, no constraint can fail on legacy data (all new CHECKs are NOT VALID).
--
--   * case_visits.case_id becomes nullable; a visit can point at a lead, a customer, a supply point (and, from phase7/02, an application).
--     A visit with none of case / lead / customer must carry a controlled `prospect` (name + optional phone / address). No fake Case, no fake Lead.
--   * Statuses stay planned / in_progress / completed / cancelled; the ONLY new stored status is no_show. «Ready to visit» is derived in the app.
--     «Rescheduled» is a link: the old visit is cancelled (status_reason 'rescheduled: …') and the new one has rescheduled_from_id.
--   * follow_ups.case_id becomes nullable (timeline_events stays case-bound): a follow-up can hang on a lead, a customer or a visit.
--   * field_checkin() / field_checkout() are replaced (same signatures) so a visit without a Case works; case-bound behaviour is exactly phase4/10's.
--     A replayed offline request never creates a second check-in (idempotent), and a cancelled / no-show visit cannot be checked in.
--   * A guard trigger: a Sales Agent's visit is always theirs; links must point to records they own and cannot be re-pointed (null -> owned only,
--     which is what prospect -> Lead and Lead -> Case need); only Admin / Back Office reassigns; cancel / no-show need a reason; no delete.
--   * An audit trigger writes activity_log (entity 'visit') for every create / status change / reassignment. The shared Admin login records
--     actor_id of that shared profile: it never identifies the individual employee.
--   * sales_owns_entity() is extended (all its phase4/18 branches kept) with 'visit' and 'application' so the restrictive activity_log policy still shows
--     an agent the audit rows of their own visits and applications.
--   * field_prospect_matches(): duplicate signal for a prospect. For records the caller does not own it returns only kind + id + owned_by_other: no name, no phone.
--   * ownership_requests: an agent asks for another agent's lead; only Admin / Back Office decides; the decision is recorded. Leads only.
-- Requires: phase4/18 (sales_owns_* helpers), phase5/17 + 18 (supply points on customers and leads), phase4/10 (check-in review flag).
-- Rollback: docs/ops/rollback_phase7_01_standalone_field_visits.sql.

do $$
begin
  if to_regprocedure('public.sales_owns_entity(text,uuid)') is null or to_regprocedure('public.is_sales_agent()') is null then
    raise exception 'phase7/01 needs phase4/18_sales_own_records_scope applied first (sales_owns_* helpers)';
  end if;
  if to_regclass('public.customer_supply_points') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customer_supply_points' and column_name = 'lead_id') then
    raise exception 'phase7/01 needs phase5/17 and phase5/18 applied first (supply points on customers and leads)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'field_checkins' and column_name = 'review_flag') then
    raise exception 'phase7/01 needs phase4/10_field_checkin_manual_flag applied first (check-in review flag)';
  end if;
end $$;

-- ───────────────────────── A. visits ─────────────────────────
alter table public.case_visits alter column case_id drop not null;
alter table public.case_visits
  add column if not exists lead_id uuid references public.leads(id),
  add column if not exists customer_id uuid references public.customers(id),
  add column if not exists supply_point_id uuid references public.customer_supply_points(id),
  add column if not exists application_id uuid,                 -- FK added by phase7/02 (the table does not exist yet)
  add column if not exists prospect jsonb,
  add column if not exists outcome_key text,
  add column if not exists outcome_reason text,
  add column if not exists status_reason text,
  add column if not exists rescheduled_from_id uuid references public.case_visits(id);
create index if not exists case_visits_lead_idx on public.case_visits (lead_id) where lead_id is not null;
create index if not exists case_visits_customer_idx on public.case_visits (customer_id) where customer_id is not null;
create index if not exists case_visits_supply_idx on public.case_visits (supply_point_id) where supply_point_id is not null;
create index if not exists case_visits_user_scheduled_idx on public.case_visits (user_id, scheduled_at) where status = 'planned';
create index if not exists case_visits_resched_idx on public.case_visits (rescheduled_from_id) where rescheduled_from_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'case_visits_anchor' and conrelid = 'public.case_visits'::regclass) then
    alter table public.case_visits add constraint case_visits_anchor
      check (num_nonnulls(case_id, lead_id, customer_id) >= 1 or prospect is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'case_visits_prospect_shape' and conrelid = 'public.case_visits'::regclass) then
    alter table public.case_visits add constraint case_visits_prospect_shape
      check (prospect is null or (jsonb_typeof(prospect) = 'object' and nullif(btrim(prospect ->> 'name'), '') is not null)) not valid;
  end if;
end $$;

-- ───────────────────────── B. follow-ups without a case ─────────────────────────
alter table public.follow_ups alter column case_id drop not null;
alter table public.follow_ups
  add column if not exists lead_id uuid references public.leads(id),
  add column if not exists customer_id uuid references public.customers(id),
  add column if not exists visit_id uuid references public.case_visits(id);
create index if not exists follow_ups_lead_idx on public.follow_ups (lead_id) where lead_id is not null;
create index if not exists follow_ups_visit_idx on public.follow_ups (visit_id) where visit_id is not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'follow_ups_anchor' and conrelid = 'public.follow_ups'::regclass) then
    alter table public.follow_ups add constraint follow_ups_anchor
      check (num_nonnulls(case_id, lead_id, customer_id, visit_id) >= 1) not valid;
  end if;
end $$;

-- ───────────────────────── C. ownership helper, extended ─────────────────────────
-- Every phase4/18 branch is kept exactly; 'visit' and 'application' are added. SECURITY DEFINER so it never recurses through RLS.
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
  elsif p_type = 'visit' then
    select exists (select 1 from public.case_visits v where v.id = p_id
      and (v.user_id = auth.uid()
           or (v.case_id is not null and public.sales_owns_case(v.case_id))
           or (v.lead_id is not null and public.sales_owns_lead(v.lead_id))
           or (v.customer_id is not null and public.sales_owns_customer(v.customer_id)))) into r;
  elsif p_type = 'application' and to_regclass('public.energy_applications') is not null then
    execute 'select exists (select 1 from public.energy_applications a where a.id = $1 and (a.created_by = auth.uid() or a.assigned_to_user_id = auth.uid()'
         || ' or (a.customer_id is not null and public.sales_owns_customer(a.customer_id)) or (a.lead_id is not null and public.sales_owns_lead(a.lead_id))))'
      into r using p_id;
  end if;
  return coalesce(r, false);
end $$;
revoke all on function public.sales_owns_entity(text, uuid) from public, anon;
grant execute on function public.sales_owns_entity(text, uuid) to authenticated, service_role;

-- ───────────────────────── D. guards ─────────────────────────
-- Checks one link of a visit / follow-up. A Sales Agent: the target must be theirs, and an existing link is never re-pointed (null -> owned only).
create or replace function public.visit_link_check(p_kind text, p_old uuid, p_new uuid, p_insert boolean, p_sales boolean)
returns void language plpgsql set search_path = public
as $$
declare v_ok boolean;
begin
  if p_new is null or (not p_insert and p_new is not distinct from p_old) then return; end if;
  if not p_sales then return; end if;
  if not p_insert and p_old is not null then
    raise exception 'visit: the % link cannot be re-pointed', p_kind using errcode = '42501';
  end if;
  v_ok := case p_kind
    when 'case' then public.sales_owns_case(p_new)
    when 'lead' then public.sales_owns_lead(p_new)
    when 'customer' then public.sales_owns_customer(p_new)
    when 'supply_point' then public.sales_owns_entity('supply_point', p_new)
    when 'application' then public.sales_owns_entity('application', p_new)
    else false end;
  if not coalesce(v_ok, false) then
    raise exception 'visit: the % is not yours', p_kind using errcode = '42501';
  end if;
end $$;
revoke all on function public.visit_link_check(text, uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.visit_link_check(text, uuid, uuid, boolean, boolean) to authenticated, service_role;

create or replace function public.case_visits_guard()
returns trigger language plpgsql set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sales boolean;
  v_ins boolean := (tg_op = 'INSERT');
  v_app_new uuid;
  v_app_old uuid;
  v_sc uuid; v_sl uuid;
  v_known text[] := array['planned', 'in_progress', 'completed', 'cancelled', 'no_show'];
begin
  if tg_op = 'DELETE' then
    if v_uid is not null then raise exception 'visit: a visit is never deleted; cancel it with a reason' using errcode = '42501'; end if;
    return old;
  end if;
  if v_uid is null then return new; end if;   -- service role / internal jobs
  v_sales := coalesce(public.is_sales_agent(), false);
  v_app_new := nullif(to_jsonb(new) ->> 'application_id', '')::uuid;
  v_app_old := case when v_ins then null else nullif(to_jsonb(old) ->> 'application_id', '')::uuid end;

  if v_ins then
    if new.status is null then new.status := 'planned'; end if;
    if new.status <> all (v_known) then raise exception 'visit: unknown status %', new.status using errcode = '23514'; end if;
    if v_sales then
      new.user_id := v_uid;
      if new.status <> 'planned' then raise exception 'visit: a new visit starts as planned' using errcode = '23514'; end if;
    end if;
  else
    if new.user_id is distinct from old.user_id and v_sales then
      raise exception 'visit: only Admin / Back Office reassigns a visit' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if new.status <> all (v_known) then raise exception 'visit: unknown status %', new.status using errcode = '23514'; end if;
      if old.status = any (v_known) and not ((old.status = 'planned' and new.status in ('in_progress', 'completed', 'cancelled', 'no_show'))
                                          or (old.status = 'in_progress' and new.status in ('completed', 'cancelled'))) then
        raise exception 'visit: % -> % is not allowed', old.status, new.status using errcode = '23514';
      end if;
      if new.status in ('cancelled', 'no_show') and nullif(btrim(coalesce(new.status_reason, '')), '') is null then
        raise exception 'visit: a reason is required to mark a visit %', new.status using errcode = '23514';
      end if;
    end if;
  end if;

  perform public.visit_link_check('case', case when v_ins then null else old.case_id end, new.case_id, v_ins, v_sales);
  perform public.visit_link_check('lead', case when v_ins then null else old.lead_id end, new.lead_id, v_ins, v_sales);
  perform public.visit_link_check('customer', case when v_ins then null else old.customer_id end, new.customer_id, v_ins, v_sales);
  perform public.visit_link_check('supply_point', case when v_ins then null else old.supply_point_id end, new.supply_point_id, v_ins, v_sales);
  perform public.visit_link_check('application', v_app_old, v_app_new, v_ins, v_sales);

  -- The supply point must belong to the same customer / lead the visit names (never mixes the supplies of two customers).
  if new.supply_point_id is not null and (v_ins or new.supply_point_id is distinct from old.supply_point_id) then
    select s.customer_id, s.lead_id into v_sc, v_sl from public.customer_supply_points s where s.id = new.supply_point_id;
    if (new.customer_id is not null and v_sc is not null and v_sc <> new.customer_id) or (new.lead_id is not null and v_sl is not null and v_sl <> new.lead_id) then
      raise exception 'visit: the supply point belongs to another customer or lead' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.case_visits_guard() from public, anon, authenticated;
drop trigger if exists case_visits_guard_trg on public.case_visits;
create trigger case_visits_guard_trg before insert or update or delete on public.case_visits for each row execute function public.case_visits_guard();

create or replace function public.follow_ups_link_guard()
returns trigger language plpgsql set search_path = public
as $$
declare v_sales boolean;
begin
  if auth.uid() is null then return new; end if;
  v_sales := coalesce(public.is_sales_agent(), false);
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  if v_sales then
    if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
    perform public.visit_link_check('lead', case when tg_op = 'INSERT' then null else old.lead_id end, new.lead_id, tg_op = 'INSERT', true);
    perform public.visit_link_check('customer', case when tg_op = 'INSERT' then null else old.customer_id end, new.customer_id, tg_op = 'INSERT', true);
    if new.visit_id is not null and (tg_op = 'INSERT' or new.visit_id is distinct from old.visit_id) and not public.sales_owns_entity('visit', new.visit_id) then
      raise exception 'follow-up: the visit is not yours' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.follow_ups_link_guard() from public, anon, authenticated;
drop trigger if exists follow_ups_link_guard_trg on public.follow_ups;
create trigger follow_ups_link_guard_trg before insert or update on public.follow_ups for each row execute function public.follow_ups_link_guard();

-- Audit. SECURITY DEFINER only for the activity_log write (the table is not writable by signed-in users).
create or replace function public.case_visits_audit()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_base jsonb := jsonb_build_object('actor_id', auth.uid(), 'visit_user_id', new.user_id, 'case_id', new.case_id, 'lead_id', new.lead_id,
                                     'customer_id', new.customer_id, 'supply_point_id', new.supply_point_id, 'application_id', to_jsonb(new) ->> 'application_id');
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('visit', new.id, case when new.rescheduled_from_id is not null then 'visit_rescheduled_created' else 'visit_scheduled' end,
            v_base || jsonb_build_object('scheduled_at', new.scheduled_at, 'rescheduled_from_id', new.rescheduled_from_id, 'has_prospect', new.prospect is not null));
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('visit', new.id, 'visit_' || new.status, v_base || jsonb_build_object('from', old.status, 'reason', new.status_reason, 'outcome', new.outcome_key));
  end if;
  if new.user_id is distinct from old.user_id then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('visit', new.id, 'visit_reassigned', v_base || jsonb_build_object('from_user_id', old.user_id, 'to_user_id', new.user_id));
  end if;
  if new.scheduled_at is distinct from old.scheduled_at and new.status = old.status then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('visit', new.id, 'visit_time_changed', v_base || jsonb_build_object('from', old.scheduled_at, 'to', new.scheduled_at));
  end if;
  if new.lead_id is distinct from old.lead_id or new.customer_id is distinct from old.customer_id or new.case_id is distinct from old.case_id then
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('visit', new.id, 'visit_linked', v_base);
  end if;
  return new;
end $$;
revoke all on function public.case_visits_audit() from public, anon, authenticated;
drop trigger if exists case_visits_audit_trg on public.case_visits;
create trigger case_visits_audit_trg after insert or update on public.case_visits for each row execute function public.case_visits_audit();

-- ───────────────────────── E. check-in / check-out for visits with or without a Case ─────────────────────────
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
       and not public.is_role('admin') then
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

    -- A cancelled or no-show visit is not open: it can not be checked in (a replayed offline request must not reopen it).
    if v_visit.status in ('cancelled', 'no_show') then
        return jsonb_build_object('accepted', false, 'code', 'NOT_OPEN', 'visitId', v_visit.id, 'status', v_visit.status,
            'message', 'Η επίσκεψη δεν είναι ανοιχτή (' || v_visit.status || ').');
    end if;

    -- Idempotency: an already-open/completed visit never produces a 2nd check-in.
    if v_visit.status in ('in_progress', 'completed') then
        insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
            latitude, longitude, accuracy_m, radius_m, result, notes)
        values (v_visit.case_id, v_visit.id, v_actor, case when v_visit.case_id is null then 'visit' else 'case' end, coalesce(v_visit.case_id, v_visit.id), p_lat, p_lng, v_acc, v_radius, 'IDEMPOTENT', p_notes);
        return jsonb_build_object('accepted', true, 'code', 'IDEMPOTENT', 'already', true, 'visitId', v_visit.id, 'status', v_visit.status,
            'message', 'Η επίσκεψη έχει ήδη καταχωρηθεί (' || v_visit.status || ').');
    end if;

    if p_lat is null or p_lng is null then
        v_flag := 'no_gps'; v_code := 'NO_GPS';
        v_msg := 'Check In ✓ χωρίς θέση GPS — θα το δει ο υπεύθυνος.';
    elsif v_tlat is null or v_tlng is null then
        v_flag := 'no_target'; v_code := 'NO_TARGET';
        v_msg := case when v_visit.case_id is null then 'Check In ✓ — η επίσκεψη δεν έχει αποθηκευμένο σημείο στον χάρτη για σύγκριση.' else 'Check In ✓ — το case δεν έχει αποθηκευμένη διεύθυνση στον χάρτη για σύγκριση.' end;
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
    if v_visit.case_id is not null then
    insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, location, metadata)
    values (v_visit.case_id, 'field_sales', 'check_in', 'Check In', v_desc, v_actor,
        case when p_lat is null then null else jsonb_build_object('lat', p_lat, 'lng', p_lng) end,
        jsonb_build_object('visit_id', v_visit.id, 'accuracy_m', v_acc,
            'distance_from_target_m', case when v_dist is null then null else round(v_dist::numeric, 1) end,
            'radius_m', v_radius, 'check_in_result', v_code, 'review_flag', v_flag));
    else
        insert into public.activity_log (entity_type, entity_id, action, details)
        values ('visit', v_visit.id, 'visit_check_in', jsonb_build_object('actor_id', v_actor, 'result', v_code, 'review_flag', v_flag, 'accuracy_m', v_acc,
            'distance_from_target_m', case when v_dist is null then null else round(v_dist::numeric, 1) end, 'radius_m', v_radius));
    end if;

    insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
        latitude, longitude, accuracy_m, distance_from_target_m, radius_m, result, notes, review_flag)
    values (v_visit.case_id, v_visit.id, v_actor, case when v_visit.case_id is null then 'visit' else 'case' end, coalesce(v_visit.case_id, v_visit.id), p_lat, p_lng, v_acc,
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
       and not public.is_role('admin') then
        raise exception 'forbidden: not your visit';
    end if;

    if v_visit.status in ('cancelled', 'no_show') then
        return jsonb_build_object('accepted', false, 'code', 'NOT_OPEN', 'visitId', v_visit.id, 'status', v_visit.status,
            'message', 'Η επίσκεψη δεν είναι ανοιχτή (' || v_visit.status || ').');
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
    values (v_visit.case_id, v_visit.id, v_actor, case when v_visit.case_id is null then 'visit' else 'case' end, coalesce(v_visit.case_id, v_visit.id),
        p_lat, p_lng, p_accuracy_m, 'CHECKOUT', p_notes);

    if v_visit.case_id is not null then
    insert into public.timeline_events (case_id, role, activity_type, title, description,
        user_id, location, metadata)
    values (v_visit.case_id, 'field_sales', 'check_out', 'Check Out',
        coalesce(nullif(p_notes, ''), 'Η επίσκεψη ολοκληρώθηκε.'),
        v_actor, case when p_lat is not null then jsonb_build_object('lat', p_lat, 'lng', p_lng) else null end,
        jsonb_build_object('visit_id', v_visit.id, 'accuracy_m', p_accuracy_m));
    else
        insert into public.activity_log (entity_type, entity_id, action, details)
        values ('visit', v_visit.id, 'visit_check_out', jsonb_build_object('actor_id', v_actor, 'accuracy_m', p_accuracy_m));
    end if;

    return jsonb_build_object('accepted', true, 'code', 'CHECKOUT',
        'visitId', v_visit.id, 'message', 'Check Out ✓ — η επίσκεψη ολοκληρώθηκε.');
end;
$$;

revoke all on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) from public, anon;
grant execute on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) to authenticated, service_role;
revoke all on function public.field_checkout(uuid, double precision, double precision, integer, text) from public, anon;
grant execute on function public.field_checkout(uuid, double precision, double precision, integer, text) to authenticated, service_role;

-- ───────────────────────── F. visit actions ─────────────────────────
-- SECURITY INVOKER: row-level security and the guard above apply to the caller.
create or replace function public.reschedule_field_visit(p_visit uuid, p_new_at timestamptz, p_reason text)
returns uuid language plpgsql set search_path = public
as $$
declare v public.case_visits%rowtype; v_new uuid;
begin
  if p_new_at is null then raise exception 'reschedule: a new date and time is required' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'reschedule: a reason is required' using errcode = '22023'; end if;
  select * into v from public.case_visits where id = p_visit;
  if v.id is null then raise exception 'reschedule: visit not found' using errcode = 'P0002'; end if;
  if v.status <> 'planned' then raise exception 'reschedule: only a planned visit can be rescheduled' using errcode = '23514'; end if;
  insert into public.case_visits (case_id, lead_id, customer_id, supply_point_id, application_id, prospect, user_id, purpose, status, scheduled_at, location, notes, rescheduled_from_id)
  values (v.case_id, v.lead_id, v.customer_id, v.supply_point_id, v.application_id, v.prospect, v.user_id, v.purpose, 'planned', p_new_at, v.location, v.notes, v.id)
  returning id into v_new;
  update public.case_visits set status = 'cancelled', status_reason = 'rescheduled: ' || btrim(p_reason) where id = v.id;
  return v_new;
end $$;

create or replace function public.cancel_field_visit(p_visit uuid, p_reason text)
returns boolean language plpgsql set search_path = public
as $$
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'cancel: a reason is required' using errcode = '22023'; end if;
  update public.case_visits set status = 'cancelled', status_reason = btrim(p_reason) where id = p_visit and status in ('planned', 'in_progress');
  return found;
end $$;

create or replace function public.mark_visit_no_show(p_visit uuid, p_reason text)
returns boolean language plpgsql set search_path = public
as $$
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'no-show: a reason is required' using errcode = '22023'; end if;
  update public.case_visits set status = 'no_show', status_reason = btrim(p_reason) where id = p_visit and status = 'planned';
  return found;
end $$;
revoke all on function public.reschedule_field_visit(uuid, timestamptz, text), public.cancel_field_visit(uuid, text), public.mark_visit_no_show(uuid, text) from public, anon;
grant execute on function public.reschedule_field_visit(uuid, timestamptz, text), public.cancel_field_visit(uuid, text), public.mark_visit_no_show(uuid, text) to authenticated, service_role;

-- ───────────────────────── G. duplicate signal for a prospect (never a block, never a merge) ─────────────────────────
-- For a record the caller does not own: kind + id + owned_by_other only (no name, no phone, no address).
create or replace function public.field_prospect_matches(p_name text, p_phone text default null, p_address text default null)
returns table (kind text, id uuid, label text, detail text, owned_by_other boolean)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_name text := lower(btrim(coalesce(p_name, '')));
  v_addr text := lower(regexp_replace(btrim(coalesce(p_address, '')), '\s+', ' ', 'g'));
  v_sales boolean := coalesce(public.is_sales_agent(), false);
begin
  if not public.is_staff() then raise exception 'prospect matches: staff only' using errcode = '42501'; end if;
  return query
  with c as (
    select 'lead'::text as k, l.id as i,
           coalesce(nullif(btrim(coalesce(l.full_name, '')), ''), nullif(btrim(coalesce(l.client_name, '')), ''), nullif(btrim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')), ''), '—') as lab,
           coalesce(l.phone, '') as ph, ''::text as addr,
           (not v_sales) or public.sales_owns_lead(l.id) as mine
      from public.leads l where to_jsonb(l) ->> 'deleted_at' is null
    union all
    select 'customer', cu.id, coalesce(nullif(btrim(coalesce(cu.full_name, '')), ''), '—'), coalesce(cu.phone, ''), ''::text,
           (not v_sales) or public.sales_owns_customer(cu.id)
      from public.customers cu where to_jsonb(cu) ->> 'deleted_at' is null
    union all
    select 'supply_point', s.id, coalesce(nullif(btrim(s.property_address), ''), '—'), ''::text, lower(regexp_replace(btrim(s.property_address), '\s+', ' ', 'g')),
           (not v_sales) or public.sales_owns_entity('supply_point', s.id)
      from public.customer_supply_points s where s.archived_at is null
  )
  select c.k, c.i, case when c.mine then c.lab end, case when c.mine then (case c.k when 'supply_point' then 'Παροχή' when 'lead' then 'Lead' else 'Πελάτης' end) end, not c.mine
    from c
   where (length(v_digits) >= 8 and c.k <> 'supply_point' and right(regexp_replace(c.ph, '\D', '', 'g'), 10) = v_digits)
      or (v_name <> '' and c.k <> 'supply_point' and lower(btrim(c.lab)) = v_name)
      or (v_addr <> '' and c.k = 'supply_point' and c.addr = v_addr)
   limit 20;
end $$;
revoke all on function public.field_prospect_matches(text, text, text) from public, anon;
grant execute on function public.field_prospect_matches(text, text, text) to authenticated, service_role;

-- ───────────────────────── H. ownership requests (leads) ─────────────────────────
create table if not exists public.ownership_requests (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null default 'lead' check (entity_type = 'lead'),
  entity_id uuid not null references public.leads(id),
  requested_by uuid not null references public.profiles(id),
  reason text not null check (btrim(reason) <> ''),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists ownership_requests_one_pending on public.ownership_requests (entity_id, requested_by) where status = 'pending';
alter table public.ownership_requests enable row level security;
drop policy if exists "ownership requests read" on public.ownership_requests;
create policy "ownership requests read" on public.ownership_requests for select to authenticated using (public.is_role('admin') or requested_by = auth.uid());
revoke all on public.ownership_requests from anon, authenticated;
grant select on public.ownership_requests to authenticated;     -- writes only through the two functions below

create or replace function public.request_lead_ownership(p_lead uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.is_staff() then raise exception 'ownership: staff only' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'ownership: a reason is required' using errcode = '22023'; end if;
  if not exists (select 1 from public.leads l where l.id = p_lead and to_jsonb(l) ->> 'deleted_at' is null) then raise exception 'ownership: lead not found' using errcode = 'P0002'; end if;
  if public.sales_owns_lead(p_lead) then raise exception 'ownership: the lead is already yours' using errcode = '23514'; end if;
  insert into public.ownership_requests (entity_id, requested_by, reason) values (p_lead, auth.uid(), btrim(p_reason)) returning id into v_id;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('lead', p_lead, 'ownership_requested', jsonb_build_object('request_id', v_id, 'actor_id', auth.uid()));
  return v_id;
end $$;

create or replace function public.decide_ownership_request(p_id uuid, p_approve boolean, p_note text default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare r public.ownership_requests%rowtype;
begin
  if not public.is_role('admin') then raise exception 'ownership: only Admin / Back Office decides' using errcode = '42501'; end if;
  select * into r from public.ownership_requests where id = p_id and status = 'pending' for update;
  if r.id is null then return false; end if;
  if p_approve then update public.leads set assigned_to_user_id = r.requested_by where id = r.entity_id; end if;
  update public.ownership_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '') where id = p_id;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('lead', r.entity_id, case when p_approve then 'ownership_approved' else 'ownership_rejected' end,
          jsonb_build_object('request_id', p_id, 'requested_by', r.requested_by, 'actor_id', auth.uid()));
  return true;
end $$;
revoke all on function public.request_lead_ownership(uuid, text), public.decide_ownership_request(uuid, boolean, text) from public, anon;
grant execute on function public.request_lead_ownership(uuid, text), public.decide_ownership_request(uuid, boolean, text) to authenticated, service_role;
