-- STAGED (Phase 3 / 09) — NOT APPLIED. Apply on staging first, after phase1/01–04 and phase3/08. Read README.md.
--
-- Central contact-eligibility FACTS, keyed to the CONTACT POINT (normalised phone number or email address), so an
-- objection or a withdrawn consent follows the person across leads, customers, B2B prospects and the legacy table:
--   * contact_objections    — «δεν θέλω επικοινωνία» (marketing, or all contact), per channel or every channel;
--   * contact_consents      — per-channel opt-in with evidence; a grant is impossible without evidence;
--   * article11_screenings  — result of checking the Article 11 opt-out register (ν. 3471/2006) for a phone number.
-- The DECISION is the shared pure module supabase/functions/_shared/eligibility.ts: edge functions enforce it before any
-- send; the CRM shows the same result to the person about to call. Nothing in this file sends anything.
--
-- Writes go only through the SECURITY DEFINER functions below (no write policies). Anyone on staff can RECORD an
-- objection or a withdrawal (honouring a «no» must be easy); recording consent or a register screening needs
-- Admin and evidence; lifting an objection is Admin-only with a reason. Legacy manager / back_office profiles hold nothing here.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Normalisation (same rules as _shared/contact-keys.ts — keep them identical)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.contact_phone_key(p text)
returns text language sql immutable
as $$ select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '') $$;

-- The website form stores 'not-provided@hlektrismos.local' when no email was given: never a real contact point.
create or replace function public.contact_email_key(e text)
returns text language sql immutable
as $$ select case when position('@' in btrim(coalesce(e, ''))) > 1 and lower(btrim(e)) not like '%@hlektrismos.local'
                  then lower(btrim(e)) end $$;

create or replace function public.contact_role()
returns text language sql stable security definer set search_path = public
as $$ select p.role from public.profiles p where p.id = auth.uid() and p.is_active and p.role in ('admin', 'inside_sales', 'field_sales') $$; -- legacy roles hold nothing
revoke all on function public.contact_role() from public, anon;
grant execute on function public.contact_role() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.contact_objections (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null default gen_random_uuid(),  -- one «no» recorded on phone AND email shares a batch
  address_kind  text not null check (address_kind in ('phone', 'email')),
  address_key   text not null,
  scope         text not null default 'marketing' check (scope in ('marketing', 'all')),
  channels      text[] check (channels is null or (cardinality(channels) > 0
                  and channels <@ array['email', 'sms', 'whatsapp', 'viber', 'voice', 'call']::text[])),
  reason        text not null check (length(btrim(reason)) >= 3),
  source        text not null default 'customer_request'
                  check (source in ('customer_request', 'unsubscribe', 'complaint', 'register', 'other')),
  lead_id       uuid,
  customer_id   uuid,
  recorded_by   uuid,
  created_at    timestamptz not null default now(),
  lifted_at     timestamptz,
  lifted_by     uuid,
  lifted_reason text,
  constraint objection_lift_complete check ((lifted_at is null) = (lifted_by is null)
    and (lifted_at is null or length(btrim(coalesce(lifted_reason, ''))) >= 3))
);
create index if not exists contact_objections_active_idx on public.contact_objections (address_kind, address_key) where lifted_at is null;

create table if not exists public.contact_consents (
  id               uuid primary key default gen_random_uuid(),
  address_kind     text not null check (address_kind in ('phone', 'email')),
  address_key      text not null,
  channel          text not null check (channel in ('email', 'sms', 'whatsapp', 'viber', 'voice', 'call')),
  status           text not null check (status in ('granted', 'withdrawn')),
  basis            text check (basis in ('consent', 'existing_customer')),
  evidence_ref     text,               -- e.g. signed form no., recording id, web form submission id
  evidence_at      timestamptz,
  text_version     text,               -- which consent wording the person agreed to
  source           text not null default 'manual',
  lead_id          uuid,
  customer_id      uuid,
  recorded_by      uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  withdrawn_at     timestamptz,
  withdrawn_reason text,
  unique (address_kind, address_key, channel),
  constraint consent_channel_matches_kind check ((channel = 'email') = (address_kind = 'email')),
  -- No fabricated consent: a grant needs a basis AND evidence (reference + when).
  constraint consent_grant_requires_evidence check (status <> 'granted'
    or (basis is not null and length(btrim(coalesce(evidence_ref, ''))) >= 3 and evidence_at is not null))
);

