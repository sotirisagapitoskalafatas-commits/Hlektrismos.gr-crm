-- Rollback of phase6/21_two_role_model.sql: removes the legacy-role trigger and restores the audit read policy.
-- Then re-run phase4/20_backoffice_sales_agent_provisioning.sql to bring back the previous matrix and directory.
drop trigger if exists profiles_no_new_legacy_office on public.profiles;
drop function if exists public.profiles_no_new_legacy_office();
drop policy if exists "staff admin audit read" on public.staff_admin_audit;
create policy "staff admin audit read" on public.staff_admin_audit for select to authenticated
  using (public.is_staff() and (public.is_role('admin') or public.is_role('manager')));
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select p.role from public.profiles p where p.id = auth.uid()));
