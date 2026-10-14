-- =============================================================================
-- CRM OS — Job / Worker Runtime & Global Kill Switch (M4)
-- -----------------------------------------------------------------------------
-- The durable execution substrate the automation engine and AI runtime claim
-- work from (per AUTOMATION-OS-AI-WORKFORCE.md §2.E / §12 M4). It exists BEFORE
-- any agent so reliability is a property of the platform, not each agent:
--   * durable job_queue with priority, delayed run_after, correlation trace
--   * idempotency_key — enqueue de-duplication (same key => same job)
--   * retry limits — max_attempts + exponential backoff on job_fail
--   * lease + heartbeat — job_claim leases a job; job_heartbeat extends it
--   * stalled-worker detection + crash-resume — job_reap_stalled requeues jobs
--     whose lease expired (a dead/crashed worker never completes or heartbeats)
--   * global kill switch — crm_settings('ai_kill_switch'); job_claim refuses to
--     hand out work while engaged, freezing all queued execution at once
--
-- Claiming uses FOR UPDATE SKIP LOCKED so many workers drain concurrently
-- without double-claiming. Workers run as service_role (edge functions); the
-- claim/heartbeat/complete/fail/reap RPCs are service_role-only. Enqueue,
-- cancel and the kill switch are operator-facing (authenticated, gated inside).
--
-- Rules: ADDITIVE only, IDEMPOTENT, RLS on, mirrors existing repo conventions.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. job_queue — the durable unit of background work
-- ---------------------------------------------------------------------------
create table if not exists public.job_queue (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid references public.organizations(id) on delete set null,
  queue             text        not null default 'default',
  kind              text        not null,              -- e.g. automation.tick | ai.task.execute | sim.opportunity
  priority          int         not null default 0,    -- higher runs first
  payload           jsonb       not null default '{}'::jsonb,
  status            text        not null default 'queued'
                    check (status in ('queued','running','retrying','done','failed','cancelled')),
  attempts          int         not null default 0,
  max_attempts      int         not null default 5,
  idempotency_key   text,                               -- de-dupe enqueue (unique when present)
  run_after         timestamptz not null default now(), -- delayed / backed-off execution
  locked_by         text,                               -- worker id holding the lease
  locked_at         timestamptz,
  lease_expires_at  timestamptz,                        -- stalled detection / crash-resume boundary
  heartbeat_at      timestamptz,
  correlation_id    uuid,                               -- trace back to originating event/task
  result            jsonb,
  last_error        text,
  created_by        uuid,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (max_attempts >= 1),
  check (attempts >= 0),
  check (priority between -100 and 100)
);

alter table public.job_queue enable row level security;

do $$
begin
  execute 'drop policy if exists "Service role full access on job_queue" on public.job_queue';
  execute 'create policy "Service role full access on job_queue" on public.job_queue for all to service_role using (true) with check (true)';
  execute 'drop policy if exists "staff read job_queue" on public.job_queue';
  execute 'create policy "staff read job_queue" on public.job_queue for select to authenticated using (public.is_role(''admin'') or public.is_role(''manager'') or public.is_role(''back_office''))';
  execute 'drop policy if exists "admin write job_queue" on public.job_queue';
  execute 'create policy "admin write job_queue" on public.job_queue for insert to authenticated with check (public.is_role(''admin''))';
  execute 'drop policy if exists "admin update job_queue" on public.job_queue';
  execute 'create policy "admin update job_queue" on public.job_queue for update to authenticated using (public.is_role(''admin'')) with check (public.is_role(''admin''))';
end $$;

-- Claim scan: only runnable rows, best priority then oldest schedule first.
create index if not exists job_queue_claim_idx
  on public.job_queue (queue, priority desc, run_after, created_at)
  where status in ('queued','retrying');
-- Reaper scan: running jobs ordered by lease expiry.
create index if not exists job_queue_lease_idx
  on public.job_queue (lease_expires_at)
  where status = 'running';
-- Enqueue de-dupe: one live/terminal row per idempotency key.
create unique index if not exists job_queue_idempotency_idx
  on public.job_queue (idempotency_key)
  where idempotency_key is not null;
create index if not exists job_queue_org_idx
  on public.job_queue (organization_id, created_at desc);
create index if not exists job_queue_correlation_idx
  on public.job_queue (correlation_id)
  where correlation_id is not null;

drop trigger if exists job_queue_updated_at on public.job_queue;
create trigger job_queue_updated_at before update on public.job_queue
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Global kill switch — one emergency stop for all AI/automation execution
-- ---------------------------------------------------------------------------
insert into public.crm_settings (setting_key, setting_value, category, description)
values ('ai_kill_switch', '{"enabled": false, "reason": null}'::jsonb, 'security',
        'Global AI/automation kill switch — when enabled, job_claim hands out no work')
on conflict (setting_key) do nothing;

