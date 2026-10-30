-- Phase 6/22 — public.crm_integrations_status stops running with view-owner rights (Supabase advisor: SECURITY DEFINER view).
-- Context: phase1/01 created the view with owner rights so every active staff member could see integration names and
-- connected state without the `config` column (which may hold tokens). Owner rights bypass RLS on crm_integrations, which is
-- what the advisor flags. Nothing in src/ reads this view (the admin screen reads crm_integrations, admin-only).
-- Change:
--   1. The view becomes security_invoker, so it follows RLS of crm_integrations (admin only). It never exposes `config`.
--   2. The same safe columns for every active staff member are served by a SECURITY DEFINER *function* that checks
--      is_staff() itself, pins search_path and is not executable by anon/public. A function is explicit, reviewable and
--      does not create a second, implicit bypass of table RLS.
-- Idempotent. Rollback: docs/ops/rollback_phase6_22_crm_integrations_status_invoker.sql
do $$
begin
  if to_regclass('public.crm_integrations_status') is not null then
    alter view public.crm_integrations_status set (security_invoker = true);
  end if;
end $$;

create or replace function public.crm_integrations_status_for_staff()
returns table (id text, name text, connected boolean, updated_at timestamptz)
language sql stable security definer set search_path = pg_catalog, public, pg_temp
as $$
  select i.id, i.name, i.connected, i.updated_at
  from public.crm_integrations i
  where public.is_staff();
$$;
revoke all on function public.crm_integrations_status_for_staff() from public, anon;
grant execute on function public.crm_integrations_status_for_staff() to authenticated;
