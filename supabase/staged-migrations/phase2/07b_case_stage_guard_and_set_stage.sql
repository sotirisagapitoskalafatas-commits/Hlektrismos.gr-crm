-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 2 / 07b: allowed stage moves + «Αλλαγή σταδίου από Back Office».   Independent of 07a (either order, or alone).
--   B) The list of allowed moves (case_stage_transitions, the same matrix as src/lib/roles.ts STAGE_TRANSITIONS) is
--      enforced for DIRECT writes by signed-in users (trigger on cases.current_stage), so the UI cannot bypass it.
--      Sales roles work inside this list. The guard no longer looks at documents (they never block).
--   D) set_case_stage: Back Office / admin / manager may move a case to ANY other stage, with a written reason, audited.
--      This is how the non-linear Back Office workflow of master prompt §8 is served: a case can be worked, returned or
--      resumed from where it really is, without pretending that earlier stages were completed.
-- This file replaces the second half of the former single 07. If the FORMER 07 was already applied, create or replace
-- swaps the guard's body for the version below (its document check goes), and the trigger is recreated.
-- Rollback: docs/ops/rollback_phase2_07b.sql.

-- ───────────────────────── B) allowed moves & the guard on every direct stage write ─────────────────────────
create table if not exists public.case_stage_transitions (from_stage text not null, to_stage text not null, primary key (from_stage, to_stage));
alter table public.case_stage_transitions enable row level security;
drop policy if exists "staff read transitions" on public.case_stage_transitions;
create policy "staff read transitions" on public.case_stage_transitions for select to authenticated using (public.is_staff());
grant select on public.case_stage_transitions to authenticated;
insert into public.case_stage_transitions (from_stage, to_stage) values
  ('new', 'contacted'), ('new', 'lost'), ('new', 'cancelled'),
  ('contacted', 'offer'), ('contacted', 'application'), ('contacted', 'lost'), ('contacted', 'cancelled'),
  ('offer', 'application'), ('offer', 'signed'), ('offer', 'lost'), ('offer', 'cancelled'),
  ('application', 'signed'), ('application', 'document_check'), ('application', 'lost'), ('application', 'cancelled'),
  ('signed', 'document_check'), ('signed', 'lost'), ('signed', 'cancelled'),
  ('document_check', 'submitted'), ('document_check', 'application'), ('document_check', 'lost'), ('document_check', 'cancelled'),
  ('submitted', 'activation'), ('submitted', 'document_check'), ('submitted', 'lost'), ('submitted', 'cancelled'),
  ('activation', 'completed'), ('activation', 'submitted'), ('activation', 'lost'), ('activation', 'cancelled'),
  ('lost', 'new'), ('cancelled', 'new')
on conflict do nothing;

-- SECURITY INVOKER: current_user is 'authenticated' for browser writes, the owner inside the SECURITY DEFINER functions.
-- A direct stage write must be an allowed move (the same list as the app, src/lib/roles.ts STAGE_TRANSITIONS).
-- Documents are NOT checked: they never block (see 07a). Anything beyond the list goes through set_case_stage below.
create or replace function public.cases_stage_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.current_stage is distinct from old.current_stage and current_user in ('authenticated', 'anon') then
    if not exists (select 1 from public.case_stage_transitions t where t.from_stage = old.current_stage and t.to_stage = new.current_stage) then
      raise exception 'stage_transition_not_allowed: % -> %', old.current_stage, new.current_stage using errcode = 'P0001', hint = 'transition';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists cases_stage_guard on public.cases;
create trigger cases_stage_guard before update of current_stage on public.cases for each row execute function public.cases_stage_guard();

-- ───────────────────────── D) «Αλλαγή σταδίου από Back Office»: any stage, with an audited reason ─────────────────────────
-- Back Office works a case from where it really is (master prompt §8.2): this is the ONE path beyond the list above.
--   Who:     the roles that hold «create_application» in the app (src/lib/roles.ts): admin, manager, back_office.
--            (A test keeps this list equal to the app's.) Sales roles keep the list.
--   Reason:  required, at least 10 characters. Recorded on the timeline (stage_set) and in activity_log with the actor.
--   Rules:   any target stage except the current one; a completed case is final; a case is completed only from
--            «Ενεργοποίηση» (OWNER DECISION, one place to change: the p_stage = 'completed' check below).
--            No document check: documents never block.
--   Columns: the same side effects as the app's changeStage — completed → status 'completed' + activation_status
--            'active'; lost / cancelled → status 'lost'; leaving lost / cancelled → status back to 'open' (the column's
--            default), so a reopened case is not counted as lost.
create or replace function public.set_case_stage(p_case uuid, p_stage text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  c public.cases%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_stages constant text[] := array['new', 'contacted', 'offer', 'application', 'signed', 'document_check', 'submitted', 'activation', 'completed', 'lost', 'cancelled'];
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true);
  if v_role is null or v_role not in ('admin', 'manager', 'back_office') then raise exception 'set_stage: not allowed' using errcode = '42501'; end if;
  if length(v_reason) < 10 then raise exception 'set_stage: a reason of at least 10 characters is required' using errcode = '22023'; end if;
  if p_stage is null or not (p_stage = any(v_stages)) then raise exception 'set_stage: unknown stage' using errcode = '22023'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'set_stage: case not found' using errcode = 'P0002'; end if;
  if c.current_stage = p_stage then raise exception 'set_stage: the case is already in this stage' using errcode = 'P0001'; end if;
  if c.current_stage = 'completed' then raise exception 'set_stage: a completed case does not change stage' using errcode = 'P0001'; end if;
  if p_stage = 'completed' and c.current_stage <> 'activation' then
    raise exception 'set_stage: a case is completed only from the activation stage' using errcode = 'P0001';
  end if;
  update public.cases
     set current_stage = p_stage,
         status = case when p_stage = 'completed' then 'completed'
                       when p_stage in ('lost', 'cancelled') then 'lost'
                       when c.current_stage in ('lost', 'cancelled') then 'open'
                       else status end,
         activation_status = case when p_stage = 'completed' then 'active' else activation_status end,
         updated_at = now()
   where id = p_case;
  insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, metadata)
  values (p_case, v_role, 'stage_set', 'Αλλαγή σταδίου από Back Office: ' || c.current_stage || ' → ' || p_stage, v_reason, auth.uid(),
          jsonb_build_object('from', c.current_stage, 'to', p_stage));
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('case', p_case, 'stage_set', jsonb_build_object('actor_id', auth.uid(), 'from', c.current_stage, 'to', p_stage, 'reason', v_reason));
end;
$$;
revoke all on function public.set_case_stage(uuid, text, text) from public, anon;
grant execute on function public.set_case_stage(uuid, text, text) to authenticated;
