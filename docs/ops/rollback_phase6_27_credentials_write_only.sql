-- Rollback of phase6/27: the Admin can read and write every crm_settings row again (the state phase2/05 left), and the three functions are removed.
-- No setting value is changed. Audit rows already written stay.
drop function if exists public.crm_set_role_permissions(jsonb);
drop function if exists public.crm_set_credential(text, text);
drop function if exists public.crm_credential_status();
drop policy if exists "crm_settings read" on public.crm_settings;
drop policy if exists "crm_settings admin write" on public.crm_settings;
create policy "crm_settings read" on public.crm_settings for select
  using (public.is_role('admin') or (public.is_role('manager') and not public.crm_setting_is_credential(setting_key)));
create policy "crm_settings admin write" on public.crm_settings for all
  using (public.is_role('admin')) with check (public.is_role('admin'));
