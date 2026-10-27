-- STAGED ONLY: apply on STAGING first; production only with the owner's approval, a backup and a change window.
-- Phase 4 / 21: Stage 2A, completing Sales Agent record isolation. Apply AFTER phase4/18 (APPLY_ORDER step 22b).
--
-- phase4/18 limits the two sales roles (inside_sales, field_sales) to their own leads, cases, customers,
-- follow-ups, case documents, timeline, visits, supply points and activity. This file closes what it leaves open:
--   A. Customer data in tables phase4/18 does not cover:
--        case_offers, case_signatures (own case); consent_records (own customer, or created by me);
--        field_checkins (mine, or own case); business_events (mine, or about my lead/case/customer);
--        work_items (assigned to / created by me); contact_consents, contact_objections, outreach_decisions
--        (own lead or own customer).
--      Legacy tables keyed to the legacy hlektrismos_leads / hlektrismos_customers (ownership cannot be resolved
--      for the CRM's sales roles) become Back Office only for the sales roles:
--        lead_notes, voice_calls, crm_emails, crm_documents, crm_tasks, calendar_events, campaign_sends,
--        contact_consent, customer_documents, customer_meters, customer_agent_attribution,
--        customer_commissions_ledger, entity_documents, supply_points, hlektrismos_leads, hlektrismos_customers.
--      None of them is read by the live app; Edge Functions use the service role and are unaffected.
--   B. Protected fields. A Sales Agent cannot reassign records or rewrite ownership:
--        leads: assigned_to_user_id, created_by_user_id
--        cases: owner_id, inside_sales_owner, field_sales_owner, back_office_owner, next_action_owner_id,
--               created_by, customer_id, lead_id
--        customers: created_by
--      On INSERT a sales agent may only name themselves (or nobody) in those fields.
--   C. Document verification is a Back Office action (roles.ts: sales lack 'verify_document'). A Sales Agent cannot
--      change case_documents.status / verified_by / verified_at, nor insert a document as verified. For every
--      browser user, verified_by and verified_at are set BY THE DATABASE (auth.uid(), now()), never taken
--      from the request.
--   D. Files. Sales Agents can open only their own files and can upload only into their own lead folder:
--        hlektrismos_docs: leads/<own lead id>/..., or contact-forms/... attached to one of their own leads
--                          (leads.attached_files) or filed on one of their own cases (case_documents.file_url)
--        client_documents: objects filed on one of their own cases (case_documents.file_url = object name).
--                          Upload stays allowed (the app names case uploads cases/<timestamp>_<file>, which
--                          carries no case id).
--        energy-bills (legacy): none for the sales roles.
--
-- RESTRICTIVE policies only: they are AND-ed with the existing permissive ones, so they can only take access away
-- from the two sales roles. Admin, manager and back_office are unchanged. The guards act only on direct browser
-- writes (current_user = 'authenticated'); SECURITY DEFINER flows (conversion, Back Office routing, trash, returns)
-- run as the owner and keep working. Idempotent; skips tables and columns that do not exist.
-- Rollback: docs/ops/rollback_phase4_21_sales_isolation_completion.sql

-- ───────────── A. restrictive row policies ─────────────
do $$
declare
  spec record;
  expr text;
  has_col boolean;
  pol constant text := 'sales own records (restrictive)';
begin
  for spec in
    select * from (values
      ('case_offers',     'public.sales_owns_case(case_id)'),
      ('case_signatures', 'public.sales_owns_case(case_id)'),
      ('consent_records', '(created_by = auth.uid() or public.sales_owns_customer(customer_id))'),
      ('field_checkins',  '(user_id = auth.uid() or (case_id is not null and public.sales_owns_case(case_id)))'),
      ('business_events', '(agent_id = auth.uid() or (entity_id is not null and public.sales_owns_entity(entity_type, entity_id)))'),
      ('work_items',      '(assignee_id = auth.uid() or created_by = auth.uid())'),
      ('contact_consents',   '((lead_id is not null and public.sales_owns_lead(lead_id)) or (customer_id is not null and public.sales_owns_customer(customer_id)))'),
      ('contact_objections', '((lead_id is not null and public.sales_owns_lead(lead_id)) or (customer_id is not null and public.sales_owns_customer(customer_id)))'),
      ('outreach_decisions', '(lead_id is not null and public.sales_owns_lead(lead_id))'),
      ('lead_notes', 'false'), ('voice_calls', 'false'), ('crm_emails', 'false'), ('crm_documents', 'false'),
      ('crm_tasks', 'false'), ('calendar_events', 'false'), ('campaign_sends', 'false'), ('contact_consent', 'false'),
      ('customer_documents', 'false'), ('customer_meters', 'false'), ('customer_agent_attribution', 'false'),
      ('customer_commissions_ledger', 'false'), ('entity_documents', 'false'), ('supply_points', 'false'),
      ('hlektrismos_leads', 'false'), ('hlektrismos_customers', 'false')
    ) as v(tbl, expr)
  loop
    if to_regclass('public.' || spec.tbl) is null then continue; end if;
    expr := spec.expr;
    -- business_events.entity_type is optional in older schemas: fall back to "mine" only.
    if spec.tbl = 'business_events' then
      select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'business_events' and column_name = 'entity_type') into has_col;
      if not has_col then expr := '(agent_id = auth.uid())'; end if;
    end if;
    execute format('alter table public.%I enable row level security', spec.tbl);
    execute format('drop policy if exists %I on public.%I', pol, spec.tbl);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (not public.is_sales_agent() or %s) with check (not public.is_sales_agent() or %s)',
      pol, spec.tbl, expr, expr);
  end loop;
