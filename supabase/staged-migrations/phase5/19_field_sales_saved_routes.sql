-- STAGED ONLY — do not apply to Supabase staging/production without an owner-approved change window.
-- Phase 5 / 19: persisted multi-route workspaces for Field Sales.
-- Backward-compatible: adds new tables only; no existing CRM rows are changed.
-- Routes are per authenticated user; Admin/Manager/Back Office can inspect and reassign team routes.
-- Sales Agents can manage only their own routes/stops. Discovery candidates remain distinct from CRM entities.
-- Rollback: docs/ops/rollback_phase5_19_field_sales_saved_routes.sql.

create table if not exists public.field_sales_routes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  route_name text not null check (length(btrim(route_name)) between 1 and 100),
  route_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft','active','paused','completed','cancelled')),
  travel_mode text not null default 'driving' check (travel_mode in ('driving','walking','bicycling')),
  origin_lat double precision,
  origin_lng double precision,
  origin_label text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint field_sales_routes_origin_pair check ((origin_lat is null) = (origin_lng is null)),
  constraint field_sales_routes_origin_lat check (origin_lat is null or origin_lat between -90 and 90),
  constraint field_sales_routes_origin_lng check (origin_lng is null or origin_lng between -180 and 180)
);

create index if not exists idx_field_sales_routes_owner_date
  on public.field_sales_routes(owner_id, route_date desc, updated_at desc);
create index if not exists idx_field_sales_routes_status_date
  on public.field_sales_routes(status, route_date desc);

create table if not exists public.field_sales_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.field_sales_routes(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  source_type text not null default 'manual' check (source_type in ('crm','visit','discovery','manual')),
  source_id uuid,
  label text not null check (length(btrim(label)) between 1 and 200),
  subtitle text,
  address text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  category text,
  source_url text,
  stop_status text not null default 'pending' check (stop_status in ('pending','arrived','completed','skipped')),
  scheduled_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (route_id, sort_order)
);

create index if not exists idx_field_sales_route_stops_order
  on public.field_sales_route_stops(route_id, sort_order);
create index if not exists idx_field_sales_route_stops_source
  on public.field_sales_route_stops(source_type, source_id) where source_id is not null;
create index if not exists idx_field_sales_route_stops_coords
  on public.field_sales_route_stops(latitude, longitude);

alter table public.field_sales_routes enable row level security;
alter table public.field_sales_route_stops enable row level security;

revoke all on table public.field_sales_routes from public, anon;
revoke all on table public.field_sales_route_stops from public, anon;
grant select, insert, update, delete on table public.field_sales_routes to authenticated;
grant select, insert, update, delete on table public.field_sales_route_stops to authenticated;
grant all on table public.field_sales_routes to service_role;
grant all on table public.field_sales_route_stops to service_role;

