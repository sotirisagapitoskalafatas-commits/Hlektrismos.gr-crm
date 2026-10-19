-- ROLLBACK for phase5/19_field_sales_saved_routes.sql.
-- WARNING: this drops saved route plans/stops and therefore deletes data created after the migration.
-- Export these tables before running if they contain user-created routes. Do not use as routine cleanup.

drop policy if exists "field route stops delete permitted route" on public.field_sales_route_stops;
drop policy if exists "field route stops update permitted route" on public.field_sales_route_stops;
drop policy if exists "field route stops insert permitted route" on public.field_sales_route_stops;
drop policy if exists "field route stops read permitted route" on public.field_sales_route_stops;
drop policy if exists "field routes delete own drafts or office" on public.field_sales_routes;
drop policy if exists "field routes update own or office" on public.field_sales_routes;
drop policy if exists "field routes insert own or office" on public.field_sales_routes;
drop policy if exists "field routes read own or office" on public.field_sales_routes;

drop trigger if exists field_sales_protect_route_stop_history on public.field_sales_route_stops;
drop function if exists public.field_sales_protect_route_stop_history();
drop trigger if exists field_sales_track_route_stop_status on public.field_sales_route_stops;
drop function if exists public.field_sales_track_route_stop_status();
drop trigger if exists field_sales_protect_route_history on public.field_sales_routes;
drop function if exists public.field_sales_protect_route_history();
drop function if exists public.field_sales_route_owner_allowed(uuid);
drop function if exists public.field_sales_replace_route_stops(uuid, jsonb);
drop trigger if exists field_sales_duplicate_review_stamp on public.field_sales_duplicate_reviews;
drop function if exists public.field_sales_duplicate_review_stamp();
drop table if exists public.field_sales_duplicate_reviews;
drop function if exists public.field_sales_candidate_duplicate_signal(text, text, text, double precision, double precision);

drop table if exists public.field_sales_route_stops;
drop table if exists public.field_sales_routes;
