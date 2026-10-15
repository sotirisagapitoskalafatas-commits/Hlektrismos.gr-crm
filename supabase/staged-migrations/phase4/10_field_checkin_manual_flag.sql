-- STAGED (Phase 4 / 10) — NOT APPLIED. Apply on staging first, then production with the owner's approval.
-- Field check-in: a manual check-in ALWAYS succeeds (meeting decision, 15/10/2026).
--
-- Before (live since 20260911010000): field_checkin() REFUSED a check-in that was more than check_in_radius_m (150 m)
-- from the stored customer location, or when GPS was missing / too inaccurate, so an agent with GPS drift or a
-- mis-geocoded address could not record the visit at all.
-- After: the check-in is accepted and the visit opens. Distance and accuracy are recorded as before, and when
-- something is off the check-in carries a review flag for the manager:
--   far_from_address — GPS more than check_in_radius_m from the stored address
--   gps_uncertain    — accuracy worse than 2 × radius (distance not trustworthy)
--   no_gps           — no position given (permission denied / unavailable)
--   no_target        — the case has no stored coordinates to compare with
-- Only the position AT check-in is stored (no tracking). A setting arrival_prompt_radius_m (default 75) is read by the
-- app to show «Φτάσατε στο…;» while it is open; it has no server effect.
-- Managers / admins / Back Office see flagged check-ins with field_checkins_for_review() and mark them reviewed.

alter table public.field_checkins
  add column if not exists review_flag text check (review_flag in ('far_from_address', 'gps_uncertain', 'no_gps', 'no_target')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_note text;
create index if not exists field_checkins_review_idx on public.field_checkins (created_at desc) where review_flag is not null and reviewed_at is null;

insert into public.crm_settings (setting_key, setting_value, category, description)
select 'arrival_prompt_radius_m', jsonb '75', 'field_sales', 'Ακτίνα (μέτρα) για την ερώτηση «Φτάσατε;» στην εφαρμογή'
where not exists (select 1 from public.crm_settings where setting_key = 'arrival_prompt_radius_m');

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
revoke all on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) from public, anon;
grant execute on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) to authenticated;

-- Flagged, not yet reviewed check-ins (newest first) for admin / manager / back office.
create or replace function public.field_checkins_for_review(p_days integer default 30)
returns table (id uuid, created_at timestamptz, agent text, case_id uuid, case_no text, customer text,
               review_flag text, distance_m double precision, accuracy_m integer, radius_m integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true) and p.role in ('admin', 'manager', 'back_office')) then
    raise exception 'checkin review: not allowed' using errcode = '42501';
  end if;
  return query
    select f.id, f.created_at, coalesce(pr.full_name, '—'), f.case_id, c.case_no, cu.full_name,
           f.review_flag, f.distance_from_target_m, f.accuracy_m, f.radius_m
    from public.field_checkins f
    left join public.profiles pr on pr.id = f.user_id
    left join public.cases c on c.id = f.case_id
    left join public.customers cu on cu.id = c.customer_id
    where f.review_flag is not null and f.reviewed_at is null
      and f.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
    order by f.created_at desc
    limit 200;
end;
$$;

create or replace function public.review_field_checkin(p_id uuid, p_note text default null)
returns boolean language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true) and p.role in ('admin', 'manager', 'back_office')) then
    raise exception 'checkin review: not allowed' using errcode = '42501';
  end if;
  update public.field_checkins set reviewed_at = now(), reviewed_by = auth.uid(), review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_id and review_flag is not null and reviewed_at is null;
  return found;
end;
$$;
revoke all on function public.field_checkins_for_review(integer) from public, anon;
revoke all on function public.review_field_checkin(uuid, text) from public, anon;
grant execute on function public.field_checkins_for_review(integer) to authenticated;
grant execute on function public.review_field_checkin(uuid, text) to authenticated;

-- ROLLBACK: re-run the field_checkin definition from supabase/migrations/20260911010000_field_sales_geofence.sql
--           (rejection behaviour); drop function public.field_checkins_for_review(integer), public.review_field_checkin(uuid, text);
--           the added columns and the setting can stay (unused).
