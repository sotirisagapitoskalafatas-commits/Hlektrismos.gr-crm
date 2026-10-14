-- STAGED — apply on STAGING first, then production only with the owner's approval and a backup.
-- Phase 3 / 08: B2B prospecting as a controlled pipeline  Discover → Screen → Review → Distribute.
--   * Search results land in b2b_prospects (NOT in leads). A business found on Google Maps is not a lead and is not
--     permission to contact anyone.
--   * Every search is a b2b_search_jobs row (who, what, counts, errors, quota units) — the scrape-b2b edge function
--     writes them with the service role and enforces the daily quota from b2b_scraper_config.
--   * Screening: normalized name/phone/domain, duplicate detection against leads, customers and earlier prospects,
--     data-quality flags.
--   * Review (Back Office, admin, manager): approve / exclude (reason) / mark duplicate.
--   * Distribution (same roles): approved prospects become CRM leads assigned to an agent (manual, round-robin or least
--     workload). It creates internal work only — never a message, SMS or call. The new lead says that the phone has NOT
--     been screened against the Article 11 opt-out registers.
--   * Excluded prospects keep only what is needed to avoid re-importing them (name/phone/domain + reason); contact
--     details beyond that are cleared. Retention of excluded rows needs Greek privacy counsel's confirmation.

create table if not exists public.b2b_search_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  params jsonb not null,                  -- {categories[], regions[], cities[], keywords[], max_per_query}
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.b2b_search_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id),
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'cancelled')),
  params jsonb not null,
  queries_planned integer not null default 0,
  queries_done integer not null default 0,
  results_found integer not null default 0,
  results_new integer not null default 0,
  results_duplicate integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.b2b_prospects (
  id uuid primary key default gen_random_uuid(),
  place_id text,                          -- Google place id (source listing id)
  company_name text not null,
  name_key text not null,                 -- normalized name for duplicate detection
  phone text,
  phone_key text,                         -- last 10 digits
  website text,
  domain text,
  address text,
  city text,
  region text,
  category text,
  source text not null default 'serpapi_google_maps',
  source_query text,
  lat double precision,
  lng double precision,
  rating numeric,
  reviews integer,
  quality text[] not null default '{}',   -- e.g. no_phone, no_website, no_address
  first_job_id uuid references public.b2b_search_jobs(id) on delete set null,
  collected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'approved', 'excluded', 'duplicate', 'assigned')),
  duplicate_of jsonb,                     -- {type: lead|customer|prospect, id, reason}
  review_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  assigned_to uuid references public.profiles(id),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz,
  lead_id uuid,                           -- the CRM lead created at distribution
  phone_screening text not null default 'not_checked' check (phone_screening in ('not_checked', 'clear', 'opted_out')),
  created_at timestamptz not null default now()
);
create unique index if not exists b2b_prospects_place_uidx on public.b2b_prospects (place_id) where place_id is not null;
create index if not exists b2b_prospects_status_idx on public.b2b_prospects (status, collected_at desc);
create index if not exists b2b_prospects_phone_idx on public.b2b_prospects (phone_key) where phone_key is not null;
create index if not exists b2b_prospects_name_idx on public.b2b_prospects (name_key);

alter table public.b2b_search_profiles enable row level security;
alter table public.b2b_search_jobs enable row level security;
alter table public.b2b_prospects enable row level security;

create or replace function public.b2b_role()
returns text language sql stable security definer set search_path = public
as $$ select p.role from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true) $$;
revoke all on function public.b2b_role() from public, anon;
grant execute on function public.b2b_role() to authenticated;

-- Who may search: admin, manager, inside_sales, back_office. Who may review/distribute: back_office, admin, manager.
drop policy if exists "b2b profiles read" on public.b2b_search_profiles;
create policy "b2b profiles read" on public.b2b_search_profiles for select to authenticated
  using (public.b2b_role() in ('admin', 'manager', 'inside_sales', 'back_office'));
drop policy if exists "b2b profiles write" on public.b2b_search_profiles;
create policy "b2b profiles write" on public.b2b_search_profiles for all to authenticated
  using (public.b2b_role() in ('admin', 'manager', 'inside_sales', 'back_office') and (created_by = auth.uid() or public.b2b_role() in ('admin', 'manager')))
  with check (public.b2b_role() in ('admin', 'manager', 'inside_sales', 'back_office') and created_by = auth.uid());
drop policy if exists "b2b jobs read" on public.b2b_search_jobs;
create policy "b2b jobs read" on public.b2b_search_jobs for select to authenticated
  using (public.b2b_role() in ('admin', 'manager', 'inside_sales', 'back_office'));
drop policy if exists "b2b prospects read" on public.b2b_prospects;
create policy "b2b prospects read" on public.b2b_prospects for select to authenticated
  using (public.b2b_role() in ('admin', 'manager', 'back_office', 'inside_sales'));
-- No insert/update/delete policies for jobs and prospects: writes go through the edge function (service role) and
-- the SECURITY DEFINER functions below.
grant select on public.b2b_search_jobs, public.b2b_prospects to authenticated;
grant select, insert, update, delete on public.b2b_search_profiles to authenticated;
grant all on public.b2b_search_jobs, public.b2b_prospects, public.b2b_search_profiles to service_role;

