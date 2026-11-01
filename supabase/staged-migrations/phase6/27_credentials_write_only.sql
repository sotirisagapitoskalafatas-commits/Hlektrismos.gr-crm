-- STAGED — NOT APPLIED. Apply once, as the project owner, in an approved window, with a fresh backup. Needs phase2/05 (crm_setting_is_credential) and phase6/25.
-- Phase 6 / 27: integration credentials become WRITE-ONLY for every browser session, the shared Admin included, and the permission model can only change
-- through a validating function.
--   Before: the Admin's session could SELECT every crm_settings row, so a stolen or shared Admin login (or a script run in the Admin's browser) could read the
--           Resend, Infobip, Twilio, Vapi, ElevenLabs and SerpApi keys; and `role_permissions`, which the Edge Function guard trusts, could be rewritten by any
--           direct table write.
--   After:  - the table policy lets an Admin read and write only NON-credential settings, and never write `role_permissions` directly;
--           - credentials are set through crm_set_credential(key, value), which returns nothing, and their presence is shown by crm_credential_status() (a yes/no
--             and a date, never the value);
--           - `role_permissions` is set through crm_set_role_permissions(json), which accepts only known capabilities for the Sales Agent type;
--           - every set is recorded in staff_admin_audit with the KEY NAME only.
--   Unchanged: Edge Functions read the values with the service role, which bypasses these policies. No existing value is changed or moved by this file.
-- A value is never in a URL, a log line or an error message from these functions.
-- Rollback: docs/ops/rollback_phase6_27_credentials_write_only.sql

do $$
begin
  if to_regprocedure('public.crm_setting_is_credential(text)') is null then raise exception 'phase6/27 needs phase2/05 first'; end if;
  if to_regclass('public.staff_admin_audit') is null then raise exception 'phase6/27 needs phase2/05 first (staff_admin_audit)'; end if;
end $$;

drop policy if exists "crm_settings read" on public.crm_settings;
drop policy if exists "crm_settings admin write" on public.crm_settings;
create policy "crm_settings read" on public.crm_settings for select
  using (public.is_role('admin') and public.is_staff() and not public.crm_setting_is_credential(setting_key));
create policy "crm_settings admin write" on public.crm_settings for all
  using (public.is_role('admin') and public.is_staff() and not public.crm_setting_is_credential(setting_key) and setting_key <> 'role_permissions')
  with check (public.is_role('admin') and public.is_staff() and not public.crm_setting_is_credential(setting_key) and setting_key <> 'role_permissions');

-- Which credentials are configured: yes or no and when, never the value.
create or replace function public.crm_credential_status()
returns table (setting_key text, configured boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not (public.is_role('admin') and public.is_staff()) then raise exception 'crm_credential_status: not allowed' using errcode = '42501'; end if;
  return query
    select s.setting_key, (s.setting_value is not null and s.setting_value not in ('""'::jsonb, '{}'::jsonb, 'null'::jsonb)), s.updated_at
    from public.crm_settings s
    where public.crm_setting_is_credential(s.setting_key)
    order by s.setting_key;
end;
$$;
revoke all on function public.crm_credential_status() from public, anon;
grant execute on function public.crm_credential_status() to authenticated, service_role;

-- Set (or clear, with an empty value) one credential. Returns nothing.
create or replace function public.crm_set_credential(p_key text, p_value text)
returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not (public.is_role('admin') and public.is_staff()) then raise exception 'crm_set_credential: not allowed' using errcode = '42501'; end if;
  if p_key is null or p_key !~ '^[A-Za-z0-9_]{3,80}$' then raise exception 'crm_set_credential: invalid key name' using errcode = '22023'; end if;
  if not public.crm_setting_is_credential(p_key) then raise exception 'crm_set_credential: not a credential setting' using errcode = '22023'; end if;
  if length(coalesce(p_value, '')) > 4000 then raise exception 'crm_set_credential: value too long' using errcode = '22023'; end if;
  insert into public.crm_settings (setting_key, setting_value, category, description)
  values (p_key, to_jsonb(coalesce(p_value, '')), 'credentials', null)
  on conflict (setting_key) do update set setting_value = excluded.setting_value, updated_at = now();
  insert into public.staff_admin_audit (actor_id, action, note) values (auth.uid(), 'credential_set', p_key || case when coalesce(p_value, '') = '' then ' (cleared)' else '' end);
end;
$$;
revoke all on function public.crm_set_credential(text, text) from public, anon;
grant execute on function public.crm_set_credential(text, text) to authenticated, service_role;

-- The permission overrides the Edge Function guard reads. Only known capabilities, only for the Sales Agent type (the Admin can never be restricted).
create or replace function public.crm_set_role_permissions(p_overrides jsonb)
returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_known text[] := array['crm.read.all','crm.read.team','crm.read.assigned','case.update.sales','case.update.operations','case.documents.verify','prospecting.search','prospecting.import',
    'campaign.draft','campaign.approve','campaign.send','communications.email.send','communications.sms.send','communications.voice.initiate','integrations.manage','users.manage_roles','audit.read','pii.export'];
  v_key text; v_cap text;
begin
  if not (public.is_role('admin') and public.is_staff()) then raise exception 'crm_set_role_permissions: not allowed' using errcode = '42501'; end if;
  if p_overrides is null or jsonb_typeof(p_overrides) <> 'object' then raise exception 'crm_set_role_permissions: an object is required' using errcode = '22023'; end if;
  for v_key in select jsonb_object_keys(p_overrides) loop
    if v_key <> 'sales_agent' then raise exception 'crm_set_role_permissions: only sales_agent can be configured' using errcode = '22023'; end if;
    if jsonb_typeof(p_overrides -> v_key) <> 'array' then raise exception 'crm_set_role_permissions: a list of capabilities is required' using errcode = '22023'; end if;
    for v_cap in select jsonb_array_elements_text(p_overrides -> v_key) loop
      if v_cap <> all (v_known) then raise exception 'crm_set_role_permissions: unknown capability' using errcode = '22023'; end if;
    end loop;
  end loop;
  insert into public.crm_settings (setting_key, setting_value, category, description)
  values ('role_permissions', p_overrides, 'permissions', null)
  on conflict (setting_key) do update set setting_value = excluded.setting_value, updated_at = now();
  insert into public.staff_admin_audit (actor_id, action, note, after) values (auth.uid(), 'role_permissions_set', 'role_permissions', p_overrides);
end;
$$;
revoke all on function public.crm_set_role_permissions(jsonb) from public, anon;
grant execute on function public.crm_set_role_permissions(jsonb) to authenticated, service_role;
