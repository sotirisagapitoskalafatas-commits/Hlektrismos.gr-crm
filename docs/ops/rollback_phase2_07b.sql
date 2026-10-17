-- ROLLBACK options for staged phase2/07b (allowed stage moves + set_case_stage). Review before running; staging first.
-- Tested locally (PGlite): supabase/tests/case-workflow.test.mjs and supabase/tests/stage-set.test.mjs.
--
-- What enforces the list of allowed moves: trigger «cases_stage_guard» (BEFORE UPDATE OF current_stage ON public.cases)
-- → function public.cases_stage_guard(). It applies only to writes made by signed-in users through the API
-- (current_user = authenticated/anon); edge functions with the service role and the SECURITY DEFINER functions
-- (set_case_stage, return_case_for_correction) are not affected. The guard no longer looks at documents.

-- OPTION A — stop enforcing the list, keep «Αλλαγή σταδίου από Back Office» (set_case_stage) and its audit trail:
create or replace function public.cases_stage_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  return new;
end;
$$;

-- OPTION B — turn the guard off completely (same effect as A, no function call per update):
--   drop trigger if exists cases_stage_guard on public.cases;
-- Re-enable later with:
--   create trigger cases_stage_guard before update of current_stage on public.cases for each row execute function public.cases_stage_guard();

-- OPTION C — remove «Αλλαγή σταδίου από Back Office» (the app then shows a neutral Greek sentence). History written by it
-- stays (timeline_events 'stage_set', activity_log 'stage_set'):
--   drop function if exists public.set_case_stage(uuid, text, text);
