-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 4 / 19: a deactivated or non-staff account can no longer use the legacy tables (security audit F-08).
--
-- Finding: ~30 older tables (campaigns, calendar, chat, voice calls, lead notes, tasks, …) are protected only by
-- `auth.role() = 'authenticated'` or `to public using (true)`-style policies, so a user whose profile was DEACTIVATED
-- (or any authenticated account without an active profile) keeps full access with a still-valid session.
--
-- Fix, additive: one RESTRICTIVE policy per table, «authenticated may only act if public.is_staff()» (an active
-- profile). It is AND-ed with the existing policies, so it only removes access from non-staff; active staff see
-- exactly what they saw before. Nothing is dropped, renamed or rewritten. The anonymous role is not touched here
-- (phase1/01 and phase1/17 handle it); service_role bypasses RLS and is unaffected.
-- Idempotent; tables that do not exist are skipped. Rollback: docs/ops/rollback_phase4_19_staff_only_legacy_tables.sql

do $$
declare t text;
begin
  foreach t in array array[
    'agent_conversations','agent_memory','agent_reports','ai_agents','calendar_events','chat_messages','chat_threads',
    'crm_documents','crm_email_labels','crm_email_settings','doc_templates','entity_documents','hlektrismos_leads',
    'lead_sources','market_tariffs','notification_log','powerfor_leads','supply_points',
    'agent_provider_commissions','agent_sessions','campaign_sends','campaigns','contact_consent','crm_tasks',
    'customer_meters','dnc_article11_blacklist','hlektrismos_provider_docs','lead_notes','sales_agents',
    'tariff_audit_log','voice_calls'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'staff only (restrictive)', t);
      execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.is_staff()) with check (public.is_staff())',
        'staff only (restrictive)', t);
    end if;
  end loop;
end $$;
