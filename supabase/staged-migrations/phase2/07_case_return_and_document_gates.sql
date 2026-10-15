-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 2 / 07: server-enforced case workflow.
--   A) Document gates — per stage, a setting: 'warn' (DEFAULT) or 'block'.
--      warn : missing / rejected / unverified documents are reported (checklist + stage dialog) but never stop a
--             stage change or a handover to Back Office (meeting decision, 15/10/2026).
--      block: the database REJECTS the stage change (trigger on cases.current_stage, so the UI cannot bypass it);
--             only an admin/manager can override, with a written reason, through change_case_stage_override.
--      Every gate ships as 'warn'. Switching a stage to 'block' (e.g. Καταχώρηση Παρόχου) is an owner decision,
--      made by an admin with set_stage_gate_mode (audited).
--   B) Allowed transitions — the same matrix as the app (src/lib/roles.ts STAGE_TRANSITIONS), enforced for direct
--      API writes. Overrides do not skip it.
--   C) «Επιστροφή για διόρθωση» — Back Office (and admin/manager) return a case in a Back Office stage to Inside or
--      Field Sales with a mandatory reason and at least one missing/incorrect item. The case keeps its id, customer and
--      stage; responsibility moves, the timeline and activity_log record it, and the responsible person is notified.
--      «Επανυποβολή» hands it back to Back Office.
-- Requirements mirror the app's indicative checklist (src/lib/documents.ts requiredDocs) and are stored in tables so the
-- business can correct them. NEEDS BUSINESS CONFIRMATION before production: the list per service and the gate levels
-- (document_check = received; submitted/activation/completed = verified).

-- ───────────────────────── A) requirement & gate tables ─────────────────────────
create table if not exists public.document_requirements (
  id serial primary key,
  service_type text,                    -- null = every service
  business_only boolean not null default false,
  any_of text[] not null,               -- satisfied by any one of these case_documents.category values
  legacy_any_of text[] not null default '{}',
  label text not null,
  required boolean not null default true,
  sort integer not null default 0
);
create table if not exists public.stage_document_gates (
  stage text primary key,
  min_status text not null check (min_status in ('received', 'verified')),
  enabled boolean not null default true,
  mode text not null default 'warn' check (mode in ('warn', 'block'))
);
alter table public.stage_document_gates add column if not exists mode text not null default 'warn';
alter table public.document_requirements enable row level security;
alter table public.stage_document_gates enable row level security;
drop policy if exists "staff read document requirements" on public.document_requirements;
create policy "staff read document requirements" on public.document_requirements for select to authenticated using (public.is_staff());
drop policy if exists "admin writes document requirements" on public.document_requirements;
create policy "admin writes document requirements" on public.document_requirements for all to authenticated using (public.is_role('admin')) with check (public.is_role('admin'));
drop policy if exists "staff read stage gates" on public.stage_document_gates;
create policy "staff read stage gates" on public.stage_document_gates for select to authenticated using (public.is_staff());
drop policy if exists "admin writes stage gates" on public.stage_document_gates;
create policy "admin writes stage gates" on public.stage_document_gates for all to authenticated using (public.is_role('admin')) with check (public.is_role('admin'));
grant select on public.document_requirements, public.stage_document_gates to authenticated;
grant insert, update, delete on public.document_requirements, public.stage_document_gates to authenticated;

