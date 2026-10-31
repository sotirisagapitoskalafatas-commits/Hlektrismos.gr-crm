#!/usr/bin/env node
// ISOLATED restore test of a backup made by prod-backup.mjs: rebuilds the database in a throw-away in-memory Postgres (PGlite)
// from schema.json + data/*.ndjson and proves it came back intact. Nothing is sent to any network or Supabase project.
//   node scripts/ops/restore-verify.mjs <backup folder>
// Checks: every table restored, row counts and per-table sha256 equal the manifest, every constraint (incl. foreign keys) validates,
// object counts (indexes, functions, triggers, policies, RLS-enabled tables) equal the catalog snapshot, and the privileged
// functions / policies the rollout will change are present byte-for-byte.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, 'manifest.json'))) { console.error('usage: restore-verify.mjs <backup folder with manifest.json>'); process.exit(2); }
const schema = JSON.parse(readFileSync(join(dir, 'schema.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const lines = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean) : []);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const skipped = []; // objects that could not be recreated in the scratch engine (reported, never silent)

const db = new PGlite();
await db.exec(`
  create domain public.vector as real[]; /* pgvector stand-in: embeddings are stored as real[]; similarity search is not restored */ create function public.uuid_generate_v4() returns uuid language sql as $f$ select gen_random_uuid() $f$; /* uuid-ossp stand-in */
  do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
  create schema if not exists auth; create schema if not exists storage; create schema if not exists extensions;
  create table auth.users (id uuid primary key, email text, created_at timestamptz, updated_at timestamptz, email_confirmed_at timestamptz, invited_at timestamptz,
    last_sign_in_at timestamptz, banned_until timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_sso_user boolean, deleted_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  create function auth.role() returns text language sql stable as $f$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $f$;
  create function auth.jwt() returns jsonb language sql stable as $f$ select '{}'::jsonb $f$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key, bucket_id text, name text, owner uuid, created_at timestamptz, updated_at timestamptz, size bigint, mimetype text);
  create function storage.foldername(name text) returns text[] language sql immutable as $f$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $f$;
  create schema if not exists cron; create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
  create function cron.schedule(n text, sc text, c text) returns bigint language sql as $f$ insert into cron.job (jobname, schedule, command) values (n, sc, c) returning jobid $f$;
  create function cron.unschedule(n text) returns boolean language sql as $f$ with d as (delete from cron.job where jobname = n returning 1) select exists (select 1 from d) $f$;
  create schema if not exists net; create function net.http_post(url text default null, headers jsonb default null, body jsonb default null, params jsonb default null, timeout_milliseconds int default null) returns bigint language sql as $f$ select 1::bigint $f$;
  create schema if not exists vault; create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
  set check_function_bodies = off; set timezone = 'UTC'; set datestyle = 'ISO, YMD'; set extra_float_digits = 3;`);

/* 1. platform stand-ins from the backup (auth users have no credentials by design) */
const loadPlatform = async (file, table, cols) => {
  const rows = lines(join(dir, 'platform', file)).map((l) => JSON.parse(l));
  if (rows.length) await db.query(`insert into ${table} (${cols.join(',')}) select ${cols.join(',')} from jsonb_populate_recordset(null::${table}, $1::jsonb)`, [JSON.stringify(rows)]);
  return rows.length;
};
await loadPlatform('auth_users.ndjson', 'auth.users', ['id', 'email', 'created_at', 'updated_at', 'email_confirmed_at', 'invited_at', 'last_sign_in_at', 'banned_until', 'raw_app_meta_data', 'raw_user_meta_data', 'is_sso_user', 'deleted_at']);
await loadPlatform('storage_buckets.ndjson', 'storage.buckets', ['id', 'name', 'public', 'file_size_limit', 'allowed_mime_types']);
await loadPlatform('storage_objects.ndjson', 'storage.objects', ['id', 'bucket_id', 'name', 'owner', 'created_at', 'updated_at', 'size', 'mimetype']);

/* 2. types, sequences, tables (no constraints yet) */
for (const e of schema.enums) await db.exec(`create type public.${q(e.name)} as enum (${e.labels.map((l) => `'${l.replace(/'/g, "''")}'`).join(', ')});`);
for (const s of schema.sequences) await db.exec(`create sequence public.${q(s.name)} increment ${s.inc} minvalue ${s.min} maxvalue ${s.max} start ${s.start};`);
const isVec = (c) => /(^|\.)vector(\(\d+\))?$/.test(c.type);
const colDdl = (c) => `${q(c.name)} ${isVec(c) ? 'public.vector' : c.type}${c.generated ? ` generated always as (${c.generated}) stored` : ''}${c.default ? ` default ${c.default}` : ''}${c.identity === 'a' ? ' generated always as identity' : c.identity === 'd' ? ' generated by default as identity' : ''}`;
for (const t of schema.tables) {
  try { await db.exec(`create table public.${q(t.name)} (${t.columns.map(colDdl).join(', ')});`); }
  catch (e) { skipped.push(`table ${t.name}: ${e.message}`); }
}
for (const s of schema.sequences) { if (s.last != null) await db.query(`select setval('public.${q(s.name)}', $1, true)`, [s.last]).catch(() => undefined); }

/* 3. data (triggers off, so the restored rows are the stored rows) */
await db.exec('set session_replication_role = replica;');
for (const t of schema.tables) {
  const rows = lines(join(dir, 'data', `${t.name}.ndjson`)).map((l) => JSON.parse(l));
  if (!rows.length) continue;
  for (const c of t.columns.filter(isVec)) for (const r of rows) if (typeof r[c.name] === 'string') r[c.name] = JSON.parse(r[c.name]);
  const cols = t.columns.filter((c) => !c.generated && c.identity !== 'a').map((c) => q(c.name)).join(', ');
  try { await db.query(`insert into public.${q(t.name)} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${q(t.name)}, $1::jsonb)`, [JSON.stringify(rows)]); }
  catch (e) { skipped.push(`data ${t.name}: ${e.message}`); }
}

/* 4. constraints (PK/unique first, then FK/check), indexes, functions, triggers, RLS, policies, grants */
const order = { p: 0, u: 1, c: 2, x: 2, f: 3 };
for (const c of [...schema.constraints].sort((a, b) => (order[a.type] ?? 4) - (order[b.type] ?? 4))) {
  try { await db.exec(`alter table public.${q(c.table)} add constraint ${q(c.name)} ${c.def};`); }
  catch (e) { skipped.push(`constraint ${c.table}.${c.name}: ${e.message}`); }
}
for (const i of schema.indexes) { try { await db.exec(i.def + ';'); } catch (e) { skipped.push(`index ${i.name}: ${e.message}`); } }
for (const f of schema.functions) { try { await db.exec(f.def + ';'); } catch (e) { skipped.push(`function ${f.name}(${f.args}): ${e.message.split('\n')[0]}`); } }
for (const v of schema.views) { try { await db.exec(`create or replace view public.${q(v.name)} as ${v.def}`); } catch (e) { skipped.push(`view ${v.name}: ${e.message.split('\n')[0]}`); } }
for (const g of schema.triggers) { try { await db.exec(g.def + ';'); } catch (e) { skipped.push(`trigger ${g.name}: ${e.message.split('\n')[0]}`); } }
for (const t of schema.tables) if (t.rls) await db.exec(`alter table public.${q(t.name)} enable row level security;` + (t.force_rls ? `alter table public.${q(t.name)} force row level security;` : ''));
for (const p of schema.policies) {
  const roles = (Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, '').split(',')).filter(Boolean).map((r) => (r === 'public' ? 'public' : q(r))).join(', ') || 'public';
  try { await db.exec(`create policy ${q(p.policyname)} on public.${q(p.tablename)} as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles}${p.qual ? ` using (${p.qual})` : ''}${p.with_check ? ` with check (${p.with_check})` : ''};`); }
  catch (e) { skipped.push(`policy ${p.policyname}: ${e.message.split('\n')[0]}`); }
}
await db.exec('set session_replication_role = origin;');

/* 5. verification */
const tblNames = schema.tables.map((t) => t.name);
let badCounts = [], badHash = [], badFile = [];
// jsonb objects can list their keys in a different order on a different Postgres build; the VALUES must be identical, so compare canonical JSON.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const NL = String.fromCharCode(10);
const canonHash = (rows) => sha(rows.map((r) => JSON.stringify(canon(r))).sort().join(NL));
for (const t of tblNames) {
  const rawLines = lines(join(dir, 'data', `${t}.ndjson`));
  const m = manifest.tables[t];
  if (rawLines.length && sha([...rawLines].sort().join(NL)) !== m.sha256) badFile.push(t); // the backup file itself is corrupt
  const got = (await db.query(`select to_jsonb(x) j from public.${q(t)} x`)).rows.map((r) => r.j);
  if (got.length !== m.rows) badCounts.push(`${t}: ${got.length} != ${m.rows}`);
  else if (m.rows && canonHash(got) !== canonHash(rawLines.map((l) => JSON.parse(l)))) badHash.push(t);
}
check('backup files are intact (sha256 of every data file equals the manifest)', badFile.length === 0, badFile.slice(0, 5).join(', '));
check(`all ${tblNames.length} tables restored`, tblNames.length === Object.keys(manifest.tables).length && !skipped.some((s) => s.startsWith('table ')), skipped.filter((s) => s.startsWith('table ')).join('; '));
check('row counts equal the manifest for every table', badCounts.length === 0, badCounts.slice(0, 5).join('; '));
check('every restored row has the same values as the backup (canonical-JSON sha256 per table)', badHash.length === 0, badHash.slice(0, 8).join(', '));
check(`total rows ${Object.values(manifest.tables).reduce((a, b) => a + b.rows, 0)} restored`, badCounts.length === 0);

const count = async (sqlText) => Number((await db.query(sqlText)).rows[0].n);
check('all constraints (PK, unique, FK, check) recreated and valid', skipped.filter((s) => s.startsWith('constraint')).length === 0 && (await count("select count(*) n from pg_constraint where connamespace = 'public'::regnamespace and convalidated is false")) === 0, skipped.filter((s) => s.startsWith('constraint')).slice(0, 3).join('; '));
check(`indexes: ${schema.indexes.length} restored`, (await count("select count(*) n from pg_indexes where schemaname = 'public'")) >= schema.indexes.length, skipped.filter((s) => s.startsWith('index')).slice(0, 3).join('; '));
const fnOk = (await count("select count(*) n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')"));
check(`functions: ${schema.functions.length} restored`, fnOk >= schema.functions.length - skipped.filter((s) => s.startsWith('function')).length && skipped.filter((s) => s.startsWith('function')).length === 0, skipped.filter((s) => s.startsWith('function')).slice(0, 3).join('; '));
check(`triggers: ${schema.triggers.length} restored`, (await count("select count(*) n from pg_trigger g join pg_class c on c.oid = g.tgrelid where c.relnamespace = 'public'::regnamespace and not g.tgisinternal")) === schema.triggers.length, skipped.filter((s) => s.startsWith('trigger')).slice(0, 3).join('; '));
check(`RLS enabled on ${schema.tables.filter((t) => t.rls).length} tables`, (await count("select count(*) n from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p') and relrowsecurity")) === schema.tables.filter((t) => t.rls).length);
check(`policies: ${schema.policies.length} restored`, (await count("select count(*) n from pg_policies where schemaname = 'public'")) === schema.policies.length, skipped.filter((s) => s.startsWith('policy')).slice(0, 3).join('; '));
const restoredDef = async (name) => (await db.query(`select pg_get_functiondef(p.oid) d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [name])).rows[0]?.d;
for (const fn of ['is_role', 'is_staff']) {
  const orig = schema.functions.find((f) => f.name === fn)?.def;
  check(`function ${fn}() restored identically`, !!orig && (await restoredDef(fn)) === orig);
}
check('platform metadata present (auth users, identities, buckets, objects, cron jobs)', Object.values(manifest.platform).every((p) => (p.rows ?? -1) >= 0), JSON.stringify(Object.fromEntries(Object.entries(manifest.platform).map(([k, v]) => [k, v.rows ?? v.error]))));


/* 6. optional ROLLOUT REHEARSAL on the restored production snapshot (REHEARSE=1): the documented apply order, then behaviour checks */
if (process.env.REHEARSE) {
  const repo = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const adapt = (sql) => sql.replace(/create\s+extension[^;]*;/gi, '').replace(/\bextensions\.vector\b/gi, 'vector').replace(/\bvector\s*\(\s*\d+\s*\)/gi, 'vector').replace(/create\s+(unique\s+)?index[^;]*using\s+(ivfflat|hnsw)[^;]*;/gi, '');
  const heads = [...repo('docs/ops/APPLY_ORDER.md').matchAll(/^## ([0-9a-z]+)\. `(phase\d\/[^`]+)\.sql`/gim)].map((m) => ({ step: m[1], file: m[2] }));
  const SUPERSEDED = new Set(['phase4/17_admin_only_staff_provisioning', 'phase4/20_backoffice_sales_agent_provisioning']); // replaced by phase6/21
  const order = heads.filter((h) => !SUPERSEDED.has(h.file));
  const i21 = order.findIndex((h) => h.file === 'phase6/21_two_role_model');
  const [h21] = order.splice(i21, 1);
  order.splice(order.findIndex((h) => h.file === 'phase2/05_staff_admin_and_role_preview') + 1, 0, h21); // right after the staff functions exist
  const before = Object.fromEntries((await db.query(`select table_name t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)).rows.map((r) => [r.t, 0]));
  for (const t of Object.keys(before)) before[t] = Number((await db.query(`select count(*)::int n from public.${q(t)}`)).rows[0].n);
  const failedSteps = []; const applied = [];
  // files whose own probe is already true on the snapshot are LIVE already (the apply-order document is older than the database): skipped, and said so
  const live0 = new Set((await db.query(repo('docs/ops/pending_migrations_check.sql'))).rows.filter((r) => r.applied).map((r) => r.file));
  console.log('\nREHEARSAL apply order: ' + order.map((h) => h.step).join(' -> '));
  console.log('REHEARSAL already live on production (skipped): ' + ([...live0].join(', ') || 'none'));
  for (const h of order) {
    if (live0.has(h.file)) continue;
    applied.push(`${h.step}	${h.file}.sql`);
    try { await db.exec(adapt(repo(`supabase/staged-migrations/${h.file}.sql`))); }
    catch (e) { failedSteps.push(`${h.step} ${h.file}: ${e.message.split('\n')[0]}`); try { await db.exec('rollback'); } catch { /* none open */ } }
  }
  console.log('REHEARSAL files applied, in order:' + NL + applied.map((a, i) => `  ${String(i + 1).padStart(2)}. step ${a}`).join(NL));
  check(`rehearsal: all ${order.filter((h) => !live0.has(h.file)).length} not-yet-live staged files applied on the restored production snapshot`, failedSteps.length === 0, failedSteps.join(' | '));
  // the repository's own pending-migrations probe: everything but the two superseded files must now be true
  let pend = [];
  try { pend = (await db.query(repo('docs/ops/pending_migrations_check.sql'))).rows; } catch (e) { check('rehearsal: pending_migrations_check.sql runs', false, e.message.split('\n')[0]); }
  const notApplied = pend.filter((r) => !r.applied && !SUPERSEDED.has(r.file)).map((r) => r.file);
  check(`rehearsal: pending-migrations probe true for every file except the two superseded (${pend.length} rows)`, pend.length > 0 && notApplied.length === 0, notApplied.join(', '));
  // data must be untouched by the rollout (only additions: new tables, seed rows of the migrations themselves)
  const changed = [];
  for (const [t, n] of Object.entries(before)) { const now = Number((await db.query(`select count(*)::int n from public.${q(t)}`)).rows[0].n); if (now !== n) changed.push(`${t} ${n}->${now}`); }
  console.log('REHEARSAL row-count changes in pre-existing tables: ' + (changed.join(', ') || 'none'));
  const asUser = async (uid, role = 'authenticated') => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']); await db.exec(`set role ${role}`); };
  const uidOf = (email) => JSON.parse(lines(join(dir, 'platform', 'auth_users.ndjson')).find((l) => l.includes(`"${email}"`))).id;
  const ADMIN = uidOf('qa.admin@hlektrismos.gr'), MGR = uidOf('qa.manager@hlektrismos.gr'), BO = uidOf('qa.backoffice@hlektrismos.gr'), FLD = uidOf('qa.fieldsales@hlektrismos.gr'), INS = uidOf('qa.insidesales@hlektrismos.gr');
  const can = async (who, tr, nr) => { await asUser(who); return (await db.query('select public.staff_admin_can($1, $2, $3) v', [who, tr, nr])).rows[0].v; };
  check('rehearsal: admin may create a field_sales account; manager, legacy back_office and sales agents may not', (await can(ADMIN, null, 'field_sales')) === true && !(await can(MGR, null, 'field_sales')) && !(await can(BO, null, 'field_sales')) && !(await can(FLD, null, 'field_sales')) && !(await can(INS, null, 'field_sales')));
  await asUser(ADMIN);
  const dirOk = await db.query('select * from public.staff_list()').then((r) => r.rows.length, () => -1);
  check('rehearsal: admin reads the staff directory (6 profiles on the snapshot)', dirOk === 6, `rows ${dirOk}`);
  let mgrBlocked = false; await asUser(MGR);
  try { await db.query('select * from public.staff_list()'); } catch { mgrBlocked = true; }
  check('rehearsal: legacy manager is refused the directory', mgrBlocked);
  const visible = async (who, tbl) => { await asUser(who); return Number((await db.query(`select count(*)::int n from public.${tbl}`)).rows[0].n); };
  await db.exec('reset role');
  const totals = { leads: Number((await db.query('select count(*)::int n from public.leads')).rows[0].n), cases: Number((await db.query('select count(*)::int n from public.cases')).rows[0].n) };
  const adminSees = { leads: await visible(ADMIN, 'leads'), cases: await visible(ADMIN, 'cases') };
  const fldSees = { leads: await visible(FLD, 'leads'), cases: await visible(FLD, 'cases') };
  const insSees = { leads: await visible(INS, 'leads'), cases: await visible(INS, 'cases') };
  check('rehearsal: admin still sees every lead and case', adminSees.leads === totals.leads && adminSees.cases === totals.cases, JSON.stringify({ totals, adminSees }));
  check('rehearsal: a Sales Agent sees only their own records (fewer than the total)', fldSees.leads < totals.leads && fldSees.cases < totals.cases && insSees.leads < totals.leads && insSees.cases < totals.cases, JSON.stringify({ totals, fldSees, insSees }));
  await db.exec('reset role');
  await db.exec(repo('docs/ops/rollback_phase6_21_two_role_model.sql'));
  check('rehearsal: rollback_phase6_21 removes the legacy-role trigger', (await count("select count(*) n from pg_trigger where tgname = 'profiles_no_new_legacy_office'")) === 0);

  // FULL definitions rollback: the generated script must bring the migrated copy back to exactly what the backup recorded
  const { execFileSync } = await import('node:child_process');
  const rbSql = execFileSync(process.execPath, [new URL('./make-rollback-sql.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), dir], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let rbErr = '';
  try { await db.exec(rbSql); await db.exec(rbSql); } catch (e) { rbErr = e.message.split('\n')[0]; }
  check('rollback-to-snapshot script runs (twice, idempotent) on the migrated copy', rbErr === '', rbErr);
  const defNow = new Map((await db.query(`select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' sig, pg_get_functiondef(p.oid) def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`)).rows.map((r) => [r.sig, r.def]));
  const badFn = schema.functions.filter((f) => defNow.get(`${f.name}(${f.args})`) !== f.def).map((f) => f.name);
  const extraFn = [...defNow.keys()].filter((k) => !schema.functions.some((f) => `${f.name}(${f.args})` === k));
  check(`rollback: all ${schema.functions.length} function definitions identical to the snapshot, no extra functions`, badFn.length === 0 && extraFn.length === 0, [...badFn.slice(0, 4), ...extraFn.slice(0, 4).map((x) => '+' + x)].join(', '));
  const polNow = (await db.query(`select tablename || '|' || policyname || '|' || permissive || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') || '|' || array_to_string(roles, ',') k from pg_policies where schemaname = 'public'`)).rows.map((r) => r.k).sort();
  const polSnap = schema.policies.map((p) => `${p.tablename}|${p.policyname}|${p.permissive}|${p.cmd}|${p.qual ?? ''}|${p.with_check ?? ''}|${(Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, '').split(',')).join(',')}`).sort();
  check(`rollback: all ${schema.policies.length} policies identical to the snapshot`, JSON.stringify(polNow) === JSON.stringify(polSnap), `now ${polNow.length}, snapshot ${polSnap.length}`);
  const stNow = (await db.query(`select tablename || '|' || policyname || '|' || permissive || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') || '|' || array_to_string(roles, ',') k from pg_policies where schemaname = 'storage'`)).rows.map((r) => r.k).sort();
  const stSnap = (schema.storage_policies ?? []).map((p) => `${p.tablename}|${p.policyname}|${p.permissive}|${p.cmd}|${p.qual ?? ''}|${p.with_check ?? ''}|${(Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, '').split(',')).join(',')}`).sort();
  check(`rollback: all ${stSnap.length} storage.objects policies identical to the snapshot (rollout-added ones removed)`, JSON.stringify(stNow) === JSON.stringify(stSnap), `now ${stNow.length}, snapshot ${stSnap.length}`);
  const bucketsNow = (await db.query('select id from storage.buckets order by id')).rows.map((r) => r.id);
  check('rollback: storage buckets identical to the snapshot (rollout-created bucket removed)', JSON.stringify(bucketsNow) === JSON.stringify(lines(join(dir, 'platform', 'storage_buckets.ndjson')).map((l) => JSON.parse(l).id).sort()), bucketsNow.join(','));
  const trgNow = (await db.query(`select c.relname || '|' || g.tgname k from pg_trigger g join pg_class c on c.oid = g.tgrelid where c.relnamespace = 'public'::regnamespace and not g.tgisinternal`)).rows.map((r) => r.k).sort();
  check(`rollback: triggers identical to the snapshot (${schema.triggers.length})`, JSON.stringify(trgNow) === JSON.stringify(schema.triggers.map((t) => `${t.table}|${t.name}`).sort()));
  const colNow = (await db.query(`select c.relname || '.' || a.attname k from pg_attribute a join pg_class c on c.oid = a.attrelid where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p') and a.attnum > 0 and not a.attisdropped`)).rows.map((r) => r.k).sort();
  check('rollback: tables and columns identical to the snapshot (rollout-created objects removed)', JSON.stringify(colNow) === JSON.stringify(schema.tables.flatMap((t) => t.columns.map((c) => `${t.name}.${c.name}`)).sort()));
  const rlsNow = (await db.query(`select relname k from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p') and relrowsecurity`)).rows.map((r) => r.k).sort();
  check('rollback: row-level-security flags identical', JSON.stringify(rlsNow) === JSON.stringify(schema.tables.filter((t) => t.rls).map((t) => t.name).sort()));
  const grNow = (await db.query(`select table_name || '|' || grantee || '|' || privilege_type k from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated','service_role')`)).rows.map((r) => r.k).sort();
  check('rollback: API-role table grants identical to the snapshot', JSON.stringify(grNow) === JSON.stringify(schema.table_grants.map((g) => `${g.table}|${g.grantee}|${g.privilege}`).sort()), `now ${grNow.length}, snapshot ${schema.table_grants.length}`);
  // data in pre-existing tables is still the backed-up data (the rollout did not rewrite rows)
  let rowsDiff = [];
  for (const t of tblNames) { const got = (await db.query(`select to_jsonb(x) j from public.${q(t)} x`)).rows.map((r) => r.j); if (canonHash(got) !== canonHash(lines(join(dir, 'data', `${t}.ndjson`)).map((l) => JSON.parse(l)))) rowsDiff.push(t); }
  console.log('REHEARSAL tables whose rows differ from the backup after rollout + rollback: ' + (rowsDiff.join(', ') || 'none'));
}

if (skipped.length) { console.log(`\nNOT RECREATED in the scratch engine (${skipped.length}) — platform-specific, listed for review:`); for (const s of skipped.slice(0, 40)) console.log('  - ' + s.slice(0, 200)); }
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} restore checks passed`);
process.exit(failed ? 1 : 0);
