-- STAGED (Phase 3 / 11) — NOT APPLIED. Apply on staging first, after phase3/09.
-- Keeps two things apart that must not be confused: a person ASKING us for something, and us PROMOTING something to them.
-- A row here is a recorded request ("the customer asked for a quote on 30/10, form 0042"), with evidence and an expiry. It is not marketing consent and it
-- never grants any: contact_consents stays the only source for promotional contact.
-- WHAT THIS FILE DOES NOT DECIDE: whether a quote sent in reply is outside the marketing rules, for how long a request stays valid, and on which channels.
-- Those are for the owner and counsel. Until they answer, the secret SERVICE_COMMS_APPROVED stays unset and these rows change nothing: every offer goes
-- through the full promotional gate.
-- Writes go only through the function below. Depends on phase3/09 (contact_role, contact_log).
-- Rollback at the end of this file.
create table if not exists public.contact_service_requests (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null,
  request_type  text not null check (request_type in ('quote', 'callback', 'service_follow_up')),
  channels      text[] not null check (cardinality(channels) > 0 and channels <@ array['email', 'sms', 'whatsapp', 'viber', 'voice', 'call']::text[]),
  evidence_ref  text not null check (length(btrim(evidence_ref)) >= 3),
  evidence_at   timestamptz not null,
  expires_at    timestamptz not null,
  recorded_by   uuid not null,
  created_at    timestamptz not null default now(),
  withdrawn_at  timestamptz,
  constraint service_request_expires_after_evidence check (expires_at > evidence_at)
);
create index if not exists contact_service_requests_lead_idx on public.contact_service_requests (lead_id) where withdrawn_at is null;
alter table public.contact_service_requests enable row level security;
revoke all on table public.contact_service_requests from public, anon, authenticated;
grant select on table public.contact_service_requests to authenticated;
grant select on table public.contact_service_requests to service_role;
drop policy if exists "admin reads service requests" on public.contact_service_requests;
create policy "admin reads service requests" on public.contact_service_requests for select to authenticated using (public.contact_role() = 'admin');

-- An active Admin, or the Sales Agent the lead is assigned to. Evidence is required; the expiry is capped so a request cannot become a standing permission.
create or replace function public.record_service_request(
  p_lead_id uuid, p_request_type text, p_channels text[], p_evidence_ref text, p_evidence_at timestamptz, p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.contact_role();
  v_id uuid;
begin
  if v_role is null or (v_role <> 'admin' and not exists (select 1 from public.hlektrismos_leads l where l.id = p_lead_id and l.assigned_to = auth.uid())) then
    raise exception 'record_service_request: not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_evidence_ref, ''))) < 3 or p_evidence_at is null or p_evidence_at > now() + interval '5 minutes' then
    raise exception 'record_service_request: evidence is required' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > p_evidence_at + interval '90 days' then
    raise exception 'record_service_request: invalid expiry' using errcode = '22023';
  end if;
  insert into public.contact_service_requests (lead_id, request_type, channels, evidence_ref, evidence_at, expires_at, recorded_by)
  values (p_lead_id, p_request_type, p_channels, btrim(p_evidence_ref), p_evidence_at, p_expires_at, auth.uid())
  returning id into v_id;
  perform public.contact_log('contact_service_request', p_lead_id, null, jsonb_build_object('type', p_request_type, 'channels', p_channels, 'evidence_ref', btrim(p_evidence_ref)));
  return v_id;
end $$;
revoke all on function public.record_service_request(uuid, text, text[], text, timestamptz, timestamptz) from public, anon;
grant execute on function public.record_service_request(uuid, text, text[], text, timestamptz, timestamptz) to authenticated;

-- ROLLBACK (drops the recorded requests: export them first):
--   drop function public.record_service_request(uuid, text, text[], text, timestamptz, timestamptz);
--   drop table public.contact_service_requests;
