-- Create a CRM user: inserts into auth.users + crm_users in one call
-- Usage: SELECT create_crm_user('full_name', 'role', 'phone', 'email', 'password')
CREATE OR REPLACE FUNCTION create_crm_user(
  p_full_name text,
  p_role text,
  p_phone text,
  p_email text,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id uuid;
  result json;
BEGIN
  -- Insert into auth.users via service role (this function runs as SECURITY DEFINER)
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    encode(gen_random_bytes(32), 'hex'),
    encode(gen_random_bytes(32), 'hex')
  )
  RETURNING id INTO new_user_id;

  -- Insert into crm_users with the FK reference
  INSERT INTO crm_users (id, role, full_name, phone, is_active, max_leads)
  VALUES (new_user_id, p_role::crm_role, p_full_name, p_phone, true, 50);

  result := json_build_object(
    'id', new_user_id,
    'email', p_email,
    'full_name', p_full_name,
    'role', p_role
  );

  RETURN result;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION create_crm_user(text, text, text, text, text) TO authenticated;
