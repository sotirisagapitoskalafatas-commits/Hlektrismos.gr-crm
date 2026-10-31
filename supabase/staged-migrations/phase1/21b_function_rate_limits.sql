-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 1 / 21b: a durable, shared rate limit for Edge Functions that send messages, place calls or spend paid quota.
-- The in-memory throttle in _shared/limits.ts is per function instance, so it does not bound a horizontally scaled function.
-- This counter lives in the database, so every instance shares it, and the increment is one atomic statement.
-- MUST be applied BEFORE the functions that call consume_rate_limits and claim_once are deployed: they refuse to send (503) when it is missing.
-- It also adds the unique index behind the atomic send claim of send-sms and send-campaign-email (without it they send nothing to a campaign),
-- and public.communication_log, which every sender writes before sending (without it nothing is sent).
-- Only service_role may call the counters; a signed-in Admin may read the log. Nothing else here is reachable through the API.
-- Idempotent. Rollback: docs/ops/rollback_phase1_21b_function_rate_limits.sql
create table if not exists public.function_rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
alter table public.function_rate_limits enable row level security;
revoke all on table public.function_rate_limits from public, anon, authenticated;
grant all on table public.function_rate_limits to service_role;

create unique index if not exists campaign_sends_campaign_lead_unique on public.campaign_sends (campaign_id, lead_id);

-- "Only once for this long": a duplicate click, a retry or a simultaneous request. True for the one caller that takes the key. The expiry is per key, so two
-- calls either side of a clock boundary cannot both pass, which a fixed window would allow. The insert is one atomic statement.
create table if not exists public.function_once_locks (
  key        text primary key,
  expires_at timestamptz not null
);
alter table public.function_once_locks enable row level security;
revoke all on table public.function_once_locks from public, anon, authenticated;
grant all on table public.function_once_locks to service_role;

