-- STAGED (Phase 3 / 10) — NOT APPLIED. Apply on staging first, then production only with the owner's approval and a backup.
-- A distinct record for every offer, its history, and acceptance as ONE transaction.
--
-- Before this file an offer was only a task title and a note: nothing tied a link to one offer, and a lead's conversion and its record were separate
-- writes. Here each offer has an id, a state and an expiry, the link is signed for that exact offer and lead (send-offer), and offer_accept changes the
-- offer, the lead, the task, the note and the history together or not at all.
--
-- MUST be applied BEFORE the send-offer and accept-offer that call these functions are deployed: without it they answer 503/500 and change nothing.
-- Depends on: hlektrismos_leads, energy_tariffs, crm_tasks, lead_notes, activity_log (present on production), is_role().
-- service_role calls every function here. An active Admin may read the tables. Sales Agents and anonymous visitors reach nothing directly.
-- Idempotent. Rollback: docs/ops/rollback_phase3_10_offer_lifecycle.sql

create table if not exists public.offers (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references public.hlektrismos_leads (id) on delete cascade,
  tariff_id      uuid not null references public.energy_tariffs (id) on delete restrict,
  status         text not null default 'created' check (status in ('created', 'sent', 'accepted', 'expired', 'withdrawn', 'superseded', 'failed')),
  purpose        text not null check (purpose in ('promotional', 'requested_service')),
  provider_name  text not null,   -- what the customer was shown, even if the tariff changes later
  program_name   text not null,
  estimated_cost numeric,
  savings        numeric,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  expires_at     timestamptz not null,
  accepted_at    timestamptz,
  closed_at      timestamptz,
  constraint offers_accepted_dated check ((status = 'accepted') = (accepted_at is not null))
);
-- One open offer per lead and tariff; one accepted offer per lead. These hold even if two requests race past every other check.
create unique index if not exists offers_one_open on public.offers (lead_id, tariff_id) where status in ('created', 'sent');
create unique index if not exists offers_one_accepted on public.offers (lead_id) where status = 'accepted';
create index if not exists offers_lead_idx on public.offers (lead_id, created_at desc);

