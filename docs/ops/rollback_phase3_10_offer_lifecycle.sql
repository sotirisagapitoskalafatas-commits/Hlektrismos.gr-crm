-- Rollback for phase3/10. Run only AFTER send-offer and accept-offer are rolled back: without these functions they refuse to work.
-- This drops the offer records and their history. Export public.offers, public.offer_events and public.offer_legacy_link_reviews first.
-- Conversions already made stay on hlektrismos_leads, crm_tasks and lead_notes.
drop function if exists public.offer_note_legacy_link(uuid, uuid, text, boolean);
drop function if exists public.offer_accept(uuid, uuid);
drop function if exists public.offer_mark_failed(uuid, uuid);
drop function if exists public.offer_mark_sent(uuid, text[], uuid);
drop function if exists public.offer_record_delivery(uuid, text, boolean, integer, uuid);
drop function if exists public.offer_create(uuid, uuid, timestamptz, text, numeric, numeric, uuid);
drop table if exists public.offer_legacy_link_reviews;
drop table if exists public.offer_events;
drop table if exists public.offers;
drop function if exists public.offer_events_append_only();
