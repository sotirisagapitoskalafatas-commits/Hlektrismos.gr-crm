-- Field Sales travel metrics (slice 8).
-- Computes per-day field activity from the `field_checkins` audit log:
--   check-ins, accepted check-ins, distinct visits, travel distance and
--   travel time measured between consecutive accepted check-ins per rep per day.
--   Travel legs are only counted when the gap between two check-ins is
--   between 3 minutes and 2 hours (filters out duplicate rapid check-ins
--   and long gaps that imply non-driving breaks).
-- SECURITY DEFINER + is_staff() gate, authenticated-only EXECUTE.

create or replace function public.field_sales_metrics(
    p_user_id uuid default null,
    p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
    v_from    timestamptz;
    v_days    jsonb;
    v_totals  jsonb;
begin
    if not public.is_staff() then
        return jsonb_build_object(
            'forbidden', true,
            'days', jsonb_build_array(),
            'totals', jsonb_build_object('checkins', 0, 'accepted', 0, 'visits', 0, 'distance_km', 0, 'travel_h', 0, 'active_days', 0)
        );
    end if;

    v_from := (current_date - make_interval(days => greatest(1, coalesce(p_days, 30))))::timestamptz;

    drop table if exists _field_metrics_day;
    create temp table _field_metrics_day on commit drop as
    with legs as (
        select user_id,
               timezone('Europe/Athens', created_at)::date as day,
               latitude, longitude, created_at,
               lag(latitude)  over w as prev_lat,
               lag(longitude) over w as prev_lng,
               lag(created_at) over w as prev_at
        from public.field_checkins
        where created_at >= v_from
          and result = 'INSIDE'
          and (p_user_id is null or user_id = p_user_id)
        window w as (partition by user_id, timezone('Europe/Athens', created_at)::date order by created_at)
    ),
    legs_km as (
        select user_id, day, created_at,
               case when prev_lat is not null then
                  6371.0 * 2 * asin(sqrt(
                      power(sin((radians(latitude) - radians(prev_lat)) / 2), 2)
                    + cos(radians(prev_lat)) * cos(radians(latitude))
                    * power(sin((radians(longitude) - radians(prev_lng)) / 2), 2)
                  ))
               else 0 end as km,
               extract(epoch from (created_at - prev_at)) / 3600.0 as gap_h
        from legs
    ),
    days as (
        select a.user_id,
               timezone('Europe/Athens', a.created_at)::date as day,
               count(*) filter (where a.result <> 'NO_TARGET') as checkins,
               count(*) filter (where a.result = 'INSIDE') as accepted,
               count(distinct a.visit_id) filter (where a.result = 'INSIDE') as visits,
               coalesce(sum(lk.km) filter (where lk.gap_h between 0.05 and 2.0), 0) as distance_km,
               coalesce(sum(lk.gap_h) filter (where lk.gap_h between 0.05 and 2.0), 0) as travel_h
        from public.field_checkins a
        left join legs_km lk
               on lk.user_id = a.user_id
              and lk.day = timezone('Europe/Athens', a.created_at)::date
              and lk.created_at = a.created_at
        where a.created_at >= v_from
          and a.result <> 'NO_TARGET'
          and (p_user_id is null or a.user_id = p_user_id)
        group by a.user_id, 2
    )
    select user_id, day, checkins, accepted, visits, distance_km, travel_h
    from days;

    select coalesce(jsonb_agg(
             jsonb_build_object(
               'day', day,
               'user_id', user_id,
               'full_name', coalesce(p.full_name, 'Χρήστης'),
               'checkins', checkins,
               'accepted', accepted,
               'visits', visits,
               'distance_km', round(distance_km::numeric, 2),
               'travel_h', round(travel_h::numeric, 2)
             ) order by day desc, full_name asc
           ), '[]'::jsonb)
    into v_days
    from _field_metrics_day d
    left join public.profiles p on p.id = d.user_id;

    select jsonb_build_object(
             'checkins', coalesce(sum(checkins), 0),
             'accepted', coalesce(sum(accepted), 0),
             'visits', coalesce(sum(visits), 0),
             'distance_km', round(coalesce(sum(distance_km), 0)::numeric, 2),
             'travel_h', round(coalesce(sum(travel_h), 0)::numeric, 2),
             'active_days', count(*)
           )
    into v_totals
    from _field_metrics_day;

    return jsonb_build_object('forbidden', false, 'days', v_days, 'totals', v_totals);
end $fn$;

revoke execute on function public.field_sales_metrics(uuid, integer) from anon, public;
grant execute on function public.field_sales_metrics(uuid, integer) to authenticated;