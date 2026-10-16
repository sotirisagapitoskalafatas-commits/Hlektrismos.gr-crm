# Security findings on the live Admin centre: cause, fix, how the website keeps working

Staged SQL and docs only. **Nothing is applied.** Apply on staging first, then production with approval and a backup.

**How each cause was found.** The live Admin centre runs anonymous probes with the public anon key. Each cause below is read from the migrations in Git and reproduced locally (PGlite) against the same policy statements. I have not read the live catalog.

**To confirm on live,** run [`pending_migrations_check.sql`](pending_migrations_check.sql), which is read-only. To list the live policies, also run:
`select schemaname, tablename, policyname, roles, cmd from pg_policies where tablename in ('crm_integrations','crm_settings','profiles','objects') order by 1,2,3;`

---

## 1. An anonymous visitor can read the integration-settings table (`crm_integrations`)

- **Exact cause.** Migration `20260818160000_create_integrations_table.sql` creates the policy `"authenticated can manage integrations"` **FOR ALL TO public USING (true) WITH CHECK (true)**. `TO public` includes the `anon` role, despite the name. So any visitor holding the public key can read **and change** every row, including `config` (tokens).
- **Smallest fix.** Already staged: `phase1/01_rls_hardening.sql` §2.
  - It drops that policy.
  - The table becomes admin-only (`is_role('admin')`).
  - Other staff read the `crm_integrations_status` view (id, name, connected, updated_at; no `config`).
  - §3 also revokes anonymous select/update/delete on 20 sensitive tables.
- **Website form, chatbot and webhook keep working.** None of them touch this table:
  - the form calls `insert_website_lead`, which is SECURITY DEFINER and keeps its anonymous EXECUTE;
  - the chatbot's `chat` function uses the anon key and calls only that RPC and `get_active_tariff_prices`;
  - the webhook uses the service role.
- **Test** (local): `supabase/tests/website-intake-hardening.test.mjs`. It reproduces the anonymous read and write with the real policy. After 01 the anonymous read and write return nothing, while the **real** `insert_website_lead` still stores a website lead. The visitor still cannot read leads back. Also `rls.test.mjs` («AFTER: anonymous role is fully locked out»).

## 2. An anonymous visitor can list files in the `hlektrismos_docs` bucket

- **Exact cause.** Storage policies are **permissive**, so they are OR-ed together. Migration `20260820000004_fix_storage_anon_policies.sql` created:
  - `"hlektrismos_docs_anon_select"`: SELECT **to anon** on the whole bucket. This is the one behind the finding.
  - `"hlektrismos_docs_anon_insert"`: anonymous INSERT on **any path**.
  - `"hlektrismos_docs_auth_select / insert / update / delete"`: any **signed-in** account, including inactive or self-registered ones, may read, change or delete every file.

  Later migrations added narrow policies (`20260909120000` «public uploads lead files»; `20261001000100` «staff reads lead files», active staff only), but **nobody dropped the old ones**, so they still allow. The bucket itself is private (`public = false`), so there is no public URL. But SELECT on `storage.objects` is what the Storage API checks for `list()` and for creating signed download links.
- **Smallest fix.** New staged file `phase1/16_storage_docs_lockdown.sql`:
  - drops the legacy policies (both generations, by name);
  - replaces the combined upload policy with two narrow ones: **anon may INSERT only into `contact-forms/`**, and **active staff may INSERT anywhere in the bucket** (the CRM's `leads/<id>/` and the old customer/provider screens);
  - keeps SELECT for active staff only;
  - gives staff no UPDATE or DELETE (nothing in the app needs them; the Κάδος purge gets an admin-only delete from phase2/06);
  - leaves the service role unchanged.
- **Website upload keeps working.** `uploadDocument()` uses `upsert: false`. In Supabase Storage an upload needs **INSERT only**; `upsert: true` would also need SELECT and UPDATE. The form uploads into `contact-forms/`, which stays allowed. List and select are denied.
- **Test** (local): `supabase/tests/storage-docs.test.mjs`. It replays **every** policy statement on `storage.objects` from the five real migrations, in order:
  - **before the fix**, the anonymous visitor lists both files and can plant a file under `leads/`;
  - **after the fix**:
    - the anonymous list is empty, an anonymous upload to `contact-forms/` succeeds, and uploads elsewhere are refused;
    - anonymous update and delete affect 0 rows;
    - inactive accounts see and upload nothing;
    - active staff list and upload;
    - the `energy-bills` bucket is untouched.
- **Staging check after applying** (5 minutes, test file only):
  1. In a private window, submit the website form with a small test PDF. Expect success.
  2. Admin centre → Ασφάλεια → «Εκτέλεση ελέγχων». Expect «Ανώνυμος επισκέπτης → αρχεία φόρμας» = «Επαληθεύτηκε».
  3. In the CRM, open the new lead → «Αρχεία από τη φόρμα» → «Άνοιγμα». Expect the file opens (a signed link for staff).
  4. Move the test lead to the Κάδος.

## 3. Any user can make themselves admin (`profiles`)

- **Exact cause.** Migration `20260910103000_crm_os_phase11_org_team_role_model.sql` (line 586) re-created the policy `"profiles update own"` as `with check (auth.uid() = id)`. That undid the hardened version of `20260910010000`. Any signed-in user can therefore run `update profiles set role = 'admin', is_active = true where id = auth.uid()`.
- **Smallest fix.** Already staged: `phase2/05_staff_admin_and_role_preview.sql` §1.
  - It adds the trigger `profiles_guard_privileged`, which refuses changes to role or status coming from the browser roles (`authenticated`/`anon`).
  - It restores the hardened policy.
  - Name and phone stay editable (the app's «Λογαριασμός» page sends only those).
- **Website form unaffected:** it never touches `profiles`.
- **Test** (local): `supabase/tests/staff-admin.test.mjs`, «BEFORE the fix (reproduces …)» and «AFTER: own role / status can no longer be changed directly; own name still editable».

## 4. A manager can read credentials in `crm_settings`

- **Exact cause.** Migration `20260911040000_b2b_scraper_and_provider_catalog.sql` created `"crm_settings_admin_all"` **FOR ALL to admin OR manager**. So a manager can read every row, including the SerpApi, IMAP and Vapi keys stored there by the legacy SettingsPanel. A manager can also rewrite `role_permissions`.
- **Smallest fix.** Already staged: `phase2/05` §6.
  - Reads are split: admins read everything; managers read only non-credential keys (`crm_setting_is_credential`: key, secret, password, token, imap, smtp, vapi, twilio…); other roles read none.
  - Only admins write.
  - The scraper settings RPCs and the service role keep working.
- **Remaining risk (not fixed by 05):** admins still read the credential rows in the browser, through the legacy SettingsPanel. The real fix is to move those keys to Edge Function secrets or Vault and retire that panel. That is a separate change; I have not started it.
- **Website form unaffected:** it never reads `crm_settings`.
- **Test** (local): `staff-admin.test.mjs`, «crm_settings: managers no longer read credentials or rewrite permission overrides; admins write».

---

## Not claimed
These fixes close the four findings above. They do **not** make the system "fully secure". The Admin centre's «Δεν έχει επαληθευτεί ζωντανά» list still stands:
- RLS per role with real accounts;
- MFA;
- public signups;
- backup and restore test;
- comparison of edge-function versions.
