-- =============================================================================
-- PRIORITY 1 — LEAD FOUNDATION
--
-- 1. Lead Pipeline enum (canonical, replaces legacy statuses)
-- 2. Immutable Lead attribution columns (source, campaign, created/assigned/
--    first_contact/referred/converted_by)
-- 3. Lead → Case lineage (cases.lead_id) + Case SLA/aging foundations
--    (stage_entered_at, next_action_owner_id)
-- 4. convert_lead_to_case() RPC — single SECURITY DEFINER write path that
--    preserves attribution and never duplicates records
-- 5. insert_website_lead() updated to the new enum + campaign attribution
-- 6. RLS: authenticated staff may now INSERT leads (manual entry)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) leads: canonical Lead Pipeline statuses
-- ---------------------------------------------------------------------------
alter table public.leads drop constraint if exists leads_status_check;

-- Remap legacy statuses before tightening the CHECK.
update public.leads set status = 'new'       where status = 'new_lead';
update public.leads set status = 'converted' where status = 'customer';

alter table public.leads
  add constraint leads_status_check check (
    status in (
      'new', 'contacted', 'qualified', 'meeting', 'offer', 'converted',
      'lost', 'unqualified', 'duplicate'
    )
  );

-- The table previously defaulted to 'New' which violated its own CHECK.
alter table public.leads alter column status set default 'new';

-- Canonical source vocabulary + legacy values so existing rows keep working.
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads
  add constraint leads_source_check check (
    source in (
      'website', 'inside_sales', 'field_sales', 'referral', 'partner',
      'campaign', 'import', 'other', 'contact'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) leads: attribution columns
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists campaign_id text,
  add column if not exists campaign_name text,
  add column if not exists source_label text,
  add column if not exists created_by_user_id uuid references public.profiles(id),
  add column if not exists assigned_to_user_id uuid references public.profiles(id),
  add column if not exists first_contact_user_id uuid references public.profiles(id),
  add column if not exists referred_by_user_id uuid references public.profiles(id),
  add column if not exists converted_by_user_id uuid references public.profiles(id),
  add column if not exists converted_at timestamptz,
  add column if not exists converted_case_id uuid references public.cases(id);

-- ---------------------------------------------------------------------------
-- 3) cases: Lead lineage + SLA/aging + next-action owner
-- ---------------------------------------------------------------------------
alter table public.cases
  add column if not exists lead_id uuid references public.leads(id),
  add column if not exists stage_entered_at timestamptz,
  add column if not exists next_action_owner_id uuid references public.profiles(id);

-- Backfill stage_entered_at for existing cases (they have no history).
update public.cases set stage_entered_at = created_at where stage_entered_at is null;

-- Stamps stage_entered_at whenever current_stage changes.
create or replace function public.bump_case_stage_entered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.current_stage is distinct from OLD.current_stage then
    NEW.stage_entered_at := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists cases_bump_stage_entered on public.cases;
create trigger cases_bump_stage_entered
  before update on public.cases
  for each row execute function public.bump_case_stage_entered();

