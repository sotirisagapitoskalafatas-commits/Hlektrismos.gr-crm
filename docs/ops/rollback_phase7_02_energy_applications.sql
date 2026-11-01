-- ROLLBACK for staged phase7/02 (energy applications). Review before running; staging first. Needs phase7/01's rollback AFTER this one.
-- OPTION A (recommended): switch the feature off and KEEP all data. Applications, their documents and the files stay; nobody can create or submit new ones.
drop function if exists public.submit_energy_application(uuid);
drop function if exists public.withdraw_energy_application(uuid, text);
drop function if exists public.request_application_documents(uuid, text);
drop function if exists public.add_application_document(uuid, text, text, text, text, integer, uuid);
drop function if exists public.set_application_document_status(uuid, text, text);
drop trigger if exists energy_applications_guard_trg on public.energy_applications;
drop trigger if exists energy_applications_audit_trg on public.energy_applications;
drop function if exists public.energy_applications_guard();
drop function if exists public.energy_applications_audit();
drop policy if exists "application files are not deleted (restrictive)" on storage.objects;

-- the phase4/21 storage helpers, without the application branch:
create or replace function public.sales_can_read_object(p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  id_text text := parts[2];
begin
  if p_bucket = 'hlektrismos_docs' then
    if parts[1] = 'leads' and id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return public.sales_owns_lead(id_text::uuid);
    end if;
    if parts[1] = 'contact-forms' then
      return exists (select 1 from public.leads l
                     where l.attached_files @> jsonb_build_array(jsonb_build_object('path', p_name)) and public.sales_owns_lead(l.id))
          or exists (select 1 from public.case_documents d
                     where d.file_url = 'hlektrismos_docs/' || p_name and public.sales_owns_case(d.case_id)); -- lib/lead-files leadFileRef()
    end if;
    return false;
  end if;
  if p_bucket = 'client_documents' then
    return exists (select 1 from public.case_documents d where d.file_url = p_name and public.sales_owns_case(d.case_id));
  end if;
  return p_bucket not in ('energy-bills');
end;
$$;

create or replace function public.sales_can_write_object(p_bucket text, p_name text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  parts text[] := string_to_array(p_name, '/');
begin
  if p_bucket = 'hlektrismos_docs' then
    return parts[1] = 'leads' and parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and public.sales_owns_lead(parts[2]::uuid);
  end if;
  if p_bucket = 'client_documents' then
    return parts[1] = 'cases'; -- case uploads carry no case id; reading them back is limited above
  end if;
  return p_bucket not in ('energy-bills');
end;
$$;

revoke all on function public.sales_can_read_object(text, text) from public, anon;
revoke all on function public.sales_can_write_object(text, text) from public, anon;
grant execute on function public.sales_can_read_object(text, text) to authenticated, service_role;
grant execute on function public.sales_can_write_object(text, text) to authenticated, service_role;

-- OPTION B (destructive; ONLY when no application exists and after a backup): drop the Case link first, then the tables.
--   select count(*) from public.energy_applications;   -- must be 0
--   alter table public.case_visits drop constraint if exists case_visits_application_fk;
--   alter table public.cases drop column if exists application_id;
--   drop table if exists public.application_documents; drop table if exists public.energy_applications; drop table if exists public.application_service_types;
--   drop sequence if exists public.energy_application_no_seq;
-- The stored files under client_documents/applications/ are evidence and are NOT removed by any of this.