-- Office users can assign routes only to currently active Sales Agent profiles.
-- SECURITY DEFINER avoids the caller's profile SELECT RLS policy accidentally hiding the target row;
-- the function returns only a boolean, not profile details.
create or replace function public.field_sales_route_owner_allowed(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select public.is_staff()
    and (
      p_owner = auth.uid()
      or public.is_role('admin')
      or public.is_role('manager')
      or public.is_role('back_office')
    )
    and exists (
      select 1 from public.profiles p
      where p.id = p_owner
        and coalesce(p.is_active, true)
        and p.role in ('field_sales', 'inside_sales')
    );
$function$;
revoke all on function public.field_sales_route_owner_allowed(uuid) from public, anon;
grant execute on function public.field_sales_route_owner_allowed(uuid) to authenticated, service_role;

drop policy if exists "field routes read own or office" on public.field_sales_routes;
create policy "field routes read own or office" on public.field_sales_routes
  for select to authenticated
  using (
    public.is_staff()
    and (
      public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
      or (owner_id = auth.uid() and (public.is_role('field_sales') or public.is_role('inside_sales')))
    )
  );

drop policy if exists "field routes insert own or office" on public.field_sales_routes;
create policy "field routes insert own or office" on public.field_sales_routes
  for insert to authenticated
  with check (
    public.is_staff()
    and public.field_sales_route_owner_allowed(owner_id)
    and (
      ((public.is_role('field_sales') or public.is_role('inside_sales')) and owner_id = auth.uid())
      or public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
    )
  );

drop policy if exists "field routes update own or office" on public.field_sales_routes;
create policy "field routes update own or office" on public.field_sales_routes
  for update to authenticated
  using (
    public.is_staff()
    and (
      public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
      or (owner_id = auth.uid() and (public.is_role('field_sales') or public.is_role('inside_sales')))
    )
  )
  with check (
    public.is_staff()
    and public.field_sales_route_owner_allowed(owner_id)
    and (
      public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
      or (owner_id = auth.uid() and (public.is_role('field_sales') or public.is_role('inside_sales')))
    )
  );

drop policy if exists "field routes delete own drafts or office" on public.field_sales_routes;
create policy "field routes delete own drafts or office" on public.field_sales_routes
  for delete to authenticated
  using (
    public.is_staff()
    and (
      public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
      or (owner_id = auth.uid() and status in ('draft','cancelled') and (public.is_role('field_sales') or public.is_role('inside_sales')))
    )
  );

drop policy if exists "field route stops read permitted route" on public.field_sales_route_stops;
create policy "field route stops read permitted route" on public.field_sales_route_stops
  for select to authenticated
  using (
    public.is_staff()
    and exists (
      select 1 from public.field_sales_routes r
      where r.id = route_id
        and (
          public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
          or (r.owner_id = auth.uid() and (public.is_role('field_sales') or public.is_role('inside_sales')))
        )
    )
  );

drop policy if exists "field route stops insert permitted route" on public.field_sales_route_stops;
create policy "field route stops insert permitted route" on public.field_sales_route_stops
  for insert to authenticated
  with check (
    public.is_staff()
    and exists (
      select 1 from public.field_sales_routes r
      where r.id = route_id
        and (
          public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
          or (r.owner_id = auth.uid() and (public.is_role('field_sales') or public.is_role('inside_sales')))
        )
    )
  );

drop policy if exists "field route stops update permitted route" on public.field_sales_route_stops;
create policy "field route stops update permitted route" on public.field_sales_route_stops
  for update to authenticated
  using (
    public.is_staff()
    and exists (
      select 1 from public.field_sales_routes r
      where r.id = route_id
        and (
          public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
          or (r.owner_id = auth.uid() and (public.is_role('field_sales') or public.is_role('inside_sales')))
        )
    )
  )
  with check (
    public.is_staff()
    and exists (
      select 1 from public.field_sales_routes r
      where r.id = route_id
        and (
          public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
          or (r.owner_id = auth.uid() and (public.is_role('field_sales') or public.is_role('inside_sales')))
        )
    )
  );

drop policy if exists "field route stops delete permitted route" on public.field_sales_route_stops;
create policy "field route stops delete permitted route" on public.field_sales_route_stops
  for delete to authenticated
  using (
    public.is_staff()
    and exists (
      select 1 from public.field_sales_routes r
      where r.id = route_id
        and (
          public.is_role('admin') or public.is_role('manager') or public.is_role('back_office')
          or (r.owner_id = auth.uid() and (public.is_role('field_sales') or public.is_role('inside_sales')))
        )
    )
  );

-- Transactional stop replacement for the browser route editor. SECURITY INVOKER preserves RLS checks.
create or replace function public.field_sales_replace_route_stops(p_route_id uuid, p_stops jsonb)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if p_route_id is null then
    raise exception 'field_sales_replace_route_stops: route_id is required' using errcode = '22023';
  end if;
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception 'field_sales_replace_route_stops: stops must be a JSON array' using errcode = '22023';
  end if;

  -- A denied delete or insert raises and rolls back the whole function call; it cannot leave a half-saved route.
  delete from public.field_sales_route_stops where route_id = p_route_id;

  insert into public.field_sales_route_stops (
    route_id, sort_order, source_type, source_id, label, subtitle, address,
    latitude, longitude, category, source_url, stop_status, scheduled_at, notes, metadata
  )
  select
    p_route_id,
    (item.ordinality - 1)::integer,
    coalesce(nullif(item.value->>'source_type',''), 'manual'),
    nullif(item.value->>'source_id','')::uuid,
    btrim(coalesce(item.value->>'label','')),
    item.value->>'subtitle',
    item.value->>'address',
    (item.value->>'latitude')::double precision,
    (item.value->>'longitude')::double precision,
    item.value->>'category',
    item.value->>'source_url',
    coalesce(nullif(item.value->>'stop_status',''), 'pending'),
    nullif(item.value->>'scheduled_at','')::timestamptz,
    item.value->>'notes',
    coalesce(item.value->'metadata','{}'::jsonb)
  from jsonb_array_elements(p_stops) with ordinality as item(value, ordinality);
end;
$function$;
revoke all on function public.field_sales_replace_route_stops(uuid, jsonb) from public, anon;
grant execute on function public.field_sales_replace_route_stops(uuid, jsonb) to authenticated, service_role;

-- Preserve route history: once a route has an arrived/completed stop, it must not be deleted.
-- Users can mark a route completed/cancelled and keep the route and stop audit trail.
create or replace function public.field_sales_protect_route_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if exists (
    select 1 from public.field_sales_route_stops s
    where s.route_id = old.id and s.stop_status in ('arrived', 'completed')
  ) then
    raise exception 'field_sales_routes: route has visit history; keep it and change its status instead'
      using errcode = '23514';
  end if;
  return old;
end;
$function$;
revoke all on function public.field_sales_protect_route_history() from public, anon, authenticated;
grant execute on function public.field_sales_protect_route_history() to service_role;
drop trigger if exists field_sales_protect_route_history on public.field_sales_routes;
create trigger field_sales_protect_route_history before delete on public.field_sales_routes
  for each row execute function public.field_sales_protect_route_history();

comment on table public.field_sales_routes is
  'Saved Field Sales routes; agents can manage their own, office roles can view/reassign team routes.';
comment on table public.field_sales_route_stops is
  'Ordered CRM/visit/discovery/manual stops attached to a saved Field Sales route. Discovery candidates are not automatically CRM leads.';
