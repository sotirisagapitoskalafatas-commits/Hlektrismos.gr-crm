-- =============================================================================
-- CRM OS — AI Policy Engine & Tool Foundation (M2)
-- -----------------------------------------------------------------------------
-- The deterministic decision layer the AI workforce runs under, plus the
-- executable tool surface it may call. Design requirements (per AUTOMATION-OS-
-- AI-WORKFORCE.md §9/§10):
--   * DEFAULT-DENY — no rule matched ⇒ deny
--   * hard-deny set is BUILT INTO evaluate_policy() and cannot be overridden
--   * allow / require_approval / deny; most-specific rule (org over global,
--     priority, newest) wins
--   * conditions are declarative jsonb (risk_max, amount_max, consent_required,
--     channel, autonomy_max) — a failed condition on an ALLOW escalates to
--     REQUIRE_APPROVAL, never silently downgrades a DENY
--   * effective_autonomy = min(requested, org cap, agent cap, rule cap)
--   * tools registry + append-only tool_call_log (actor, org, outcome)
--   * consent_records — customer channel consent used by the governor
--
-- Rules: ADDITIVE only, IDEMPOTENT, RLS on, mirrors existing repo conventions.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. tools — the executable surface for the AI workforce (gateway-driven)
-- ---------------------------------------------------------------------------
create table if not exists public.tools (
  id                   uuid primary key default gen_random_uuid(),
  key                  text not null unique,
  name                 text not null,
  description          text,
  category             text not null default 'crm_read'
                       check (category in ('crm_read','crm_write','communication','analytics','admin')),
  handler              text not null,
  required_permission  text,             -- e.g. 'communicate' — governor/policy gates on it
  request_schema       jsonb not null default '{}'::jsonb,
  response_schema      jsonb not null default '{}'::jsonb,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.tools enable row level security;

do $$
begin
  execute 'drop policy if exists "Service role full access on tools" on public.tools';
  execute 'create policy "Service role full access on tools" on public.tools for all to service_role using (true) with check (true)';
  execute 'drop policy if exists "authenticated read tools" on public.tools';
  execute 'create policy "authenticated read tools" on public.tools for select to authenticated using (true)';
  execute 'drop policy if exists "admin write tools" on public.tools';
  execute 'create policy "admin write tools" on public.tools for insert to authenticated with check (public.is_role(''admin''))';
  execute 'drop policy if exists "admin update tools" on public.tools';
  execute 'create policy "admin update tools" on public.tools for update to authenticated using (public.is_role(''admin'')) with check (public.is_role(''admin''))';
end $$;

-- ---------------------------------------------------------------------------
-- 2. tool_call_log — append-only audit trail of every tool invocation
-- ---------------------------------------------------------------------------
create table if not exists public.tool_call_log (
  id               uuid primary key default gen_random_uuid(),
  tool_id          uuid references public.tools(id) on delete set null,
  tool_key         text not null,
  caller_type      text not null check (caller_type in ('user','agent','system')),
  caller_id        uuid,
  organization_id  uuid references public.organizations(id) on delete set null,
  request          jsonb not null default '{}'::jsonb,
  response         jsonb,
  error            text,
  status           text not null default 'success'
                   check (status in ('success','error','denied','approved')),
  decision_id      uuid,               -- approval_request/ai_tasks reference (later)
  latency_ms       int,
  created_at       timestamptz not null default now()
);

alter table public.tool_call_log enable row level security;

do $$
begin
  execute 'drop policy if exists "Service role full access on tool_call_log" on public.tool_call_log';
  execute 'create policy "Service role full access on tool_call_log" on public.tool_call_log for all to service_role using (true) with check (true)';
  execute 'drop policy if exists "authenticated own tool_call_log" on public.tool_call_log';
  execute 'create policy "authenticated own tool_call_log" on public.tool_call_log for select to authenticated using (caller_type = ''user'' and caller_id = auth.uid())';
  execute 'drop policy if exists "staff read tool_call_log" on public.tool_call_log';
  execute 'create policy "staff read tool_call_log" on public.tool_call_log for select to authenticated using (public.is_role(''admin'') or public.is_role(''manager'') or public.is_role(''back_office''))';
end $$;

create index if not exists tool_call_log_org_idx     on public.tool_call_log (organization_id, created_at desc);
create index if not exists tool_call_log_tool_idx    on public.tool_call_log (tool_key, created_at desc);
create index if not exists tool_call_log_caller_idx  on public.tool_call_log (caller_type, caller_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. policy_rules — the decision matrix (global defaults + org overrides)
-- ---------------------------------------------------------------------------
create table if not exists public.policy_rules (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,  -- null = global
  scope            text     not null default 'all' check (scope in ('all','role','agent')),
  subject_key      text,                                                        -- role key or agent key when scope <> 'all'
  resource         text     not null,   -- action key (send_message, change_pricing) or tool key
  effect           text     not null   check (effect in ('allow','require_approval','deny')),
  priority         int      not null default 0,
  conditions       jsonb    not null default '{}'::jsonb,
  notes            text,
  is_active        boolean  not null default true,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (scope = 'all' or subject_key is not null),
  check (scope <> 'all' or subject_key is null)
);

alter table public.policy_rules enable row level security;

do $$
begin
  execute 'drop policy if exists "Service role full access on policy_rules" on public.policy_rules';
  execute 'create policy "Service role full access on policy_rules" on public.policy_rules for all to service_role using (true) with check (true)';
  execute 'drop policy if exists "authenticated read policy_rules" on public.policy_rules';
  execute 'create policy "authenticated read policy_rules" on public.policy_rules for select to authenticated using (true)';
  execute 'drop policy if exists "admin write policy_rules" on public.policy_rules';
  execute 'create policy "admin write policy_rules" on public.policy_rules for insert to authenticated with check (public.is_role(''admin'') or public.is_role(''manager''))';
  execute 'drop policy if exists "admin update policy_rules" on public.policy_rules';
  execute 'create policy "admin update policy_rules" on public.policy_rules for update to authenticated using (public.is_role(''admin'') or public.is_role(''manager'')) with check (public.is_role(''admin'') or public.is_role(''manager''))';
end $$;

create index if not exists policy_rules_resource_idx   on public.policy_rules (resource, is_active);
create index if not exists policy_rules_subject_idx    on public.policy_rules (scope, subject_key, is_active);

-- ---------------------------------------------------------------------------
-- 4. consent_records — customer channel consent (governor input)
-- ---------------------------------------------------------------------------
create table if not exists public.consent_records (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  customer_id        uuid not null references public.customers(id) on delete cascade,
  channel            text not null check (channel in ('email','sms','phone','letter','all')),
  consent_type       text not null default 'marketing' check (consent_type in ('marketing','transactional','outbound_call','all')),
  status             text not null check (status in ('granted','revoked')),
  consent_granted_at timestamptz,
  consent_revoked_at timestamptz,
  source             text,             -- web_form | crm | ai_capture | api
  created_by         uuid,
  created_at         timestamptz not null default now(),
  unique (customer_id, channel, consent_type)
);

alter table public.consent_records enable row level security;

do $$
begin
  execute 'drop policy if exists "Service role full access on consent_records" on public.consent_records';
  execute 'create policy "Service role full access on consent_records" on public.consent_records for all to service_role using (true) with check (true)';
  execute 'drop policy if exists "staff read consent_records" on public.consent_records';
  execute 'create policy "staff read consent_records" on public.consent_records for select to authenticated using (public.is_role(''admin'') or public.is_role(''manager'') or public.is_role(''back_office'') or public.is_role(''inside_sales'') or public.is_role(''field_sales''))';
  execute 'drop policy if exists "staff write consent_records" on public.consent_records';
  execute 'create policy "staff write consent_records" on public.consent_records for insert to authenticated with check (public.is_role(''admin'') or public.is_role(''manager'') or public.is_role(''back_office''))';
  execute 'drop policy if exists "staff update consent_records" on public.consent_records';
  execute 'create policy "staff update consent_records" on public.consent_records for update to authenticated using (public.is_role(''admin'') or public.is_role(''manager'') or public.is_role(''back_office'')) with check (public.is_role(''admin'') or public.is_role(''manager'') or public.is_role(''back_office''))';
end $$;

create index if not exists consent_records_org_idx on public.consent_records (organization_id, customer_id);

-- ---------------------------------------------------------------------------
-- 5. evaluate_policy() — the deterministic decision engine
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_policy(
  p_subject_type text,               -- 'user' | 'agent' | 'system'
  p_subject_key  text,               -- role key (user) or agent key (agent)
  p_action       text,               -- action or tool key
  p_target       text default null,  -- optional target (channel, entity type...)
  p_context      jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org        uuid := public.crm_current_organization_id();
  v_rule       record;
  v_effect     text;
  v_reasons    text[] := '{}'::text[];
  v_risk       text;
  v_risk_ord   int;
  v_failed     boolean := false;
  v_autonomy   int;
  v_rule_autonomy int;
  v_org_autonomy  int;
  v_agent_autonomy int;
  v_channel    text;
  v_conditions jsonb;
  v_consent    boolean;
begin
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'evaluate_policy: forbidden for role %', auth.role();
  end if;
  if p_action is null or p_action = '' then
    raise exception 'evaluate_policy: p_action is required';
  end if;

  -- 5.1 hard-deny set: built-in, cannot be overridden by any rule
  if p_action in ('access_credentials','extract_secrets','arbitrary_code_execution','cross_tenant_access','destructive_db_action') then
    return jsonb_build_object(
      'effect', 'deny',
      'risk', 'critical',
      'effective_autonomy', 0,
      'reasons', jsonb_build_array('builtin hard-deny'),
      'rule_id', null,
      'matched_rule', null,
      'evaluated_at', now()
    );
  end if;

  -- 5.2 most-specific matching rule (org override > global override; then priority; then newest)
  select * into v_rule
    from public.policy_rules
   where is_active
     and (organization_id is null or organization_id = v_org)
     and ((scope = 'all')
          or (scope in ('role','agent') and subject_key = p_subject_key))
     and (resource = p_action or (p_target is not null and resource = p_target))
   order by (organization_id is not null) desc, priority desc, created_at desc
   limit 1;

  v_conditions := coalesce(v_rule.conditions, '{}'::jsonb);

  if v_rule is null then
    v_effect := 'deny';
    v_reasons := array_append(v_reasons, 'no policy rule matched (default-deny)');
  else
    v_effect := v_rule.effect;
    v_reasons := array_append(v_reasons, format('rule %s (%s => %s)', v_rule.id, v_rule.resource, v_rule.effect));
  end if;

  -- 5.3 deterministic risk classification (keywords on the action/target)
  if lower(coalesce(p_action, '') || ' ' || coalesce(p_target, '')) ~ '(password|secret|credential|token|credit|api.?key)' then
    v_risk := 'critical';
  elsif lower(coalesce(p_action, '') || ' ' || coalesce(p_target, '')) ~ '(cancel|financial|pricing|price|owner|privacy|payment|offer|campaign)' then
    v_risk := 'high';
  elsif lower(coalesce(p_action, '') || ' ' || coalesce(p_target, '')) ~ '(send|message|email|sms|communicate|call|schedule)' then
    v_risk := 'medium';
  else
    v_risk := 'low';
  end if;
  v_risk_ord := case v_risk when 'low' then 0 when 'medium' then 1 when 'high' then 2 when 'critical' then 3 else 0 end;

  -- 5.4 declarative condition checks (failures escalate ALLOW to REQUIRE_APPROVAL)
  v_failed := false;

  if v_conditions ? 'risk_max' and v_risk_ord > (v_conditions->>'risk_max')::int then
    v_failed := true;
    v_reasons := array_append(v_reasons, format('risk %s exceeds risk_max %s', v_risk, v_conditions->>'risk_max'));
  end if;

  if v_conditions ? 'amount_max'
     and coalesce((p_context->>'amount')::numeric, 0) > (v_conditions->>'amount_max')::numeric then
    v_failed := true;
    v_reasons := array_append(v_reasons, format('amount %s exceeds amount_max %s', p_context->>'amount', v_conditions->>'amount_max'));
  end if;

  if coalesce(v_conditions->>'consent_required', 'false')::boolean then
    if p_context ? 'consent' and jsonb_typeof(p_context->'consent') = 'boolean' then
      v_consent := (p_context->>'consent')::boolean;
    else
      v_consent := false;
    end if;
    if not coalesce(v_consent, false) then
      v_failed := true;
      v_reasons := array_append(v_reasons, 'consent_required but consent not granted');
    end if;
  end if;

  if v_conditions ? 'channel' then
    v_channel := coalesce(p_context->>'channel', '');
    if not exists (select 1 from jsonb_array_elements_text(v_conditions->'channel') c where c = v_channel) then
      v_failed := true;
      v_reasons := array_append(v_reasons, format('channel %L not allowed %s', v_channel, v_conditions->>'channel'));
    end if;
  end if;

  if v_failed and v_effect = 'allow' then
    v_effect := 'require_approval';
    v_reasons := array_append(v_reasons, 'condition failure escalated allow -> require_approval');
  end if;

  -- 5.5 effective_autonomy = min(requested, rule cap, org cap, agent cap)
  v_rule_autonomy    := coalesce(nullif(v_conditions->>'autonomy_max', '')::int, 5);
  v_org_autonomy     := 5;
  v_agent_autonomy   := 5;
  v_autonomy         := least(least(coalesce((p_context->>'autonomy_level')::int, 1), v_rule_autonomy), least(v_org_autonomy, v_agent_autonomy));
  if v_effect = 'deny' then
    v_autonomy := 0;
  end if;

  return jsonb_build_object(
    'effect',             v_effect,
    'risk',               v_risk,
    'effective_autonomy', v_autonomy,
    'reasons',            to_jsonb(v_reasons),
    'rule_id',            case when v_rule is null then null else v_rule.id end,
    'matched_rule',       case when v_rule is null then null else
                           jsonb_build_object('resource', v_rule.resource, 'scope', v_rule.scope, 'subject_key', v_rule.subject_key, 'effect', v_rule.effect) end,
    'evaluated_at',       now()
  );
end;
$$;

revoke all on function public.evaluate_policy(text, text, text, text, jsonb) from public, anon;
grant  execute on function public.evaluate_policy(text, text, text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Seeds — Sales Development AI starter tool surface (fixed ids => idempotent)
-- ---------------------------------------------------------------------------
insert into public.tools (id, key, name, description, category, handler, required_permission) values
  ('00000000-0000-0000-0000-000000000001', 'getLead',         'Get Lead',          'Fetch a lead by id with contacts',             'crm_read',       'crud:crm', null),
  ('00000000-0000-0000-0000-000000000002', 'getCustomer360',  'Customer 360',       'Customer profile, cases, communications',      'crm_read',       'crud:crm', null),
  ('00000000-0000-0000-0000-000000000003', 'getPipeline',     'Pipeline Snapshot',  'Stage funnel counts any range',                'crm_read',       'crud:crm', null),
  ('00000000-0000-0000-0000-000000000004', 'getTodayWork',    'Today''s Work',      'Todays check-ins, cases, follow-ups',          'crm_read',       'crud:crm', null),
  ('00000000-0000-0000-0000-000000000005', 'searchCRM',       'CRM Search',         'Search leads/customers across fields',         'crm_read',       'crud:crm', null),
  ('00000000-0000-0000-0000-000000000006', 'createTask',      'Create Task',        'Create a work item / task',                    'crm_write',      'crud:crm', null),
  ('00000000-0000-0000-0000-000000000007', 'createFollowUp',  'Create Follow-up',   'Schedule a follow-up with a lead/customer',    'crm_write',      'crud:crm', null),
  ('00000000-0000-0000-0000-000000000008', 'createApproval',  'Create Approval',    'Request human approval for an action',         'crm_write',      'crud:crm', null),
  ('00000000-0000-0000-0000-000000000009', 'sendMessage',     'Send Message',       'Send an outbound message on a channel',        'communication',  'comms:out', 'communicate')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Seeds — default policy matrix (global; org per-org rules can override)
-- ---------------------------------------------------------------------------
insert into public.policy_rules (id, organization_id, scope, subject_key, resource, effect, priority, conditions, notes) values
  -- ALLOW — internal CRM work (no external side effects)
  ('00000000-0000-0000-0000-000000100001', null, 'all', null, 'create_task',          'allow', 10, '{}', 'Mission work: create internal task'),
  ('00000000-0000-0000-0000-000000100002', null, 'all', null, 'summarize_customer',   'allow', 10, '{}', 'Read-only synthesis'),
  ('00000000-0000-0000-0000-000000100003', null, 'all', null, 'prepare_follow_up',    'allow', 10, '{}', 'Draft only, no send'),
  ('00000000-0000-0000-0000-000000100004', null, 'all', null, 'analyze_customer',     'allow', 10, '{}', 'Read-only analysis'),
  ('00000000-0000-0000-0000-000000100005', null, 'all', null, 'recommend_next_action','allow', 10, '{}', 'Shadow-mode recommendation'),
  ('00000000-0000-0000-0000-000000100006', null, 'all', null, 'getLead',              'allow', 10, '{}', 'CRM read tool'),
  ('00000000-0000-0000-0000-000000100007', null, 'all', null, 'getCustomer360',       'allow', 10, '{}', 'CRM read tool'),
  ('00000000-0000-0000-0000-000000100008', null, 'all', null, 'getPipeline',          'allow', 10, '{}', 'CRM read tool'),
  ('00000000-0000-0000-0000-000000100009', null, 'all', null, 'getTodayWork',         'allow', 10, '{}', 'CRM read tool'),
  ('00000000-0000-0000-0000-000000100010', null, 'all', null, 'searchCRM',            'allow', 10, '{}', 'CRM read tool'),
  ('00000000-0000-0000-0000-000000100011', null, 'all', null, 'createFollowUp',       'allow', 10, '{}', 'Creates a work item only'),
  ('00000000-0000-0000-0000-000000100012', null, 'all', null, 'createApproval',       'allow', 10, '{}', 'Creating an approval request is always allowed'),
  -- REQUIRE_APPROVAL — external or high-impact side effects
  ('00000000-0000-0000-0000-000000200001', null, 'all', null, 'send_message',          'require_approval', 20, '{"risk_max": 3}', 'External communication'),
  ('00000000-0000-0000-0000-000000200002', null, 'all', null, 'send_email',            'require_approval', 20, '{"risk_max": 3}', 'External email'),
  ('00000000-0000-0000-0000-000000200003', null, 'all', null, 'send_sms',              'require_approval', 20, '{"risk_max": 3}', 'External SMS'),
  ('00000000-0000-0000-0000-000000200004', null, 'all', null, 'schedule_meeting',      'require_approval', 20, '{"risk_max": 3}', 'External meeting invite'),
  ('00000000-0000-0000-0000-000000200005', null, 'all', null, 'change_owner',          'require_approval', 30, '{}', 'Ownership change'),
  ('00000000-0000-0000-0000-000000200006', null, 'all', null, 'change_pricing',        'require_approval', 30, '{}', 'Pricing change'),
  ('00000000-0000-0000-0000-000000200007', null, 'all', null, 'cancel_appointment',    'require_approval', 30, '{}', 'Cancellation'),
  ('00000000-0000-0000-0000-000000200008', null, 'all', null, 'run_campaign',          'require_approval', 40, '{}', 'Bulk campaign send'),
  ('00000000-0000-0000-0000-000000200009', null, 'all', null, 'financial_action',      'require_approval', 40, '{"risk_max": 2}', 'Money movement'),
  ('00000000-0000-0000-0000-000000200010', null, 'all', null, 'sendMessage',           'require_approval', 20, '{"risk_max": 3}', 'Tool key — external communication surface'),
  -- ALLOW — tool keys of the Sales Development AI starter surface
  ('00000000-0000-0000-0000-000000100013', null, 'all', null, 'createTask',            'allow', 10, '{}', 'Tool key — internal work item'),
  ('00000000-0000-0000-0000-000000100014', null, 'all', null, 'createFollowUp',        'allow', 10, '{}', 'Tool key — internal work item'),
  ('00000000-0000-0000-0000-000000100015', null, 'all', null, 'createApproval',        'allow', 10, '{}', 'Tool key — always allowed'),
  -- DENY — belt & braces alongside the built-in hard-deny set
  ('00000000-0000-0000-0000-000000300001', null, 'all', null, 'access_credentials',       'deny', 100, '{}', 'hard-deny'),
  ('00000000-0000-0000-0000-000000300002', null, 'all', null, 'extract_secrets',          'deny', 100, '{}', 'hard-deny'),
  ('00000000-0000-0000-0000-000000300003', null, 'all', null, 'arbitrary_code_execution', 'deny', 100, '{}', 'hard-deny'),
  ('00000000-0000-0000-0000-000000300004', null, 'all', null, 'cross_tenant_access',      'deny', 100, '{}', 'hard-deny'),
  ('00000000-0000-0000-0000-000000300005', null, 'all', null, 'destructive_db_action',    'deny', 100, '{}', 'hard-deny')
on conflict (id) do nothing;

commit;