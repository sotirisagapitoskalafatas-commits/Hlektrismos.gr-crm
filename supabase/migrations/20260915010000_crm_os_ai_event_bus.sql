-- =============================================================================
-- CRM OS — AI Event Bus v2 (M1)
-- -----------------------------------------------------------------------------
-- Additive hardening of the existing append-only business_events backbone to
-- the full event-bus shape required by the AI workforce design:
--   * organization_id (scoping)
--   * event_version (schema evolution of payloads)
--   * correlation_id / causation_id (traceability across AI task chains)
--   * source (crm|automation|ai|webhook|integration|system)
--   * event_types registry (canonical taxonomy, advisory for legacy writers,
--     STRICT for the emit_business_event() RPC)
--   * emit_business_event() — the single canonical write path (idempotent,
--     actor-derived, pg_notify published)
--   * business_event_notify — pg_notify('business_event_published', ...)
--
-- Rules: ADDITIVE only, IDEMPOTENT, RLS on, mirrors existing repo conventions.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Extend business_events (ADDITIVE only)
-- ---------------------------------------------------------------------------
alter table public.business_events
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists event_version    int not null default 1,
  add column if not exists correlation_id   uuid,
  add column if not exists causation_id     uuid,
  add column if not exists source           text not null default 'crm';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'business_events_version_ck' and conrelid = 'public.business_events'::regclass) then
    alter table public.business_events
      add constraint business_events_version_ck check (event_version >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'business_events_source_ck' and conrelid = 'public.business_events'::regclass) then
    alter table public.business_events
      add constraint business_events_source_ck check (source in ('crm','automation','ai','webhook','integration','system'));
  end if;
end $$;

create index if not exists business_events_org_idx         on public.business_events (organization_id, created_at desc);
create index if not exists business_events_correlation_idx on public.business_events (correlation_id) where correlation_id is not null;