-- ───────────────────────── screening helpers (also used by the edge function) ─────────────────────────
create or replace function public.b2b_name_key(n text)
returns text language plpgsql immutable
as $$
declare k text;
begin
  -- explicit Greek mapping (capitals, accents, final ς) so the key does not depend on the database locale
  k := lower(translate(coalesce(n, ''), 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩΆΈΉΊΌΎΏΪΫάέήίόύώϊϋΐΰς', 'αβγδεζηθικλμνξοπρστυφχψωαεηιουωιυαεηιουωιυιυσ'));
  k := regexp_replace(k, '\.', '', 'g');                 -- «Α.Ε.» → «αε»
  k := ' ' || regexp_replace(k, '[^a-zα-ω0-9]+', ' ', 'g') || ' ';
  for i in 1..2 loop                                      -- legal-form words, also when consecutive
    k := regexp_replace(k, ' (αε|επε|ικε|οε|εε|μικε|sa|ltd|ike|epe|oe|ee) ', ' ', 'g');
  end loop;
  return btrim(regexp_replace(k, ' +', ' ', 'g'));
end;
$$;
create or replace function public.b2b_phone_key(p text)
returns text language sql immutable
as $$ select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '') $$;

-- Where else does this business already exist? First match wins: lead (phone/name), customer (phone/name), prospect.
create or replace function public.b2b_find_duplicate(p_name_key text, p_phone_key text, p_self uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare r uuid;
begin
  if p_phone_key is not null then
    select id into r from public.leads where public.b2b_phone_key(phone) = p_phone_key limit 1;
    if r is not null then return jsonb_build_object('type', 'lead', 'id', r, 'reason', 'phone'); end if;
    select id into r from public.customers where public.b2b_phone_key(phone) = p_phone_key limit 1;
    if r is not null then return jsonb_build_object('type', 'customer', 'id', r, 'reason', 'phone'); end if;
    select id into r from public.b2b_prospects where phone_key = p_phone_key and id is distinct from p_self and status <> 'duplicate' limit 1;
    if r is not null then return jsonb_build_object('type', 'prospect', 'id', r, 'reason', 'phone'); end if;
  end if;
  if length(coalesce(p_name_key, '')) >= 4 then
    select id into r from public.leads where public.b2b_name_key(coalesce(company, full_name, client_name)) = p_name_key limit 1;
    if r is not null then return jsonb_build_object('type', 'lead', 'id', r, 'reason', 'name'); end if;
    select id into r from public.customers where public.b2b_name_key(full_name) = p_name_key limit 1;
    if r is not null then return jsonb_build_object('type', 'customer', 'id', r, 'reason', 'name'); end if;
  end if;
  return null;
end;
$$;
revoke all on function public.b2b_find_duplicate(text, text, uuid) from public, anon, authenticated;
grant execute on function public.b2b_find_duplicate(text, text, uuid) to service_role;

create or replace function public.b2b_prospects_screen()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.name_key := public.b2b_name_key(new.company_name);
  new.phone_key := public.b2b_phone_key(new.phone);
  new.domain := nullif(lower(regexp_replace(regexp_replace(coalesce(new.website, ''), '^[a-z]+://(www\.)?', '', 'i'), '/.*$', '')), '');
  new.quality := array_remove(array[
    case when new.phone_key is null then 'no_phone' end,
    case when new.domain is null then 'no_website' end,
    case when coalesce(btrim(new.address), '') = '' then 'no_address' end], null);
  if tg_op = 'INSERT' then
    new.duplicate_of := public.b2b_find_duplicate(new.name_key, new.phone_key, new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists b2b_prospects_screen on public.b2b_prospects;
create trigger b2b_prospects_screen before insert or update of company_name, phone, website, address on public.b2b_prospects
  for each row execute function public.b2b_prospects_screen();

-- ───────────────────────── review ─────────────────────────
create or replace function public.b2b_review(p_ids uuid[], p_action text, p_reason text default null)
returns integer language plpgsql security definer set search_path = public
as $$
declare v_role text := public.b2b_role(); n integer; v_from text[]; v_to text;
begin
  if v_role is null or v_role not in ('back_office', 'admin', 'manager') then raise exception 'b2b_review: not allowed' using errcode = '42501'; end if;
  case p_action
    when 'approve' then v_from := array['new']; v_to := 'approved';
    when 'exclude' then v_from := array['new', 'approved']; v_to := 'excluded';
    when 'duplicate' then v_from := array['new', 'approved']; v_to := 'duplicate';
    when 'reopen' then v_from := array['excluded', 'duplicate']; v_to := 'new';
    else raise exception 'b2b_review: invalid action' using errcode = '22023';
  end case;
  if p_action in ('exclude', 'duplicate') and length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'b2b_review: a reason is required' using errcode = '22023';
  end if;
  with upd as (
    update public.b2b_prospects
       set status = v_to, review_reason = nullif(btrim(coalesce(p_reason, '')), ''), reviewed_by = auth.uid(), reviewed_at = now(),
           -- data minimisation: an excluded business keeps only what prevents re-importing it
           website = case when v_to = 'excluded' then null else website end,
           address = case when v_to = 'excluded' then null else address end,
           lat = case when v_to = 'excluded' then null else lat end,
           lng = case when v_to = 'excluded' then null else lng end
     where id = any(p_ids) and status = any(v_from)
    returning id)
  insert into public.activity_log (entity_type, entity_id, action, details)
  select 'b2b_prospect', id, 'b2b_' || p_action, jsonb_build_object('actor_id', auth.uid(), 'reason', p_reason) from upd;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.b2b_review(uuid[], text, text) from public, anon;
grant execute on function public.b2b_review(uuid[], text, text) to authenticated;

-- ───────────────────────── distribution ─────────────────────────
-- p_mode: manual (one agent), round_robin (over p_agents in order), workload (fewest open leads first).
-- Each approved prospect becomes ONE lead (source import, B2B) assigned to the agent. Internal work only.
create or replace function public.b2b_distribute(p_ids uuid[], p_mode text, p_agents uuid[])
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_role text := public.b2b_role(); p record; agents uuid[]; i integer := 0; a uuid; v_lead uuid; out jsonb := '[]'::jsonb;
begin
  if v_role is null or v_role not in ('back_office', 'admin', 'manager') then raise exception 'b2b_distribute: not allowed' using errcode = '42501'; end if;
  if p_mode not in ('manual', 'round_robin', 'workload') then raise exception 'b2b_distribute: invalid mode' using errcode = '22023'; end if;
  select array_agg(x order by ord) into agents
    from unnest(p_agents) with ordinality u(x, ord)
    join public.profiles pr on pr.id = u.x and pr.role in ('inside_sales', 'field_sales') and coalesce(pr.is_active, true);
  if agents is null or array_length(agents, 1) = 0 then raise exception 'b2b_distribute: choose at least one active sales agent' using errcode = '22023'; end if;
  if p_mode = 'manual' and array_length(agents, 1) <> 1 then raise exception 'b2b_distribute: manual mode takes exactly one agent' using errcode = '22023'; end if;

  for p in select * from public.b2b_prospects where id = any(p_ids) and status = 'approved' order by collected_at for update loop
    if p_mode = 'workload' then
      select x into a from unnest(agents) x
       order by (select count(*) from public.leads l where l.assigned_to_user_id = x and coalesce(l.status, 'new') in ('new', 'contacted', 'qualified', 'meeting', 'offer')), x
       limit 1;
    else
      a := agents[(i % array_length(agents, 1)) + 1];
    end if;
    insert into public.leads (full_name, client_name, client_contact, company, phone, address, region, lead_type, service_category,
                              status, source, source_label, assigned_to_user_id, lat, lng, comments)
    values (p.company_name, p.company_name, coalesce(p.phone, ''), p.company_name, p.phone, p.address, p.region, 'B2B', 'energy',
            'new', 'import', 'B2B Scraper · Google Maps', a, p.lat, p.lng,
            concat_ws(' | ', 'Πηγή: Google Maps (SerpApi)', 'Κατηγορία: ' || coalesce(p.category, '—'),
                      case when p.website is not null then 'Ιστοσελίδα: ' || p.website end,
                      'Συλλογή: ' || to_char(p.collected_at, 'DD/MM/YYYY'),
                      'Πριν από τηλεφωνική προώθηση: έλεγχος μητρώου Άρθρου 11 — ΔΕΝ έχει γίνει'))
    returning id into v_lead;
    update public.b2b_prospects set status = 'assigned', assigned_to = a, assigned_by = auth.uid(), assigned_at = now(), lead_id = v_lead where id = p.id;
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('b2b_prospect', p.id, 'b2b_assigned', jsonb_build_object('actor_id', auth.uid(), 'agent', a, 'lead_id', v_lead, 'mode', p_mode));
    insert into public.app_notifications (user_id, title, body, type)
    values (a, 'Νέο B2B lead', p.company_name || coalesce(' · ' || p.city, ''), 'b2b_assigned');
    out := out || jsonb_build_array(jsonb_build_object('prospect', p.id, 'lead', v_lead, 'agent', a));
    i := i + 1;
  end loop;
  return out;
end;
$$;
revoke all on function public.b2b_distribute(uuid[], text, uuid[]) from public, anon;
grant execute on function public.b2b_distribute(uuid[], text, uuid[]) to authenticated;

-- Daily search quota: queries already run today (Europe/Athens).
create or replace function public.b2b_queries_today()
returns integer language sql stable security definer set search_path = public
as $$ select coalesce(sum(queries_done), 0)::int from public.b2b_search_jobs where created_at >= date_trunc('day', now() at time zone 'Europe/Athens') at time zone 'Europe/Athens' $$;
revoke all on function public.b2b_queries_today() from public, anon;
grant execute on function public.b2b_queries_today() to authenticated, service_role;
