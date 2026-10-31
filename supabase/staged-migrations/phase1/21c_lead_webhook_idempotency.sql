-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 1 / 21c: atomic intake for receive-lead-webhook. Senders retry, and two deliveries of one event can arrive at the same moment on two function
-- instances, so a read followed by an insert can create two leads. Here the check, the lead, the event row and the audit row are one transaction under
-- a lock on the event, so exactly one delivery creates the lead. If anything fails the transaction rolls back and the sender's retry starts clean.
-- MUST be applied BEFORE the receive-lead-webhook that calls ingest_webhook_lead is deployed: without it that function answers 500 and stores nothing.
-- Only service_role may call it. Idempotent. Rollback: docs/ops/rollback_phase1_21c_lead_webhook_idempotency.sql
create table if not exists public.lead_webhook_events (
  source     text not null,
  event_key  text not null, -- "event:<the sender's id>", or "contact:<hash>" when the sender supplies no id
  lead_id    uuid references public.leads (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (source, event_key)
);
alter table public.lead_webhook_events enable row level security;
revoke all on table public.lead_webhook_events from public, anon, authenticated;
grant select, insert, update on table public.lead_webhook_events to service_role;

-- With a sender's event id a repeat is recognised for as long as the row exists. Without one, the same contact from the same source inside ten minutes
-- counts as a repeat, which is the best available signal and cannot tell a retry from a genuine second submission.
create or replace function public.ingest_webhook_lead(p_source text, p_event_id text, p_contact_hash text, p_lead jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_key text;
  v_lead uuid;
  v_seen timestamptz;
begin
  if p_source is null or length(p_source) = 0 or length(p_source) > 120 or jsonb_typeof(p_lead) is distinct from 'object'
     or (p_event_id is null and p_contact_hash is null) or length(p_event_id) > 200 or length(p_contact_hash) > 100 then
    raise exception 'invalid webhook lead arguments';
  end if;
  v_key := case when p_event_id is not null then 'event:' || p_event_id else 'contact:' || p_contact_hash end;
  perform pg_advisory_xact_lock(hashtextextended('lead-webhook|' || p_source || '|' || v_key, 0));

  select lead_id, created_at into v_lead, v_seen from public.lead_webhook_events where source = p_source and event_key = v_key;
  if found and (p_event_id is not null or v_seen > now() - interval '10 minutes') then
    return jsonb_build_object('lead_id', v_lead, 'duplicate', true);
  end if;

  insert into public.leads (full_name, first_name, last_name, client_name, client_contact, email, phone, region, company, lead_type, source, source_label,
                            campaign_name, campaign_id, status, comments, age_confirmed, gdpr_consent, consent_granted_at, consent_source)
  select x.full_name, x.first_name, x.last_name, x.client_name, x.client_contact, x.email, x.phone, x.region, x.company, x.lead_type, x.source, x.source_label,
         x.campaign_name, x.campaign_id, x.status, x.comments, x.age_confirmed, x.gdpr_consent, x.consent_granted_at, x.consent_source
  from jsonb_to_record(p_lead) as x(full_name text, first_name text, last_name text, client_name text, client_contact text, email text, phone text, region text,
                                    company text, lead_type text, source text, source_label text, campaign_name text, campaign_id text, status text, comments text,
                                    age_confirmed boolean, gdpr_consent boolean, consent_granted_at timestamptz, consent_source text)
  returning id into v_lead;

  insert into public.lead_webhook_events (source, event_key, lead_id) values (p_source, v_key, v_lead)
  on conflict (source, event_key) do update set lead_id = excluded.lead_id, created_at = now();

  insert into public.activity_log (entity_type, entity_id, action, details)
  values ('lead', v_lead, 'created', jsonb_build_object('via', 'webhook', 'source', p_lead ->> 'source_label'));

  return jsonb_build_object('lead_id', v_lead, 'duplicate', false);
end;
$$;
revoke all on function public.ingest_webhook_lead(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_webhook_lead(text, text, text, jsonb) to service_role;
