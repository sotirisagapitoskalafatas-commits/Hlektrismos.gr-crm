-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 2 / 07c: «Επαναφορά ολοκληρωμένου case» — an ADMIN reopens a completed case, with a written reason, audited.
--   Independent of 07a and 07b (any order, or alone, and twice). It does not change set_case_stage: a completed case is
--   still final for everybody on the ordinary path («Αλλαγή σταδίου από Back Office»). This is the one narrow exception.
--   Who:     admin only (not manager, not Back Office). An inactive admin is refused.
--   When:    only a case whose current stage is «Ολοκληρώθηκε». Nothing else is touched by this function.
--   Where to: one of the working stages new … activation (not completed, lost or cancelled), chosen by the admin.
--   Reason:  required, at least 10 characters. Checked BEFORE anything is read or written, so the app can ask «is this
--            installed?» with an empty reason without ever changing data (a test proves it).
--   Columns: stage = the chosen stage; status = 'open' (a reopened case is worked again); activation_status = NULL (the
--            line is no longer confirmed active — the previous value is kept in the audit entry below).
--            completed_at is not a column of cases, so nothing else has to be reset.
--   Audit:   timeline_events (activity_type 'stage_set', the stepper reads it) and activity_log (action 'case_reopened')
--            with the actor, the stage moved from/to, the reason and the previous status and activation_status.
-- Rollback: docs/ops/rollback_phase2_07c.sql.

create or replace function public.reopen_completed_case(p_case uuid, p_stage text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  c public.cases%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_targets constant text[] := array['new', 'contacted', 'offer', 'application', 'signed', 'document_check', 'submitted', 'activation'];
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true);
  if v_role is distinct from 'admin' then raise exception 'reopen: not allowed' using errcode = '42501'; end if;
  if length(v_reason) < 10 then raise exception 'reopen: a reason of at least 10 characters is required' using errcode = '22023'; end if;
  if p_stage is null or not (p_stage = any(v_targets)) then raise exception 'reopen: unknown stage' using errcode = '22023'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'reopen: case not found' using errcode = 'P0002'; end if;
  if c.current_stage <> 'completed' then raise exception 'reopen: the case is not completed' using errcode = 'P0001'; end if;
  update public.cases
     set current_stage = p_stage, status = 'open', activation_status = null, updated_at = now()
   where id = p_case;
  insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, metadata)
  values (p_case, v_role, 'stage_set', 'Επαναφορά ολοκληρωμένου case από διαχειριστή: completed → ' || p_stage, v_reason, auth.uid(),
          jsonb_build_object('from', 'completed', 'to', p_stage, 'reopened', true));
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('case', p_case, 'case_reopened', jsonb_build_object('actor_id', auth.uid(), 'from', 'completed', 'to', p_stage, 'reason', v_reason,
          'previous_status', c.status, 'previous_activation_status', c.activation_status));
end;
$$;
revoke all on function public.reopen_completed_case(uuid, text, text) from public, anon;
grant execute on function public.reopen_completed_case(uuid, text, text) to authenticated;
