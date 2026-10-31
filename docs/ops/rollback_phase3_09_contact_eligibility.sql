-- Rollback for phase3/09. Run only AFTER phase3/11 is rolled back (rollback_phase3_11_contact_service_requests.sql) and after the Edge Functions that read
-- these tables are rolled back or stopped: the hardened send-sms, send-campaign-email, send-email, make-voice-call, send-offer and vapi-webhook REFUSE
-- to send (fail closed) while contact_objections / contact_consents are missing. That is the intended safe state, not an outage to work around.
-- This DROPS objections, consents (with their evidence) and Article 11 screenings. A recorded «δεν θέλω επικοινωνία» is a legal fact:
-- export public.contact_objections, public.contact_consents and public.article11_screenings FIRST and keep the export.
-- Audit rows already written to activity_log by contact_log() are not touched.
drop function if exists public.record_article11_screening(text, text, text, text, timestamptz, uuid, uuid);
drop function if exists public.withdraw_contact_consent(text, text, text, text, uuid, uuid);
drop function if exists public.record_contact_consent(text, text, text, text, text, timestamptz, text, text, uuid, uuid);
drop function if exists public.lift_contact_objection(uuid, text);
drop function if exists public.record_spoken_objection(text, text, uuid, uuid);
drop function if exists public.record_contact_objection(text, text, text, text[], text, text, uuid, uuid);
drop function if exists public.contact_log(text, uuid, uuid, jsonb);
drop function if exists public.contact_facts(text, text);
drop table if exists public.article11_screenings;
drop table if exists public.contact_consents;
drop table if exists public.contact_objections;
drop function if exists public.contact_role();
drop function if exists public.contact_email_key(text);
drop function if exists public.contact_phone_key(text);
