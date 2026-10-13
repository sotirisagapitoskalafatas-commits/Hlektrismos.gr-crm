-- AUDIT HARDENING (2026-10-13) — NOT YET APPLIED. Review, test on a staging copy, then apply.
-- Rollback: see the "ROLLBACK" block at the bottom (re-creates the previous permissive policies).
-- Scope: only objects whose permissive policies were confirmed in migration source and never
-- replaced by a later migration. Idempotent and safe to re-run.

-- 1) crm_emails — customer correspondence was readable by the anonymous role (the public anon key
--    ships in every browser bundle) and writable by any signed-in user.
do $$ begin
  if to_regclass('public.crm_emails') is not null then
    drop policy if exists "crm_emails_select_anon" on public.crm_emails;
    drop policy if exists "crm_emails_select" on public.crm_emails;
    drop policy if exists "crm_emails_insert" on public.crm_emails;
    drop policy if exists "crm_emails_update" on public.crm_emails;
    drop policy if exists "crm_emails_delete" on public.crm_emails;
    drop policy if exists "staff read crm_emails" on public.crm_emails;
    drop policy if exists "staff write crm_emails" on public.crm_emails;
    create policy "staff read crm_emails" on public.crm_emails for select to authenticated using (public.is_staff());
    create policy "staff write crm_emails" on public.crm_emails for all to authenticated
      using (public.is_staff()) with check (public.is_staff());
  end if;
end $$;

-- 2) crm_integrations — was `FOR ALL TO public USING (true)`: anonymous read AND write of integration config.
do $$ begin
  if to_regclass('public.crm_integrations') is not null then
    drop policy if exists "authenticated can manage integrations" on public.crm_integrations;
    drop policy if exists "staff manage crm_integrations" on public.crm_integrations;
    create policy "staff manage crm_integrations" on public.crm_integrations for all to authenticated
      using (public.is_staff()) with check (public.is_staff());
  end if;
end $$;

-- 3) Defense in depth: the anonymous role never needs to read, change or delete these tables
--    (public form submissions go through insert_website_lead / the `chat` edge function).
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
--   create policy "crm_emails_select_anon" on public.crm_emails for select to anon using (true);
--   create policy "authenticated can manage integrations" on public.crm_integrations for all to public using (true) with check (true);
--   grant select on public.campaigns, public.campaign_sends, public.voice_calls, public.contact_consent to anon;
