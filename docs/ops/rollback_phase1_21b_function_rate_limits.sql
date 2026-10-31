-- Rollback for phase1/21b. Run only AFTER the functions that call consume_rate_limits and claim_once are rolled back:
-- without it they refuse to send (503), which is safe but stops all outbound messages.
-- communication_log is an audit record: export it first. Dropping it loses that history.
drop table if exists public.communication_log;
drop function if exists public.communication_log_append_only();
drop function if exists public.consume_rate_limits(jsonb);
drop function if exists public.release_once(text);
drop function if exists public.claim_once(text, integer);
drop table if exists public.function_once_locks;
drop index if exists public.campaign_sends_campaign_lead_unique;
drop table if exists public.function_rate_limits;
