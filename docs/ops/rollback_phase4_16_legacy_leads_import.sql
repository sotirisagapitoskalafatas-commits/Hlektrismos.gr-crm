-- ROLLBACK for the staged legacy-leads import (supabase/staged-migrations/phase4/16_import_legacy_leads.sql).
-- Review first, then delete. Tested locally (PGlite): supabase/tests/legacy-leads-import.test.mjs.
-- The old table hlektrismos_leads was never touched, so nothing has to be restored there.

-- 1) REVIEW (read-only): what the import created, and how much of it the team has already worked on.
select count(*)                                              as imported_leads,
       count(*) filter (where l.converted_case_id is not null) as already_converted,
       count(*) filter (where exists (select 1 from public.cases k where k.lead_id = l.id)) as with_a_case
  from public.leads l
 where exists (select 1 from unnest(coalesce(l.tags, '{}'::text[])) t where t like 'legacy\_import:%');

-- 2) DELETE the imported leads nobody has built on. A lead that was converted or has a case is KEPT.
--    If the team has added notes, follow-ups or documents to an imported lead, review those first: a reference from
--    another table either blocks the delete (the statement fails and nothing is deleted) or follows that table's own rule.
delete from public.leads l
 where exists (select 1 from unnest(coalesce(l.tags, '{}'::text[])) t where t like 'legacy\_import:%')
   and l.converted_case_id is null
   and not exists (select 1 from public.cases k where k.lead_id = l.id);

-- The activity_log entry written by the import (entity_type 'lead_import', counts only) stays as the record of what happened.
-- Running the import again afterwards copies the rows again (the marker tags went with the deleted leads).
