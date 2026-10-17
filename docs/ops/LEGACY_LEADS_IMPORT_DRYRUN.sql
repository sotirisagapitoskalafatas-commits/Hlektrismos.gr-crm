-- READ-ONLY dry run for the staged legacy-leads import (supabase/staged-migrations/phase4/16_import_legacy_leads.sql).
-- Paste each of the two queries in the Supabase SQL Editor and send the grids back. Counts only: no names, phones, e-mails.
-- Nothing is written; both are plain SELECTs.

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
         end as new_status,
         old_status in ('converted', 'customer', 'won', 'active', 'accepted', 'awaiting_signature', 'docs_pending',
                        'sent_to_provider', 'submitted_to_provider', 'deddie_meter_reading') as beyond_lead
    from src s
), elig as (
  select m.* from mapped m
   where m.deleted_at is null and (m.first_name is not null or m.last_name is not null)
     and (m.phone is not null or m.email is not null) and m.new_status is not null
), classified as (
  select m.*,
         case
           when exists (select 1 from public.leads l where l.tags @> array['legacy_import:' || m.id::text]) then 'already_imported'
           when m.deleted_at is not null then 'soft_deleted'
           when m.first_name is null and m.last_name is null then 'no_name'
           when m.phone is null and m.email is null then 'no_contact'
           when m.new_status is null then 'unmappable_status'
           when exists (select 1 from public.leads l
                         where not exists (select 1 from unnest(coalesce(l.tags, '{}'::text[])) t where t like 'legacy\_import:%')
                           and ((m.phone_key is not null and length(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g')) >= 10
                                 and right(regexp_replace(l.phone, '\D', '', 'g'), 10) = m.phone_key)
                                or (m.email is not null and lower(btrim(coalesce(l.email, ''))) = m.email))) then 'duplicate_existing'
           when exists (select 1 from elig e
                         where e.id <> m.id and (e.created_at, e.id) < (m.created_at, m.id)
                           and ((m.phone_key is not null and e.phone_key = m.phone_key) or (m.email is not null and e.email = m.email))) then 'duplicate_in_legacy'
           else 'copy'
         end as verdict
    from mapped m
)
-- <<< CLASSIFY
select item, n, meaning from (
  select 1 as ord, 'legacy rows in total' as item, count(*) as n, 'every row of hlektrismos_leads' as meaning from classified
  union all select 2, 'would be COPIED', count(*) filter (where verdict = 'copy'), 'new rows in public.leads (source import, label «Παλιά βάση»)' from classified
  union all select 3, 'skipped: already imported', count(*) filter (where verdict = 'already_imported'), 'a previous run copied them (0 before the first run)' from classified
  union all select 4, 'skipped: soft-deleted in the old table', count(*) filter (where verdict = 'soft_deleted'), 'deleted_at is set; a deletion is respected' from classified
  union all select 5, 'skipped: no name', count(*) filter (where verdict = 'no_name'), 'first and last name both empty' from classified
  union all select 6, 'skipped: no phone and no e-mail', count(*) filter (where verdict = 'no_contact'), 'nothing to reach the person with (the placeholder e-mail counts as empty)' from classified
  union all select 7, 'skipped: status cannot be mapped', count(*) filter (where verdict = 'unmappable_status'), 'a status outside the mapping table in the SQL file' from classified
  union all select 8, 'skipped: already in public.leads', count(*) filter (where verdict = 'duplicate_existing'), 'same phone (last 10 digits) or same e-mail as a lead the CRM already has' from classified
  union all select 9, 'skipped: repeated inside the old table', count(*) filter (where verdict = 'duplicate_in_legacy'), 'same phone/e-mail as an older old-table row; the oldest is copied' from classified
  union all select 10, 'of the COPIED: without recorded consent', count(*) filter (where verdict = 'copy' and not consent), 'copied with gdpr_consent = false; not to be contacted until the owner decides' from classified
  union all select 11, 'of the COPIED: old status beyond «lead»', count(*) filter (where verdict = 'copy' and beyond_lead), 'converted, customer, won, active, … → qualified + tag legacy_status:<old>; owner decision' from classified
  union all select 12, 'of the COPIED: no e-mail', count(*) filter (where verdict = 'copy' and email is null), 'phone only' from classified
  union all select 13, 'of the COPIED: no phone', count(*) filter (where verdict = 'copy' and phone is null), 'e-mail only' from classified
  union all select 14, 'check: the numbers add up', (count(*) - count(*) filter (where verdict in ('copy','already_imported','soft_deleted','no_name','no_contact','unmappable_status','duplicate_existing','duplicate_in_legacy'))), 'must be 0' from classified
  union all select 15, 'old statuses in use (all rows)', count(distinct old_status), 'distinct values; the SQL file maps 20 known ones' from classified
) r order by ord;