create table if not exists public.offer_events (
  id         bigint generated always as identity primary key,
  offer_id   uuid not null references public.offers (id) on delete cascade,
  event      text not null check (event in ('created', 'delivery_sent', 'delivery_failed', 'sent', 'failed', 'accepted', 'accept_refused', 'expired', 'superseded', 'withdrawn')),
  channel    text check (channel is null or channel in ('email', 'viber', 'whatsapp')),
  actor_id   uuid,               -- null = the customer's link or the system
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists offer_events_offer_idx on public.offer_events (offer_id, id);

-- Old links (no offer id) are never honoured automatically. A person reviews them here; no customer record is touched.
create table if not exists public.offer_legacy_link_reviews (
  lead_id         uuid not null references public.hlektrismos_leads (id) on delete cascade,
  tariff_id       uuid not null references public.energy_tariffs (id) on delete cascade,
  link_format     text not null check (link_format in ('unsigned', 'signed_no_expiry', 'signed_expiring')),
  signature_valid boolean not null default false,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  hits            integer not null default 1,
  resolved_at     timestamptz,
  resolved_by     uuid,
  resolution      text,
  primary key (lead_id, tariff_id)
);

alter table public.offers enable row level security;
alter table public.offer_events enable row level security;
alter table public.offer_legacy_link_reviews enable row level security;
revoke all on table public.offers, public.offer_events, public.offer_legacy_link_reviews from public, anon, authenticated;
grant select, insert, update on table public.offers to service_role;
grant select, insert on table public.offer_events to service_role;
grant select, insert, update on table public.offer_legacy_link_reviews to service_role;
grant select on table public.offers, public.offer_events, public.offer_legacy_link_reviews to authenticated;
drop policy if exists "admin reads offers" on public.offers;
create policy "admin reads offers" on public.offers for select to authenticated using (public.is_role('admin'));
drop policy if exists "admin reads offer_events" on public.offer_events;
create policy "admin reads offer_events" on public.offer_events for select to authenticated using (public.is_role('admin'));
drop policy if exists "admin reads legacy link reviews" on public.offer_legacy_link_reviews;
create policy "admin reads legacy link reviews" on public.offer_legacy_link_reviews for select to authenticated using (public.is_role('admin'));

-- History cannot be rewritten. A row goes only when its offer goes, which happens only when the lead itself is erased (cascade: depth > 1).
create or replace function public.offer_events_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'offer_events is append-only';
end $$;
drop trigger if exists offer_events_no_change on public.offer_events;
create trigger offer_events_no_change before update or delete on public.offer_events
  for each row execute function public.offer_events_append_only();

-- An open offer older than ten minutes is replaced by a new one (its link then answers "closed"); younger than that, it is a double click.
create or replace function public.offer_create(
  p_lead_id uuid, p_tariff_id uuid, p_expires_at timestamptz, p_purpose text, p_estimated_cost numeric, p_savings numeric, p_actor_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_lead record;
  v_tariff record;
  v_open record;
  v_id uuid;
begin
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '60 days' then
    raise exception 'offer_create: invalid expiry';
  end if;
  select id, status, deleted_at into v_lead from public.hlektrismos_leads where id = p_lead_id for update;
  if not found or v_lead.deleted_at is not null then return jsonb_build_object('state', 'not_found'); end if;
  if v_lead.status in ('customer', 'lost', 'unsubscribed', 'do_not_contact') then return jsonb_build_object('state', 'closed'); end if;
  select provider_name, program_name into v_tariff from public.energy_tariffs where id = p_tariff_id;
  if not found then return jsonb_build_object('state', 'not_found'); end if;

  select id, created_at into v_open from public.offers where lead_id = p_lead_id and tariff_id = p_tariff_id and status in ('created', 'sent') for update;
  if found then
    if v_open.created_at > now() - interval '10 minutes' then
      return jsonb_build_object('state', 'open', 'offer_id', v_open.id);
    end if;
    update public.offers set status = 'superseded', closed_at = now() where id = v_open.id;
    insert into public.offer_events (offer_id, event, actor_id) values (v_open.id, 'superseded', p_actor_id);
  end if;

  insert into public.offers (lead_id, tariff_id, purpose, provider_name, program_name, estimated_cost, savings, created_by, expires_at)
  values (p_lead_id, p_tariff_id, p_purpose, v_tariff.provider_name, v_tariff.program_name, p_estimated_cost, p_savings, p_actor_id, p_expires_at)
  returning id into v_id;
  insert into public.offer_events (offer_id, event, actor_id, detail) values (v_id, 'created', p_actor_id, jsonb_build_object('purpose', p_purpose));
  return jsonb_build_object('state', 'created', 'offer_id', v_id, 'provider_name', v_tariff.provider_name, 'program_name', v_tariff.program_name);
end $$;

create or replace function public.offer_record_delivery(p_offer_id uuid, p_channel text, p_ok boolean, p_status integer, p_actor_id uuid)
returns void language sql security invoker set search_path = public as $$
  insert into public.offer_events (offer_id, event, channel, actor_id, detail)
  values (p_offer_id, case when p_ok then 'delivery_sent' else 'delivery_failed' end, p_channel, p_actor_id, jsonb_build_object('provider_status', p_status));
$$;

-- At least one channel delivered: the offer, the lead, the follow-up task, the note and the history move together.
create or replace function public.offer_mark_sent(p_offer_id uuid, p_channels text[], p_actor_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare o public.offers;
begin
  select * into o from public.offers where id = p_offer_id for update;
  if not found or o.status <> 'created' then return false; end if;
  update public.offers set status = 'sent', sent_at = now() where id = p_offer_id;
  update public.hlektrismos_leads set status = 'follow_up', last_contact_at = now() where id = o.lead_id;
  insert into public.crm_tasks (lead_id, tariff_id, title, description, status, priority, due_date)
  values (o.lead_id, o.tariff_id, 'Προσφορά στάλθηκε: ' || o.provider_name || ' - ' || o.program_name,
          'Εκτιμώμενο κόστος: €' || coalesce(o.estimated_cost::text, '') || '/μήνα. Εξοικονόμηση: €' || coalesce(o.savings::text, '0') || '/μήνα. Περιμένουμε απάντηση.',
          'pending', 'high', now() + interval '1 day');
  insert into public.lead_notes (lead_id, content, author, note_type)
  values (o.lead_id, '📧 Προσφορά στάλθηκε: ' || o.provider_name || ' — ' || o.program_name || E'\nΚανάλια: ' || array_to_string(p_channels, ', '), 'system', 'offer_sent');
  insert into public.offer_events (offer_id, event, actor_id, detail) values (p_offer_id, 'sent', p_actor_id, jsonb_build_object('channels', p_channels));
  return true;
end $$;

-- Nothing was delivered: no status change on the lead, no task, and a retry may create a new offer at once.
create or replace function public.offer_mark_failed(p_offer_id uuid, p_actor_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  update public.offers set status = 'failed', closed_at = now() where id = p_offer_id and status = 'created';
  if not found then return false; end if;
  insert into public.offer_events (offer_id, event, actor_id) values (p_offer_id, 'failed', p_actor_id);
  return true;
end $$;

-- The customer's acceptance. p_lead_id comes from the signed token, so a valid token for one offer or lead cannot reach another.
-- Locks the lead, then the offer (the order offer_create uses). A refused attempt changes nothing except its history row.
create or replace function public.offer_accept(p_offer_id uuid, p_lead_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  o public.offers;
  v_lead record;
  v_state text;
begin
  select id, status, deleted_at into v_lead from public.hlektrismos_leads where id = p_lead_id for update;
  if not found or v_lead.deleted_at is not null then return jsonb_build_object('state', 'not_found'); end if;
  select * into o from public.offers where id = p_offer_id and lead_id = p_lead_id for update;
  if not found then return jsonb_build_object('state', 'not_found'); end if;

  if o.status = 'accepted' then return jsonb_build_object('state', 'already_accepted'); end if;
  if o.status in ('withdrawn', 'superseded', 'failed', 'expired') then
    v_state := case when o.status = 'expired' then 'expired' else 'closed' end;
  elsif o.expires_at <= now() then
    update public.offers set status = 'expired', closed_at = now() where id = o.id;
    insert into public.offer_events (offer_id, event) values (o.id, 'expired');
    return jsonb_build_object('state', 'expired');
  elsif v_lead.status in ('customer', 'lost', 'unsubscribed', 'do_not_contact') then
    v_state := 'closed';
  end if;
  if v_state is not null then
    insert into public.offer_events (offer_id, event, detail) values (o.id, 'accept_refused', jsonb_build_object('state', v_state));
    return jsonb_build_object('state', v_state);
  end if;

  update public.offers set status = 'accepted', accepted_at = now(), closed_at = now() where id = o.id;
  update public.offers set status = 'superseded', closed_at = now() where lead_id = p_lead_id and id <> o.id and status in ('created', 'sent');
  update public.hlektrismos_leads set status = 'customer', converted_at = now() where id = p_lead_id;
  insert into public.crm_tasks (lead_id, tariff_id, title, description, status, priority, completed_at)
  values (p_lead_id, o.tariff_id, 'Πελάτης αποδέχτηκε προσφορά: ' || o.provider_name || ' — ' || o.program_name,
          'Ο πελάτης αποδέχτηκε την προσφορά μέσω του συνδέσμου αποδοχής.', 'completed', 'high', now());
  insert into public.lead_notes (lead_id, content, author, note_type)
  values (p_lead_id, '✅ Ο πελάτης αποδέχτηκε την προσφορά: ' || o.provider_name || ' — ' || o.program_name, 'system', 'offer_accepted');
  insert into public.offer_events (offer_id, event) values (o.id, 'accepted');
  return jsonb_build_object('state', 'accepted');
end $$;

-- An old link was opened and pressed. Stored only when there is evidence of an offer for that pair, so a guessed link stores nothing.
create or replace function public.offer_note_legacy_link(p_lead_id uuid, p_tariff_id uuid, p_format text, p_signature_valid boolean)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if not exists (select 1 from public.crm_tasks t where t.lead_id = p_lead_id and t.tariff_id = p_tariff_id and t.title like 'Προσφορά στάλθηκε%') then
    return false;
  end if;
  insert into public.offer_legacy_link_reviews as r (lead_id, tariff_id, link_format, signature_valid)
  values (p_lead_id, p_tariff_id, p_format, p_signature_valid)
  on conflict (lead_id, tariff_id) do update set hits = r.hits + 1, last_seen_at = now(), signature_valid = r.signature_valid or excluded.signature_valid;
  return true;
end $$;

revoke all on function public.offer_create(uuid, uuid, timestamptz, text, numeric, numeric, uuid) from public, anon, authenticated;
revoke all on function public.offer_record_delivery(uuid, text, boolean, integer, uuid) from public, anon, authenticated;
revoke all on function public.offer_mark_sent(uuid, text[], uuid) from public, anon, authenticated;
revoke all on function public.offer_mark_failed(uuid, uuid) from public, anon, authenticated;
revoke all on function public.offer_accept(uuid, uuid) from public, anon, authenticated;
revoke all on function public.offer_note_legacy_link(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.offer_create(uuid, uuid, timestamptz, text, numeric, numeric, uuid) to service_role;
grant execute on function public.offer_record_delivery(uuid, text, boolean, integer, uuid) to service_role;
grant execute on function public.offer_mark_sent(uuid, text[], uuid) to service_role;
grant execute on function public.offer_mark_failed(uuid, uuid) to service_role;
grant execute on function public.offer_accept(uuid, uuid) to service_role;
grant execute on function public.offer_note_legacy_link(uuid, uuid, text, boolean) to service_role;
