-- ATLAS CRM — case Trash + bulk case actions.
-- Additive migration. Cases are hidden from normal queries after trash; only the admin Trash RPC can reveal them.
-- Customers, leads, supply points and energy applications are never deleted by this migration.
-- Permanent deletion removes only case-owned rows and files under client_documents/cases/.

alter table public.cases add column if not exists deleted_at timestamptz;
alter table public.cases add column if not exists deleted_by uuid references public.profiles(id);
alter table public.cases add column if not exists deleted_reason text;
create index if not exists cases_trashed_idx on public.cases (deleted_at) where deleted_at is not null;

-- Hide trashed cases from EVERY ordinary query, including Admin queries. SECURITY DEFINER Trash RPCs remain able to list/manage them.
drop policy if exists "trashed cases hidden" on public.cases;
create policy "trashed cases hidden" on public.cases as restrictive for select to authenticated
  using (deleted_at is null);

-- The legacy permissive "admin delete cases" policy must not allow bypassing Trash.
-- SECURITY DEFINER purge_record remains the only permanent-delete path.
drop policy if exists "cases delete only through trash" on public.cases;
create policy "cases delete only through trash" on public.cases as restrictive for delete to authenticated
  using (false);

create or replace function public.case_trash_columns_guard()
returns trigger language plpgsql set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.deleted_at is not null or new.deleted_by is not null or new.deleted_reason is not null then
        raise exception 'trash: use Διαγραφή / Επαναφορά' using errcode = '42501';
      end if;
    elsif new.deleted_at is distinct from old.deleted_at
       or new.deleted_by is distinct from old.deleted_by
       or new.deleted_reason is distinct from old.deleted_reason then
      raise exception 'trash: use Διαγραφή / Επαναφορά' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$;
drop trigger if exists cases_trash_guard on public.cases;
create trigger cases_trash_guard before insert or update on public.cases
for each row execute function public.case_trash_columns_guard();

