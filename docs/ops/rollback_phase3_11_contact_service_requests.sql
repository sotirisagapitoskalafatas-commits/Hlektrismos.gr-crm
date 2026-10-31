-- Rollback for phase3/11. Run only AFTER send-offer is rolled back (or SERVICE_COMMS_APPROVED is unset and no requested offers are in flight):
-- without contact_service_requests send-offer treats every channel as promotional, which is the safe behaviour.
-- This DROPS the recorded customer requests and their evidence. Export public.contact_service_requests first.
-- Offers already created with purpose 'requested_service' keep that value; nothing else references this table.
drop function if exists public.withdraw_service_request(uuid);
drop function if exists public.record_service_request(uuid, text, text[], text, timestamptz, timestamptz);
drop table if exists public.contact_service_requests;