-- ---------------------------------------------------------------------------
-- 2. event_types — canonical registry
-- ---------------------------------------------------------------------------
create table if not exists public.event_types (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  version      int  not null default 1,
  applies_to   text,                       -- lead | customer | case | workflow | ai | communication | field | finance | market | system
  description  text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table public.event_types enable row level security;

do $$
begin
  execute 'drop policy if exists "Service role full access on event_types" on public.event_types';
  execute 'create policy "Service role full access on event_types" on public.event_types for all to service_role using (true) with check (true)';
  execute 'drop policy if exists "authenticated read event_types" on public.event_types';
  execute 'create policy "authenticated read event_types" on public.event_types for select to authenticated using (true)';
  execute 'drop policy if exists "admin insert event_types" on public.event_types';
  execute 'create policy "admin insert event_types" on public.event_types for insert to authenticated with check (public.is_role(''admin'') or public.is_role(''manager''))';
  execute 'drop policy if exists "admin update event_types" on public.event_types';
  execute 'create policy "admin update event_types" on public.event_types for update to authenticated using (public.is_role(''admin'') or public.is_role(''manager'')) with check (public.is_role(''admin'') or public.is_role(''manager''))';
end $$;

-- Registry v1 seeds: the full planned taxonomy PLUS the three legacy types the
-- user_roles_audit trigger already emits today (RoleGranted/Changed/Revoked).
insert into public.event_types (key, version, applies_to, description) values
  -- Lead lifecycle
  ('LeadCreated',            1, 'lead',            'New lead entered the CRM'),
  ('LeadContacted',          1, 'lead',            'Lead was contacted (any channel)'),
  ('LeadQualified',          1, 'lead',            'Lead passed qualification'),
  ('LeadMeetingBooked',      1, 'lead',            'Meeting scheduled'),
  ('LeadOfferSent',          1, 'lead',            'Offer proposal sent'),
  ('LeadConverted',          1, 'lead',            'Lead converted to customer'),
  ('LeadLost',               1, 'lead',            'Lead marked lost'),
  ('LeadReassigned',         1, 'lead',            'Lead ownership changed'),
  ('LeadPaused',             1, 'lead',            'Lead paused (e.g. AI kill switch, complaint)'),
  -- Customer lifecycle
  ('CustomerCreated',        1, 'customer',        'Customer record created'),
  ('CustomerOnboarded',      1, 'customer',        'Onboarding completed'),
  ('CustomerActive',         1, 'customer',        'Customer entered active state'),
  ('CustomerAtRisk',         1, 'customer',        'Customer flagged at risk'),
  ('CustomerChurned',        1, 'customer',        'Customer churned'),
  ('CustomerWinBack',        1, 'customer',        'Win-back engagement started'),
  ('ContractRenewalDue',     1, 'customer',        'Contract renewal deadline approaching'),
  ('ContractExpired',        1, 'customer',        'Contract expired'),
  -- Case lifecycle
  ('CaseCreated',            1, 'case',            'Case/request opened'),
  ('CaseStageChanged',       1, 'case',            'Case stage transitioned'),
  ('CaseAssigned',           1, 'case',            'Case assigned/ownership set'),
  ('CaseResolved',           1, 'case',            'Case resolved'),
  ('CaseEscalated',          1, 'case',            'Case escalated (human/manager)'),
  ('ComplaintOpened',        1, 'case',            'Customer complaint opened'),
  -- Finance
  ('PaymentReceived',        1, 'finance',         'Payment recorded'),
  ('CommissionPosted',       1, 'finance',         'Commission ledger entry posted'),
  ('RevenueRecorded',        1, 'finance',         'Revenue event recorded'),
  ('InvoiceSent',            1, 'finance',         'Invoice sent to customer'),
  -- Communication
  ('MessagePrepared',        1, 'communication',   'Outbound message drafted/prepared'),
  ('MessageDraftApproved',   1, 'communication',   'Outbound draft approved'),
  ('MessageSent',            1, 'communication',   'Outbound message sent'),
  ('MessageDelivered',       1, 'communication',   'Message delivery confirmed'),
  ('MessageFailed',          1, 'communication',   'Message send/delivery failed'),
  ('MessageCoalesced',       1, 'communication',   'Pending messages merged into one send'),
  ('OptOutReceived',         1, 'communication',   'Customer opted out of a channel'),
  ('ConsentUpdated',         1, 'communication',   'Customer consent state changed'),
  -- Field
  ('CheckInAccepted',        1, 'field',           'Field check-in accepted'),
  ('CheckInRejected',        1, 'field',           'Field check-in rejected'),
  ('VisitCompleted',         1, 'field',           'Field visit completed'),
  ('RoutePlanned',           1, 'field',           'Route planned/optimized'),
  -- Workflow / Automation
  ('AutomationTriggered',    1, 'workflow',        'Automation definition triggered'),
  ('AutomationNodeCompleted', 1, 'workflow',       'Workflow node completed'),
  ('AutomationCompleted',    1, 'workflow',        'Workflow execution completed'),
  ('AutomationPaused',       1, 'workflow',        'Workflow paused'),
  ('AutomationRetried',      1, 'workflow',        'Workflow node retried'),
  ('AutomationCompensated',  1, 'workflow',        'Workflow compensation executed'),
  ('ApprovalRequested',      1, 'workflow',        'Approval requested'),
  ('ApprovalDecision',       1, 'workflow',        'Approval decided'),
  ('EscalationRaised',       1, 'workflow',        'Escalation raised'),
  ('TaskCreated',            1, 'workflow',        'Work item created'),
  ('TaskCompleted',          1, 'workflow',        'Work item completed'),
  -- AI operations
  ('AiTaskCreated',          1, 'ai',              'AI task created'),
  ('AiTaskApproved',         1, 'ai',              'AI task approved for execution'),
  ('AiTaskBlocked',          1, 'ai',              'AI task blocked by policy'),
  ('AiTaskEscalated',        1, 'ai',              'AI task escalated'),
  ('AiRecommendationMade',   1, 'ai',              'Shadow-mode recommendation produced'),
  ('AiRunCosted',            1, 'ai',              'AI run cost recorded'),
  ('AiError',                1, 'ai',              'AI run error recorded'),
  ('HumanHandoff',           1, 'ai',              'AI workload handed to a human'),
  -- Journeys
  ('JourneyEnrolled',        1, 'customer',        'Customer enrolled in a journey'),
  ('JourneyStageEntered',    1, 'customer',        'Journey stage entered'),
  ('JourneyPaused',          1, 'customer',        'Journey paused (e.g. complaint)'),
  ('JourneyExited',          1, 'customer',        'Journey exited'),
  -- System
  ('MigrationApplied',       1, 'system',          'Schema migration applied'),
  ('SchemaChange',           1, 'system',          'Schema drift/change recorded'),
  ('IntegrationStatusChanged', 1, 'system',        'External integration status changed'),
  -- Market
  ('TariffUpdated',          1, 'market',          'Tariff catalog updated'),
  ('ProviderCatalogChanged', 1, 'market',          'Provider catalog changed'),
  -- Legacy (already emitted by user_roles_audit trigger)
  ('RoleGranted',            1, 'system',          'Role granted to a user'),
  ('RoleChanged',            1, 'system',          'Role changed for a user'),
  ('RoleRevoked',            1, 'system',          'Role revoked from a user')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. emit_business_event() — the canonical write path
--    * register the event_type first (strict registry)
--    * caller must be authenticated or service_role
--    * actor derived from JWT unless explicitly provided (agent/webhook/system)
--    * idempotency honored (same key returns the same event id)
-- ---------------------------------------------------------------------------
create or replace function public.emit_business_event(
  p_event_type      text,
  p_entity_type     text default null,
  p_entity_id       uuid default null,
  p_payload         jsonb default '{}'::jsonb,
  p_organization_id uuid default null,
  p_correlation_id  uuid default null,
  p_causation_id    uuid default null,
  p_source          text default 'crm',
  p_actor_type      text default null,
  p_agent_id        uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org         uuid := coalesce(p_organization_id, public.crm_current_organization_id());
  v_actor_type  text;
  v_actor_id    uuid;
  v_key         text := coalesce(p_idempotency_key, gen_random_uuid()::text);
  v_version     int;
  v_id          uuid;
begin
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'emit_business_event: forbidden for role %', auth.role();
  end if;

  if coalesce(p_entity_type, '') <> '' and p_entity_id is null then
    raise exception 'emit_business_event: entity_type given without entity_id';
  end if;

  select version into v_version
    from public.event_types
   where key = p_event_type and is_active;
  if v_version is null then
    raise exception 'emit_business_event: unknown or inactive event_type "%"', p_event_type;
  end if;

  if p_actor_type is not null then
    v_actor_type := p_actor_type;
  elsif p_agent_id is not null then
    v_actor_type := 'agent';
  elsif auth.uid() is not null then
    v_actor_type := 'user';
    v_actor_id  := auth.uid();
  else
    v_actor_type := 'system';
  end if;

  insert into public.business_events (
    idempotency_key, event_type, event_version, entity_type, entity_id,
    actor_type, actor_id, agent_id, organization_id,
    correlation_id, causation_id, source, payload
  ) values (
    v_key, p_event_type, v_version, nullif(p_entity_type, ''), p_entity_id,
    v_actor_type, v_actor_id, p_agent_id, v_org,
    p_correlation_id, p_causation_id, coalesce(nullif(p_source, ''), 'crm'),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.business_events where idempotency_key = v_key;
  end if;

  return v_id;
end;
$$;

revoke all on function public.emit_business_event(text, text, uuid, jsonb, uuid, uuid, uuid, text, text, uuid, text) from public, anon;
grant  execute on function public.emit_business_event(text, text, uuid, jsonb, uuid, uuid, uuid, text, text, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. pg_notify publication — feed for realtime consumers / edge subscribers
-- ---------------------------------------------------------------------------
create or replace function public.business_event_notify()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  perform pg_notify('business_event_published',
    json_build_object(
      'id',             new.id,
      'event_type',     new.event_type,
      'event_version',  new.event_version,
      'entity_type',    new.entity_type,
      'entity_id',      new.entity_id,
      'organization_id', new.organization_id,
      'correlation_id', new.correlation_id,
      'actor_type',     new.actor_type,
      'source',         new.source,
      'created_at',     new.created_at
    )::text);
  return new;
end;
$$;

drop trigger if exists business_event_notify on public.business_events;
create trigger business_event_notify
  after insert on public.business_events
  for each row execute function public.business_event_notify();

commit;