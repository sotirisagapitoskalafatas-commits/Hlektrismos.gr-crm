-- ROLLBACK options for staged phase2/07 (review before running; staging first).
--
-- What enforces the stage-transition list: the trigger «cases_stage_guard» (BEFORE UPDATE OF current_stage ON
-- public.cases) → function public.cases_stage_guard(), this part:
--   if not exists (select 1 from public.case_stage_transitions t
--                  where t.from_stage = old.current_stage and t.to_stage = new.current_stage) then
--     raise exception 'stage_transition_not_allowed: % -> %' ... hint = 'transition';
-- It applies only to writes made by signed-in users through the API (current_user = authenticated/anon); edge functions
-- with the service role and the SECURITY DEFINER functions are not affected.

-- OPTION A — keep the document gates (warn/block setting), stop enforcing the transition list:
create or replace function public.cases_stage_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare b jsonb;
begin
  if new.current_stage is distinct from old.current_stage and current_user in ('authenticated', 'anon') then
    b := public.case_document_blockers(new.id, new.current_stage);
    if jsonb_array_length(b) > 0 and exists (select 1 from public.stage_document_gates g where g.stage = new.current_stage and g.enabled and g.mode = 'block') then
      raise exception 'stage_blocked: required documents' using errcode = 'P0001', detail = b::text, hint = 'document_blockers';
    end if;
  end if;
  return new;
end;
$$;

-- OPTION B — turn the whole guard off (no transition check, no document block of any kind):
--   drop trigger if exists cases_stage_guard on public.cases;
-- Re-enable later with:
--   create trigger cases_stage_guard before update of current_stage on public.cases for each row execute function public.cases_stage_guard();
