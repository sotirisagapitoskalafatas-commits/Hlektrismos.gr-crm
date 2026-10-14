-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 2 / 06: «Κάδος» (trash) for leads and customers.
--   * «Διαγραφή» = move to trash (admin, manager). Trashed rows are hidden from every other role by a RESTRICTIVE
--     row-level policy (enforced by the database, not by the UI).
--   * «Επαναφορά» (admin, manager) restores the row unchanged.
--   * «Οριστική διαγραφή» (admin only) only from the trash, and only when NOTHING references the record
--     (cases, consent records, …): no silent cascades, CRM history and consent evidence are never lost by accident.
--   * deleted_* columns can only be written through these functions (trigger), every action is in activity_log
--     with the actor; the purge audit keeps ids only (no personal data), so it does not undo an erasure.
-- Owner decision recorded 14/10/2026: trash + admin-only permanent delete for leads and customers.

alter table public.leads add column if not exists deleted_at timestamptz;
alter table public.leads add column if not exists deleted_by uuid;
alter table public.leads add column if not exists deleted_reason text;
alter table public.customers add column if not exists deleted_at timestamptz;
alter table public.customers add column if not exists deleted_by uuid;
alter table public.customers add column if not exists deleted_reason text;
create index if not exists leads_trashed_idx on public.leads (deleted_at) where deleted_at is not null;
create index if not exists customers_trashed_idx on public.customers (deleted_at) where deleted_at is not null;

-- ───── visibility: trashed rows only for admin / manager (AND-ed with the existing permissive policies) ─────
drop policy if exists "trashed leads hidden" on public.leads;
create policy "trashed leads hidden" on public.leads as restrictive for select to authenticated
  using (deleted_at is null or public.is_role('admin') or public.is_role('manager'));
drop policy if exists "trashed customers hidden" on public.customers;
create policy "trashed customers hidden" on public.customers as restrictive for select to authenticated
  using (deleted_at is null or public.is_role('admin') or public.is_role('manager'));

-- ───── the trash columns are written only by the functions below (they run as their owner) ─────
create or replace function public.trash_columns_guard()
returns trigger language plpgsql set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by
          or new.deleted_reason is distinct from old.deleted_reason) then
    raise exception 'trash: use «Διαγραφή» / «Επαναφορά»' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists leads_trash_guard on public.leads;
create trigger leads_trash_guard before update on public.leads for each row execute function public.trash_columns_guard();
drop trigger if exists customers_trash_guard on public.customers;
create trigger customers_trash_guard before update on public.customers for each row execute function public.trash_columns_guard();

create or replace function public.trash_actor_role()
returns text language sql stable security definer set search_path = public
as $$ select p.role from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true) $$;
revoke all on function public.trash_actor_role() from public, anon, authenticated;

