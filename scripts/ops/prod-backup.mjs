#!/usr/bin/env node
// READ-ONLY logical backup of a Hlektrismos Supabase project through the Supabase CLI (no Docker, no pg_dump, no DB password).
//   node scripts/ops/prod-backup.mjs --ref nonaymiwdayfuulccxrl --out C:\Users\<you>\hlek-backups
// Writes <out>/<ref>-<UTC timestamp>/ with:
//   schema.json     catalog snapshot: tables/columns, sequences, constraints, indexes, functions, triggers, RLS, policies, grants, views, enums, extensions
//   data/<table>.ndjson   every row of every public table (one JSON object per line)
//   platform/*.ndjson     auth users + identities (NO password hashes, tokens or secrets), storage buckets and object METADATA, cron job schedules (no commands)
//   manifest.json   project, time, git commit, per-table row counts and sha256 of the canonical row set
// The folder contains customer data: keep it OUTSIDE the repository, on an encrypted disk, and never upload it.
// Only SELECT statements are issued. Storage FILES (bills, contracts) are not downloaded here; see docs/ops/BACKUP_RESTORE.md.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ALLOWED = new Set(['nonaymiwdayfuulccxrl', 'jiencxiapucrexpmzxbo']);
const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const REF = arg('ref', 'nonaymiwdayfuulccxrl');
const OUT = arg('out');
if (!ALLOWED.has(REF)) { console.error('refusing unknown project ' + REF); process.exit(2); }
if (!OUT) { console.error('usage: --out <directory outside the repository>'); process.exit(2); }
if (/[\\/]hlek(-[a-z0-9]+)?[\\/](?!hlek-backups)/i.test(OUT + '/') && !/hlek-backups/i.test(OUT)) console.error('warning: --out looks like it is inside a repository checkout');

const work = mkdtempSync(join(tmpdir(), 'bk-'));
function sql(text) {
  const f = join(work, `q-${randomBytes(3).toString('hex')}.sql`);
  writeFileSync(f, text);
  const r = spawnSync('npx', ['-y', 'supabase@2.120.0', 'db', 'query', '--linked', '--project-ref', REF, '-o', 'json', '-f', f], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 });
  rmSync(f, { force: true });
  const out = (r.stdout || '') + (r.stderr || '');
  const i = out.indexOf('['), j = out.lastIndexOf(']');
  if (i < 0) throw new Error('query failed: ' + out.replace(/\s+/g, ' ').slice(0, 400));
  return JSON.parse(out.slice(i, j + 1));
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = join(OUT, `${REF}-${stamp}`);
mkdirSync(join(dir, 'data'), { recursive: true });
mkdirSync(join(dir, 'platform'), { recursive: true });

