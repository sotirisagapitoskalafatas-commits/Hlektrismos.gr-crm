-- STAGED (Phase 4 / 13) — NOT APPLIED. Additive only.
-- Back Office exception states on a case, without moving or closing it:
--   offer_declined     — the customer declined the offer (may be revised)
--   no_response        — no answer from the customer
--   unsigned           — contract / application sent, not signed yet
--   provider_rejected  — the provider rejected the application
-- «Missing information» is NOT a new value: the existing «Επιστροφή για διόρθωση» (phase2/07) covers it.
-- Closing a case still uses the existing «Χάθηκε» / «Ακυρώθηκε» stages. Nothing blocks a stage change.

alter table public.cases
  add column if not exists exception_state text check (exception_state in ('offer_declined', 'no_response', 'unsigned', 'provider_rejected')),
  add column if not exists exception_note text,
  add column if not exists exception_at timestamptz,
  add column if not exists exception_by uuid;
create index if not exists cases_exception_idx on public.cases (exception_state) where exception_state is not null;

-- Set or clear (p_state null) the exception; audited on the timeline and in activity_log.
create or replace function public.set_case_exception(p_case uuid, p_state text, p_note text default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_role text; v_old text;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true);
  if v_role is null then raise exception 'case exception: not allowed' using errcode = '42501'; end if;
  if p_state is not null and p_state not in ('offer_declined', 'no_response', 'unsigned', 'provider_rejected') then
    raise exception 'case exception: invalid state' using errcode = '22023';
  end if;
  if p_state is not null and length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'case exception: a note is required' using errcode = '22023';
  end if;
  select exception_state into v_old from public.cases where id = p_case;
  if not found then raise exception 'case exception: case not found' using errcode = 'P0002'; end if;
  update public.cases
     set exception_state = p_state,
         exception_note = case when p_state is null then null else btrim(p_note) end,
         exception_at = case when p_state is null then null else now() end,
         exception_by = case when p_state is null then null else auth.uid() end
   where id = p_case;
  insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, metadata)
  values (p_case, v_role, 'status_change',
          case when p_state is null then 'Η εξαίρεση έκλεισε' else 'Εξαίρεση: ' || p_state end,
          coalesce(btrim(p_note), ''), auth.uid(), jsonb_build_object('exception_from', v_old, 'exception_to', p_state));
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('case', p_case, 'case_exception', jsonb_build_object('from', v_old, 'to', p_state, 'by', auth.uid()));
  return true;
end;
$$;
revoke all on function public.set_case_exception(uuid, text, text) from public, anon;
grant execute on function public.set_case_exception(uuid, text, text) to authenticated;

-- ROLLBACK: drop function public.set_case_exception(uuid, text, text);
--           alter table public.cases drop column exception_state, drop column exception_note, drop column exception_at, drop column exception_by;
