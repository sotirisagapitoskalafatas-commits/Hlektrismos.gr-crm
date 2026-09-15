-- =============================================================================
-- CRM OS — AI Policy & Consent RLS completion (M2b)
-- -----------------------------------------------------------------------------
-- M2 created tables with select/insert/update policies only. This follow-up
-- adds the DELETE policies the management UI needs (policy_rules, tools,
-- consent_records). Revoke of consent intentionally stays an UPDATE (audit
-- trail) rather than a hard DELETE.
-- =============================================================================

begin;

do $$
begin
  execute 'drop policy if exists "admin delete policy_rules" on public.policy_rules';
  execute 'create policy "admin delete policy_rules" on public.policy_rules for delete to authenticated using (public.is_role(''admin'') or public.is_role(''manager''))';

  execute 'drop policy if exists "admin delete tools" on public.tools';
  execute 'create policy "admin delete tools" on public.tools for delete to authenticated using (public.is_role(''admin''))';

  execute 'drop policy if exists "staff delete consent_records" on public.consent_records';
  execute 'create policy "staff delete consent_records" on public.consent_records for delete to authenticated using (public.is_role(''admin'') or public.is_role(''manager'') or public.is_role(''back_office''))';
end $$;

commit;