/* ───── 1. catalog snapshot ───── */
const META = `
select 'tables' k, coalesce(jsonb_agg(t order by t.name), '[]'::jsonb) v from (
  select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
    (select jsonb_agg(jsonb_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull,
        'default', case when a.attgenerated = '' then pg_get_expr(d.adbin, d.adrelid) end,
        'generated', case when a.attgenerated <> '' then pg_get_expr(d.adbin, d.adrelid) end,
        'identity', nullif(a.attidentity::text, '')) order by a.attnum)
       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')) t
union all select 'sequences', coalesce(jsonb_agg(jsonb_build_object('name', sequencename, 'last', last_value, 'start', start_value, 'inc', increment_by, 'min', min_value, 'max', max_value) order by sequencename), '[]'::jsonb) from pg_sequences where schemaname = 'public'
union all select 'constraints', coalesce(jsonb_agg(jsonb_build_object('table', cl.relname, 'name', co.conname, 'type', co.contype, 'def', pg_get_constraintdef(co.oid)) order by co.contype, cl.relname, co.conname), '[]'::jsonb)
  from pg_constraint co join pg_class cl on cl.oid = co.conrelid where co.connamespace = 'public'::regnamespace and cl.relkind in ('r', 'p')
union all select 'indexes', coalesce(jsonb_agg(jsonb_build_object('table', t.relname, 'name', i.relname, 'def', pg_get_indexdef(x.indexrelid)) order by t.relname, i.relname), '[]'::jsonb)
  from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class t on t.oid = x.indrelid
  where t.relnamespace = 'public'::regnamespace and not exists (select 1 from pg_constraint c where c.conindid = x.indexrelid)
union all select 'functions', coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'def', pg_get_functiondef(p.oid), 'acl', p.proacl::text, 'secdef', p.prosecdef) order by p.proname, p.oid), '[]'::jsonb)
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all select 'triggers', coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'name', g.tgname, 'def', pg_get_triggerdef(g.oid, true), 'enabled', g.tgenabled) order by c.relname, g.tgname), '[]'::jsonb)
  from pg_trigger g join pg_class c on c.oid = g.tgrelid where c.relnamespace = 'public'::regnamespace and not g.tgisinternal
union all select 'policies', coalesce(jsonb_agg(to_jsonb(p) order by tablename, policyname), '[]'::jsonb) from pg_policies p where schemaname = 'public'
union all select 'table_grants', coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privilege', privilege_type) order by table_name, grantee, privilege_type), '[]'::jsonb)
  from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
union all select 'views', coalesce(jsonb_agg(jsonb_build_object('name', viewname, 'def', definition)), '[]'::jsonb) from pg_views where schemaname = 'public'
union all select 'enums', coalesce(jsonb_agg(jsonb_build_object('name', t.typname, 'labels', (select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))), '[]'::jsonb)
  from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype = 'e'
union all select 'extensions', coalesce(jsonb_agg(jsonb_build_object('name', extname, 'version', extversion)), '[]'::jsonb) from pg_extension
union all select 'storage_policies', coalesce(jsonb_agg(to_jsonb(p) order by policyname), '[]'::jsonb) from pg_policies p where schemaname = 'storage'
union all select 'server', to_jsonb(version());`;
const meta = Object.fromEntries(sql(META).map((r) => [r.k, r.v]));
writeFileSync(join(dir, 'schema.json'), JSON.stringify(meta, null, 1));
const tables = meta.tables.map((t) => t.name);

/* ───── 2. data: one query for all tables (tables are small); each row as JSON ───── */
const branches = tables.map((t) => `select '${t}' as t, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as d from public."${t}" x`).join('\nunion all\n');
const manifest = { project: REF, taken_at: new Date().toISOString(), server: meta.server, tables: {}, platform: {} };
for (const r of sql(branches)) {
  const lines = r.d.map((row) => JSON.stringify(row));
  writeFileSync(join(dir, 'data', `${r.t}.ndjson`), lines.join('\n') + (lines.length ? '\n' : ''));
  manifest.tables[r.t] = { rows: lines.length, sha256: sha([...lines].sort().join('\n')) };
}

/* ───── 3. platform metadata (no secrets) ───── */
const PLATFORM = {
  auth_users: `select id, email, created_at, updated_at, email_confirmed_at, invited_at, last_sign_in_at, banned_until, raw_app_meta_data, raw_user_meta_data, is_sso_user, deleted_at from auth.users order by created_at`,
  auth_identities: `select id, user_id, provider, provider_id, created_at, last_sign_in_at from auth.identities order by created_at`,
  storage_buckets: `select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id`,
  storage_objects: `select id, bucket_id, name, owner, created_at, updated_at, (metadata->>'size')::bigint as size, metadata->>'mimetype' as mimetype from storage.objects order by created_at`,
  cron_jobs: `select jobid, jobname, schedule, active, md5(command) as command_md5 from cron.job order by jobid`,
};
for (const [name, q] of Object.entries(PLATFORM)) {
  let rows = [];
  try { rows = sql(q); } catch (e) { manifest.platform[name] = { error: String(e.message).slice(0, 120) }; continue; }
  const lines = rows.map((r) => JSON.stringify(r));
  writeFileSync(join(dir, 'platform', `${name}.ndjson`), lines.join('\n') + (lines.length ? '\n' : ''));
  manifest.platform[name] = { rows: lines.length, sha256: sha([...lines].sort().join('\n')) };
}
manifest.git = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim();
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
rmSync(work, { recursive: true, force: true });
const totalRows = Object.values(manifest.tables).reduce((a, b) => a + b.rows, 0);
console.log(`backup of ${REF}: ${tables.length} tables, ${totalRows} rows -> ${dir}`);
console.log(JSON.stringify({ platform: Object.fromEntries(Object.entries(manifest.platform).map(([k, v]) => [k, v.rows ?? v.error])) }));
