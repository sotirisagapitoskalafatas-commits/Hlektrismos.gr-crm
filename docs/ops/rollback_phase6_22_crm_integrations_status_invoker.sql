-- Rollback of phase6/22 (restores the owner-rights view; re-opens the advisor finding).
drop function if exists public.crm_integrations_status_for_staff();
do $$
begin
  if to_regclass('public.crm_integrations_status') is not null then
    alter view public.crm_integrations_status set (security_invoker = false);
  end if;
end $$;
