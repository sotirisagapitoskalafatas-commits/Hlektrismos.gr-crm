-- STAGED — NOT APPLIED. One-time, idempotent import of ALL rows of the legacy table public.hlektrismos_leads into public.leads, so the
-- sales team can see the lead history in the CRM. Staging first, then production only with the owner's approval and a backup.
-- Owner decisions of 18/10/2026: import all rows except the soft-deleted ones (skipped) · rows without marketing consent are imported but marked «not for marketing» ·
-- imported leads are unassigned · statuses are mapped to ours and the original status is kept in a note.
--
-- HOW TO RUN (SQL editor, as the project owner):
--   1) create the objects:            run this whole file (it only creates a view and a function; nothing is copied).
--   2) DRY RUN (default, no writes):  select * from public.import_legacy_leads();            -- counts only
--   3) the real import:               select * from public.import_legacy_leads(false);       -- writes, returns the same counts
--   A read-only dry run that needs NOTHING created first is docs/ops/LEGACY_LEADS_IMPORT_DRYRUN.sql (same classification).
--   Neither anon nor authenticated users can run the function or read the view (grants revoked): only the owner can.
--
-- WHAT IT DOES
--   * Nothing is deleted or changed in hlektrismos_leads. Every row that is not soft-deleted is copied once. A second run copies nothing
--     (the tag 'legacy_import:<old id>' marks a copied row).
--   * Every copied row: source 'import', source_label 'Παλιά βάση', original date kept, UNASSIGNED, tags {'import', 'legacy_import:<id>',
--     'legacy_status:<old status>', 'legacy_source:<old source>'} and a note that names the original status.
--   * Rows WITHOUT recorded consent: gdpr_consent = false, tag 'not_for_marketing', and the note says so. They are for sales follow-up
--     only: no campaigns, no bulk SMS/e-mail. (Once phase3/09 is applied, a contact with no permission record is already refused for
--     promotional channels — fail closed; the tag and gdpr_consent = false make the same thing visible and searchable now.)
--   * Statuses (old → leads_status_check): new, lead → new · contacted, intro, follow_up → contacted · qualified → qualified ·
--     awaiting_offer, proposal → offer · lost, rejected → lost · the old "beyond lead" statuses (converted, customer, won, active, accepted,
--     awaiting_signature, docs_pending, sent_to_provider, submitted_to_provider, deddie_meter_reading) → qualified (never «converted»: no
--     case exists for them) · anything else or empty → new. The original status is always in the note and in the tag legacy_status:<old>.
--   * Rows that were SOFT-DELETED in the old table (deleted_at set) are SKIPPED (owner decision 18/10/2026): they stay in the old table and
--     are counted as «skipped_deleted» in the dry run. A deletion in the old table is respected, never undone by this import.
--   * Rows with no name get the name «Χωρίς όνομα (παλιά βάση)» (the column is required). Rows with no phone and no e-mail are copied as they are.
--   * Possible duplicates (the same phone — last 10 digits — or e-mail as a lead the CRM already has, or as an OLDER row of the old table)
--     are copied and tagged 'possible_duplicate' with a note; nothing is merged or hidden.
--   * Not copied on purpose: government_id (sensitive, not needed to see a lead), bill file paths, scores, assignments.
--   * One activity_log entry with the counts only (no personal data).
-- Rollback: docs/ops/rollback_phase4_16_legacy_leads_import.sql.

-- The plan as a view (owner only): one row per old row with everything the import decides. Contains personal data: not readable by app users.
create or replace view public.legacy_leads_import_plan as
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
                      where e.id <> m.id and e.deleted_at is null and (e.created_at, e.id) < (m.created_at, m.id)
                        and ((m.phone_key is not null and e.phone_key = m.phone_key) or (m.email is not null and e.email = m.email)))) as possible_duplicate
    from mapped m
)
-- <<< CLASSIFY
select * from classified;
revoke all on public.legacy_leads_import_plan from public, anon, authenticated;

