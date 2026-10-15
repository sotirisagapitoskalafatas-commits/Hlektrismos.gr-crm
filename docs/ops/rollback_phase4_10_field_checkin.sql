-- ROLLBACK for staged phase4/10: restores field_checkin() exactly as in supabase/migrations/20260911010000_field_sales_geofence.sql
-- (rejects check-ins > check_in_radius_m or without GPS). Generated from the repository; review before running.
begin;
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
    v_res      text;
begin
    if v_actor is null then
        raise exception 'auth.uid() is null';
    end if;
    if not public.is_staff() then
        raise exception 'forbidden: staff only';
    end if;

    select * into v_visit from public.case_visits where id = p_visit_id;
    if v_visit is null or v_visit.id is null then
        return jsonb_build_object('accepted', false, 'code', 'NO_VISIT',
            'message', 'Η επίσκεψη δεν βρέθηκε.');
    end if;
    if v_visit.user_id is not null and v_visit.user_id <> v_actor
       and not exists (select 1 from public.profiles p where p.id = v_actor and p.role in ('admin', 'manager')) then
        raise exception 'forbidden: not your visit';
    end if;

    select * into v_case from public.cases where id = v_visit.case_id;

    -- Target position: case coordinates first, then the visit's own location.
    v_tlat := case when v_case.lat is not null then v_case.lat
                   when v_visit.location is not null then (v_visit.location ->> 'lat')::double precision
                   else null end;
    v_tlng := case when v_case.lng is not null then v_case.lng
                   when v_visit.location is not null then (v_visit.location ->> 'lng')::double precision
                   else null end;

    v_radius := p_radius_m;
    if v_radius is null then
        select (setting_value #>> '{}')::integer into v_radius
        from public.crm_settings where setting_key = 'check_in_radius_m';
    end if;
    v_radius := coalesce(v_radius, 150);
    v_acc := coalesce(p_accuracy_m, 50);

    -- No stored coordinates → honest NO_TARGET, never a fabricated pin.
    if v_tlat is null or v_tlng is null then
        insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
            latitude, longitude, accuracy_m, radius_m, result, notes)
        values (v_visit.case_id, v_visit.id, v_actor, 'case', v_visit.case_id,
            p_lat, p_lng, v_acc, v_radius, 'NO_TARGET', p_notes);
        return jsonb_build_object('accepted', false, 'code', 'NO_TARGET', 'caseId', v_visit.case_id,
            'message', 'Δεν βρέθηκαν σημεία για τη συγκεκριμένη κατηγορία. Προσθέστε lat/lng στο case.');
    end if;

    -- Idempotency: an already-open/completed visit never produces a 2nd check-in.
    if v_visit.status in ('in_progress', 'completed') then
        insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
            latitude, longitude, accuracy_m, radius_m, result, notes)
        values (v_visit.case_id, v_visit.id, v_actor, 'case', v_visit.case_id,
            p_lat, p_lng, v_acc, v_radius, 'IDEMPOTENT', p_notes);
        return jsonb_build_object('accepted', true, 'code', 'IDEMPOTENT', 'already', true,
            'visitId', v_visit.id, 'status', v_visit.status,
            'message', 'Η επίσκεψη έχει ήδη καταχωρηθεί (' || v_visit.status || ').');
    end if;

    -- GPS must exist and be trustworthy enough for the configured radius.
    if p_lat is null or p_lng is null then
        insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
            latitude, longitude, accuracy_m, radius_m, result, notes)
        values (v_visit.case_id, v_visit.id, v_actor, 'case', v_visit.case_id,
            p_lat, p_lng, v_acc, v_radius, 'GPS_UNCERTAIN', p_notes);
        return jsonb_build_object('accepted', false, 'code', 'GPS_UNCERTAIN', 'visitId', v_visit.id,
            'message', 'Η θέση σας δεν είναι διαθέσιμη ή δεν έχει αρκετή ακρίβεια. Ενεργοποιήστε την τοποθεσία για Check-in.');
    end if;

    if v_acc > v_radius * 2 then
        insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
            latitude, longitude, accuracy_m, distance_from_target_m, radius_m, result, notes)
        values (v_visit.case_id, v_visit.id, v_actor, 'case', v_visit.case_id,
            p_lat, p_lng, v_acc, null, v_radius, 'GPS_UNCERTAIN', p_notes);
        return jsonb_build_object('accepted', false, 'code', 'GPS_UNCERTAIN', 'visitId', v_visit.id,
            'accuracyM', v_acc, 'radiusM', v_radius,
            'message', 'Η ακρίβεια GPS (±' || v_acc || ' μ) υπερβαίνει τη διπλάσια ακτίνα ελέγχου (' || v_radius || ' μ).');
    end if;

    v_cos := sin(radians(v_tlat)) * sin(radians(p_lat))
             + cos(radians(v_tlat)) * cos(radians(p_lat)) * cos(radians(p_lng) - radians(v_tlng));
    v_cos := least(1.0, greatest(-1.0, v_cos));
    v_dist := 6371000.0 * acos(v_cos); -- meters

    if v_dist <= v_radius then
        v_res := 'INSIDE_RADIUS';
        update public.case_visits
           set status = 'in_progress',
               started_at = coalesce(started_at, now()),
               check_in = jsonb_build_object('at', now(), 'lat', p_lat, 'lng', p_lng,
                                  'accuracy', v_acc, 'distance_from_target_m', round(v_dist::numeric, 1),
                                  'radius_m', v_radius, 'result', v_res)
         where id = v_visit.id;

        insert into public.timeline_events (case_id, role, activity_type, title, description,
            user_id, location, metadata)
        values (v_visit.case_id, 'field_sales', 'check_in', 'Check In',
            'Ο πωλητής έφτασε στον πελάτη — εντός ακτίνας ' || v_radius || ' μ (απόσταση ' ||
            round(v_dist::numeric, 0) || ' μ, ακρίβεια ±' || v_acc || ' μ).',
            v_actor, jsonb_build_object('lat', p_lat, 'lng', p_lng),
            jsonb_build_object('visit_id', v_visit.id, 'accuracy_m', v_acc,
                'distance_from_target_m', round(v_dist::numeric, 1), 'radius_m', v_radius,
                'check_in_radius_policy', 'INSIDE_RADIUS'));
    else
        v_res := 'OUTSIDE_RADIUS';
    end if;

    insert into public.field_checkins (case_id, visit_id, user_id, entity_type, entity_id,
        latitude, longitude, accuracy_m, distance_from_target_m, radius_m, result, notes)
    values (v_visit.case_id, v_visit.id, v_actor, 'case', v_visit.case_id,
        p_lat, p_lng, v_acc, round(v_dist::numeric, 1), v_radius, v_res, p_notes);

    return jsonb_build_object('accepted', v_res = 'INSIDE_RADIUS', 'code', v_res,
        'visitId', v_visit.id, 'caseId', v_visit.case_id,
        'distanceMeters', round(v_dist::numeric, 1), 'radiusM', v_radius, 'accuracyM', v_acc,
        'message', case v_res
            when 'INSIDE_RADIUS' then 'Check In αποδεκτό — εντός ακτίνας ' || v_radius || ' μ.'
            else 'Το GPS απέχει ' || round(v_dist::numeric, 0) || ' μ από τον στόχο (πέραν ακτίνας ' || v_radius || ' μ).'
        end);
end;
$$;

revoke all on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) from public;
grant execute on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) to authenticated;
drop function if exists public.field_checkins_for_review(integer);
drop function if exists public.review_field_checkin(uuid, text);
-- The added columns (review_flag, reviewed_at, reviewed_by, review_note) and the arrival_prompt_radius_m setting can stay; they are unused by the old function.
commit;
