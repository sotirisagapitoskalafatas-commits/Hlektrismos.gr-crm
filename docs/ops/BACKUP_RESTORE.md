# Backup and isolated restore — production `nonaymiwdayfuulccxrl`

## Why a custom backup
The project has **no platform backup to rely on**: `supabase backups list` returns no backups and `pitr_enabled: false`. Docker, `pg_dump` and the database password are not available to the tooling, so the backup is taken **through the Supabase CLI with SELECT statements only** (`scripts/ops/prod-backup.mjs`). It needs no secret key and changes nothing.
*(Recommended anyway: enable Supabase daily backups / PITR in the Dashboard — owner action — so a platform-level restore point also exists.)*

## What the backup contains (and what it does not)
| Included | Not included |
|---|---|
| Every row of all 79 `public` tables (NDJSON, one file per table) | Row data of `auth` (only a credential-free user list: ids, e-mails, timestamps, bans, metadata — **no password hashes, tokens or MFA secrets**) |
| Full catalog snapshot (`schema.json`): columns/defaults/generated columns, sequences, constraints, indexes, 71 functions (full source), 38 triggers, RLS flags, 287 policies, grants for `anon`/`authenticated`/`service_role`, views, enums, extensions, `storage.objects` policies | **Storage files** are not in `prod-backup.mjs`; they have their own step: `scripts/ops/storage-backup.mjs` (below). The SQL rollout does not touch files |
| Platform metadata: Auth identities, storage buckets and object metadata, `cron.job` schedules + md5 of each command (not the command text) | Vault secrets, Edge Function secrets, Auth settings (Site URL, SMTP, templates) — screenshot these in the Dashboard before the window |
| `manifest.json`: per-table row counts and sha256, git commit, time | |

The output folder holds **customer data**. Keep it outside the repository (any folder outside the repository), on an encrypted disk, never upload it.

## Take a backup
```
node scripts/ops/prod-backup.mjs --ref <production project ref> --out <folder outside the repository>
```
Run it **immediately before** the maintenance window and again right after the last migration step; keep both.

## Isolated restore test
```
node scripts/ops/restore-verify.mjs <backup folder>                 # restore + 14 integrity checks
REHEARSE=1 node scripts/ops/restore-verify.mjs <backup folder>      # + the rollout rehearsal and the rollback test
```
The script rebuilds the database in a **throw-away in-memory Postgres (PGlite)** on your machine, loads schema and data, and checks: backup files intact (sha256 vs manifest); all tables restored; row counts; every row's values (canonical-JSON hash per table); all constraints including foreign keys validate; indexes, functions, triggers, RLS flags and policies restored; `is_role` / `is_staff` byte-identical. Nothing leaves the machine.

### Evidence — 30 Oct 2026, backup `nonaymiwdayfuulccxrl-2026-10-30T13-06-40Z`
- Backup: 79 tables, **1 534 rows**; platform: 9 auth users, 8 identities, 2 buckets, 20 objects, 8 cron jobs.
- Restore: **14/14 checks passed** (all 79 tables, 1 534 rows identical, 155 indexes, 71 functions, 38 triggers, 287 policies, RLS on 79 tables).
- Rollout rehearsal on the restored (local) copy: **27 not-yet-live staged files applied without error**; `phase1/03`, `phase5/17`, `phase5/18` are already live and were skipped; the repository's pending-migrations probe is true for everything except the two superseded files; the only change to existing data is one seed row in `crm_settings` (32→33).
- Behaviour on the restored real data: admin may create a `field_sales` account, manager / legacy back office / both sales roles may not; admin reads the 6-profile directory, legacy manager is refused; admin still sees all 7 leads and 6 cases; a Sales Agent sees only own records.
- **Storage files:** `node scripts/ops/storage-backup.mjs <backup folder>` downloaded **20/20 files (6 861 671 bytes)** through the CLI's own login, sizes verified against the database's object metadata, sha256 in `storage-manifest.json`. Restore mechanism proven on **Supabase staging** with a synthetic PNG (upload → download → identical hash → removed); customer documents were never copied to staging.
- **Definitions rollback** (`scripts/ops/make-rollback-sql.mjs`, run twice = idempotent) on the migrated copy: all 71 function definitions, 287 policies, 38 triggers, tables/columns, RLS flags and 1 673 grants **identical to the snapshot**; only data difference: the seeded `crm_settings` row.
- **Limits of this evidence:** PGlite is Postgres, not Supabase — `auth`, `storage`, `cron`, `net`, `vault` and `pgvector` are stand-ins, so platform behaviour is covered by the **staging** run (`scripts/qa/staging-two-role.mjs`, 63/64 real-JWT checks), not by this restore.

## Restore into production (only if the rollout must be undone)
1. **Definitions** (policies, triggers, functions, RLS, grants, rollout-created tables/columns): `node scripts/ops/make-rollback-sql.mjs <pre-rollout backup> > rollback.sql`, review, run in the SQL editor. It leaves row data alone.
2. **Rows**, only if a migration damaged data (the staged files are additive; none rewrites existing rows): reload the affected tables from `data/<table>.ndjson` (`insert … select … from jsonb_populate_recordset(null::public.<table>, <json>)`), in foreign-key order, with `session_replication_role = replica`.
3. Seed rows created by a migration (e.g. one `crm_settings` row) are not removed by the definitions rollback; delete them by key if needed.
4. Auth: nothing in the rollout changes Auth data except the **optional** QA deactivation (`docs/ops/sql/deactivate_qa_accounts.sql`), which is reversed by `update auth.users set banned_until = null …` and `update public.profiles set is_active = true …`.
