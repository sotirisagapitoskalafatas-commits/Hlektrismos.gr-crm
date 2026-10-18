-- Rollback of supabase/staged-migrations/phase4/19_staff_only_legacy_tables.sql (drops only its own policies).
do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_policies where schemaname = 'public' and policyname = 'staff only (restrictive)' loop
    execute format('drop policy if exists %I on %I.%I', 'staff only (restrictive)', r.schemaname, r.tablename);
  end loop;
end $$;
