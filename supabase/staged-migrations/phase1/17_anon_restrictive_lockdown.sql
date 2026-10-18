-- STAGED — NOT APPLIED. Apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 1 / 17 — closes what phase1/01 leaves open for the ANONYMOUS role (docs/ops/SECURITY_AUDIT.md F-02, F-06).
-- ADDITIVE: no policy is dropped and no grant is revoked. A RESTRICTIVE policy is AND-ed with every existing policy, so adding
-- «anon: never» to a table cannot widen anything and cannot change what signed-in staff can do. Idempotent.
--
-- Why: these legacy tables still carry permissive policies from the first dashboard migrations that apply to the role `public`
-- (= anon AND signed-in) with `using (true)`: «Allow all on agent_provider_commissions», «Allow all on customer_agent_attribution»,
-- `customer_documents`, `sales_agents`, `customer_commissions_ledger`, `crm_users`, `crm_tasks`, `crm_integrations`, `crm_emails`.
-- With the public anon key (shipped in every browser bundle) anyone could read — and for the `all` ones write — commissions, agent
-- attribution, customer document records and staff directory rows. phase1/01 revokes anon privileges on part of this list; this
-- file is the belt and braces for ALL of them, and covers two tables phase1/01 does not name (agent_provider_commissions,
-- customer_agent_attribution) plus supply_points / customer_meters / entity_documents.
-- Not touched on purpose: hlektrismos_leads (the website form inserts there as anon, consent = true), the tariff tables (public data),
-- and every table that has no anon-capable policy.
--
-- Also: create_crm_user() is SECURITY DEFINER without `set search_path` (F-06). It is already restricted to the service role by
-- migration 20261001000000; pinning the search_path closes the remaining hijack route. This is a setting on the function, not a drop.
-- Rollback: docs/ops/rollback_phase1_17_anon_restrictive_lockdown.sql.

do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_provider_commissions', 'customer_agent_attribution', 'customer_commissions_ledger', 'customer_documents', 'sales_agents',
    'supply_points', 'customer_meters', 'entity_documents', 'crm_users', 'crm_tasks', 'crm_integrations', 'crm_emails'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'anon never (restrictive)', t);
      execute format('create policy %I on public.%I as restrictive for all to anon using (false) with check (false)', 'anon never (restrictive)', t);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public.create_crm_user(text,text,text,text,text)') is not null then
    execute 'alter function public.create_crm_user(text,text,text,text,text) set search_path = public';
  end if;
end $$;
