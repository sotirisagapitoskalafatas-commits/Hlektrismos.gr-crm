-- Rollback for phase1/21c. Run only AFTER receive-lead-webhook is rolled back: without the function it answers 500 and stores nothing.
-- The leads created through it stay; only the record of which deliveries were seen is lost.
drop function if exists public.ingest_webhook_lead(text, text, text, jsonb);
drop table if exists public.lead_webhook_events;
