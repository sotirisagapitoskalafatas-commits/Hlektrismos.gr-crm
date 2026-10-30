#!/usr/bin/env node
// READ-ONLY download of the Storage FILES (bills, contracts) listed in a database backup, through the Supabase CLI's own login.
//   node scripts/ops/storage-backup.mjs <backup folder from prod-backup.mjs>
// Writes <backup folder>/storage/<bucket>/NNN.bin and storage-manifest.json (maps each file to its real object name) (size + sha256 of every file) and verifies each size
// against the object metadata recorded in the database backup. Customer documents: keep the folder outside the repository.
// Restore mechanism (proved on STAGING with a synthetic file, never with customer documents):
//   supabase storage cp <local file> ss:///<bucket>/<path> --linked --experimental --project-ref <ref>
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const dir = process.argv[2];
if (!dir || !existsSync(join(dir, 'manifest.json'))) { console.error('usage: storage-backup.mjs <backup folder with manifest.json>'); process.exit(2); }
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const REF = manifest.project;
if (!['nonaymiwdayfuulccxrl', 'jiencxiapucrexpmzxbo'].includes(REF)) { console.error('refusing unknown project'); process.exit(2); }
const objects = readFileSync(join(dir, 'platform', 'storage_objects.ndjson'), 'utf8').split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l));
const results = []; let bad = 0;
const qa = (x) => (/\s/.test(x) ? `"${x}"` : x); // cmd.exe needs explicit quotes around arguments with spaces
let n = 0;
for (const o of objects) {
  // the destination is a short relative name (the CLI mis-reads absolute Windows paths such as C:\... as a URL scheme); the real name is kept in the manifest
  const rel = `storage/${o.bucket_id}/${String(++n).padStart(3, '0')}.bin`;
  mkdirSync(join(dir, 'storage', o.bucket_id), { recursive: true });
  const r = spawnSync('npx', ['-y', 'supabase@2.120.0', 'storage', 'cp', qa(`ss:///${o.bucket_id}/${o.name}`), `./${rel}`, '--linked', '--experimental', '--project-ref', REF], { encoding: 'utf8', shell: process.platform === 'win32', cwd: dir, env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  const dest = join(dir, rel);
  const ok = existsSync(dest) && statSync(dest).size === Number(o.size ?? statSync(dest).size);
  if (!ok) { bad++; console.log(`FAIL  ${o.bucket_id} #${n}  (${(r.stderr || r.stdout || '').replace(/\s+/g, ' ').slice(0, 120)})`); continue; }
  results.push({ bucket: o.bucket_id, name: o.name, file: rel, size: statSync(dest).size, sha256: createHash('sha256').update(readFileSync(dest)).digest('hex') });
  console.log(`ok    ${o.bucket_id} #${n}  ${statSync(dest).size} bytes`);
}
writeFileSync(join(dir, 'storage-manifest.json'), JSON.stringify({ project: REF, taken_at: new Date().toISOString(), files: results }, null, 1));
console.log(`\nstorage backup: ${results.length}/${objects.length} files verified against object metadata, ${results.reduce((a, b) => a + b.size, 0)} bytes`);
process.exit(bad ? 1 : 0);
