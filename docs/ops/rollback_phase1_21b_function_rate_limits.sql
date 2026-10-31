-- Rollback for phase1/21b. Run only AFTER the functions that call consume_rate_limit are rolled back:
-- without it they refuse to send (503), which is safe but stops all outbound messages.
drop function if exists public.consume_rate_limit(text, integer, integer);
drop table if exists public.function_rate_limits;
