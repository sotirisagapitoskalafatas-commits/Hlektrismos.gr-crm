-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 1 / 21b: a durable, shared rate limit for Edge Functions that send messages, place calls or spend paid quota.
-- The in-memory throttle in _shared/limits.ts is per function instance, so it does not bound a horizontally scaled function.
-- This counter lives in the database, so every instance shares it, and the increment is one atomic statement.
-- MUST be applied BEFORE the functions that call consume_rate_limit are deployed: they refuse to send (503) when it is missing.
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

-- True when this attempt is inside the limit. p_cost counts recipients for a batch. Fixed window: the count resets at each boundary.
create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer, p_cost integer default 1)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 200 or p_limit < 1 or p_window_seconds < 1 or p_cost < 1 then
    raise exception 'invalid rate limit arguments';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.function_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window, p_cost)
  on conflict (bucket, window_start) do update set hits = r.hits + p_cost
  returning hits into v_hits;
  -- opportunistic cleanup, so the table stays small without a cron job
  if random() < 0.01 then
    delete from public.function_rate_limits where window_start < now() - interval '2 days';
  end if;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, integer) to service_role;

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
  action          text not null check (action in ('sms', 'viber', 'whatsapp', 'voice', 'email_campaign', 'email_direct', 'offer')),
  result          text not null check (result in ('attempt', 'sent', 'failed')),
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