insert into public.document_requirements (service_type, business_only, any_of, legacy_any_of, label, required, sort)
select * from (values
  (null::text, false, array['id_card'], array['identity'], 'Ταυτότητα ή διαβατήριο', true, 10),
  ('energy', false, array['bill_electricity'], array['bill'], 'Λογαριασμός ρεύματος', true, 20),
  ('energy', false, array['e9', 'lease', 'free_use'], array[]::text[], 'Αποδεικτικό χρήσης ακινήτου (Ε9, μισθωτήριο ή παραχώρηση)', true, 30),
  ('gas', false, array['bill_gas'], array['bill'], 'Λογαριασμός φυσικού αερίου', true, 20),
  ('gas', false, array['e9', 'lease', 'free_use'], array[]::text[], 'Αποδεικτικό χρήσης ακινήτου (Ε9, μισθωτήριο ή παραχώρηση)', true, 30),
  ('solar', false, array['bill_electricity'], array['bill'], 'Λογαριασμός ρεύματος', true, 20),
  ('solar', false, array['e9', 'property_title'], array[]::text[], 'Ε9 ή τίτλος ιδιοκτησίας', true, 30),
  ('solar', false, array['site_photos'], array[]::text[], 'Φωτογραφίες στέγης / χώρου', false, 40),
  ('ev', false, array['site_photos'], array[]::text[], 'Φωτογραφίες χώρου φορτιστή', false, 40),
  ('ev', false, array['e9', 'lease', 'free_use'], array[]::text[], 'Αποδεικτικό χρήσης ακινήτου', false, 30),
  (null, true, array['tax_start', 'business_registry'], array[]::text[], 'Έναρξη εργασιών ή βεβαίωση ΓΕΜΗ', true, 50),
  (null, true, array['legal_rep'], array[]::text[], 'Νομιμοποίηση εκπροσώπου (για νομικά πρόσωπα)', false, 60),
  (null, false, array['signed'], array[]::text[], 'Υπογεγραμμένη σύμβαση / αίτηση', true, 90)
) v
where not exists (select 1 from public.document_requirements);

insert into public.stage_document_gates (stage, min_status) values
  ('document_check', 'received'), ('submitted', 'verified'), ('activation', 'verified'), ('completed', 'verified')
on conflict (stage) do nothing;

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

-- What is missing for p_stage: [{label, status: missing|rejected|unverified, any_of, mode: warn|block}] (empty = nothing).
create or replace function public.case_document_blockers(p_case uuid, p_stage text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare c record; g text; gm text; r record; st text; out jsonb := '[]'::jsonb; biz boolean;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  select service_type, property_type, case_type into c from public.cases where id = p_case;
  if not found then return out; end if;
  select min_status, mode into g, gm from public.stage_document_gates where stage = p_stage and enabled;
  if g is null then return out; end if;
  biz := coalesce(c.property_type, '') in ('Κατάστημα', 'Γραφείο') or coalesce(c.case_type, '') ~* '(b2b|business|επιχειρ)';
  for r in
    select * from public.document_requirements d
    where d.required and (d.service_type is null or d.service_type = coalesce(c.service_type, 'energy')) and (not d.business_only or biz)
    order by d.sort, d.id
  loop
    select case when bool_or(x.status = 'verified') then 'verified'
                when bool_or(x.status <> 'rejected') then 'received'
                when count(*) > 0 then 'rejected' else 'missing' end
      into st
      from public.case_documents x
     where x.case_id = p_case and (x.category = any(r.any_of) or x.category = any(r.legacy_any_of));
    if st in ('missing', 'rejected') or (g = 'verified' and st <> 'verified') then
      out := out || jsonb_build_array(jsonb_build_object('label', r.label, 'status', case when st = 'received' then 'unverified' else st end, 'any_of', to_jsonb(r.any_of), 'mode', gm));
    end if;
  end loop;
  return out;
end;
$$;
revoke all on function public.case_document_blockers(uuid, text) from public, anon;
grant execute on function public.case_document_blockers(uuid, text) to authenticated, service_role;

-- ───────────────────────── B) the guard on every direct stage write ─────────────────────────
-- SECURITY INVOKER: current_user is 'authenticated' for browser writes, the owner inside the SECURITY DEFINER override.
create or replace function public.cases_stage_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare b jsonb;
begin
  if new.current_stage is distinct from old.current_stage and current_user in ('authenticated', 'anon') then
    if not exists (select 1 from public.case_stage_transitions t where t.from_stage = old.current_stage and t.to_stage = new.current_stage) then
      raise exception 'stage_transition_not_allowed: % -> %', old.current_stage, new.current_stage using errcode = 'P0001', hint = 'transition';
    end if;
    b := public.case_document_blockers(new.id, new.current_stage);
    -- Only a gate set to 'block' stops the change; 'warn' gates are shown in the app and never block.
    if jsonb_array_length(b) > 0 and exists (select 1 from public.stage_document_gates g where g.stage = new.current_stage and g.enabled and g.mode = 'block') then
      raise exception 'stage_blocked: required documents' using errcode = 'P0001', detail = b::text, hint = 'document_blockers';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists cases_stage_guard on public.cases;
create trigger cases_stage_guard before update of current_stage on public.cases for each row execute function public.cases_stage_guard();

