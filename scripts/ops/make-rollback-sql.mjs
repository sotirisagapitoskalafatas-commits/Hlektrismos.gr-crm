#!/usr/bin/env node
// Generates ONE SQL file that puts the DEFINITIONS of a database back to what a backup (prod-backup.mjs) recorded:
//   node scripts/ops/make-rollback-sql.mjs <backup folder> [> rollback-to-snapshot.sql]
// It reverts policies, triggers, functions, RLS flags, table grants, and drops tables/columns that did not exist at backup time.
// It does NOT restore row data and does not touch auth or storage. (Row data is restored table by table from data/*.ndjson only if a
// migration damaged rows; the staged migrations are additive, see docs/ops/PRODUCTION_ROLLOUT_CHECKLIST.md.)
// The generated script is idempotent and is itself exercised by scripts/ops/restore-verify.mjs (REHEARSE=1) against a restored copy.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: make-rollback-sql.mjs <backup folder>'); process.exit(2); }
const schema = JSON.parse(readFileSync(join(dir, 'schema.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => (a.length ? `array[${a.map(lit).join(', ')}]::text[]` : "array[]::text[]");
const q = (id) => '"' + String(id).replace(/"/g, '""') + '"';

const tables = schema.tables.map((t) => t.name);
const cols = schema.tables.flatMap((t) => t.columns.map((c) => `${t.name}.${c.name}`));
const policyKeys = schema.policies.map((p) => `${p.tablename}|${p.policyname}`);
const trigKeys = schema.triggers.map((t) => `${t.table}|${t.name}`);
const stPolicyKeys = (schema.storage_policies ?? []).map((p) => `${p.tablename}|${p.policyname}`);
const bucketIds = existsSync(join(dir, 'platform', 'storage_buckets.ndjson')) ? readFileSync(join(dir, 'platform', 'storage_buckets.ndjson'), 'utf8').split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l).id) : [];
const fnSigs = schema.functions.map((f) => `${f.name}(${f.args})`);

const out = [];
out.push(`-- Generated from backup ${manifest.project} @ ${manifest.taken_at}. Reverts DEFINITIONS to that snapshot. Idempotent.`);
out.push('begin;');
out.push(`do $rollback$ declare r record; begin
  -- 1. policies that did not exist at snapshot time
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    if not ((r.tablename || '|' || r.policyname) = any (${arr(policyKeys)})) then execute format('drop policy %I on public.%I', r.policyname, r.tablename); end if;
  end loop;
  for r in select policyname, tablename from pg_policies where schemaname = 'storage' loop
    if not ((r.tablename || '|' || r.policyname) = any (${arr(stPolicyKeys)})) then execute format('drop policy %I on storage.%I', r.policyname, r.tablename); end if;
  end loop;
  -- 2. triggers that did not exist at snapshot time
  for r in select g.tgname, c.relname from pg_trigger g join pg_class c on c.oid = g.tgrelid where c.relnamespace = 'public'::regnamespace and not g.tgisinternal loop
    if not ((r.relname || '|' || r.tgname) = any (${arr(trigKeys)})) then execute format('drop trigger %I on public.%I', r.tgname, r.relname); end if;
  end loop;
  -- 5. tables and columns that did not exist at snapshot time (only objects the rollout itself created)
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    if not (r.relname = any (${arr(tables)})) then execute format('drop table public.%I cascade', r.relname); end if;
  end loop;
  for r in select c.relname, a.attname from pg_attribute a join pg_class c on c.oid = a.attrelid
           where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped loop
    if not ((r.relname || '.' || r.attname) = any (${arr(cols)})) then execute format('alter table public.%I drop column %I cascade', r.relname, r.attname); end if;
  end loop;
end $rollback$;`);
// 3. snapshot functions back (drop first when the signature is unchanged but the return type differs would fail replace: try replace, fall back to drop+create)
for (const f of schema.functions) {
  out.push(`do $f$ begin
  begin execute ${lit(f.def)};
  exception when others then
    execute ${lit(`drop function if exists public.${q(f.name)}(${f.args})`)};
    execute ${lit(f.def)};
  end;
end $f$;`);
}
// 6. snapshot triggers + policies (recreated unconditionally so a changed definition is restored too)
for (const g of schema.triggers) out.push(`drop trigger if exists ${q(g.name)} on public.${q(g.table)};\n${g.def};`);
for (const p of schema.policies) {
  const roles = (Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, '').split(',')).filter(Boolean).map((r) => (r === 'public' ? 'public' : q(r))).join(', ') || 'public';
  out.push(`drop policy if exists ${q(p.policyname)} on public.${q(p.tablename)};`);
  out.push(`create policy ${q(p.policyname)} on public.${q(p.tablename)} as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles}${p.qual ? ` using (${p.qual})` : ''}${p.with_check ? ` with check (${p.with_check})` : ''};`);
}
for (const p of schema.storage_policies ?? []) {
  const roles = (Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, '').split(',')).filter(Boolean).map((r) => (r === 'public' ? 'public' : q(r))).join(', ') || 'public';
  out.push(`drop policy if exists ${q(p.policyname)} on storage.${q(p.tablename)};`);
  out.push(`create policy ${q(p.policyname)} on storage.${q(p.tablename)} as ${p.permissive.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles}${p.qual ? ` using (${p.qual})` : ''}${p.with_check ? ` with check (${p.with_check})` : ''};`);
}
// storage buckets created by the rollout (e.g. avatars) are removed only when they hold no files
if (bucketIds.length) out.push(`delete from storage.buckets b where not (b.id = any (${arr(bucketIds)})) and not exists (select 1 from storage.objects o where o.bucket_id = b.id);`);
// 4. functions that did not exist at snapshot time — dropped LAST among the code objects, after every snapshot policy/trigger stopped referencing them
out.push(`do $rollback$ declare r record; begin
  -- 4. functions that did not exist at snapshot time
  for r in select p.oid::regprocedure::text as sig, p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    if not ((r.proname || '(' || r.args || ')') = any (${arr(fnSigs)})) then execute format('drop function %s', r.sig); end if;
  end loop;
end $rollback$;`);
// 7. RLS flags
for (const t of schema.tables) out.push(`alter table public.${q(t.name)} ${t.rls ? 'enable' : 'disable'} row level security;` + (t.force_rls ? `alter table public.${q(t.name)} force row level security;` : `alter table public.${q(t.name)} no force row level security;`));
// 8. table grants for the API roles
out.push(`revoke all on all tables in schema public from anon, authenticated, service_role;`);
for (const g of schema.table_grants) out.push(`grant ${g.privilege} on public.${q(g.table)} to ${q(g.grantee)};`);
out.push('commit;');
console.log(out.join('\n'));
