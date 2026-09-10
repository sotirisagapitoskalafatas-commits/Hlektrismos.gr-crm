-- =============================================================================
-- CRM OS — Phase 1.2: Provider / Product FK conversion
-- -----------------------------------------------------------------------------
-- Converts the legacy text columns `leads.provider/program` and
-- `cases.provider/program` into an authoritative many-to-one relationship with
-- the canonical catalog tables `providers` / `products` (Phase 1 foundation),
-- while preserving the legacy text columns as read-back/display compatibility.
--
-- Design rules (matching the live applied convention):
--   * ADDITIVE only — new FK columns; legacy text columns are NOT dropped or
--     overwritten; existing UI display paths keep working unchanged.
--   * IDEMPOTENT — backfill only touches rows whose FK is still NULL
--     (`WHERE provider_id IS NULL`), so re-running never clobbers manual fixes
--     and never double-maps; all DDL is guarded / `create or replace`.
--   * DETERMINISTIC — a fixed canonical alias set + keyword rules. No
--     heuristics, no ML, no invented records: an input maps only when it
--     resolves to exactly ONE canonical row.
--   * ORG-SCOPED — resolution is scoped to the seeded organization id
--     (immutable default param); candidate set is the org's own catalog.
--   * RLS-COMPATIBLE — new FK columns live on tables with existing RLS
--     (staff read/write, admin delete); no new grants are created, access
--     surface is unchanged. Helper functions are SECURITY INVOKER.
--   * FUTURE WRITE PATHS — BEFORE INSERT/UPDATE triggers auto-resolve the FKs
--     from the legacy text (covers convert_lead_to_case(), lib/api.ts,
--     edge functions, webhooks) without touching each caller.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Canonical aliases (idempotent) — Greek-brand spellings that differ from
--    the canonical Latin/Greek names. These are authoritative facts about the
--    market actors, not invented records.
-- ---------------------------------------------------------------------------
update public.providers
set metadata = jsonb_set(metadata, '{aliases}', coalesce(metadata -> 'aliases', '[]'::jsonb) || '["ΕΛΙΝ"]'::jsonb)
where slug = 'elin'
  and not coalesce(metadata -> 'aliases', '[]'::jsonb) @> '["ΕΛΙΝ"]'::jsonb;

update public.providers
set metadata = jsonb_set(metadata, '{aliases}', coalesce(metadata -> 'aliases', '[]'::jsonb) || '["Φυσικό Αέριο"]'::jsonb)
where slug = 'fge'
  and not coalesce(metadata -> 'aliases', '[]'::jsonb) @> '["Φυσικό Αέριο"]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Resolution helpers (deterministic, immutable/stable, security invoker)
