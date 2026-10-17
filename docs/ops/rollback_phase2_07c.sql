-- ROLLBACK for staged phase2/07c (admin reopens a completed case). Review before running; staging first.
-- Tested locally (PGlite): supabase/tests/reopen-case.test.mjs.
--
-- Removing the function is enough: it has no table, column, trigger or policy of its own. The app then shows a neutral
-- Greek sentence instead of the form («Η λειτουργία δεν είναι ακόμη διαθέσιμη.»).
drop function if exists public.reopen_completed_case(uuid, text, text);

-- Cases that were already reopened stay reopened (their stage, status and activation_status are not restored).
-- Every reopening is recorded, so they can be listed and, if the owner wants, put back by hand:
--   select entity_id as case_id, created_at, details->>'actor_id' as actor, details->>'to' as reopened_to, details->>'reason' as reason,
--          details->>'previous_status' as previous_status, details->>'previous_activation_status' as previous_activation_status
--     from public.activity_log where action = 'case_reopened' order by created_at;