-- Rows in other public tables that point at this lead/customer (single-column FKs), per table.
create or replace function public.trash_references(p_type text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare r record; c integer; out jsonb := '{}'::jsonb;
begin
  for r in
    select cl.relname as tbl, att.attname as col
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and array_length(con.conkey, 1) = 1 and ns.nspname = 'public'
      and con.confrelid = (case p_type when 'lead' then 'public.leads' else 'public.customers' end)::regclass
  loop
    execute format('select count(*) from public.%I where %I = $1', r.tbl, r.col) into c using p_id;
    if c > 0 then out := out || jsonb_build_object(r.tbl, coalesce((out ->> r.tbl)::int, 0) + c); end if;
  end loop;
  return out;
end;
$$;
revoke all on function public.trash_references(text, uuid) from public, anon, authenticated;

create or replace function public.trash_record(p_type text, p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare v_role text := public.trash_actor_role(); v_open integer; v_done integer;
begin
  if v_role is null or v_role not in ('admin', 'manager') then raise exception 'trash: not allowed' using errcode = '42501'; end if;
  if p_type = 'lead' then
    update public.leads set deleted_at = now(), deleted_by = auth.uid(), deleted_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = p_id and deleted_at is null;
  elsif p_type = 'customer' then
    select count(*) into v_open from public.cases where customer_id = p_id and current_stage not in ('completed', 'lost', 'cancelled');
    if v_open > 0 then
      raise exception 'trash: customer has % open case(s)', v_open using errcode = 'P0001', hint = 'open_cases';
    end if;
    update public.customers set deleted_at = now(), deleted_by = auth.uid(), deleted_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = p_id and deleted_at is null;
  else
    raise exception 'trash: invalid type' using errcode = '22023';
  end if;
  get diagnostics v_done = row_count;
  if v_done = 0 then raise exception 'trash: not found or already in trash' using errcode = 'P0002'; end if;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values (p_type, p_id, 'trashed', jsonb_build_object('actor_id', auth.uid(), 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

create or replace function public.restore_record(p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_role text := public.trash_actor_role(); v_done integer;
begin
  if v_role is null or v_role not in ('admin', 'manager') then raise exception 'restore: not allowed' using errcode = '42501'; end if;
  if p_type = 'lead' then
    update public.leads set deleted_at = null, deleted_by = null, deleted_reason = null where id = p_id and deleted_at is not null;
  elsif p_type = 'customer' then
    update public.customers set deleted_at = null, deleted_by = null, deleted_reason = null where id = p_id and deleted_at is not null;
  else
    raise exception 'restore: invalid type' using errcode = '22023';
  end if;
  get diagnostics v_done = row_count;
  if v_done = 0 then raise exception 'restore: not in trash' using errcode = 'P0002'; end if;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values (p_type, p_id, 'restored', jsonb_build_object('actor_id', auth.uid()));
end;
$$;

-- Permanent delete: admin only, only from the trash, only without references. Returns the lead's stored file paths
-- (website attachments) so the admin's browser can remove them from Storage (policy below).
create or replace function public.purge_record(p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_role text := public.trash_actor_role(); v_refs jsonb; v_files jsonb := '[]'::jsonb; v_done integer;
begin
  if v_role is distinct from 'admin' then raise exception 'purge: only an administrator can delete permanently' using errcode = '42501'; end if;
  if p_type not in ('lead', 'customer') then raise exception 'purge: invalid type' using errcode = '22023'; end if;
  if p_type = 'lead' and not exists (select 1 from public.leads where id = p_id and deleted_at is not null)
     or p_type = 'customer' and not exists (select 1 from public.customers where id = p_id and deleted_at is not null) then
    raise exception 'purge: move the record to the trash first' using errcode = 'P0002';
  end if;
  v_refs := public.trash_references(p_type, p_id);
  if v_refs <> '{}'::jsonb then
    raise exception 'purge: referenced by %', v_refs::text using errcode = 'P0001', hint = 'has_references';
  end if;
  if p_type = 'lead' then
    select coalesce((select jsonb_agg(f ->> 'path') from jsonb_array_elements(case when jsonb_typeof(attached_files) = 'array' then attached_files else '[]'::jsonb end) f where f ? 'path'), '[]'::jsonb)
      into v_files from public.leads where id = p_id;
    delete from public.leads where id = p_id;
  else
    delete from public.customers where id = p_id;
  end if;
  get diagnostics v_done = row_count;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values (p_type, p_id, 'purged', jsonb_build_object('actor_id', auth.uid(), 'files', jsonb_array_length(coalesce(v_files, '[]'::jsonb))));
  return jsonb_build_object('deleted', v_done = 1, 'files', coalesce(v_files, '[]'::jsonb));
end;
$$;

-- What is in the trash (admin / manager), newest first, with what still points at each record.
create or replace function public.trash_list()
returns table (entity_type text, id uuid, name text, phone text, email text, deleted_at timestamptz, deleted_by_name text,
               deleted_reason text, references_json jsonb)
language plpgsql stable security definer set search_path = public
as $$
declare v_role text := public.trash_actor_role();
begin
  if v_role is null or v_role not in ('admin', 'manager') then raise exception 'trash_list: not allowed' using errcode = '42501'; end if;
  return query
    select 'lead'::text, l.id, coalesce(nullif(l.full_name, ''), l.client_name), l.phone, l.email, l.deleted_at,
           (select p.full_name from public.profiles p where p.id = l.deleted_by), l.deleted_reason, public.trash_references('lead', l.id)
      from public.leads l where l.deleted_at is not null
    union all
    select 'customer'::text, c.id, c.full_name, c.phone, c.email, c.deleted_at,
           (select p.full_name from public.profiles p where p.id = c.deleted_by), c.deleted_reason, public.trash_references('customer', c.id)
      from public.customers c where c.deleted_at is not null
    order by 6 desc;
end;
$$;

revoke all on function public.trash_record(text, uuid, text) from public, anon;
revoke all on function public.restore_record(text, uuid) from public, anon;
revoke all on function public.purge_record(text, uuid) from public, anon;
revoke all on function public.trash_list() from public, anon;
grant execute on function public.trash_record(text, uuid, text) to authenticated;
grant execute on function public.restore_record(text, uuid) to authenticated;
grant execute on function public.purge_record(text, uuid) to authenticated;
grant execute on function public.trash_list() to authenticated;

-- Storage: an administrator may remove website attachments of a purged lead (bucket stays private).
drop policy if exists "admin deletes lead files" on storage.objects;
create policy "admin deletes lead files" on storage.objects for delete to authenticated
  using (bucket_id = 'hlektrismos_docs' and public.is_role('admin'));