create table if not exists public.article11_screenings (
  id              uuid primary key default gen_random_uuid(),
  phone_key       text not null,
  result          text not null check (result in ('not_listed', 'listed')),
  register_source text not null check (length(btrim(register_source)) >= 2),
  evidence_ref    text,
  screened_at     timestamptz not null,
  recorded_by     uuid,
  created_at      timestamptz not null default now()
);
create index if not exists article11_screenings_phone_idx on public.article11_screenings (phone_key, screened_at desc);

-- RLS: direct reads for the roles that manage this; every write goes through the functions below.
alter table public.contact_objections enable row level security;
alter table public.contact_consents enable row level security;
alter table public.article11_screenings enable row level security;
revoke all on public.contact_objections, public.contact_consents, public.article11_screenings from anon, public;
revoke insert, update, delete on public.contact_objections, public.contact_consents, public.article11_screenings from authenticated;
grant select on public.contact_objections, public.contact_consents, public.article11_screenings to authenticated;
grant all on public.contact_objections, public.contact_consents, public.article11_screenings to service_role;

drop policy if exists "contact managers read objections" on public.contact_objections;
create policy "contact managers read objections" on public.contact_objections for select to authenticated
  using (public.contact_role() = 'admin');
drop policy if exists "contact managers read consents" on public.contact_consents;
create policy "contact managers read consents" on public.contact_consents for select to authenticated
  using (public.contact_role() = 'admin');
drop policy if exists "contact managers read screenings" on public.article11_screenings;
create policy "contact managers read screenings" on public.article11_screenings for select to authenticated
  using (public.contact_role() = 'admin');

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Facts for one contact point (any active staff member: the person about to call must be able to see a «no»)
--    Returns flags, never the address itself.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.contact_facts(p_phone text, p_email text)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  pk text := public.contact_phone_key(p_phone);
  ek text := public.contact_email_key(p_email);
begin
  if public.contact_role() is null then
    raise exception 'contact_facts: not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'has_phone', pk is not null,
    'has_email', ek is not null,
    'objections', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'batch_id', o.batch_id, 'address_kind', o.address_kind, 'scope', o.scope, 'channels', o.channels,
                                          'reason', o.reason, 'source', o.source, 'created_at', o.created_at) order by o.created_at desc)
      from public.contact_objections o
      where o.lifted_at is null
        and ((o.address_kind = 'phone' and o.address_key = pk) or (o.address_kind = 'email' and o.address_key = ek))), '[]'::jsonb),
    'consents', coalesce((
      select jsonb_object_agg(c.channel, jsonb_build_object('status', c.status, 'basis', c.basis, 'evidence_ref', c.evidence_ref,
                                                            'evidence_at', c.evidence_at, 'text_version', c.text_version, 'updated_at', c.updated_at))
      from public.contact_consents c
      where (c.address_kind = 'phone' and c.address_key = pk) or (c.address_kind = 'email' and c.address_key = ek)), '{}'::jsonb),
    'article11', (
      select jsonb_build_object('result', s.result, 'screened_at', s.screened_at, 'register_source', s.register_source)
      from public.article11_screenings s where s.phone_key = pk
      order by s.screened_at desc, s.created_at desc limit 1),
    'email_suppressed', case when ek is null then false
                             else exists (select 1 from public.email_suppressions es where es.email = ek) end
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Recording (every change is also written to activity_log)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.contact_log(p_action text, p_lead uuid, p_customer uuid, p_details jsonb)
returns void language sql security definer set search_path = public
as $$
  insert into public.activity_log (entity_type, entity_id, action, details)
  values (case when p_customer is not null then 'customer' when p_lead is not null then 'lead' else 'contact' end,
          coalesce(p_customer, p_lead), p_action, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('by', auth.uid()));
