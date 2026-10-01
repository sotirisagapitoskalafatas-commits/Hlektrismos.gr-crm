-- Security: close the self-service path into customer data.
--
-- Before this migration:
--   * handle_new_user() gave EVERY new auth user a profile with role
--     'inside_sales', and is_staff() only checked that a profile exists, so
--     anyone able to call supabase.auth.signUp() with the public anon key
--     could read customers, cases, documents and signatures.
--   * create_crm_user() is SECURITY DEFINER, granted to every authenticated
--     user, and lets the caller pick any role, including 'admin'.
--
-- Also turn OFF "Allow new users to sign up" in Supabase Auth settings. This
-- migration is the server-side backstop if that switch is ever re-enabled.

-- 1) New auth users start INACTIVE. An admin activates staff explicitly:
--      update public.profiles set is_active = true, role = '<role>' where id = '<uuid>';
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    'inside_sales',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2) Only ACTIVE profiles count as staff. Existing profiles keep
--    is_active = true (column default), so current staff are unaffected.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and coalesce(p.is_active, true)
  );
$function$;

-- 3) create_crm_user(): only the service role (Supabase dashboard / server)
--    may create users. It had no admin check at all.
revoke execute on function public.create_crm_user(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_crm_user(text, text, text, text, text) to service_role;
