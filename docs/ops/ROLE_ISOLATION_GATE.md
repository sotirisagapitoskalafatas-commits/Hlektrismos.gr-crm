# Role isolation gate (LOCAL evidence for the two-role model)

`node --test supabase/tests/final-state-role-isolation.test.mjs` (22 tests, about 25 s).

**What it is.** The repository's own `supabase/migrations/` plus the STAGED files in the documented apply order (`APPLY_ORDER.md`), ending in the **final** two-role state:
`phase6/21` (two account types) → `phase4/18` + `phase4/21` (Sales Agents see only their own records) → `phase6/25` (exactly `admin` / `sales_agent`) → `phase6/26` (one active Admin) → `phase6/27` (credentials write-only).
It runs on embedded Postgres (PGlite) and is exercised from **four separate sessions**: the Admin, Sales Agent A, Sales Agent B and an anonymous visitor. Anonymous denial alone proves nothing about isolation between signed-in users, so none of the checks rely on it.

**What it is not.** It is not staging and not production. It does not read the live database, the Dashboard, Auth, PostgREST or Storage. Whether the live database already has these files is a separate fact (`pending_migrations_check.sql`, run by the owner).

## What it proves (on the final chain)
| Area | Checked from the browser roles |
|---|---|
| Self-promotion | A and B cannot become Admin or change anyone's role, status or key by 10 different direct writes (UPDATE of own/other/all rows, upsert, insert, `user_roles` insert/update); the grant/revoke/primary-role functions are not callable from the browser; `staff_update` / `staff_set_active` / `staff_list` / trash / purge / `reassign_lead` refuse a Sales Agent. |
| The Admin | cannot change their own role or status, cannot create a second Admin, cannot change a colleague's role by plain UPDATE (only the protected operation), and the protected operation still edits ordinary data. |
| Reactivation | a **deactivated** account cannot reactivate itself or edit its profile. |
| Defence in depth | four independent layers, each shown on its own inside a rolled-back transaction: no UPDATE privilege on `role` / `is_active` / `id` / `organization_id`; the trigger `profiles_guard_privileged`; the hardened own-row policy; the single-Admin rule. |
| Credentials | no browser session reads a credential row of `crm_settings` or an integration `config`, not even the Admin; nobody changes a credential or `role_permissions` through the table. |
| Isolation | A sees only A's leads, customers, cases, follow-ups, documents, offers, signatures, consents and tasks (same for B); the Admin sees both; legacy lead notes are not for Sales Agents; a deactivated agent sees nothing; A cannot change, reassign, delete or attach to B's records. |
| Documents | a case with **no** documents still moves along an allowed route: missing documents warn, they never block (no blocking mode or override exists). |
| Anonymous | reads and writes none of the above. |
| Tripwire | every `SECURITY DEFINER` function a browser can run either checks who is asking or is on a reviewed list with a reason; anonymous may run only `insert_website_lead` (the public form). A new unguarded function fails the build. |

## Negative control (why a passing gate means something)
The same attacks run against `supabase/migrations/` alone, which is what auto-applies today. They **succeed**: an `inside_sales` user turns themselves into `admin` with one UPDATE (migration `20260910103000`, line 586), an agent reads colleagues' leads, and the Admin session reads the raw `SERPAPI_API_KEY`. Six deliberate regressions (re-opening line 586; re-granting the column privilege; removing every profile guard layer; opening `crm_settings`; opening `leads`; adding an unguarded definer function) each fail the gate.

## Where the fixes live (all STAGED, none applied by Claude Code)
| Finding | File | Note |
|---|---|---|
| Self-promotion (migration `20260910103000:586`) | `phase1/18_live_api_privilege_hardening.sql` (guard trigger, column privileges, hardened policy), restated by `phase2/05` and `phase6/21` | `phase1/18` is step 4 of the core sequence. |
| Credentials and `role_permissions` | `phase2/05` (managers), `phase6/27` (nobody reads or writes them through the table; write-only RPCs) | The legacy `SettingsPanel` already runs in write-only mode when `phase6/27` is live. |
| Sales Agents see only their own records | `phase4/18` + `phase4/21` (updated for `sales_agent` by `phase6/25`) | Required **before** any Sales Agent account is used. |
| Exactly two roles / one Admin | `phase6/25`, `phase6/26` | |
| Missing documents never block | `phase2/07a` (warn-only), `07b` (stage guard has no document rule) | Business-confirm the checklist per provider before production. |

Every migration that defines a **write** policy or grant on `profiles`, in order: `20260909120000` (vulnerable) → `20260910010000` (hardened) → `20260910103000:586` (**reintroduced the hole**) → staged `phase1/18` (hardened + column grants) → `phase2/05` (hardened) → `phase6/21` (tightened). Applied migrations were **not** edited; no additional corrective migration was needed because the staged chain already closes every path the gate probes.

## Still to verify on the real system (not covered here)
Real Supabase Auth/PostgREST, Storage policies, Edge Functions with live JWTs, and the actual live schema. After the owner applies the files: run the same probes with the two real accounts (one Admin, one Sales Agent) and a second Sales Agent, and record the result in the Security dashboard.