$$;
revoke all on function public.contact_log(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- «Δεν θέλει επικοινωνία»: any active staff member. Attaches to the phone and/or the email depending on the channels.
create or replace function public.record_contact_objection(
  p_phone text, p_email text, p_scope text, p_channels text[], p_reason text,
  p_source text default 'customer_request', p_lead_id uuid default null, p_customer_id uuid default null)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  pk text := public.contact_phone_key(p_phone);
  ek text := public.contact_email_key(p_email);
  n integer := 0;
  v_batch uuid := gen_random_uuid();
begin
  if public.contact_role() is null then
    raise exception 'record_contact_objection: not allowed' using errcode = '42501';
  end if;
  if coalesce(p_scope, '') not in ('marketing', 'all') then
    raise exception 'record_contact_objection: invalid scope' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'record_contact_objection: a reason is required' using errcode = '22023';
  end if;
  if p_channels is not null and (cardinality(p_channels) = 0
      or not p_channels <@ array['email', 'sms', 'whatsapp', 'viber', 'voice', 'call']::text[]) then
    raise exception 'record_contact_objection: invalid channels' using errcode = '22023';
  end if;

  if pk is not null and (p_channels is null or p_channels && array['sms', 'whatsapp', 'viber', 'voice', 'call']::text[]) then
    insert into public.contact_objections (batch_id, address_kind, address_key, scope, channels, reason, source, lead_id, customer_id, recorded_by)
    values (v_batch, 'phone', pk, p_scope, p_channels, btrim(p_reason), coalesce(p_source, 'customer_request'), p_lead_id, p_customer_id, auth.uid());
    n := n + 1;
  end if;
  if ek is not null and (p_channels is null or 'email' = any(p_channels)) then
    insert into public.contact_objections (batch_id, address_kind, address_key, scope, channels, reason, source, lead_id, customer_id, recorded_by)
    values (v_batch, 'email', ek, p_scope, p_channels, btrim(p_reason), coalesce(p_source, 'customer_request'), p_lead_id, p_customer_id, auth.uid());
    -- Marketing email stops everywhere the suppression list is checked (send-offer, campaigns, newsletters).
    insert into public.email_suppressions (email, reason, source) values (ek, 'objection', 'crm') on conflict (email) do nothing;
    n := n + 1;
  end if;
  if n = 0 then
    raise exception 'record_contact_objection: no phone or email for these channels' using errcode = '22023';
  end if;
  perform public.contact_log('contact_objection', p_lead_id, p_customer_id,
    jsonb_build_object('scope', p_scope, 'channels', p_channels, 'source', p_source));
  return n;
end;
$$;

-- A refusal spoken to the AI caller, recorded by vapi-webhook (service_role only: there is no signed-in person). Attaches to the phone number, and to the
-- email when the record has one, so every channel stops for marketing whichever address a later send looks at; the email also goes on the suppression list.
-- Safe to repeat: an address is not recorded twice. It stores no transcript text.
create or replace function public.record_spoken_objection(p_phone text, p_email text, p_lead_id uuid, p_voice_call_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  pk text := public.contact_phone_key(p_phone);
  ek text := public.contact_email_key(p_email);
  v_batch uuid := gen_random_uuid();
  n integer := 0;
begin
  if pk is null and ek is null then
    raise exception 'record_spoken_objection: no phone number or email' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('objection|' || coalesce(pk, ek), 0));
  if pk is not null and not exists (select 1 from public.contact_objections o where o.address_kind = 'phone' and o.address_key = pk and o.lifted_at is null and o.channels is null) then
    insert into public.contact_objections (batch_id, address_kind, address_key, scope, channels, reason, source, lead_id)
    values (v_batch, 'phone', pk, 'marketing', null, 'Προφορική άρνηση σε κλήση AI', 'customer_request', p_lead_id);
    n := n + 1;
  end if;
  if ek is not null and not exists (select 1 from public.contact_objections o where o.address_kind = 'email' and o.address_key = ek and o.lifted_at is null and o.channels is null) then
    insert into public.contact_objections (batch_id, address_kind, address_key, scope, channels, reason, source, lead_id)
    values (v_batch, 'email', ek, 'marketing', null, 'Προφορική άρνηση σε κλήση AI', 'customer_request', p_lead_id);
    insert into public.email_suppressions (email, reason, source) values (ek, 'objection', 'crm') on conflict (email) do nothing;
    n := n + 1;
  end if;
  if n > 0 then
    perform public.contact_log('contact_objection', p_lead_id, null,
      jsonb_build_object('scope', 'marketing', 'source', 'spoken', 'voice_call', p_voice_call_id));
  end if;
  return n > 0;
end;
$$;

-- Admin only, with a reason (e.g. «νέα έγγραφη συγκατάθεση της 12/11, αρ. 0042»). Lifts the whole recorded «no»
-- (phone and email rows of the same batch) and removes the suppression it created — not one from an unsubscribe link.
create or replace function public.lift_contact_objection(p_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare o public.contact_objections; n integer;
begin
  if public.contact_role() is distinct from 'admin' then
    raise exception 'lift_contact_objection: not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'lift_contact_objection: a reason is required' using errcode = '22023';
  end if;
  select * into o from public.contact_objections where id = p_id;
  if o.id is null then return false; end if;
  update public.contact_objections set lifted_at = now(), lifted_by = auth.uid(), lifted_reason = btrim(p_reason)
  where batch_id = o.batch_id and lifted_at is null;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  delete from public.email_suppressions es
  using public.contact_objections x
  where x.batch_id = o.batch_id and x.address_kind = 'email' and es.email = x.address_key
    and es.reason = 'objection' and es.source = 'crm'
    and not exists (select 1 from public.contact_objections y where y.address_kind = 'email' and y.address_key = x.address_key and y.lifted_at is null);
  perform public.contact_log('contact_objection_lifted', o.lead_id, o.customer_id, jsonb_build_object('batch', o.batch_id));
  return true;
end;
$$;

-- Consent with evidence: Admin only.
create or replace function public.record_contact_consent(
  p_phone text, p_email text, p_channel text, p_basis text, p_evidence_ref text, p_evidence_at timestamptz,
  p_text_version text default null, p_source text default 'manual', p_lead_id uuid default null, p_customer_id uuid default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  kind text := case when p_channel = 'email' then 'email' else 'phone' end;
  k text := case when p_channel = 'email' then public.contact_email_key(p_email) else public.contact_phone_key(p_phone) end;
  v_id uuid;
begin
  if public.contact_role() is distinct from 'admin' then
    raise exception 'record_contact_consent: not allowed' using errcode = '42501';
  end if;
  if coalesce(p_channel, '') not in ('email', 'sms', 'whatsapp', 'viber', 'voice', 'call') then
    raise exception 'record_contact_consent: invalid channel' using errcode = '22023';
  end if;
  if coalesce(p_basis, '') not in ('consent', 'existing_customer') then
    raise exception 'record_contact_consent: invalid basis' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_evidence_ref, ''))) < 3 or p_evidence_at is null then
    raise exception 'record_contact_consent: evidence is required' using errcode = '22023';
  end if;
  if p_evidence_at > now() + interval '5 minutes' then
    raise exception 'record_contact_consent: evidence date is in the future' using errcode = '22023';
  end if;
  if k is null then
    raise exception 'record_contact_consent: no address for this channel' using errcode = '22023';
  end if;
  insert into public.contact_consents (address_kind, address_key, channel, status, basis, evidence_ref, evidence_at, text_version,
                                       source, lead_id, customer_id, recorded_by)
  values (kind, k, p_channel, 'granted', p_basis, btrim(p_evidence_ref), p_evidence_at, nullif(btrim(coalesce(p_text_version, '')), ''),
          coalesce(p_source, 'manual'), p_lead_id, p_customer_id, auth.uid())
  on conflict (address_kind, address_key, channel) do update
    set status = 'granted', basis = excluded.basis, evidence_ref = excluded.evidence_ref, evidence_at = excluded.evidence_at,
        text_version = excluded.text_version, source = excluded.source, recorded_by = excluded.recorded_by,
        lead_id = coalesce(excluded.lead_id, contact_consents.lead_id), customer_id = coalesce(excluded.customer_id, contact_consents.customer_id),
        withdrawn_at = null, withdrawn_reason = null, updated_at = now()
  returning id into v_id;
  perform public.contact_log('contact_consent_granted', p_lead_id, p_customer_id,
    jsonb_build_object('channel', p_channel, 'basis', p_basis, 'evidence_ref', btrim(p_evidence_ref)));
  return v_id;
