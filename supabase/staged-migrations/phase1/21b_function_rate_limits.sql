-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 1 / 21b: a durable, shared rate limit for Edge Functions that send messages, place calls or spend paid quota.
-- The in-memory throttle in _shared/limits.ts is per function instance, so it does not bound a horizontally scaled function.
-- This counter lives in the database, so every instance shares it, and the increment is one atomic statement.
-- MUST be applied BEFORE the functions that call consume_rate_limit are deployed: they refuse to send (503) when it is missing.
-- Only service_role may call it; nothing here is reachable through the API by a signed-in or anonymous user.
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

-- True when this attempt is inside the limit. Fixed window: the count resets at each window boundary.
create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 200 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.function_rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  -- opportunistic cleanup, so the table stays small without a cron job
  if random() < 0.01 then
    delete from public.function_rate_limits where window_start < now() - interval '2 days';
  end if;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
