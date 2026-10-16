-- ROLLBACK for staged phase4/15. Restores convert_lead_to_case() exactly as in migration 20260909200000
-- (customer reused by exact phone OR email, placeholder email stored on new customers — the D1 behaviour).
-- Customers created while 15 was live keep a null email; nothing else to undo.

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

drop function if exists public.customer_match_phone(text);
