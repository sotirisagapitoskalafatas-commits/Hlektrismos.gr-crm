-- Email SMTP config row in crm_settings
INSERT INTO crm_settings (setting_key, setting_value, category, description)
VALUES (
  'email_config',
  jsonb_build_object(
    'smtp_host', '',
    'smtp_port', 587,
    'smtp_user', '',
    'smtp_password', '',
    'from_name', 'Hlektrismos.gr',
    'from_email', ''
  ),
  'email',
  'SMTP email configuration for sending emails from CRM'
)
ON CONFLICT (setting_key) DO NOTHING;
