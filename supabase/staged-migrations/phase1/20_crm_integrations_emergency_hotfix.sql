-- Phase 1/20 — EMERGENCY HOTFIX: public.crm_integrations (production finding, 30 Oct 2026). NOT applied anywhere yet.
-- Live state before this file (read-only audit): RLS on; permissive policy "authenticated can manage integrations"
-- (roles = public, USING true, WITH CHECK true); anon holds SELECT/INSERT/UPDATE/DELETE and column access to `config`
-- (which can hold integration tokens); authenticated holds full table privileges.
-- Result after this file: only an ACTIVE `admin` can read or write the table through the API; anon and every other
-- role (field_sales, inside_sales, manager, back_office, inactive accounts) are denied; service_role (Edge Functions,
-- cron) is unchanged. It is self-contained: depends only on public.is_role(text) and public.is_staff(), which exist
-- on production. It does not touch any other table. It supersedes the crm_integrations part of phase1/01, 17 and 18, which
-- stay in the rollout and remain compatible (their restrictive policies AND with the admin-only permissive policy).
-- Idempotent. There is deliberately NO rollback that re-opens the table; to loosen access, write a new reviewed policy.
do $$
begin
  if to_regclass('public.crm_integrations') is null then
    return;
  end if;

  alter table public.crm_integrations enable row level security;

  -- 1. Remove every permissive policy this table is known to have had.
  drop policy if exists "authenticated can manage integrations" on public.crm_integrations;
  drop policy if exists "staff manage crm_integrations" on public.crm_integrations;
  drop policy if exists "admin manage crm_integrations" on public.crm_integrations;

  -- 2. Privileges: nothing for anon/public; the API role keeps only what the admin UI needs, RLS decides who.
  revoke all on table public.crm_integrations from public, anon, authenticated;
  grant select, insert, update, delete on table public.crm_integrations to authenticated;
  grant all on table public.crm_integrations to service_role;

  -- 3. The only permissive policy: an active admin.
  create policy "admin manage crm_integrations" on public.crm_integrations for all to authenticated
    using (public.is_role('admin') and public.is_staff())
    with check (public.is_role('admin') and public.is_staff());

  -- 4. Defense in depth: anon is denied even if a permissive policy for public is ever re-added by accident.
  drop policy if exists "phase1/20 anon denied" on public.crm_integrations;
  create policy "phase1/20 anon denied" on public.crm_integrations as restrictive for all to anon
    using (false) with check (false);
end $$;