insert into public.event_types (key, version, applies_to, description) values
  ('AiKillSwitchToggled', 1, 'ai', 'Global AI/automation kill switch toggled')
on conflict (key) do nothing;

-- ai_is_killed() — cheap, safe read used by the claim path. Default false when unset.
create or replace function public.ai_is_killed()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select (setting_value->>'enabled')::boolean
       from public.crm_settings
      where setting_key = 'ai_kill_switch'),
    false);
$$;

revoke all on function public.ai_is_killed() from public, anon;
grant  execute on function public.ai_is_killed() to authenticated, service_role;

-- ai_kill_switch_set() — the single emergency stop (admin/manager). Audited.
create or replace function public.ai_kill_switch_set(
  p_enabled boolean,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_state jsonb;
begin
  if not (public.is_role('admin') or public.is_role('manager')) then
    raise exception 'ai_kill_switch_set: requires admin or manager';
  end if;

  v_state := jsonb_build_object('enabled', p_enabled, 'reason', p_reason);

  insert into public.crm_settings (setting_key, setting_value, category, description)
  values ('ai_kill_switch', v_state, 'security',
          'Global AI/automation kill switch — when enabled, job_claim hands out no work')
  on conflict (setting_key)
  do update set setting_value = excluded.setting_value;

  perform public.emit_business_event(
    'AiKillSwitchToggled', null, null,
    jsonb_build_object('enabled', p_enabled, 'reason', p_reason),
    null, null, null, 'ai');

  return v_state;
end;
$$;

revoke all on function public.ai_kill_switch_set(boolean, text) from public, anon;
grant  execute on function public.ai_kill_switch_set(boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. job_enqueue() — add work (idempotent on idempotency_key)
-- ---------------------------------------------------------------------------
create or replace function public.job_enqueue(
  p_kind            text,
  p_payload         jsonb default '{}'::jsonb,
  p_queue           text default 'default',
  p_priority        int default 0,
  p_run_after       timestamptz default now(),
  p_max_attempts    int default 5,
  p_idempotency_key text default null,
  p_correlation_id  uuid default null,
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id  uuid;
  v_org uuid := coalesce(p_organization_id, public.crm_current_organization_id());
begin
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'job_enqueue: forbidden for role %', auth.role();
  end if;
  if coalesce(p_kind, '') = '' then
    raise exception 'job_enqueue: kind is required';
  end if;

  insert into public.job_queue (
    organization_id, queue, kind, priority, payload,
    max_attempts, idempotency_key, run_after, correlation_id, created_by
  ) values (
    v_org, coalesce(nullif(p_queue, ''), 'default'), p_kind, coalesce(p_priority, 0), coalesce(p_payload, '{}'::jsonb),
    greatest(coalesce(p_max_attempts, 5), 1), p_idempotency_key, coalesce(p_run_after, now()), p_correlation_id, auth.uid()
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null and p_idempotency_key is not null then
    select id into v_id from public.job_queue where idempotency_key = p_idempotency_key;
  end if;

  return v_id;
end;
$$;

revoke all on function public.job_enqueue(text, jsonb, text, int, timestamptz, int, text, uuid, uuid) from public, anon;
grant  execute on function public.job_enqueue(text, jsonb, text, int, timestamptz, int, text, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. job_claim() — atomically lease the next runnable job (workers only)
--    * refuses while the kill switch is engaged
--    * FOR UPDATE SKIP LOCKED => safe concurrent draining
--    * increments attempts and sets a lease that heartbeats must extend
-- ---------------------------------------------------------------------------
create or replace function public.job_claim(
  p_queue        text default 'default',
  p_worker       text default null,
  p_lease_seconds int default 60,
  p_kinds        text[] default null
)
returns setof public.job_queue
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_worker text := coalesce(nullif(p_worker, ''), 'worker:' || coalesce(auth.uid()::text, 'service'));
  v_lease  int  := greatest(coalesce(p_lease_seconds, 60), 5);
begin
  if public.ai_is_killed() then
    return;  -- frozen: hand out nothing
  end if;

  return query
  with next_job as (
    select id
      from public.job_queue
     where queue = coalesce(nullif(p_queue, ''), 'default')
       and status in ('queued','retrying')
       and run_after <= now()
       and (p_kinds is null or kind = any(p_kinds))
     order by priority desc, run_after, created_at
     for update skip locked
     limit 1
  )
  update public.job_queue j
     set status           = 'running',
         attempts         = j.attempts + 1,
         locked_by        = v_worker,
         locked_at        = now(),
         lease_expires_at = now() + make_interval(secs => v_lease),
         heartbeat_at     = now(),
         started_at       = coalesce(j.started_at, now())
    from next_job
   where j.id = next_job.id
  returning j.*;
end;
$$;

revoke all on function public.job_claim(text, text, int, text[]) from public, anon, authenticated;
grant  execute on function public.job_claim(text, text, int, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- 5. job_heartbeat() — extend the lease of a job a worker still holds
-- ---------------------------------------------------------------------------
create or replace function public.job_heartbeat(
  p_id            uuid,
  p_worker        text default null,
  p_lease_seconds int default 60
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_found boolean;
  v_lease int := greatest(coalesce(p_lease_seconds, 60), 5);
begin
  update public.job_queue
     set heartbeat_at     = now(),
         lease_expires_at = now() + make_interval(secs => v_lease)
   where id = p_id
     and status = 'running'
     and (p_worker is null or locked_by = p_worker)
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;

revoke all on function public.job_heartbeat(uuid, text, int) from public, anon, authenticated;
grant  execute on function public.job_heartbeat(uuid, text, int) to service_role;

-- ---------------------------------------------------------------------------
-- 6. job_complete() — mark a claimed job done
-- ---------------------------------------------------------------------------
create or replace function public.job_complete(
  p_id     uuid,
  p_result jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_found boolean;
begin
  update public.job_queue
     set status           = 'done',
         result           = coalesce(p_result, '{}'::jsonb),
         finished_at      = now(),
         locked_by        = null,
         lease_expires_at = null,
         last_error       = null
   where id = p_id
     and status = 'running'
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;

revoke all on function public.job_complete(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.job_complete(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 7. job_fail() — record a failure; retry with exponential backoff or give up
-- ---------------------------------------------------------------------------
create or replace function public.job_fail(
  p_id    uuid,
  p_error text,
  p_retry boolean default true
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_job    public.job_queue;
  v_status text;
  v_backoff int;
begin
  select * into v_job from public.job_queue where id = p_id and status = 'running' for update;
  if not found then
    return null;
  end if;

  if p_retry and v_job.attempts < v_job.max_attempts then
    -- exponential backoff: 5 * 2^attempts seconds, capped at 1 hour
    v_backoff := least((5 * power(2, v_job.attempts))::int, 3600);
    update public.job_queue
       set status           = 'retrying',
           last_error       = p_error,
           run_after        = now() + make_interval(secs => v_backoff),
           locked_by        = null,
           lease_expires_at = null
     where id = p_id;
    v_status := 'retrying';
  else
    update public.job_queue
       set status           = 'failed',
           last_error       = p_error,
           finished_at      = now(),
           locked_by        = null,
           lease_expires_at = null
     where id = p_id;
    v_status := 'failed';
  end if;

  return v_status;
end;
$$;

revoke all on function public.job_fail(uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.job_fail(uuid, text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 8. job_reap_stalled() — crash-resume: requeue jobs whose lease expired
--    A worker that crashes never completes, fails, or heartbeats — its lease
--    lapses and this reclaims the job (retry if attempts remain, else fail).
-- ---------------------------------------------------------------------------
create or replace function public.job_reap_stalled(
  p_grace_seconds int default 0
)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count int;
begin
  with stalled as (
    select id, attempts, max_attempts
      from public.job_queue
     where status = 'running'
       and lease_expires_at is not null
       and lease_expires_at < now() - make_interval(secs => greatest(coalesce(p_grace_seconds, 0), 0))
     for update skip locked
  )
  update public.job_queue j
     set status           = case when s.attempts < s.max_attempts then 'retrying' else 'failed' end,
         last_error       = 'lease expired (stalled worker reaped)',
         run_after        = case when s.attempts < s.max_attempts then now() else j.run_after end,
         finished_at      = case when s.attempts < s.max_attempts then null else now() end,
         locked_by        = null,
         lease_expires_at = null
    from stalled s
   where j.id = s.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.job_reap_stalled(int) from public, anon, authenticated;
grant  execute on function public.job_reap_stalled(int) to service_role;

-- ---------------------------------------------------------------------------
-- 9. job_cancel() — operator cancels a job that has not finished
-- ---------------------------------------------------------------------------
create or replace function public.job_cancel(
  p_id     uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_found boolean;
begin
  if auth.role() = 'authenticated' and not (public.is_role('admin') or public.is_role('manager')) then
    raise exception 'job_cancel: requires admin or manager';
  end if;

  update public.job_queue
     set status           = 'cancelled',
         last_error       = coalesce(p_reason, last_error),
         finished_at      = now(),
         locked_by        = null,
         lease_expires_at = null
   where id = p_id
     and status in ('queued','retrying','running')
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;

revoke all on function public.job_cancel(uuid, text) from public, anon;
grant  execute on function public.job_cancel(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Automatic stalled-job reaping (pg_cron, guarded — no-op without cron)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule('crm_os_job_reap_stalled')
      where exists (select 1 from cron.job where jobname = 'crm_os_job_reap_stalled');
    perform cron.schedule('crm_os_job_reap_stalled', '* * * * *',
      $cron$ select public.job_reap_stalled(30); $cron$);
  end if;
exception when others then
  -- cron not available / insufficient privilege in this environment: skip silently
  null;
end $$;

commit;
