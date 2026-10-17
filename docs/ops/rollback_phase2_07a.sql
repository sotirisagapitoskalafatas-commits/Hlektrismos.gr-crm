-- ROLLBACK for staged phase2/07a (document checklist + «Επιστροφή για διόρθωση»). Review before running; staging first.
-- Tested locally (PGlite): supabase/tests/case-workflow.test.mjs.
--
-- What it does: removes the return/resubmit functions and the guard that stops direct edits of the return columns.
-- DATA IS KEPT: the returned_* / return_* columns on public.cases (and the values in them), document_requirements and
-- stage_document_gates. A case that is currently «returned» stays returned; to release one by hand (as the database owner):
--   update public.cases set returned_at = null, returned_by = null, return_reason = null, return_items = null,
--          return_to_team = null, return_from_stage = null where id = '<case id>';
-- The app degrades to a neutral Greek sentence while the functions are missing (it does not show migration wording).
drop trigger if exists cases_return_guard on public.cases;
drop function if exists public.return_case_for_correction(uuid, text, jsonb, text);
drop function if exists public.resubmit_returned_case(uuid, text);
drop function if exists public.cases_return_guard();

-- Optional, separate decision: the informational checklist function. The app calls it and shows no checklist warning
-- while it is missing; nothing else depends on it.
--   drop function if exists public.case_document_blockers(uuid, text);
