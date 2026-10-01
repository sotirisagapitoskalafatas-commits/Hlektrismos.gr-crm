-- Age gate on every public (no-account) data-collection path.
--
-- Public paths that create leads without an account:
--   * landing-page lead form and #/contact form -> rpc insert_website_lead -> public.leads
--   * direct anon INSERT on public.leads (policy "public website creates lead")
--   * JARVIS chatbot callback -> edge function `chat` (service role) -> public.hlektrismos_leads
--   * direct anon INSERT on public.hlektrismos_leads (policy "leads_anon_insert")
--
-- The service is for adults (energy supply contracts), so the bar is 18+,
-- which also covers COPPA's under-13 rule. The UI asks first; this migration
-- makes the database refuse any anonymous insert without the confirmation,
-- so the check cannot be skipped by calling the API directly.

alter table public.leads add column if not exists age_confirmed boolean not null default false;
alter table public.hlektrismos_leads add column if not exists age_confirmed boolean not null default false;

create or replace function public.enforce_public_lead_age()
returns trigger
language plpgsql
as $$
begin
  -- auth.role() reads the request JWT, so this also fires inside SECURITY
  -- DEFINER functions called by anonymous visitors. Staff and service-role
  -- inserts (e.g. the `chat` edge function, which checks itself) are exempt.
  if coalesce(auth.role(), '') = 'anon' and new.age_confirmed is not true then
    raise exception 'age confirmation required (18+)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_public_age_gate on public.leads;
create trigger leads_public_age_gate before insert on public.leads
  for each row execute function public.enforce_public_lead_age();

drop trigger if exists hlektrismos_leads_public_age_gate on public.hlektrismos_leads;
create trigger hlektrismos_leads_public_age_gate before insert on public.hlektrismos_leads
  for each row execute function public.enforce_public_lead_age();

-- insert_website_lead(): same body as 20260909200000_p1_lead_foundation.sql, plus the age check.
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
  v_adult boolean := (p_payload->>'age_confirmed')::boolean;
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
  -- Age gate (website AND contact forms): refuse BEFORE anything is
  -- written, so nothing from an under-18 attempt is stored.
  if coalesce(v_adult, false) is not true then
    raise exception 'age confirmation required (18+)';
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
    campaign_name, campaign_id, age_confirmed
  ) values (
    coalesce(v_full, v_first), coalesce(v_email, v_phone, 'not-provided@hlektrismos.local'),
    v_first, v_last, v_full, coalesce(v_email, 'not-provided@hlektrismos.local'), v_phone, v_region,
    v_prop, v_cat, p_source, 'new', v_comments, v_consent, 'v1',
    case when v_consent is true then now() else null end,
    case when v_consent is true then p_source else null end,
    nullif(v_files, 'null'::jsonb),
    v_campaign, v_campaign_id, true
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_website_lead(text, jsonb) from public;
grant execute on function public.insert_website_lead(text, jsonb) to anon, authenticated;

-- Uploaded bills / IDs in hlektrismos_docs: readable by ACTIVE staff only
-- (was: any authenticated user, including self-registered accounts).
drop policy if exists "staff reads lead files" on storage.objects;
create policy "staff reads lead files" on storage.objects
  for select to authenticated
  using (bucket_id = 'hlektrismos_docs' and public.is_staff());
