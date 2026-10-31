-- STAGED — apply only AFTER the real shared Admin has signed in and the QA / demo admins are switched off (docs/ops/sql/deactivate_qa_accounts.sql). NOT yet applied.
-- Phase 6 / 26: one active `admin` row, enforced by the database. A second active admin cannot be created, activated or promoted, by any code path.
-- It names no account: it refuses unless exactly one active admin exists and that account can really sign in, so it can never lock the owner out or pick the
-- wrong person. The shared login is one identity: audit rows name that account, not the employee using it.
-- Rollback: docs/ops/rollback_phase6_26_single_active_admin.sql
do $$
declare v_n int;
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check' and pg_get_constraintdef(oid) like '%sales_agent%') then
    raise exception 'phase6/26 needs phase6/25 first';
  end if;
  select count(*) into v_n from public.profiles where role = 'admin' and coalesce(is_active, true);
  if v_n <> 1 then raise exception 'expected exactly 1 active admin, found %: finish the Admin provisioning and the QA cleanup first', v_n; end if;
  if not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.role = 'admin' and coalesce(p.is_active, true) and u.last_sign_in_at is not null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now()) and exists (select 1 from auth.identities i where i.user_id = u.id)) then
    raise exception 'the active admin has not signed in, or cannot: do not lock this in';
  end if;
end $$;
create unique index if not exists profiles_single_active_admin on public.profiles ((true)) where role = 'admin' and coalesce(is_active, true);
