-- READ-ONLY dry run for the staged legacy-leads import (supabase/staged-migrations/phase4/16_import_legacy_leads.sql).
-- It needs NOTHING created first. Paste each of the two queries in the Supabase SQL Editor and send the grids back.
-- Counts only: no names, phones, e-mails. Nothing is written; both are plain SELECTs.
-- (After that file is applied, the same counts come from:  select * from public.import_legacy_leads();  — also a dry run by default.)

-- ───────────── 1) Are the old-table columns the import reads really there? (every row must say present) ─────────────
select c.col as legacy_column,
       case when exists (select 1 from information_schema.columns i where i.table_schema = 'public' and i.table_name = 'hlektrismos_leads' and i.column_name = c.col)
            then 'present' else 'MISSING — tell Claude before going on' end as state
  from (values ('id'), ('created_at'), ('first_name'), ('last_name'), ('phone'), ('email'), ('region'), ('customer_type'), ('provider'),
               ('property_type'), ('comments'), ('deleted_at'), ('consent'), ('status'), ('source'), ('service_type')) c(col)
 order by 2 desc, 1;

-- ───────────── 2) What the import would do ─────────────
-- >>> CLASSIFY (identical in the dry-run file; a test compares the two)
with src as (
  select h.id, h.created_at,
         nullif(btrim(coalesce(h.first_name, '')), '') as first_name,
         nullif(btrim(coalesce(h.last_name, '')), '') as last_name,
         nullif(btrim(coalesce(h.phone, '')), '') as phone,
         nullif(nullif(lower(btrim(coalesce(h.email, ''))), ''), 'not-provided@hlektrismos.local') as email,
         case when length(regexp_replace(coalesce(h.phone, ''), '\D', '', 'g')) >= 10 then right(regexp_replace(h.phone, '\D', '', 'g'), 10) end as phone_key,
         h.region, h.customer_type, h.provider, h.property_type, h.comments, h.deleted_at,
         coalesce(h.consent, false) as consent,
         nullif(btrim(coalesce(h.source, '')), '') as old_source,
         nullif(btrim(coalesce(h.service_type, '')), '') as service_type,
         lower(btrim(coalesce(h.status, ''))) as old_status
    from public.hlektrismos_leads h
), mapped as (
  select s.*,
         case
           when old_status in ('new', 'lead') then 'new'
           when old_status in ('contacted', 'intro', 'follow_up') then 'contacted'
           when old_status = 'qualified' then 'qualified'
           when old_status in ('awaiting_offer', 'proposal') then 'offer'
           when old_status in ('lost', 'rejected') then 'lost'
           when old_status in ('converted', 'customer', 'won', 'active', 'accepted', 'awaiting_signature', 'docs_pending',
                               'sent_to_provider', 'submitted_to_provider', 'deddie_meter_reading') then 'qualified'
           else 'new'
         end as mapped_status,
         case
           when old_status in ('new', 'lead', 'contacted', 'intro', 'follow_up', 'qualified', 'awaiting_offer', 'proposal', 'lost', 'rejected') then 'direct'
           when old_status in ('converted', 'customer', 'won', 'active', 'accepted', 'awaiting_signature', 'docs_pending',
                               'sent_to_provider', 'submitted_to_provider', 'deddie_meter_reading') then 'beyond_lead'
           else 'unknown'
         end as status_kind
    from src s
), classified as (
  select m.*,
         (m.deleted_at is not null) as is_deleted,
         (m.first_name is null and m.last_name is null) as no_name,
         (m.phone is null and m.email is null) as no_contact,
         exists (select 1 from public.leads l where l.tags @> array['legacy_import:' || m.id::text]) as already_imported,
         (exists (select 1 from public.leads l
                   where not exists (select 1 from unnest(coalesce(l.tags, '{}'::text[])) t where t like 'legacy\_import:%')
                     and ((m.phone_key is not null and length(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g')) >= 10
                           and right(regexp_replace(l.phone, '\D', '', 'g'), 10) = m.phone_key)
                          or (m.email is not null and lower(btrim(coalesce(l.email, ''))) = m.email)))
          or exists (select 1 from mapped e
                      where e.id <> m.id and (e.created_at, e.id) < (m.created_at, m.id)
                        and ((m.phone_key is not null and e.phone_key = m.phone_key) or (m.email is not null and e.email = m.email)))) as possible_duplicate
    from mapped m
)
-- <<< CLASSIFY
select r.item, r.n from (
    select 1 as ord, 'MODE: READ-ONLY dry run — nothing is written' as item, 0::bigint as n
    union all select 2, 'legacy rows in total', count(*) from classified
    union all select 3, 'already imported by an earlier run (skipped)', count(*) filter (where already_imported) from classified
    union all select 4, 'TO COPY in this run', count(*) filter (where not already_imported) from classified
    union all select 5, 'of those: without recorded consent → «not for marketing»', count(*) filter (where not consent and not is_deleted and not already_imported) from classified
    union all select 6, 'of those: soft-deleted in the old table → «unqualified», not for marketing', count(*) filter (where is_deleted and not already_imported) from classified
    union all select 7, 'of those: possible duplicates (tagged, not merged)', count(*) filter (where possible_duplicate and not already_imported) from classified
    union all select 8, 'of those: no name (named «Χωρίς όνομα»)', count(*) filter (where no_name and not already_imported) from classified
    union all select 9, 'of those: no phone and no e-mail', count(*) filter (where no_contact and not already_imported) from classified
    union all select 10, 'statuses: mapped directly', count(*) filter (where status_kind = 'direct' and not already_imported) from classified
    union all select 11, 'statuses: «beyond lead» → qualified', count(*) filter (where status_kind = 'beyond_lead' and not already_imported) from classified
    union all select 12, 'statuses: unknown or empty → new', count(*) filter (where status_kind = 'unknown' and not already_imported) from classified
    union all select 13, 'distinct old statuses in use', count(distinct old_status) from classified
  ) r order by r.ord;
