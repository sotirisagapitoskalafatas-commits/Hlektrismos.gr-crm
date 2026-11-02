-- Phase 7 / 04: move the untouched email wizard default away from blocked SMTP port 587.
-- Never overwrite a host, username or password already configured by the owner.
update public.crm_settings
set setting_value = jsonb_set(setting_value, '{smtp_port}', '465'::jsonb, true),
    updated_at = now()
where setting_key = 'email_config'
  and coalesce(setting_value->>'smtp_host', '') = ''
  and coalesce(setting_value->>'smtp_user', '') = ''
  and coalesce(setting_value->>'smtp_password', '') = ''
  and coalesce(setting_value->>'smtp_port', '587') = '587';