-- References that must survive the case. Case-owned timeline, offers, documents, signatures, visits,
-- follow-ups, notifications and check-ins are removed in the purge transaction below.
create or replace function public.case_trash_references(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_leads integer := 0;
  v_apps integer := 0;
  v_visits integer := 0;
  v_followups integer := 0;
  v_checkins integer := 0;
  v_signatures integer := 0;
  v_out jsonb := '{}'::jsonb;
begin
  select count(*) into v_leads from public.leads where converted_case_id = p_id;
  select count(*) into v_apps from public.energy_applications where primary_case_id = p_id;
  select count(*) into v_visits
    from public.case_visits newer
    join public.case_visits older on older.id = newer.rescheduled_from_id
    where older.case_id = p_id and newer.case_id is distinct from p_id;
  -- Never remove a visit that is still used by a different case or standalone activity.
  select count(*) into v_followups
    from public.follow_ups f
    join public.case_visits v on v.id = f.visit_id
    where v.case_id = p_id and f.case_id is distinct from p_id;
  select count(*) into v_checkins
    from public.field_checkins fc
    join public.case_visits v on v.id = fc.visit_id
    where v.case_id = p_id and fc.case_id is distinct from p_id;
  select count(*) into v_signatures
    from public.case_signatures sig
    join public.case_documents doc on doc.id = sig.document_id
    where doc.case_id = p_id and sig.case_id is distinct from p_id;

  if v_leads > 0 then v_out := v_out || jsonb_build_object('converted_leads', v_leads); end if;
  if v_apps > 0 then v_out := v_out || jsonb_build_object('energy_applications', v_apps); end if;
  if v_visits > 0 then v_out := v_out || jsonb_build_object('rescheduled_visits', v_visits); end if;
  if v_followups > 0 then v_out := v_out || jsonb_build_object('follow_ups', v_followups); end if;
  if v_checkins > 0 then v_out := v_out || jsonb_build_object('field_checkins', v_checkins); end if;
  if v_signatures > 0 then v_out := v_out || jsonb_build_object('other_case_signatures', v_signatures); end if;
  return v_out;
end;
$$;
revoke all on function public.case_trash_references(uuid) from public, anon, authenticated;

-- Extend the existing generic Trash operation. Leads/customers retain their existing rules.
create or replace function public.trash_record(p_type text, p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare v_role text := public.trash_actor_role(); v_open integer; v_done integer;
begin
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'trash: not allowed' using errcode = '42501';
  end if;

  if p_type = 'lead' then
    update public.leads set deleted_at = now(), deleted_by = auth.uid(),
      deleted_reason = nullif(btrim(coalesce(p_reason, '')), '')
      where id = p_id and deleted_at is null;
  elsif p_type = 'customer' then
    select count(*) into v_open from public.cases
      where customer_id = p_id and current_stage not in ('completed', 'lost', 'cancelled');
    if v_open > 0 then
      raise exception 'trash: customer has % open case(s)', v_open using errcode = 'P0001', hint = 'open_cases';
    end if;
    update public.customers set deleted_at = now(), deleted_by = auth.uid(),
      deleted_reason = nullif(btrim(coalesce(p_reason, '')), '')
      where id = p_id and deleted_at is null;
  elsif p_type = 'case' then
    if v_role is distinct from 'admin' then
      raise exception 'trash: only an administrator can move cases to the trash' using errcode = '42501';
    end if;
    update public.cases set deleted_at = now(), deleted_by = auth.uid(),
      deleted_reason = nullif(btrim(coalesce(p_reason, '')), '')
      where id = p_id and deleted_at is null;
  else
    raise exception 'trash: invalid type' using errcode = '22023';
  end if;

  get diagnostics v_done = row_count;
  if v_done = 0 then raise exception 'trash: not found or already in trash' using errcode = 'P0002'; end if;
  insert into public.activity_log (entity_type, entity_id, action, details)
    values (p_type, p_id, 'trashed', jsonb_build_object('actor_id', auth.uid(),
      'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

-- One transaction for the whole visible selection: either every selected case is moved to Trash, or none are.
create or replace function public.trash_cases_bulk(p_case_ids uuid[], p_reason text default null)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_role text := public.trash_actor_role();
  v_ids uuid[];
  v_requested integer;
  v_done integer;
begin
  if v_role is distinct from 'admin' then
    raise exception 'trash: only an administrator can move cases to the trash' using errcode = '42501';
  end if;
  if p_case_ids is null or cardinality(p_case_ids) < 1 or cardinality(p_case_ids) > 250 then
    raise exception 'trash: select between 1 and 250 cases' using errcode = '22023';
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_case_ids) x;
  v_requested := cardinality(v_ids);
  if exists (select 1 from public.cases c where c.id = any(v_ids) and c.deleted_at is not null) then
    raise exception 'trash: one or more cases are already in the trash' using errcode = 'P0002';
  end if;
  update public.cases set deleted_at = now(), deleted_by = auth.uid(),
    deleted_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = any(v_ids) and deleted_at is null;
  get diagnostics v_done = row_count;
  if v_done <> v_requested then
    raise exception 'trash: one or more selected cases were not found' using errcode = 'P0002';
  end if;

  insert into public.activity_log (entity_type, entity_id, action, details)
    select 'case', x, 'trashed', jsonb_build_object('actor_id', auth.uid(),
      'reason', nullif(btrim(coalesce(p_reason, '')), ''))
    from unnest(v_ids) x;
  return v_done;
end;
$$;

create or replace function public.restore_record(p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_role text := public.trash_actor_role(); v_done integer;
begin
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'restore: not allowed' using errcode = '42501';
  end if;
  if p_type = 'lead' then
    update public.leads set deleted_at = null, deleted_by = null, deleted_reason = null
      where id = p_id and deleted_at is not null;
  elsif p_type = 'customer' then
    update public.customers set deleted_at = null, deleted_by = null, deleted_reason = null
      where id = p_id and deleted_at is not null;
  elsif p_type = 'case' then
    if v_role is distinct from 'admin' then
      raise exception 'restore: only an administrator can restore cases' using errcode = '42501';
    end if;
    update public.cases set deleted_at = null, deleted_by = null, deleted_reason = null
      where id = p_id and deleted_at is not null;
  else
    raise exception 'restore: invalid type' using errcode = '22023';
  end if;
  get diagnostics v_done = row_count;
  if v_done = 0 then raise exception 'restore: not in trash' using errcode = 'P0002'; end if;
  insert into public.activity_log (entity_type, entity_id, action, details)
    values (p_type, p_id, 'restored', jsonb_build_object('actor_id', auth.uid()));
end;
$$;

-- Permanent deletion: only an Admin, only from Trash. The customer, lead, supply point and energy application are never deleted.
-- The file list contains only files stored under the case-owned client_documents/cases/ prefix; website lead attachments
-- in hlektrismos_docs/contact-forms/ are deliberately retained because they may still belong to the preserved lead.
create or replace function public.purge_record(p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_role text := public.trash_actor_role();
  v_refs jsonb;
  v_files jsonb := '[]'::jsonb;
  v_done integer;
begin
  if v_role is distinct from 'admin' then
    raise exception 'purge: only an administrator can delete permanently' using errcode = '42501';
  end if;
  if p_type not in ('lead', 'customer', 'case') then
    raise exception 'purge: invalid type' using errcode = '22023';
  end if;

  if p_type = 'case' then
    if not exists (select 1 from public.cases where id = p_id and deleted_at is not null) then
      raise exception 'purge: move the record to the trash first' using errcode = 'P0002';
    end if;
    v_refs := public.case_trash_references(p_id);
    if v_refs <> '{}'::jsonb then
      raise exception 'purge: referenced by %', v_refs::text using errcode = 'P0001', hint = 'has_references';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('bucket', 'client_documents', 'path', path)), '[]'::jsonb)
      into v_files
      from (
        select distinct raw_path as path
        from (
          select case
            when d.file_url like 'client_documents/cases/%' then substring(d.file_url from length('client_documents/') + 1)
            when d.file_url like 'cases/%' then d.file_url
            when d.file_url like 'https://%' and position('/client_documents/cases/' in d.file_url) > 0
              then substring(d.file_url from position('/client_documents/cases/' in d.file_url) + length('/client_documents/'))
            else null
          end as raw_path
          from public.case_documents d where d.case_id = p_id
          union all
          select case
            when s.image_url like 'client_documents/cases/%' then substring(s.image_url from length('client_documents/') + 1)
            when s.image_url like 'cases/%' then s.image_url
            when s.image_url like 'https://%' and position('/client_documents/cases/' in s.image_url) > 0
              then substring(s.image_url from position('/client_documents/cases/' in s.image_url) + length('/client_documents/'))
            else null
          end
          from public.case_signatures s where s.case_id = p_id
        ) candidates
      ) owned_files
      where path like 'cases/%';

    -- Child order follows the live foreign keys: follow-ups/signatures before visits/documents.
    -- A cross-case / standalone follow-up that references one of these visits was checked above.
    -- Delete only follow-ups owned by this case; never delete another case's work item.
    delete from public.follow_ups where case_id = p_id;
    delete from public.case_signatures where case_id = p_id;
    delete from public.case_offers where case_id = p_id;
    delete from public.case_documents where case_id = p_id;
    delete from public.app_notifications where case_id = p_id;
    delete from public.timeline_events where case_id = p_id;
    delete from public.case_visits where case_id = p_id;
    delete from public.cases where id = p_id and deleted_at is not null;
    get diagnostics v_done = row_count;
    if v_done <> 1 then raise exception 'purge: case was not deleted' using errcode = 'P0002'; end if;

    insert into public.activity_log (entity_type, entity_id, action, details)
      values ('case', p_id, 'purged', jsonb_build_object('actor_id', auth.uid(),
        'files', jsonb_array_length(coalesce(v_files, '[]'::jsonb))));
    return jsonb_build_object('deleted', true, 'files', coalesce(v_files, '[]'::jsonb));
  end if;

  if p_type = 'lead' and not exists (select 1 from public.leads where id = p_id and deleted_at is not null)
     or p_type = 'customer' and not exists (select 1 from public.customers where id = p_id and deleted_at is not null) then
    raise exception 'purge: move the record to the trash first' using errcode = 'P0002';
  end if;
  v_refs := public.trash_references(p_type, p_id);
  if v_refs <> '{}'::jsonb then
    raise exception 'purge: referenced by %', v_refs::text using errcode = 'P0001', hint = 'has_references';
  end if;
  if p_type = 'lead' then
    select coalesce((select jsonb_agg(f ->> 'path') from jsonb_array_elements(
      case when jsonb_typeof(attached_files) = 'array' then attached_files else '[]'::jsonb end
    ) f where f ? 'path'), '[]'::jsonb)
      into v_files from public.leads where id = p_id;
    delete from public.leads where id = p_id;
  else
    delete from public.customers where id = p_id;
  end if;
  get diagnostics v_done = row_count;
  insert into public.activity_log (entity_type, entity_id, action, details)
    values (p_type, p_id, 'purged', jsonb_build_object('actor_id', auth.uid(),
      'files', jsonb_array_length(coalesce(v_files, '[]'::jsonb))));
  return jsonb_build_object('deleted', v_done = 1, 'files', coalesce(v_files, '[]'::jsonb));
end;
$$;

create or replace function public.trash_list()
returns table (entity_type text, id uuid, name text, phone text, email text, deleted_at timestamptz,
  deleted_by_name text, deleted_reason text, references_json jsonb)
language plpgsql stable security definer set search_path = public
as $$
declare v_role text := public.trash_actor_role();
begin
  if v_role is null or v_role not in ('admin', 'manager') then
    raise exception 'trash_list: not allowed' using errcode = '42501';
  end if;
  return query
    select 'lead'::text, l.id, coalesce(nullif(l.full_name, ''), l.client_name), l.phone, l.email, l.deleted_at,
      (select p.full_name from public.profiles p where p.id = l.deleted_by), l.deleted_reason,
      public.trash_references('lead', l.id)
    from public.leads l where l.deleted_at is not null
    union all
    select 'customer'::text, c.id, c.full_name, c.phone, c.email, c.deleted_at,
      (select p.full_name from public.profiles p where p.id = c.deleted_by), c.deleted_reason,
      public.trash_references('customer', c.id)
    from public.customers c where c.deleted_at is not null
    union all
    select 'case'::text, ca.id, coalesce(nullif(cu.full_name, ''), ca.title),
      cu.phone, cu.email, ca.deleted_at,
      (select p.full_name from public.profiles p where p.id = ca.deleted_by), ca.deleted_reason,
      public.case_trash_references(ca.id)
    from public.cases ca left join public.customers cu on cu.id = ca.customer_id
    where ca.deleted_at is not null
    order by 6 desc;
end;
$$;

revoke all on function public.trash_record(text, uuid, text) from public, anon;
revoke all on function public.trash_cases_bulk(uuid[], text) from public, anon;
revoke all on function public.restore_record(text, uuid) from public, anon;
revoke all on function public.purge_record(text, uuid) from public, anon;
revoke all on function public.trash_list() from public, anon;
grant execute on function public.trash_record(text, uuid, text) to authenticated;
grant execute on function public.trash_cases_bulk(uuid[], text) to authenticated;
grant execute on function public.restore_record(text, uuid) to authenticated;
grant execute on function public.purge_record(text, uuid) to authenticated;
grant execute on function public.trash_list() to authenticated;

-- Case documents and signatures in this prefix are deleted only by the Admin purge operation.
drop policy if exists "admin deletes case files" on storage.objects;
create policy "admin deletes case files" on storage.objects for delete to authenticated
  using (bucket_id = 'client_documents' and name like 'cases/%' and public.is_role('admin'));