-- DRY RUN by default (counts only, nothing written). p_dry_run => false: the same counts first, then the write, then «COPIED (written)».
create or replace function public.import_legacy_leads(p_dry_run boolean default true)
returns table (item text, n bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_copied bigint := 0;
begin
  -- the counts are taken BEFORE anything is written (a run that copies changes what «already imported» means)
  return query
  select r.item, r.n from (
    select 1 as ord, case when coalesce(p_dry_run, true) then 'MODE: DRY RUN — nothing is written' else 'MODE: IMPORT — rows are written' end as item, 0::bigint as n
    union all select 2, 'legacy rows in total', count(*) from public.legacy_leads_import_plan
    union all select 3, 'already imported by an earlier run (skipped)', count(*) filter (where already_imported and not is_deleted) from public.legacy_leads_import_plan
    union all select 4, 'skipped_deleted: soft-deleted in the old table (they stay there)', count(*) filter (where is_deleted) from public.legacy_leads_import_plan
    union all select 5, 'TO COPY in this run', count(*) filter (where not already_imported and not is_deleted) from public.legacy_leads_import_plan
    union all select 6, 'of those: without recorded consent → «not for marketing»', count(*) filter (where not consent and not already_imported and not is_deleted) from public.legacy_leads_import_plan
    union all select 7, 'of those: possible duplicates (tagged, not merged)', count(*) filter (where possible_duplicate and not already_imported and not is_deleted) from public.legacy_leads_import_plan
    union all select 8, 'of those: no name (named «Χωρίς όνομα»)', count(*) filter (where no_name and not already_imported and not is_deleted) from public.legacy_leads_import_plan
    union all select 9, 'of those: no phone and no e-mail', count(*) filter (where no_contact and not already_imported and not is_deleted) from public.legacy_leads_import_plan
    union all select 10, 'statuses: mapped directly', count(*) filter (where status_kind = 'direct' and not already_imported and not is_deleted) from public.legacy_leads_import_plan
    union all select 11, 'statuses: «beyond lead» → qualified', count(*) filter (where status_kind = 'beyond_lead' and not already_imported and not is_deleted) from public.legacy_leads_import_plan
    union all select 12, 'statuses: unknown or empty → new', count(*) filter (where status_kind = 'unknown' and not already_imported and not is_deleted) from public.legacy_leads_import_plan
    union all select 13, 'distinct old statuses in use', count(distinct old_status) from public.legacy_leads_import_plan
  ) r order by r.ord;
  if not coalesce(p_dry_run, true) then
    with ins as (
      insert into public.leads (client_name, client_contact, first_name, last_name, full_name, email, phone, region, property_type, comments,
                                service_category, provider, lead_type, status, source, source_label, tags, created_at, updated_at,
                                gdpr_consent, consent_version, consent_granted_at, consent_source, notes)
      select case when p.no_name then 'Χωρίς όνομα (παλιά βάση)' else btrim(concat_ws(' ', p.first_name, p.last_name)) end,
             coalesce(p.phone, p.email, ''),
             coalesce(p.first_name, ''), coalesce(p.last_name, ''), case when p.no_name then 'Χωρίς όνομα (παλιά βάση)' else btrim(concat_ws(' ', p.first_name, p.last_name)) end,
             p.email, p.phone, p.region, p.property_type, p.comments,
             coalesce(p.service_type, 'Ρεύμα'), p.provider, p.customer_type,
             p.mapped_status,
             'import', 'Παλιά βάση',
             array['import', 'legacy_import:' || p.id::text, 'legacy_status:' || coalesce(nullif(p.old_status, ''), 'empty')]
               || case when p.old_source is not null then array['legacy_source:' || p.old_source] else '{}'::text[] end
               || case when not p.consent then array['not_for_marketing'] else '{}'::text[] end
               || case when p.possible_duplicate then array['possible_duplicate'] else '{}'::text[] end,
             p.created_at, now(),
             p.consent, 'legacy', case when p.consent then p.created_at end, 'legacy_import',
             concat_ws(E'
',
               'Εισαγωγή από την παλιά βάση (hlektrismos_leads). Αρχική κατάσταση: ' || coalesce(nullif(p.old_status, ''), '(κενή)')
                 || case p.status_kind when 'beyond_lead' then ' — αντιστοιχίστηκε σε «qualified» (δεν υπάρχει case στο CRM).' when 'unknown' then ' — άγνωστη, μπήκε ως «new».' else '.' end,
               case when not p.consent then 'ΟΧΙ για marketing: δεν υπάρχει καταγεγραμμένη συγκατάθεση — μόνο follow-up πωλήσεων, όχι καμπάνιες ή μαζικά SMS/email.' end,
               case when p.possible_duplicate then 'Πιθανό διπλότυπο: ίδιο τηλέφωνο ή email με άλλο lead.' end)
        from public.legacy_leads_import_plan p
       where not p.already_imported and not p.is_deleted
      returning 1
    )
    select count(*) into v_copied from ins;
    insert into public.activity_log (entity_type, entity_id, action, details)
    values ('lead_import', null, 'legacy_import', jsonb_build_object('copied', v_copied));
    return query select 'COPIED (written)'::text, v_copied;
  end if;
end;
$$;
revoke all on function public.import_legacy_leads(boolean) from public, anon, authenticated;
