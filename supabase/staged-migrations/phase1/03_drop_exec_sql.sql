-- STAGED (Phase 1) — NOT APPLIED. Apply on staging first.
-- campaign-scheduler used rpc('exec_sql') with interpolated ids; no migration in Git defines it, so if it exists in
-- a live database it was created by hand. The repo no longer calls it. A generic SQL-execution RPC is never acceptable.
-- BEFORE running: run docs/audit/audit-rls-readonly.sql query 9 and save the function definition for the record.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'exec_sql'
  loop
    execute format('revoke all on function %s from anon, authenticated, public', r.sig);
    execute format('drop function %s', r.sig);
  end loop;
end $$;
-- ROLLBACK: restore from the definition saved before running (do not recreate a generic exec_sql).
