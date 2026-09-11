-- Field sales RPCs are SECURITY DEFINER and gate callers via is_staff() in the
-- body, but least privilege means anonymous users should not have EXECUTE on
-- the public API schema. Staff call them through the `authenticated` role.
revoke execute on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) from anon, public;
revoke execute on function public.field_checkout(uuid, double precision, double precision, integer, text) from anon, public;

grant execute on function public.field_checkin(uuid, double precision, double precision, integer, integer, text) to authenticated;
grant execute on function public.field_checkout(uuid, double precision, double precision, integer, text) to authenticated;