-- Admin switches a stage's document gate between 'warn' and 'block' (audited). Default for every stage: 'warn'.
create or replace function public.set_stage_gate_mode(p_stage text, p_mode text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_old text;
begin
  if not public.is_role('admin') then raise exception 'gate mode: not allowed' using errcode = '42501'; end if;
  if coalesce(p_mode, '') not in ('warn', 'block') then raise exception 'gate mode: invalid mode' using errcode = '22023'; end if;
  select mode into v_old from public.stage_document_gates where stage = p_stage;
  if not found then raise exception 'gate mode: no document gate for this stage' using errcode = 'P0002'; end if;
  update public.stage_document_gates set mode = p_mode where stage = p_stage;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('settings', null, 'stage_gate_mode', jsonb_build_object('stage', p_stage, 'from', v_old, 'to', p_mode, 'by', auth.uid()));
  return true;
end;
$$;
revoke all on function public.set_stage_gate_mode(text, text) from public, anon;
grant execute on function public.set_stage_gate_mode(text, text) to authenticated;

-- Admin / manager override of DOCUMENT blockers only (the transition must still be allowed); reason required.
create or replace function public.change_case_stage_override(p_case uuid, p_stage text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; c public.cases%rowtype; b jsonb;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true);
  if v_role is null or v_role not in ('admin', 'manager') then raise exception 'override: not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'override: a reason of at least 10 characters is required' using errcode = '22023'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'override: case not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.case_stage_transitions t where t.from_stage = c.current_stage and t.to_stage = p_stage) then
    raise exception 'stage_transition_not_allowed: % -> %', c.current_stage, p_stage using errcode = 'P0001', hint = 'transition';
  end if;
  b := public.case_document_blockers(p_case, p_stage);
  update public.cases set current_stage = p_stage, updated_at = now() where id = p_case;
  insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, metadata)
  values (p_case, v_role, 'stage_override', 'Παράκαμψη ελέγχου εγγράφων: ' || c.current_stage || ' → ' || p_stage, btrim(p_reason), auth.uid(),
          jsonb_build_object('from', c.current_stage, 'to', p_stage, 'blockers', b));
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('case', p_case, 'stage_override', jsonb_build_object('actor_id', auth.uid(), 'from', c.current_stage, 'to', p_stage, 'reason', btrim(p_reason), 'blockers', b));
end;
$$;
revoke all on function public.change_case_stage_override(uuid, text, text) from public, anon;
grant execute on function public.change_case_stage_override(uuid, text, text) to authenticated;

-- ───────────────────────── C) return for correction ─────────────────────────
alter table public.cases add column if not exists returned_at timestamptz;
alter table public.cases add column if not exists returned_by uuid references public.profiles(id);
alter table public.cases add column if not exists return_reason text;
alter table public.cases add column if not exists return_items jsonb;
alter table public.cases add column if not exists return_to_team text check (return_to_team in ('inside_sales', 'field_sales'));
alter table public.cases add column if not exists return_from_stage text;

create or replace function public.cases_return_guard()
returns trigger language plpgsql set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.returned_at is distinct from old.returned_at or new.returned_by is distinct from old.returned_by
    or new.return_reason is distinct from old.return_reason or new.return_items is distinct from old.return_items
    or new.return_to_team is distinct from old.return_to_team or new.return_from_stage is distinct from old.return_from_stage) then
    raise exception 'return: use «Επιστροφή για διόρθωση» / «Επανυποβολή»' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists cases_return_guard on public.cases;
create trigger cases_return_guard before update on public.cases for each row execute function public.cases_return_guard();