-- ---------------------------------------------------------------------------
create or replace function public.crm_legacy_label_key(v text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select lower(trim(regexp_replace(coalesce(v, ''), E'\\s+', ' ', 'g')));
$$;

-- Returns the single provider id that a legacy label matches, or NULL when the
-- label matches zero or more than one canonical provider (ambiguous → unmapped).
create or replace function public.crm_resolve_provider_id(
  p_label text,
  p_org_id uuid default '00000000-0000-0000-0000-00000000c001'::uuid
)
returns uuid
language sql
stable
set search_path = 'public'
as $$
  with matches as (
    select p.id, count(*) over () as n
    from public.providers p
    where p.organization_id = p_org_id
      and (
        public.crm_legacy_label_key(p.name) = public.crm_legacy_label_key(p_label)
        or public.crm_legacy_label_key(p.slug) = public.crm_legacy_label_key(p_label)
        or exists (
          select 1
          from jsonb_array_elements_text(coalesce(p.metadata -> 'aliases', '[]'::jsonb)) a
          where public.crm_legacy_label_key(a) = public.crm_legacy_label_key(p_label)
        )
      )
  )
  select m.id from matches m where m.n = 1;
$$;

-- Maps a program/tariff name to a canonical product code by keyword rules only
-- (no provider context). NULL when no keyword matches with confidence.
create or replace function public.crm_product_code_for(p_program text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select case
    when lower(coalesce(p_program, '')) like '%φωτοβολταϊκ%'
      or lower(coalesce(p_program, '')) like '%solar%'
      or lower(coalesce(p_program, '')) like '%ηλιακ%'           then 'solar'
    when lower(coalesce(p_program, '')) like '%αέριο%'
      or lower(coalesce(p_program, '')) like '%gaz%'             then 'gas'
    when lower(coalesce(p_program, '')) like '%ηλεκτροκίνη%'
      or lower(coalesce(p_program, '')) like '%φόρτισ%'
      or lower(coalesce(p_program, '')) like '%φορτισ%'          then 'ev'
    when lower(coalesce(p_program, '')) like '%ασφαλ%'           then 'insurance'
    when lower(coalesce(p_program, '')) like '%ιστοσελίδ%'
      or lower(coalesce(p_program, '')) like '%web%'             then 'web'
    else null
  end;
$$;

-- Category fallback used only when the program name has no keyword signal:
-- an electricity provider maps to the energy product, a gas provider to gas, etc.
create or replace function public.crm_product_code_for_category(p_category text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select case p_category
    when 'electricity' then 'energy'
    when 'gas'         then 'gas'
    when 'solar'       then 'solar'
    when 'ev'          then 'ev'
    when 'insurance'   then 'insurance'
    when 'web'         then 'web'
    else null
  end;
$$;

-- Product id for a program, using keyword rules first and the provider category
-- fallback second (only when a provider is known). Unique-match semantics like
-- crm_resolve_provider_id (ambiguous or unknown → NULL).
create or replace function public.crm_resolve_product_id(
  p_program text,
  p_provider_id uuid,
  p_org_id uuid default '00000000-0000-0000-0000-00000000c001'::uuid
)
returns uuid
language sql
stable
set search_path = 'public'
as $$
  with matches as (
    select pr.id, count(*) over () as n
    from public.products pr
    where pr.organization_id = p_org_id
      and pr.code = coalesce(
        public.crm_product_code_for(p_program),
        case when p_provider_id is not null
          then public.crm_product_code_for_category(
            (select pv.category from public.providers pv where pv.id = p_provider_id)
          )
          else null
        end
      )
  )
  select m.id from matches m where m.n = 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. Additive FK columns + indexes (idempotent)
-- ---------------------------------------------------------------------------
alter table public.leads add column if not exists provider_id uuid references public.providers(id) on delete set null;
alter table public.leads add column if not exists product_id  uuid references public.products(id)  on delete set null;
alter table public.cases add column if not exists provider_id uuid references public.providers(id) on delete set null;
alter table public.cases add column if not exists product_id  uuid references public.products(id)  on delete set null;

create index if not exists leads_provider_id_idx on public.leads (provider_id);
create index if not exists leads_product_id_idx  on public.leads (product_id);
create index if not exists cases_provider_id_idx on public.cases (provider_id);
create index if not exists cases_product_id_idx  on public.cases (product_id);

-- ---------------------------------------------------------------------------
-- 4. Backfill (deterministic, idempotent, org-scoped via the resolvers;
--    NEVER invents catalog rows — only updates referencing existing rows)
-- ---------------------------------------------------------------------------
update public.cases c
set provider_id = public.crm_resolve_provider_id(c.provider)
where c.provider_id is null
  and public.crm_legacy_label_key(c.provider) <> '';

update public.cases c
set product_id = public.crm_resolve_product_id(c.program, c.provider_id)
where c.product_id is null
  and public.crm_legacy_label_key(c.program) <> '';

update public.leads l
set provider_id = public.crm_resolve_provider_id(l.provider)
where l.provider_id is null
  and public.crm_legacy_label_key(l.provider) <> '';

update public.leads l
set product_id = public.crm_resolve_product_id(l.program, l.provider_id)
where l.product_id is null
  and public.crm_legacy_label_key(l.program) <> '';

-- ---------------------------------------------------------------------------
-- 5. Auto-resolve triggers for ALL future write paths (insert/update), so the
--    canonical relationship stays authoritative no matter which layer writes
--    (app API, SECURITY DEFINER RPCs, edge functions, webhooks).
--    No-op when the FK is already set → idempotent and never clobbers.
-- ---------------------------------------------------------------------------
create or replace function public.leads_provider_product_resolve()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if new.provider_id is null and coalesce(btrim(new.provider), '') <> '' then
    new.provider_id := public.crm_resolve_provider_id(new.provider);
  end if;
  if new.product_id is null and coalesce(btrim(new.program), '') <> '' then
    new.product_id := public.crm_resolve_product_id(new.program, new.provider_id);
  end if;
  return new;
end;
$$;

create or replace function public.cases_provider_product_resolve()
returns trigger
language plpgsql
set search_path = 'public'
as $$
begin
  if new.provider_id is null and coalesce(btrim(new.provider), '') <> '' then
    new.provider_id := public.crm_resolve_provider_id(new.provider);
  end if;
  if new.product_id is null and coalesce(btrim(new.program), '') <> '' then
    new.product_id := public.crm_resolve_product_id(new.program, new.provider_id);
  end if;
  return new;
end;
$$;

drop trigger if exists leads_provider_product_resolve on public.leads;
create trigger leads_provider_product_resolve
  before insert or update on public.leads
  for each row execute function public.leads_provider_product_resolve();

drop trigger if exists cases_provider_product_resolve on public.cases;
create trigger cases_provider_product_resolve
  before insert or update on public.cases
  for each row execute function public.cases_provider_product_resolve();

-- ---------------------------------------------------------------------------
-- 6. RLS — no change required. provider_id/product_id are columns on tables
--    that already enforce row-level security (staff read/insert/update,
--    admin/manager delete); the new FKs only reference catalog rows that are
--    world-readable by design (authenticated read). No policy is expanded.
-- ---------------------------------------------------------------------------

commit;