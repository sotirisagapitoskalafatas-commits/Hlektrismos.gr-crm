-- STAGED — NOT APPLIED. One-time, idempotent copy of the legacy table public.hlektrismos_leads into public.leads,
-- so the sales team can see the lead history in the CRM. Run the dry-run FIRST: docs/ops/LEGACY_LEADS_IMPORT_DRYRUN.sql
-- (counts only, read-only). Staging first, then production only with the owner's approval and a backup.
--
--   * Nothing is deleted or changed in hlektrismos_leads.
--   * Every copied row is marked: source = 'import', source_label = 'Παλιά βάση', tags = {'import', 'legacy_import:<old id>', …}.
--     The tag 'legacy_import:<old id>' is what makes a second run copy nothing.
--   * Skipped (and counted by the dry-run): already imported · soft-deleted in the old table · no name · no phone and no
--     e-mail · a status that cannot be mapped · the same phone (last 10 digits) or e-mail already in public.leads ·
--     the same phone/e-mail twice inside the old table (the oldest row is the one copied).
--   * Status mapping (old → leads_status_check): new, lead → new · contacted, intro, follow_up → contacted ·
--     qualified → qualified · awaiting_offer, proposal → offer · lost, rejected → lost · the old "beyond lead" statuses
--     (converted, customer, won, active, accepted, awaiting_signature, docs_pending, sent_to_provider,
--     submitted_to_provider, deddie_meter_reading) → qualified, with the tag 'legacy_status:<old status>' so nothing is
--     lost. They are NOT marked «converted»: no case exists for them in the CRM. OWNER DECISION: the CASE below is the
--     one place to change it.
--   * Consent is copied as recorded (gdpr_consent = old consent; consent_version 'legacy'; consent_source
--     'legacy_import'). Rows without recorded consent are copied too but visibly (gdpr_consent = false): do not contact
--     them until the contact-eligibility rules (phase3/09) are applied and the owner decides.
--   * Not copied on purpose: government_id (sensitive, not needed to see a lead), bill file paths, scores, assignments.
--     Imported leads are unassigned.
--   * One statement = atomic: it all happens or nothing does. It also writes ONE activity_log entry with the counts only.
-- Rollback: docs/ops/rollback_phase4_16_legacy_leads_import.sql.

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
, ins as (
  insert into public.leads (client_name, client_contact, first_name, last_name, full_name, email, phone, region, property_type, comments,
                            service_category, provider, lead_type, status, source, source_label, tags, created_at, updated_at,
                            gdpr_consent, consent_version, consent_granted_at, consent_source, notes)
  select btrim(concat_ws(' ', c.first_name, c.last_name)),
         coalesce(c.phone, c.email, ''),
         coalesce(c.first_name, ''), coalesce(c.last_name, ''), btrim(concat_ws(' ', c.first_name, c.last_name)),
         c.email, c.phone, c.region, c.property_type, c.comments,
         coalesce(c.service_type, 'Ρεύμα'), c.provider, c.customer_type, c.new_status, 'import', 'Παλιά βάση',
         array['import', 'legacy_import:' || c.id::text]
           || case when c.beyond_lead then array['legacy_status:' || c.old_status] else '{}'::text[] end
           || case when c.old_source is not null then array['legacy_source:' || c.old_source] else '{}'::text[] end,
         c.created_at, now(),
         c.consent, 'legacy', case when c.consent then c.created_at end, 'legacy_import',
         'Εισαγωγή από την παλιά βάση (hlektrismos_leads)'
    from classified c where c.verdict = 'copy'
  returning 1
)
insert into public.activity_log (entity_type, entity_id, action, details)
select 'lead_import', null, 'legacy_import',
       jsonb_build_object('copied', (select count(*) from ins),
                          'skipped', (select jsonb_object_agg(v, n) from (select verdict v, count(*) n from classified where verdict <> 'copy' group by 1) x));