create or replace function public.claim_once(p_key text, p_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_taken boolean;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 or p_seconds is null or p_seconds < 1 or p_seconds > 86400 then
    raise exception 'invalid once-lock arguments';
  end if;
  insert into public.function_once_locks as l (key, expires_at) values (p_key, now() + make_interval(secs => p_seconds))
  on conflict (key) do update set expires_at = excluded.expires_at where l.expires_at <= now()
  returning true into v_taken;
  if random() < 0.01 then
    delete from public.function_once_locks where expires_at < now() - interval '1 day';
  end if;
  return coalesce(v_taken, false);
end;
$$;
revoke all on function public.claim_once(text, integer) from public, anon, authenticated;
grant execute on function public.claim_once(text, integer) to service_role;

-- Gives the key back after a send that definitely did not happen, so a genuine retry can go out.
create or replace function public.release_once(p_key text)
returns void
language sql
security invoker
set search_path = public
as $$ delete from public.function_once_locks where key = p_key; $$;
revoke all on function public.release_once(text) from public, anon, authenticated;
grant execute on function public.release_once(text) to service_role;

-- Several limits as one step: every counter advances, or none does. p_items = [{bucket, limit, window_seconds, cost?}].
-- Answers {"ok":true} or {"ok":false,"bucket":<the first one that refused>}. Counters are locked in sorted order, so two calls sharing buckets
-- cannot deadlock, and the row locks are held to the end of the transaction, so concurrent calls cannot both take the last unit.
create or replace function public.consume_rate_limits(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r record;
  v_hits integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'invalid rate limit arguments';
  end if;
  if (select count(*) <> count(distinct e ->> 'bucket') from jsonb_array_elements(p_items) e) then
    raise exception 'invalid rate limit arguments: a bucket appears twice'; -- the two costs would not add up
  end if;
  for r in
    select x.bucket, x."limit" as lim, x.window_seconds as win, coalesce(x.cost, 1) as cost,
           to_timestamp(floor(extract(epoch from now()) / x.window_seconds) * x.window_seconds) as win_start
    from jsonb_to_recordset(p_items) as x(bucket text, "limit" integer, window_seconds integer, cost integer)
    order by x.bucket, x.window_seconds
  loop
    if r.bucket is null or length(r.bucket) = 0 or length(r.bucket) > 200 or r.lim is null or r.lim < 1 or r.win is null or r.win < 1 or r.cost < 1 then
      raise exception 'invalid rate limit arguments';
    end if;
    insert into public.function_rate_limits (bucket, window_start, hits) values (r.bucket, r.win_start, 0)
    on conflict (bucket, window_start) do nothing;
    select hits into v_hits from public.function_rate_limits where bucket = r.bucket and window_start = r.win_start for update;
    if v_hits + r.cost > r.lim then
      return jsonb_build_object('ok', false, 'bucket', r.bucket);
    end if;
  end loop;
  update public.function_rate_limits f set hits = f.hits + i.cost
  from (
    select x.bucket, coalesce(x.cost, 1) as cost,
           to_timestamp(floor(extract(epoch from now()) / x.window_seconds) * x.window_seconds) as win_start
    from jsonb_to_recordset(p_items) as x(bucket text, "limit" integer, window_seconds integer, cost integer)
  ) i
  where f.bucket = i.bucket and f.window_start = i.win_start;
  if random() < 0.01 then
    delete from public.function_rate_limits where window_start < now() - interval '2 days';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.consume_rate_limits(jsonb) from public, anon, authenticated;
grant execute on function public.consume_rate_limits(jsonb) to service_role;

-- Attributable, insert-only record of every outbound message and call. Written by Edge Functions with service_role, read by an active Admin.
-- No message text, no provider reply, no secret; the address appears only as a SHA-256 hash, the record through its ids.
create table if not exists public.communication_log (
  id              bigint generated always as identity primary key,
  action          text not null check (action in ('sms', 'viber', 'whatsapp', 'voice', 'email_campaign', 'email_direct', 'email_confirmation', 'offer')),
  result          text not null check (result in ('attempt', 'sent', 'failed', 'unknown')), -- unknown: the provider may have accepted it; a person reconciles
  actor_kind      text not null check (actor_kind in ('user', 'service')),
  actor_id        uuid,
  lead_id         uuid,
  customer_id     uuid,
  campaign_id     uuid,
  recipient_hash  text,
  provider_status integer,
  provider_ref    text check (provider_ref is null or length(provider_ref) <= 200),
  created_at      timestamptz not null default now(),
  constraint communication_log_user_named check (actor_kind <> 'user' or actor_id is not null)
);
-- an earlier version of this file created the table with a shorter list of actions
alter table public.communication_log drop constraint if exists communication_log_action_check;
alter table public.communication_log drop constraint if exists communication_log_result_check;
alter table public.communication_log add constraint communication_log_result_check check (result in ('attempt', 'sent', 'failed', 'unknown'));
alter table public.communication_log add constraint communication_log_action_check
  check (action in ('sms', 'viber', 'whatsapp', 'voice', 'email_campaign', 'email_direct', 'email_confirmation', 'offer'));
create index if not exists communication_log_lead_idx on public.communication_log (lead_id, created_at desc) where result = 'sent';
create index if not exists communication_log_recipient_idx on public.communication_log (recipient_hash, created_at desc);
alter table public.communication_log enable row level security;
revoke all on table public.communication_log from public, anon, authenticated;
grant select, insert on table public.communication_log to service_role;
grant select on table public.communication_log to authenticated;
drop policy if exists "admin reads communication_log" on public.communication_log;
create policy "admin reads communication_log" on public.communication_log for select to authenticated using (public.is_role('admin'));

create or replace function public.communication_log_append_only() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'communication_log is append-only';
end $$;
drop trigger if exists communication_log_no_change on public.communication_log;
create trigger communication_log_no_change before update or delete on public.communication_log
  for each row execute function public.communication_log_append_only();