end;
$$;

-- Withdrawal: any active staff member (the person said «σταματήστε»). Creates a withdrawn row if none existed, so a
-- later grant has to be recorded explicitly with new evidence.
create or replace function public.withdraw_contact_consent(
  p_phone text, p_email text, p_channel text, p_reason text, p_lead_id uuid default null, p_customer_id uuid default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  kind text := case when p_channel = 'email' then 'email' else 'phone' end;
  k text := case when p_channel = 'email' then public.contact_email_key(p_email) else public.contact_phone_key(p_phone) end;
begin
  if public.contact_role() is null then
    raise exception 'withdraw_contact_consent: not allowed' using errcode = '42501';
  end if;
  if coalesce(p_channel, '') not in ('email', 'sms', 'whatsapp', 'viber', 'voice', 'call') then
    raise exception 'withdraw_contact_consent: invalid channel' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'withdraw_contact_consent: a reason is required' using errcode = '22023';
  end if;
  if k is null then
    raise exception 'withdraw_contact_consent: no address for this channel' using errcode = '22023';
  end if;
  insert into public.contact_consents (address_kind, address_key, channel, status, source, lead_id, customer_id, recorded_by,
                                       withdrawn_at, withdrawn_reason)
  values (kind, k, p_channel, 'withdrawn', 'crm', p_lead_id, p_customer_id, auth.uid(), now(), btrim(p_reason))
  on conflict (address_kind, address_key, channel) do update
    set status = 'withdrawn', withdrawn_at = now(), withdrawn_reason = btrim(p_reason), recorded_by = auth.uid(), updated_at = now();
  if p_channel = 'email' then
    insert into public.email_suppressions (email, reason, source) values (k, 'consent_withdrawn', 'crm') on conflict (email) do nothing;
  end if;
  perform public.contact_log('contact_consent_withdrawn', p_lead_id, p_customer_id, jsonb_build_object('channel', p_channel));
  return true;
end;
$$;

-- Article 11 register screening result for a phone number: Admin only. History is kept; the latest
-- screening wins. The matching B2B prospects' phone_screening flag is updated when phase3/08 is present.
create or replace function public.record_article11_screening(
  p_phone text, p_result text, p_register_source text, p_evidence_ref text default null,
  p_screened_at timestamptz default now(), p_lead_id uuid default null, p_customer_id uuid default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  pk text := public.contact_phone_key(p_phone);
  v_id uuid;
begin
  if public.contact_role() is distinct from 'admin' then
    raise exception 'record_article11_screening: not allowed' using errcode = '42501';
  end if;
  if coalesce(p_result, '') not in ('not_listed', 'listed') then
    raise exception 'record_article11_screening: invalid result' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_register_source, ''))) < 2 then
    raise exception 'record_article11_screening: the register checked is required' using errcode = '22023';
  end if;
  if p_screened_at is null or p_screened_at > now() + interval '5 minutes' or p_screened_at < now() - interval '365 days' then
    raise exception 'record_article11_screening: invalid screening date' using errcode = '22023';
  end if;
  if pk is null then
    raise exception 'record_article11_screening: no phone number' using errcode = '22023';
  end if;
  insert into public.article11_screenings (phone_key, result, register_source, evidence_ref, screened_at, recorded_by)
  values (pk, p_result, btrim(p_register_source), nullif(btrim(coalesce(p_evidence_ref, '')), ''), p_screened_at, auth.uid())
  returning id into v_id;
  if to_regclass('public.b2b_prospects') is not null then
    execute 'update public.b2b_prospects set phone_screening = $1 where phone_key = $2'
      using case when p_result = 'listed' then 'opted_out' else 'clear' end, pk;
  end if;
  perform public.contact_log('article11_screening', p_lead_id, p_customer_id,
    jsonb_build_object('result', p_result, 'register', btrim(p_register_source)));
  return v_id;
