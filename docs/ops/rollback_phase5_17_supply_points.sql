-- ROLLBACK for staged phase5/17 (several connections per customer). Review before running; staging first.
-- Tested locally (PGlite): supabase/tests/supply-points.test.mjs.
-- The legacy tables supply_points and customer_meters were never touched, so nothing has to be restored there.

-- OPTION A — switch the feature off, KEEP the data (recommended). The app then shows «Η λειτουργία δεν είναι ακόμη διαθέσιμη.».
drop trigger if exists cases_supply_point_guard on public.cases;
drop trigger if exists case_documents_supply_point_guard on public.case_documents;
drop function if exists public.supply_point_link_guard();
drop function if exists public.flag_supply_point_review(uuid, text);
drop function if exists public.resolve_supply_point_review(uuid, text);
drop function if exists public.supply_point_duplicates(text, uuid);
-- To make the tables unreachable as well (data stays in the database):
--   revoke all on public.customer_supply_points, public.tariff_categories from authenticated;

-- OPTION B — remove everything, INCLUDING the connections people entered. Export first:
--   select * from public.customer_supply_points;   select * from public.tariff_categories;
--   select id, supply_point_id from public.cases where supply_point_id is not null;
--   select id, supply_point_id from public.case_documents where supply_point_id is not null;
-- alter table public.case_documents drop column if exists supply_point_id;
-- alter table public.cases drop column if exists supply_point_id;
-- drop trigger if exists customer_supply_points_audit_ins on public.customer_supply_points;
-- drop trigger if exists customer_supply_points_audit_upd on public.customer_supply_points;
-- drop function if exists public.customer_supply_points_audit();
-- drop table if exists public.customer_supply_points;
-- drop table if exists public.tariff_categories;
-- The activity_log entries (entity_type 'supply_point') stay as the history.
