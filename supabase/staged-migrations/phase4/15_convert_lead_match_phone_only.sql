-- STAGED (Phase 4 / 15) — NOT APPLIED. Idempotent (create or replace). Rollback: docs/ops/rollback_phase4_15_convert_lead.sql
--
-- Finding D1 (docs/product/UNIFIED_CUSTOMER_FOLDER.md). The website form stores 'not-provided@hlektrismos.local'
-- when the visitor gives no email (src/pages/LandingPage.tsx and insert_website_lead). convert_lead_to_case()
-- (migration 20260909200000) reused an existing customer by exact phone OR email. Two different people who both
-- left the email blank were therefore joined to ONE customer record.
--
-- Change (only the customer lookup and the stored email; everything else is the original function verbatim):
--   1. An existing customer is reused ONLY on the same phone, compared on the last 10 digits
--      («6900000000» = «+30 690 000 0000»). Email is never used for matching. A phone with fewer than
--      10 digits never matches.
--   2. A customer in the Κάδος (deleted_at set, staged phase2/06) is never reused. Works with or without 06.
--   3. A new customer never gets the placeholder (or any …@hlektrismos.local) address: email is stored as null.
-- Existing rows are NOT changed. Possibly merged records are listed for manual review by
-- docs/ops/d1_placeholder_review.sql — nothing is split automatically.

create or replace function public.customer_match_phone(p text)
returns text language sql immutable
as $$ select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10
                  then right(regexp_replace(p, '\D', '', 'g'), 10) end $$;

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
  v_phone_key text;
  v_email     text;
  v_reused    boolean := false;
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

  -- Reuse an existing customer ONLY by phone (last 10 digits). Never by email: the website placeholder
  -- address is shared by everyone who left the field blank.
  v_phone_key := public.customer_match_phone(v_lead.phone);
  if v_phone_key is not null then
    select c.* into v_customer
    from public.customers c
    where public.customer_match_phone(c.phone) = v_phone_key
      and (to_jsonb(c) ->> 'deleted_at') is null
    order by c.created_at
    limit 1;
    v_reused := v_customer.id is not null;
  end if;

  if v_customer.id is null then
    v_email := case when lower(btrim(coalesce(v_lead.email, ''))) like '%@hlektrismos.local' then null
                    else nullif(btrim(coalesce(v_lead.email, '')), '') end;
    insert into public.customers (full_name, email, phone)
    values (v_full, v_email, v_lead.phone)
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
      'converted', true,
      'customer_reused', v_reused  -- new in phase4/15: an existing customer with the same phone was used
    )
  );

  return v_case_id;
end;
$$;

revoke all on function public.convert_lead_to_case(uuid) from public;
grant execute on function public.convert_lead_to_case(uuid) to authenticated;
