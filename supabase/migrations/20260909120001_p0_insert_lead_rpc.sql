-- P0 harden: single public write-path for lead intake via SECURITY DEFINER RPC.
-- Replaces the wide "anon INSERT into leads" policy (which also broke because
-- PostgREST's POST ?select= (INSERT ... RETURNING) requires a SELECT policy).
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
    consent_granted_at, consent_source, attached_files
  ) values (
    coalesce(v_full, v_first), coalesce(v_email, v_phone, 'not-provided@hlektrismos.local'),
    v_first, v_last, v_full, coalesce(v_email, 'not-provided@hlektrismos.local'), v_phone, v_region,
    v_prop, v_cat, p_source, 'new_lead', v_comments, v_consent, 'v1',
    case when v_consent is true then now() else null end, case when v_consent is true then p_source else null end,
    nullif(v_files, 'null'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.insert_website_lead(text, jsonb) from public;
grant execute on function public.insert_website_lead(text, jsonb) to anon, authenticated;

-- Remove the wide anonymous table-write; RPC is now the only anon write path.
drop policy if exists "public website creates lead" on public.leads;