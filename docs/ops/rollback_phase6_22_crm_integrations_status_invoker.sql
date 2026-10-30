-- Rollback of phase6/22 — intentionally a no-op that KEEPS the view security_invoker.
-- Going back to owner rights would reintroduce the SECURITY DEFINER view finding (RLS bypass on crm_integrations).
-- If the view itself must go (nothing in the app reads it), drop it explicitly: `drop view if exists public.crm_integrations_status;`
do $$
begin
  if to_regclass('public.crm_integrations_status') is not null then
    alter view public.crm_integrations_status set (security_invoker = true);
  end if;
end $$;