create or replace function public.return_case_for_correction(p_case uuid, p_reason text, p_items jsonb, p_to_team text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; c public.cases%rowtype; v_to uuid; v_label text; v_items jsonb; v_reason text := btrim(coalesce(p_reason, ''));
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true);
  if v_role is null or v_role not in ('back_office', 'admin', 'manager') then raise exception 'return: not allowed' using errcode = '42501'; end if;
  if length(v_reason) < 10 then raise exception 'return: a reason of at least 10 characters is required' using errcode = '22023'; end if;
  v_items := (select coalesce(jsonb_agg(btrim(e)), '[]'::jsonb) from jsonb_array_elements_text(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) e where btrim(e) <> '');
  if jsonb_array_length(v_items) = 0 then raise exception 'return: at least one missing or incorrect item is required' using errcode = '22023'; end if;
  if p_to_team not in ('inside_sales', 'field_sales') then raise exception 'return: invalid team' using errcode = '22023'; end if;
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'return: case not found' using errcode = 'P0002'; end if;
  if c.current_stage not in ('application', 'document_check', 'submitted', 'activation') then
    raise exception 'return: only cases in a Back Office stage can be returned' using errcode = 'P0001';
  end if;
  if c.returned_at is not null then raise exception 'return: the case is already returned' using errcode = 'P0001'; end if;
  v_to := case p_to_team when 'inside_sales' then c.inside_sales_owner else c.field_sales_owner end;
  v_label := case p_to_team when 'inside_sales' then 'Inside Sales' else 'Field Sales' end;
  update public.cases
     set returned_at = now(), returned_by = auth.uid(), return_reason = v_reason, return_items = v_items,
         return_to_team = p_to_team, return_from_stage = c.current_stage,
         next_action_owner_id = v_to, next_action = left('Διόρθωση για Back Office: ' || v_reason, 240), updated_at = now()
   where id = p_case;
  insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, metadata)
  values (p_case, v_role, 'returned', 'Επιστροφή για διόρθωση → ' || v_label, v_reason, auth.uid(),
          jsonb_build_object('from_stage', c.current_stage, 'to_team', p_to_team, 'to_user', v_to, 'items', v_items));
  -- notify the responsible person; with nobody assigned, every active manager (to triage)
  insert into public.app_notifications (user_id, case_id, title, body, type)
  select u, p_case, 'Επιστροφή για διόρθωση', left(coalesce(nullif(c.title, ''), 'Case') || ': ' || v_reason, 300), 'returned'
  from (select v_to as u where v_to is not null
        union select p.id from public.profiles p where v_to is null and p.role = 'manager' and coalesce(p.is_active, true)) t;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('case', p_case, 'returned', jsonb_build_object('actor_id', auth.uid(), 'from_stage', c.current_stage, 'to_team', p_to_team, 'to_user', v_to, 'reason', v_reason, 'items', v_items));
  return jsonb_build_object('to_user', v_to, 'to_team', p_to_team);
end;
$$;
revoke all on function public.return_case_for_correction(uuid, text, jsonb, text) from public, anon;
grant execute on function public.return_case_for_correction(uuid, text, jsonb, text) to authenticated;

create or replace function public.resubmit_returned_case(p_case uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_role text; c public.cases%rowtype; v_to uuid;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true);
  select * into c from public.cases where id = p_case for update;
  if not found then raise exception 'resubmit: case not found' using errcode = 'P0002'; end if;
  if c.returned_at is null then raise exception 'resubmit: the case is not returned' using errcode = 'P0001'; end if;
  if v_role is null or not (v_role in ('admin', 'manager') or v_role = c.return_to_team or c.next_action_owner_id = auth.uid()) then
    raise exception 'resubmit: not allowed' using errcode = '42501';
  end if;
  v_to := coalesce(c.back_office_owner, c.returned_by);
  update public.cases
     set returned_at = null, returned_by = null, return_reason = null, return_items = null, return_to_team = null, return_from_stage = null,
         next_action_owner_id = v_to, next_action = 'Επανέλεγχος μετά τη διόρθωση', updated_at = now()
   where id = p_case;
  insert into public.timeline_events (case_id, role, activity_type, title, description, user_id, metadata)
  values (p_case, v_role, 'resubmitted', 'Επανυποβολή στο Back Office', coalesce(btrim(p_note), ''), auth.uid(),
          jsonb_build_object('previous_reason', c.return_reason, 'items', c.return_items));
  if v_to is not null then
    insert into public.app_notifications (user_id, case_id, title, body, type)
    values (v_to, p_case, 'Επανυποβολή μετά από διόρθωση', left(coalesce(nullif(c.title, ''), 'Case') || ': ' || coalesce(nullif(btrim(p_note), ''), 'έτοιμο για επανέλεγχο'), 300), 'resubmitted');
  end if;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('case', p_case, 'resubmitted', jsonb_build_object('actor_id', auth.uid(), 'to_user', v_to));
end;
$$;
revoke all on function public.resubmit_returned_case(uuid, text) from public, anon;
grant execute on function public.resubmit_returned_case(uuid, text) to authenticated;
