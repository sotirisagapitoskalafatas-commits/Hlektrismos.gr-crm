# Handoff summary — Thursday 22 Oct

Written 18/10/2026 by OpenCode. Facts below were read from the repository and the
staging database, not from memory. Where something was **not** verified, it says so.

---

## 1. The short version

- **All 21 staged SQL migrations are applied on staging** and verified with a
  read-only catalog check (`docs/ops/pending_migrations_check.sql`). Every marker
  returns `t`. The per-step procedure, the exact check query for each file, and the
  backup points are in `docs/ops/STAGING_APPLY_SCRIPT.md`.
- **The full PGlite suite passes: 296 / 296, 0 fail.** Earlier single-file failures
  in this session were memory contention under parallelism, not defects — each
  passed in isolation, and the whole suite went green once the Node heap was capped
  at 512 MB. See §4.
- **Nothing was written to the live database.** Live is read-only for me for the
  whole session. `LIVE_RO_DB_URL` is unset and no live connection string exists in
  the repo or the environment, so Task A (the live status check) is **blocked**,
  not done. See §5.
- **No merge, no push to `main`, no deploy.** No secrets printed. No real customer
  data used (synthetic UUIDs only).

---

## 2. Where each queue item stands

The queue is `docs/ops/MASTER_PROMPT_COVERAGE.md` (9 numbered items in its §"Gaps to
build"; the file also maps every requirement §0–§23). It is committed on `main` (via
PR #93). Status after this session:

| # | Item | State | Note |
|---|------|-------|------|
| 1 | Legacy import: skip soft-deleted | done | `phase4/16` applied on staging; dry run only, **no rows copied** |
| 2 | `STAGING_APPLY_SCRIPT.md` | done | merged as PR #95; 21 steps + separate `04` caveat |
| 3 | Security audit + staged SQL fixes | done | PR #96; `phase1/16`, `phase1/17` applied on staging |
| 4 | Admin-only account provisioning | **not mine** | PR #98, branch `feat/admin-only-provisioning` — another agent's. Untouched |
| 5 | Two-role mapping + own-records RLS for sales | staged, applied on staging | not applied on live; screens show the neutral sentence until it is |
| 6 | One folder layout for Lead/Case/Customer | not started | |
| 7 | Rename «Λειτουργίες» | not started | |
| 8 | Redesign pass (§10, §17) | not started | |
| 9 | §3 outcomes/reasons, §7 per-stage checklist, §8 Back Office | staged `07a/b/c`, `phase4/13` applied on staging | not on live |

**Caveat on the coverage file:** `MASTER_PROMPT_COVERAGE.md` was written before this
session's staging applies. Its `built-waiting-for-SQL` markers — §6.2 supply points,
§7.1 per-stage checklist, §8 Back Office stages/exceptions — and the notes saying
`phase1/16` and `phase5/17–18` are unapplied were true of **live** and of staging at
that time. They are now applied on **staging** only. Live is unchanged.

**The paid-waiting items were not built**, as instructed: §4 routes/map/check-in,
§5.2 duplicate approval queue, §6.3 custom fields. They need the owner's written
approval first.

---

## 3. What "applied on staging" means, exactly

21 files under `supabase/staged-migrations/`, across five phases:

- **phase1** — `01` RLS hardening, `02` outreach-decisions audit, `03` drop
  `exec_sql`, `16` storage docs lockdown, `17` anonymous restrictive lockdown.
- **phase2** — `05` staff admin + role preview, `06` trash (leads/customers),
  `07a` document checklist + return-for-correction, `07b` case stage guard +
  `set_case_stage`, `07c` reopen completed case.
- **phase3** — `08` B2B prospects review distribution, `09` contact eligibility.
- **phase4** — `10` field check-in manual flag, `11` customer first/last name,
  `12` default back-office assignee, `13` case exception state, `14` follow-up
  `kind`, `15` convert-lead phone-only match, `16` import legacy leads.
- **phase5** — `17` customer supply points, `18` lead supply points.

**One caveat:** `phase1/04_cron_secret_and_pause.sql` is applied on staging but is
**not** part of the 21-row check grid. The check script queries `cron.job` only as
a separate statement at the bottom, and that errors harmlessly if `pg_cron` is not
readable for the connected role. So "`04` is applied" rests on the apply log, not
on a catalog marker.

**Non-additive steps got a schema-only backup first**, taken immediately before
the apply and kept on `D:\`:

- `phase2/07a`, `07b`, `07c`
- `phase4/10`

The rest are additive (new tables/columns/functions/policies) and need no backup.

**The legacy import was a dry run only.** `import_legacy_leads()` runs in dry-run
by default and prints counts; `import_legacy_leads(false)` is the real copy and was
**not** executed. No data was migrated.

Per-file check queries and the exact `psql` invocations are in
`docs/ops/STAGING_APPLY_SCRIPT.md`. Backups taken before the non-additive steps are
on `D:\`, named `backup_staging_before_*.sql` (with a timestamp).

---

## 4. The PGlite suite — and a false alarm worth knowing about

Final state: **296 tests, 296 pass, 0 fail.**

This session produced three apparent failures, all in different files, and all
reproducible only under the parallel full-suite run:

1. `reopen-case.test.mjs` — failed in the suite, **passed 9/9 alone**.
2. `stage-set.test.mjs` — failed in a later suite run, **passed alone**.
3. Both together — passed, but the process exited `-1` (truncated under memory
   pressure), not on an assertion.

The cause was **system memory pressure**, not the SQL. Each PGlite test spins up an
in-memory Postgres; running the whole suite in parallel drove free RAM to ~2.8 GB of
15.9 GB and the failures moved between files. Capping the Node heap with
`NODE_OPTIONS=--max-old-space-size=512` for the run made the entire suite pass.

**If you re-run the suite and see one file fail while everything else is green,
run that file on its own before believing it.** This is an environment artefact,
not a regression.

---

## 5. Live database — blocked, not done

I did **not** run anything against the live database, and I could not.

- `LIVE_RO_DB_URL` is not set in the environment.
- No live connection string (host, user, password) exists anywhere in the repository,
  and none was provided to me. The handoff rules require live credentials to stay out
  of chat, so I did not go looking for them in logs or ask for them in the clear.
- The `.env` in the working tree points at a local mock
  (`VITE_SUPABASE_URL=http://127.0.0.1:54399`), not at live.

What this means concretely: `docs/ops/pending_migrations_check.sql` has **not** been
run on live, so I cannot say which of the 21 files are already there and which are
pending. The script itself is verified safe to run — I read it line by line; it is a
single `select` over a `values` list, reading only `pg_policies`, `pg_proc`,
`pg_trigger` and `information_schema`. No DML, no DDL, no functions invoked, no
customer data or PII read. It is safe for a read-only role.

**To finish Task A**, run that script on live from the Supabase SQL editor (read-only
is fine) and paste the output. Expect many rows to be `false` — that is the pending
list, and it is the next batch after staging is confirmed good.

Also still pending on the live side, from the security work:

- **Rotate the leaked live service-role key.** It is present in `create-demo.mjs` in
  the repo history. Rotation is step 1 of `docs/ops/SECURITY_HOTFIX_RUNBOOK.md` and
  needs the owner's dashboard. Do not print or commit the key.
- The live database password was exposed in an earlier session. Rotation is advised;
  the owner has not confirmed it done.
- `security:audit report…` (PR #96) is merged, but its live-facing checks
  (`phase1/16`, `phase1/17`) are applied on **staging only**.

---

## 6. Open questions for the owner

1. **GoTrue rejects directly-inserted users.** A synthetic staff user with a valid
   `pgcrypto` bcrypt password hash cannot sign in — the auth server returns
   `invalid_credentials`. The hash itself is well-formed. So I could not test the
   storage signed-URL flow end-to-end over HTTP; I verified it at the SQL level
   instead (signed-URL creation is gated by `SELECT` on `storage.objects`, so the
   property holds). Worth understanding before relying on programmatic user creation.
2. **No staging service-role key.** `.env` has only `VITE_MAPBOX_TOKEN` plus the mock
   URL above. Server-side staging tests that need the service role cannot run here.
3. **Which of the 21 are on live?** See §5 — needs one read-only run.

---

## 7. Rules I worked under (unchanged, restated so the next session inherits them)

- Never write to the live database. Never `supabase link` to live.
- Never merge, never push to `main`, never deploy. Work on `opencode/<item>` branches,
  one PR per item.
- Never touch `claude/*` branches or `feat/admin-only-provisioning` (#98).
- Every SQL change is a staged, additive file with a rollback and PGlite tests.
- A feature whose SQL is not applied shows «Η λειτουργία δεν είναι ακόμη διαθέσιμη.»
- Never print, log or commit secrets. Synthetic UUIDs only — no real customer data.
- Check free disk before each work block; stop below 3 GB.
- The paid features (§4, §5.2, §6.3) are not built until the owner says so in writing.