end $$;

-- ───────────── B. protected ownership fields ─────────────
-- TG_ARGV[0]: comma-separated columns a Sales Agent may never change on UPDATE.
-- TG_ARGV[1]: comma-separated columns that, on INSERT by a Sales Agent, must be NULL or the agent themself.
create or replace function public.sales_protected_fields_guard()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
declare
  col text;
  o jsonb;
  n jsonb := to_jsonb(new);
begin
  -- Only direct browser writes by an active Sales Agent. SECURITY DEFINER flows run as the owner.
  if current_user <> 'authenticated' or not public.is_sales_agent() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    foreach col in array string_to_array(tg_argv[0], ',') loop
      if n ? col and (o -> col) is distinct from (n -> col) then
        raise exception 'Only Back Office can change % on %', col, tg_table_name using errcode = '42501';
      end if;
    end loop;
  else
    foreach col in array string_to_array(tg_argv[1], ',') loop
      if n ? col and (n ->> col) is not null and (n ->> col) <> auth.uid()::text then
        raise exception 'A Sales Agent can only name themselves in %.%', tg_table_name, col using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.sales_protected_fields_guard() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.leads') is not null then
    drop trigger if exists sales_protected_fields_guard on public.leads;
    create trigger sales_protected_fields_guard before insert or update on public.leads for each row
      execute function public.sales_protected_fields_guard('assigned_to_user_id,created_by_user_id', 'assigned_to_user_id,created_by_user_id');
  end if;
  if to_regclass('public.cases') is not null then
    drop trigger if exists sales_protected_fields_guard on public.cases;
    create trigger sales_protected_fields_guard before insert or update on public.cases for each row
      execute function public.sales_protected_fields_guard(
        'owner_id,inside_sales_owner,field_sales_owner,back_office_owner,next_action_owner_id,created_by,customer_id,lead_id',
        'owner_id,inside_sales_owner,field_sales_owner,created_by');
  end if;
  if to_regclass('public.customers') is not null then
    drop trigger if exists sales_protected_fields_guard on public.customers;
    create trigger sales_protected_fields_guard before insert or update on public.customers for each row
      execute function public.sales_protected_fields_guard('created_by', 'created_by');
  end if;
end $$;

-- ───────────── C. document verification is set by the database ─────────────
create or replace function public.case_documents_verification_guard()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' then
    return new; -- service role and SECURITY DEFINER flows (e.g. return for correction) keep their own logic
  end if;
  if tg_op = 'INSERT' then
    if public.is_sales_agent() and (new.status = 'verified' or new.verified_by is not null or new.verified_at is not null) then
      raise exception 'Only Back Office can verify documents' using errcode = '42501';
    end if;
    if new.status = 'verified' then
      new.verified_by := auth.uid();
      new.verified_at := now();
    else
      new.verified_by := null;
      new.verified_at := null;
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at then
    if public.is_sales_agent() then
      raise exception 'Only Back Office can change a document''s verification' using errcode = '42501';
    end if;
    -- Never trust the request: the reviewer is the signed-in user.
    new.verified_by := auth.uid();
    new.verified_at := case when new.status = 'verified' then now() else null end;
  end if;
  return new;
