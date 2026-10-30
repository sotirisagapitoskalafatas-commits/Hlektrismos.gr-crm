-- Phase 6/22 — public.crm_integrations_status stops running with view-owner rights (Supabase advisor: SECURITY DEFINER view).
-- phase1/01 created the view with owner rights so every staff member could list integration names/connected state without the
-- `config` column. Owner rights bypass RLS on crm_integrations, which is what the advisor flags. NOTHING in src/ or in any Edge
-- Function reads this view (the admin screen reads crm_integrations, which is admin-only), so no replacement API is added.
-- Change: the view becomes security_invoker and therefore follows the RLS of crm_integrations (active admin only). It still
-- selects only id, name, connected, updated_at and never `config`. Everyone else sees zero rows. No function is created.
-- Position: after phase6/21 (step 26). Depends on phase1/01 (the view and the admin-only policy). Idempotent.
-- Rollback: docs/ops/rollback_phase6_22_crm_integrations_status_invoker.sql — it deliberately KEEPS security_invoker = true.
do $$
begin
  if to_regclass('public.crm_integrations_status') is not null then
    alter view public.crm_integrations_status set (security_invoker = true);
  end if;
end $$;
