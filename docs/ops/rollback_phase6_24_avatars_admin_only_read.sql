-- Rollback of supabase/staged-migrations/phase6/24_avatars_admin_only_read.sql.
-- It removes the Admin read of other people's photos. It deliberately does NOT restore phase6/20's "avatars read office" policy, which let the legacy
-- back_office role read every photo; going back to that would reopen what phase6/24 closed. Each user keeps access to their own photo.
-- The bucket and the files are not touched (remove them in the Dashboard if wanted). To remove the whole feature, run rollback_phase6_20_user_preferences.sql.
drop policy if exists "avatars read admin" on storage.objects;
drop policy if exists "avatars read office" on storage.objects;
