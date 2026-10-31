-- Rollback of phase6/26: more than one active admin becomes possible again. Changes no row.
drop index if exists public.profiles_single_active_admin;
