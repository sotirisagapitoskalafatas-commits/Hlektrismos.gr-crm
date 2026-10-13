-- PROPOSED (revision 2, 2026-10-14) — NOT APPLIED. Staging first; owner approval required for production.
-- Changes vs revision 1: crm_integrations is now ADMIN-ONLY (revision 1 allowed every active staff member);
-- non-admins get a safe status view with no config/secret column. crm_emails keeps staff-wide access ONLY as an
-- interim step: it must be scoped by lead ownership/team once the ownership model is agreed (Phase 1/2).
-- Idempotent. Verify with docs/audit/audit-rls-readonly.sql before and after.

-- 1) crm_emails: remove anonymous read and the "any authenticated user" policies.
do $$ begin
  if to_regclass('public.crm_emails') is not null then
    drop policy if exists "crm_emails_select_anon" on public.crm_emails;
    drop policy if exists "crm_emails_select" on public.crm_emails;
    drop policy if exists "crm_emails_insert" on public.crm_emails;
    drop policy if exists "crm_emails_update" on public.crm_emails;
    drop policy if exists "crm_emails_delete" on public.crm_emails;
    drop policy if exists "staff read crm_emails" on public.crm_emails;
    drop policy if exists "staff write crm_emails" on public.crm_emails;
    -- INTERIM: active staff. TODO(Phase 2): restrict to owner/team of the linked lead; admin/manager all.
    create policy "staff read crm_emails" on public.crm_emails for select to authenticated using (public.is_staff());
    create policy "staff write crm_emails" on public.crm_emails for all to authenticated
      using (public.is_staff()) with check (public.is_staff());
  end if;
end $$;

-- 2) crm_integrations: ADMIN ONLY (config jsonb may hold tokens).
do $$ begin
  if to_regclass('public.crm_integrations') is not null then
    drop policy if exists "authenticated can manage integrations" on public.crm_integrations;
    drop policy if exists "staff manage crm_integrations" on public.crm_integrations;
    drop policy if exists "admin manage crm_integrations" on public.crm_integrations;
    create policy "admin manage crm_integrations" on public.crm_integrations for all to authenticated
      using (public.is_role('admin')) with check (public.is_role('admin'));
  end if;
end $$;

-- Safe status for everyone else: no config column. The view runs with owner rights by design and exposes
-- only non-secret columns. CHECK FIRST that non-admin screens read this view, not the table, or they will show empty lists.
create or replace view public.crm_integrations_status as
  select id, name, connected, updated_at from public.crm_integrations;
revoke all on public.crm_integrations_status from anon, public;
grant select on public.crm_integrations_status to authenticated;

-- 3) Defense in depth: the anonymous role never needs read/update/delete on these tables
--    (public intake goes through insert_website_lead / the `chat` function).
do $$
declare t text;
begin
  foreach t in array array[
    'crm_emails','crm_integrations','crm_settings','crm_users','lead_notes','crm_tasks',
    'campaigns','campaign_sends','voice_calls','contact_consent','consent_records',
    'hlektrismos_leads','leads','customers','hlektrismos_customers','email_suppressions',
    'customer_documents','case_documents','sales_agents','customer_commissions_ledger'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke select, update, delete, truncate, references, trigger on public.%I from anon', t);
    end if;
  end loop;
end $$;

-- ROLLBACK (manual, only if a legitimate workflow breaks):
--   drop view if exists public.crm_integrations_status;
--   create policy "crm_emails_select_anon" on public.crm_emails for select to anon using (true);
--   create policy "authenticated can manage integrations" on public.crm_integrations for all to public using (true) with check (true);
--   grant select on public.campaigns, public.campaign_sends, public.voice_calls, public.contact_consent to anon;