-- ---------------------------------------------------------------------------
-- 4) convert_lead_to_case() — safe Lead → Case conversion preserving lineage
-- ---------------------------------------------------------------------------
create or replace function public.convert_lead_to_case(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead      public.leads%rowtype;
  v_customer  public.customers%rowtype;
  v_cust_id   uuid;
  v_case_id   uuid;
  v_full      text;
  v_service   text;
  v_actor     uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'auth.uid() is null';
  end if;
  if not public.is_staff() then
    raise exception 'forbidden: staff only';
  end if;

  select * into v_lead from public.leads where id = p_lead_id;
  if v_lead is null or v_lead.id is null then
    raise exception 'lead not found';
  end if;
  if v_lead.status = 'converted' or v_lead.converted_case_id is not null then
    raise exception 'lead already converted';
  end if;

  -- Best-effort full name.
  v_full := coalesce(
    nullif(btrim(coalesce(v_lead.full_name, '')), ''),
    nullif(btrim(coalesce(v_lead.first_name, '') || ' ' || coalesce(v_lead.last_name, '')), ''),
    nullif(btrim(coalesce(v_lead.client_name, '')), ''),
    'Νέος πελάτης'
  );

  -- Reuse an existing customer by phone/email when possible.
  select * into v_customer
  from public.customers
  where (v_lead.phone is not null and phone = v_lead.phone)
     or (v_lead.email is not null and email = v_lead.email)
  limit 1;

  if v_customer.id is null then
    insert into public.customers (full_name, email, phone)
    values (v_full, v_lead.email, v_lead.phone)
    returning * into v_customer;
  end if;
  v_cust_id := v_customer.id;

  -- Normalize the service category.
  v_service := case lower(coalesce(nullif(v_lead.service_category, ''), 'energy'))
    when 'energy' then 'energy'
    when 'ρεύμα' then 'energy'
    when 'gas' then 'gas'
    when 'αέριο' then 'gas'
    when 'solar' then 'solar'
    when 'φωτοβολταϊκά' then 'solar'
    when 'ev' then 'ev'
    when 'ηλεκτροκίνηση' then 'ev'
    when 'insurance' then 'insurance'
    when 'web' then 'web'
    else 'energy'
  end;

  -- Create the Case, carrying the lead's attribution.
  insert into public.cases (
    title,
    customer_id,
    source,
    service_type,
    property_type,
    current_stage,
    status,
    lead_id,
    owner_id,
    inside_sales_owner,
    created_by,
    stage_entered_at,
    notes
  ) values (
    v_full,
    v_cust_id,
    coalesce(v_lead.source, 'website'),
    v_service,
    v_lead.property_type,
    'new',
    'open',
    p_lead_id,
    v_actor,
    coalesce(v_lead.assigned_to_user_id, v_actor),
    v_actor,
    now(),
    coalesce(nullif(coalesce(v_lead.comments, v_lead.notes), ''), '')
  )
  returning id into v_case_id;

  -- Mark the Lead converted + record attribution (immutable history).
  update public.leads set
    status             = 'converted',
    converted_by_user_id = v_actor,
    converted_at       = now(),
    converted_case_id  = v_case_id,
    first_contact_user_id = coalesce(first_contact_user_id, v_lead.assigned_to_user_id)
  where id = p_lead_id;

  -- Timeline event: Lead converted → Case created.
  insert into public.timeline_events (
    case_id, role, activity_type, title, description, user_id,
    metadata
  ) values (
    v_case_id,
    'system',
    'created',
    'Case δημιουργήθηκε από Lead',
    'Μετατροπή Lead σε Case. Πηγή: ' || coalesce(v_lead.source, 'website'),
    v_actor,
    jsonb_build_object(
      'lead_id', p_lead_id,
      'lead_source', v_lead.source,
      'lead_campaign', v_lead.campaign_name,
      'converted', true
    )
  );

  return v_case_id;
end;
$$;

revoke all on function public.convert_lead_to_case(uuid) from public;
grant execute on function public.convert_lead_to_case(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) insert_website_lead() — new enum + campaign attribution
-- ---------------------------------------------------------------------------
create or replace function public.insert_website_lead(p_source text, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text := nullif(btrim(coalesce(p_payload->>'first_name','')), '');
  v_last text := nullif(btrim(coalesce(p_payload->>'last_name','')), '');
  v_full text := nullif(btrim(coalesce(p_payload->>'full_name','')), '');
  v_email text := nullif(btrim(coalesce(p_payload->>'email','')), '');
  v_phone text := nullif(btrim(coalesce(p_payload->>'phone','')), '');
  v_region text := nullif(btrim(coalesce(p_payload->>'region','')), '');
  v_prop text := nullif(btrim(coalesce(p_payload->>'property_type','')), '');
  v_cat text := nullif(btrim(coalesce(p_payload->>'service_category','')), '');
  v_comments text := nullif(btrim(coalesce(p_payload->>'comments','')), '');
  v_consent boolean := (p_payload->>'gdpr_consent')::boolean;
  v_files jsonb := p_payload->'attached_files';
  v_campaign text := nullif(btrim(coalesce(p_payload->>'campaign_name', p_payload->>'utm_campaign','')), '');
  v_campaign_id text := nullif(btrim(coalesce(p_payload->>'campaign_id','')), '');
  v_id uuid;
begin
  if p_source is null or p_source not in ('website', 'contact') then
    raise exception 'invalid source';
  end if;
  if p_source = 'website' and coalesce(v_consent, false) is not true then
    raise exception 'gdpr consent required';
  end if;

  v_cat := case
    when v_cat in ('energy','gas','solar','ev') then v_cat
    when v_cat = 'Ρεύμα' then 'energy'
    when v_cat = 'Φυσικό Αέριο' then 'gas'
    when v_cat = 'Φωτοβολταϊκά' then 'solar'
    when v_cat = 'Ηλεκτροκίνηση' then 'ev'
    else v_cat
  end;

  if v_full is null then
    v_full := nullif(btrim(coalesce(v_first,'') || ' ' || coalesce(v_last,'')), '');
  end if;
  if v_first is null and v_full is not null then
    v_first := split_part(v_full, ' ', 1);
  end if;
  if v_first is null then
    v_first := coalesce(split_part(coalesce(v_email,''), '@', 1), 'Μη διαθέσιμο');
  end if;

  insert into public.leads (
    client_name, client_contact, first_name, last_name, full_name, email, phone, region,
    property_type, service_category, source, status, comments, gdpr_consent, consent_version,
    consent_granted_at, consent_source, attached_files,
    campaign_name, campaign_id
  ) values (
    coalesce(v_full, v_first), coalesce(v_email, v_phone, 'not-provided@hlektrismos.local'),
    v_first, v_last, v_full, coalesce(v_email, 'not-provided@hlektrismos.local'), v_phone, v_region,
    v_prop, v_cat, p_source, 'new', v_comments, v_consent, 'v1',
    case when v_consent is true then now() else null end,
    case when v_consent is true then p_source else null end,
    nullif(v_files, 'null'::jsonb),
    v_campaign, v_campaign_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_website_lead(text, jsonb) from public;
grant execute on function public.insert_website_lead(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) RLS: staff may insert leads (manual entry through the UI)
-- ---------------------------------------------------------------------------
drop policy if exists "staff insert leads" on public.leads;
create policy "staff insert leads" on public.leads
  for insert to authenticated
  with check (is_staff());

-- Small named constraint for the case → lead FK so PostgREST embeds are stable.
alter table public.cases drop constraint if exists cases_lead_id_fkey;
alter table public.cases
  add constraint cases_lead_id_fkey foreign key (lead_id) references public.leads(id);