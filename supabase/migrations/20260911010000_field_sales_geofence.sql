-- ---------------------------------------------------------------------------
-- Field Sales — server-validated Check-in (geofence + idempotency + audit).
--
-- 1. Leads gain optional coordinates so the Field Sales map can render real
--    Lead pins (source/confidence tracked — we never fabricate coordinates).
-- 2. field_checkins() audit trail for every check-in attempt + result.
-- 3. field_checkin() RPC (SECURITY DEFINER):
--      · validates caller is staff and owns the visit (or manages it)
--      · resolves the target from the case (or the visit's own location)
--      · GPS_UNCERTAIN when accuracy exceeds 2× the geo-fence radius
--      · INSIDE_RADIUS → accepts, opens the visit, writes timeline event
--      · OUTSIDE_RADIUS → rejects (recorded), no timeline event
--      · NO_TARGET     → no stored coordinates (recorded), never invents a point
--      · IDEMPOTENT    → the visit is already in progress/completed; repeated
--                        requests never duplicate the check-in
--    Radius is configurable via crm_settings['check_in_radius_m'] (default 150).
-- 4. field_checkout() RPC completes the visit + closes the audit loop.
-- ---------------------------------------------------------------------------

create table if not exists public.field_checkins (
    id                    uuid primary key default gen_random_uuid(),
    case_id               uuid references public.cases(id) on delete cascade,
    visit_id              uuid references public.case_visits(id) on delete cascade,
    user_id               uuid references auth.users(id) on delete set null,
    entity_type           text not null default 'case',
    entity_id             uuid,
    service_request_id    uuid,
    latitude              double precision,
    longitude             double precision,
    accuracy_m            integer,
    distance_from_target_m double precision,
    radius_m              integer,
    result                text not null,
    idempotency_key       text,
    notes                 text,
    created_at            timestamptz not null default now()
);

create index if not exists field_checkins_visit_idx on public.field_checkins (visit_id, created_at desc);
create index if not exists field_checkins_case_idx  on public.field_checkins (case_id, created_at desc);
create index if not exists field_checkins_user_idx  on public.field_checkins (user_id, created_at desc);

alter table public.field_checkins enable row level security;

drop policy if exists "field_checkins_staff_read" on public.field_checkins;
create policy "field_checkins_staff_read" on public.field_checkins
    for select using (public.is_staff());

drop policy if exists "field_checkins_rpc_write" on public.field_checkins;
create policy "field_checkins_rpc_write" on public.field_checkins
    for insert with check (public.is_staff());

-- Leads coordinates (optional — only ever set via explicit user action).
alter table public.leads
    add column if not exists lat double precision,
    add column if not exists lng double precision,
    add column if not exists location_source text,
    add column if not exists location_confidence text;

-- Seed the configurable geo-fence radius (no-op if already set).
insert into public.crm_settings (setting_key, setting_value, category, description)
select 'check_in_radius_m', jsonb '150', 'field_sales', 'Ακτίνα (μέτρα) για έγκυρο Check In πεδίου'
where not exists (select 1 from public.crm_settings where setting_key = 'check_in_radius_m');

-- ---------------------------------------------------------------------------
-- field_checkin() — server-validated GPS check-in.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- field_checkout() — complete the visit + close the audit loop.
-- ---------------------------------------------------------------------------
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

revoke all on function public.field_checkout(uuid, double precision, double precision, integer, text) from public;
grant execute on function public.field_checkout(uuid, double precision, double precision, integer, text) to authenticated;