end;
$$;
revoke all on function public.case_documents_verification_guard() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.case_documents') is not null then
    drop trigger if exists case_documents_verification_guard on public.case_documents;
    create trigger case_documents_verification_guard before insert or update on public.case_documents for each row
      execute function public.case_documents_verification_guard();
  end if;
end $$;

-- ───────────── D. files ─────────────
-- SECURITY DEFINER so the ownership lookups read leads/case_documents without recursing through RLS.
create or replace function public.sales_can_read_object(p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  id_text text := parts[2];
begin
  if p_bucket = 'hlektrismos_docs' then
    if parts[1] = 'leads' and id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return public.sales_owns_lead(id_text::uuid);
    end if;
    if parts[1] = 'contact-forms' then
      return exists (select 1 from public.leads l
                     where l.attached_files @> jsonb_build_array(jsonb_build_object('path', p_name)) and public.sales_owns_lead(l.id))
          or exists (select 1 from public.case_documents d
                     where d.file_url = 'hlektrismos_docs/' || p_name and public.sales_owns_case(d.case_id)); -- lib/lead-files leadFileRef()
    end if;
    return false;
  end if;
  if p_bucket = 'client_documents' then
    return exists (select 1 from public.case_documents d where d.file_url = p_name and public.sales_owns_case(d.case_id));
  end if;
  return p_bucket not in ('energy-bills');
end;
$$;

create or replace function public.sales_can_write_object(p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if p_bucket = 'hlektrismos_docs' then
    return parts[1] = 'leads' and parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and public.sales_owns_lead(parts[2]::uuid);
  end if;
  if p_bucket = 'client_documents' then
    return parts[1] = 'cases'; -- case uploads carry no case id; reading them back is limited above
  end if;
  return p_bucket not in ('energy-bills');
end;
$$;
-- Both run inside the storage policies below, so signed-in users need EXECUTE (phase1/19 grants nothing implicitly).
revoke all on function public.sales_can_read_object(text, text) from public, anon;
revoke all on function public.sales_can_write_object(text, text) from public, anon;
grant execute on function public.sales_can_read_object(text, text) to authenticated, service_role;
grant execute on function public.sales_can_write_object(text, text) to authenticated, service_role;

drop policy if exists "sales own files read (restrictive)" on storage.objects;
create policy "sales own files read (restrictive)" on storage.objects as restrictive
  for select to authenticated
  using (not public.is_sales_agent() or public.sales_can_read_object(bucket_id, name));
drop policy if exists "sales own files change (restrictive)" on storage.objects;
create policy "sales own files change (restrictive)" on storage.objects as restrictive
  for update to authenticated
  using (not public.is_sales_agent() or public.sales_can_read_object(bucket_id, name))
  with check (not public.is_sales_agent() or public.sales_can_write_object(bucket_id, name));
drop policy if exists "sales own files delete (restrictive)" on storage.objects;
create policy "sales own files delete (restrictive)" on storage.objects as restrictive
  for delete to authenticated
  using (not public.is_sales_agent() or public.sales_can_read_object(bucket_id, name));
drop policy if exists "sales own files upload (restrictive)" on storage.objects;
create policy "sales own files upload (restrictive)" on storage.objects as restrictive
  for insert to authenticated
  with check (not public.is_sales_agent() or public.sales_can_write_object(bucket_id, name));

-- ───────────── E. ID-taking SECURITY DEFINER RPCs ─────────────
-- These run as the owner, so RLS does not stop a Sales Agent passing ANOTHER agent's id. Verified locally:
-- convert_lead_to_case(B's lead), route_lead_to_backoffice(B's lead) and set_case_exception(B's case) succeeded,
-- and case_document_blockers / field_sales_metrics returned B's data.
-- Pattern (Supabase guidance): the original function moves UNCHANGED into the non-exposed `private` schema; a
-- SECURITY INVOKER wrapper with the same name and signature stays in `public`. The wrapper checks ownership only
-- for direct API calls by a Sales Agent (current_user = 'authenticated'); calls from the service role or from
-- other SECURITY DEFINER functions pass through. Re-running a later migration that CREATE OR REPLACEs one of
-- these in public would replace the wrapper: re-apply this file afterwards (runbook).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function public.sales_assert_can_act(p_kind text, p_id uuid)
returns void language plpgsql stable set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' or p_id is null or not public.is_sales_agent() then
    return;
  end if;
  if (p_kind = 'lead' and public.sales_owns_lead(p_id))
     or (p_kind = 'case' and public.sales_owns_case(p_id))
     or (p_kind = 'self' and p_id = auth.uid()) then
    return;
  end if;
  raise exception 'Not your % (Sales Agents can act only on their own records)', p_kind using errcode = '42501';
end;
$$;
revoke all on function public.sales_assert_can_act(text, uuid) from public, anon;
grant execute on function public.sales_assert_can_act(text, uuid) to authenticated, service_role;

-- Move each original (still SECURITY DEFINER, body unchanged) to private, once. A second run finds it already there.
do $$
declare
  sig text;
begin
  foreach sig in array array['convert_lead_to_case(uuid)', 'route_lead_to_backoffice(uuid)', 'set_case_exception(uuid,text,text)',
                             'case_document_blockers(uuid,text)', 'field_sales_metrics(uuid,integer)'] loop
    if to_regprocedure('private.' || sig) is null and to_regprocedure('public.' || sig) is not null
       and (select prosecdef from pg_proc where oid = to_regprocedure('public.' || sig)) then
      execute format('alter function public.%s set schema private', sig);
    end if;
    if to_regprocedure('private.' || sig) is not null then
      execute format('revoke all on function private.%s from public, anon', sig);
      execute format('grant execute on function private.%s to authenticated, service_role', sig);
    end if;
  end loop;
end $$;

-- Wrappers (SECURITY INVOKER): same names, arguments and results as the originals.
do $$
begin
  if to_regprocedure('private.convert_lead_to_case(uuid)') is not null then
    create or replace function public.convert_lead_to_case(p_lead_id uuid)
    returns uuid language plpgsql security invoker set search_path = public, pg_temp
    as $f$ begin perform public.sales_assert_can_act('lead', p_lead_id); return private.convert_lead_to_case(p_lead_id); end; $f$;
    grant execute on function public.convert_lead_to_case(uuid) to authenticated, service_role;
  end if;
  if to_regprocedure('private.route_lead_to_backoffice(uuid)') is not null then
    create or replace function public.route_lead_to_backoffice(p_lead uuid)
    returns jsonb language plpgsql security invoker set search_path = public, pg_temp
    as $f$ begin perform public.sales_assert_can_act('lead', p_lead); return private.route_lead_to_backoffice(p_lead); end; $f$;
    grant execute on function public.route_lead_to_backoffice(uuid) to authenticated, service_role;
  end if;
  if to_regprocedure('private.set_case_exception(uuid,text,text)') is not null then
    create or replace function public.set_case_exception(p_case uuid, p_state text, p_note text default null)
    returns boolean language plpgsql security invoker set search_path = public, pg_temp
    as $f$ begin perform public.sales_assert_can_act('case', p_case); return private.set_case_exception(p_case, p_state, p_note); end; $f$;
    grant execute on function public.set_case_exception(uuid, text, text) to authenticated, service_role;
  end if;
  if to_regprocedure('private.case_document_blockers(uuid,text)') is not null then
    create or replace function public.case_document_blockers(p_case uuid, p_stage text)
    returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp
    as $f$ begin perform public.sales_assert_can_act('case', p_case); return private.case_document_blockers(p_case, p_stage); end; $f$;
    grant execute on function public.case_document_blockers(uuid, text) to authenticated, service_role;
  end if;
  if to_regprocedure('private.field_sales_metrics(uuid,integer)') is not null then
    -- NULL means "me" in the original; only another user's id needs the check.
    create or replace function public.field_sales_metrics(p_user_id uuid default null, p_days integer default 30)
    returns jsonb language plpgsql security invoker set search_path = public, pg_temp
    as $f$ begin perform public.sales_assert_can_act('self', p_user_id); return private.field_sales_metrics(p_user_id, p_days); end; $f$;
    grant execute on function public.field_sales_metrics(uuid, integer) to authenticated, service_role;
  end if;
end $$;
