-- STAGED (Phase 4 / 12) — NOT APPLIED. Additive only.
-- Default Back Office assignee: a SETTING that points to a user (never a hardcoded name).
-- When a lead is created with documents, the app calls route_lead_to_backoffice(): the lead is assigned to that
-- person, who is notified, and it appears in their «Διεκπεραίωση» queue. If no assignee is set (or the user is no longer
-- an active Back Office member), nothing is changed and the app says so.
--
-- Stored in crm_settings('default_backoffice_assignee') as a JSON string with the user id. Not a credential.

create or replace function public.default_backoffice_assignee()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_id uuid; v_name text;
begin
  if not public.is_staff() then raise exception 'backoffice assignee: not allowed' using errcode = '42501'; end if;
  select nullif(setting_value #>> '{}', '')::uuid into v_id from public.crm_settings where setting_key = 'default_backoffice_assignee';
  if v_id is null then return null; end if;
  select p.full_name into v_name from public.profiles p where p.id = v_id and p.role in ('admin', 'back_office') and coalesce(p.is_active, true);
  if v_name is null then return null; end if;   -- deactivated or role changed: treat as not set
  return jsonb_build_object('id', v_id, 'full_name', v_name);
end;
$$;

create or replace function public.set_default_backoffice_assignee(p_user uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_old text;
begin
  if not public.is_role('admin') then raise exception 'backoffice assignee: not allowed' using errcode = '42501'; end if;
  if p_user is not null and not exists (select 1 from public.profiles p where p.id = p_user and p.role in ('admin', 'back_office') and coalesce(p.is_active, true)) then
    raise exception 'backoffice assignee: must be an active Admin / Back Office user' using errcode = '22023';
  end if;
  select setting_value #>> '{}' into v_old from public.crm_settings where setting_key = 'default_backoffice_assignee';
  if exists (select 1 from public.crm_settings where setting_key = 'default_backoffice_assignee') then
    update public.crm_settings set setting_value = to_jsonb(coalesce(p_user::text, '')) where setting_key = 'default_backoffice_assignee';
  else
    insert into public.crm_settings (setting_key, setting_value, category, description)
    values ('default_backoffice_assignee', to_jsonb(coalesce(p_user::text, '')), 'workflow', 'Υπεύθυνος Back Office για νέα leads με έγγραφα');
  end if;
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('settings', null, 'default_backoffice_assignee', jsonb_build_object('from', nullif(v_old, ''), 'to', p_user, 'by', auth.uid()));
  return true;
end;
$$;

-- Assigns a lead to the default Back Office assignee and notifies them. Any active staff member (the creator).
-- The originating creator stays in created_by_user_id. Returns the assignee {id, full_name} or null when none is set.
create or replace function public.route_lead_to_backoffice(p_lead uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare a jsonb; v_name text;
begin
  if not public.is_staff() then raise exception 'route lead: not allowed' using errcode = '42501'; end if;
  a := public.default_backoffice_assignee();
  if a is null then return null; end if;
  update public.leads set assigned_to_user_id = (a->>'id')::uuid where id = p_lead returning coalesce(full_name, client_name) into v_name;
  if not found then raise exception 'route lead: lead not found' using errcode = 'P0002'; end if;
  insert into public.app_notifications (user_id, title, body, type, link)
  values ((a->>'id')::uuid, 'Νέο lead με έγγραφα', coalesce(v_name, ''), 'lead', p_lead::text);
  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('lead', p_lead, 'routed_to_backoffice', jsonb_build_object('to', a->>'id', 'by', auth.uid()));
  return a;
end;
$$;

revoke all on function public.default_backoffice_assignee() from public, anon;
revoke all on function public.set_default_backoffice_assignee(uuid) from public, anon;
revoke all on function public.route_lead_to_backoffice(uuid) from public, anon;
grant execute on function public.default_backoffice_assignee() to authenticated;
grant execute on function public.set_default_backoffice_assignee(uuid) to authenticated;
grant execute on function public.route_lead_to_backoffice(uuid) to authenticated;

-- ROLLBACK: drop the three functions; delete from crm_settings where setting_key = 'default_backoffice_assignee';