end;
$$;

revoke all on function public.contact_facts(text, text) from public, anon;
revoke all on function public.record_contact_objection(text, text, text, text[], text, text, uuid, uuid) from public, anon;
revoke all on function public.record_spoken_objection(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_spoken_objection(text, text, uuid, uuid) to service_role;
revoke all on function public.lift_contact_objection(uuid, text) from public, anon;
revoke all on function public.record_contact_consent(text, text, text, text, text, timestamptz, text, text, uuid, uuid) from public, anon;
revoke all on function public.withdraw_contact_consent(text, text, text, text, uuid, uuid) from public, anon;
revoke all on function public.record_article11_screening(text, text, text, text, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.contact_facts(text, text) to authenticated, service_role;
grant execute on function public.record_contact_objection(text, text, text, text[], text, text, uuid, uuid) to authenticated;
grant execute on function public.lift_contact_objection(uuid, text) to authenticated;
grant execute on function public.record_contact_consent(text, text, text, text, text, timestamptz, text, text, uuid, uuid) to authenticated;
grant execute on function public.withdraw_contact_consent(text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.record_article11_screening(text, text, text, text, timestamptz, uuid, uuid) to authenticated;

-- ROLLBACK (drops the recorded objections/consents/screenings — export them first):
--   drop function public.record_article11_screening(text, text, text, text, timestamptz, uuid, uuid);
--   drop function public.withdraw_contact_consent(text, text, text, text, uuid, uuid);
--   drop function public.record_contact_consent(text, text, text, text, text, timestamptz, text, text, uuid, uuid);
--   drop function public.record_spoken_objection(text, text, uuid, uuid);
--   drop function public.lift_contact_objection(uuid, text);
--   drop function public.record_contact_objection(text, text, text, text[], text, text, uuid, uuid);
--   drop function public.contact_log(text, uuid, uuid, jsonb);
--   drop function public.contact_facts(text, text);
--   drop table public.article11_screenings; drop table public.contact_consents; drop table public.contact_objections;
--   drop function public.contact_role(); drop function public.contact_email_key(text); drop function public.contact_phone_key(text);
