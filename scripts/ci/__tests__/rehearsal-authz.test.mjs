// The CRM-only staging rehearsal script must refuse production and the shared staging project, plan offline,
// and cover every Edge Function in the repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../../qa/rehearsal-authz.mjs', import.meta.url));
const fnDir = fileURLToPath(new URL('../../../supabase/functions/', import.meta.url));
const M = await import('../../qa/rehearsal-authz.mjs');
const run = (env, args = []) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

test('refuses production, the shared staging project, a missing ref and a malformed ref', () => {
  assert.match(M.refuse('nonaymiwdayfuulccxrl'), /production/);
  assert.match(M.refuse('jiencxiapucrexpmzxbo'), /shared/);
  assert.match(M.refuse(''), /CRM_STAGING_REF/);
  assert.match(M.refuse('not-a-ref'), /CRM_STAGING_REF/);
  assert.equal(M.refuse('abcdefghijklmnopqrst'), null);
  for (const ref of ['nonaymiwdayfuulccxrl', 'jiencxiapucrexpmzxbo', '']) {
    const r = run({ CRM_STAGING_REF: ref }, ['--plan']);
    assert.equal(r.status, 2, `exit code for ref "${ref}"`);
  }
});

test('--plan prints the matrix and sends nothing (no CLI, no network needed)', () => {
  const r = run({ CRM_STAGING_REF: 'abcdefghijklmnopqrst' }, ['--plan']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PLAN for abcdefghijklmnopqrst \(nothing is sent\)/);
  assert.match(r.stdout, /admin-users/);
});

test('the function list covers exactly the functions in the repository', () => {
  const repo = readdirSync(fnDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name).sort();
  assert.deepEqual(M.FUNCTIONS.map(([n]) => n).sort(), repo);
});

test('expected outcomes: anonymous, inactive and legacy callers are always denied on non-public functions; Sales Agents never reach admin-only ones', () => {
  for (const [fn, access] of M.FUNCTIONS) {
    if (access === 'public') continue;
    for (const who of ['anon', 'inactive', 'manager', 'legacyBo']) assert.equal(M.expectedForFunction(access, who), 'denied', `${fn}/${who}`);
    if (access === 'admin' || access === 'secret') for (const who of ['inside', 'fieldA']) assert.equal(M.expectedForFunction(access, who), 'denied', `${fn}/${who}`);
  }
  assert.equal(M.expectedForFunction('admin+inside', 'inside'), 'allowed');
  assert.equal(M.expectedForFunction('admin+inside', 'fieldA'), 'denied');
});

test('the table matrix denies anonymous and inactive callers everywhere and keeps customer_documents / integrations / settings admin-only', () => {
  for (const [t, e] of Object.entries(M.TABLES)) { assert.equal(e.anon, 'none', t); assert.equal(e.inactive, 'none', t); }
  for (const t of ['customer_documents', 'crm_integrations', 'crm_settings']) assert.deepEqual([M.TABLES[t].sales, M.TABLES[t].legacy], ['none', 'none']);
});

// ───── guards added after review: the SQL target must be the linked project, version gate, work functions
import { mkdtempSync, mkdirSync, writeFileSync as wf, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const REF = 'abcdefghijklmnopqrst';
const linkedDir = (ref) => { const d = mkdtempSync(join(tmpdir(), 'rehearsal-link-')); mkdirSync(join(d, 'supabase', '.temp'), { recursive: true }); if (ref) wf(join(d, 'supabase', '.temp', 'project-ref'), ref); return d; };
const runIn = (cwd, env, args = []) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

test('SQL runs only on the linked project: production, the shared staging project, another project or no link are all refused', () => {
  const prod = linkedDir('nonaymiwdayfuulccxrl');
  assert.match(M.linkProblem(REF, prod), /production/);
  const shared = linkedDir('jiencxiapucrexpmzxbo');
  assert.match(M.linkProblem(REF, shared), /shared staging/);
  const other = linkedDir('zzzzzzzzzzzzzzzzzzzz');
  assert.match(M.linkProblem(REF, other), /another project/);
  assert.match(M.linkProblem(REF, linkedDir(null)), /not linked/);
  const ok = linkedDir(REF);
  assert.equal(M.linkProblem(REF, ok), null);
  for (const d of [prod, shared, other, ok]) rmSync(d, { recursive: true, force: true });
});

test('a real run is refused (exit 2, before any CLI or network call) without the link or without the version confirmation', () => {
  const prod = linkedDir('nonaymiwdayfuulccxrl');
  let r = runIn(prod, { CRM_STAGING_REF: REF });
  assert.equal(r.status, 2); assert.match(r.stderr, /LINKED project \(production\)/);
  const good = linkedDir(REF);
  r = runIn(good, { CRM_STAGING_REF: REF });
  assert.equal(r.status, 2); assert.match(r.stderr, /CRM_STAGING_VERSIONS_VERIFIED/);
  r = runIn(good, { CRM_STAGING_REF: REF, CRM_STAGING_VERSIONS_VERIFIED: 'no' });
  assert.equal(r.status, 2);
  r = runIn(prod, { CRM_STAGING_REF: REF, CRM_STAGING_VERSIONS_VERIFIED: 'yes' });
  assert.equal(r.status, 2, 'the confirmation does not override the link check');
  for (const d of [prod, good]) rmSync(d, { recursive: true, force: true });
});

test('functions that start work without a body are skipped by default; the list only names real functions', () => {
  const names = new Set(M.FUNCTIONS.map(([n]) => n));
  for (const f of M.WORK_FUNCTIONS) assert.ok(names.has(f), f);
  for (const must of ['campaign-scheduler', 'sync-green-tariffs', 'autonomous-tariff-scraper']) assert.ok(M.WORK_FUNCTIONS.has(must), must);
  const plan = run({ CRM_STAGING_REF: REF }, ['--plan']);
  assert.match(plan.stdout, /campaign-scheduler\s+secret\s+\(skipped unless --include-work-functions\)/);
});

test('source: the trigger removed for seeding is restored in a finally block, and the run never prints a token', () => {
  const s = readFileSync(script, 'utf8').replace(/\r\n/g, '\n');
  assert.match(s, /pg_get_triggerdef/);
  assert.ok(s.indexOf('} finally {') > s.indexOf('restoreTrigger = ') && s.includes('restoreTrigger();'), 'restored in finally');
  assert.ok(!/console\.(log|error)\([^)]*(tok\b|tok\[|access_token|PUB\b|password)/.test(s), 'no token, key or password reaches the console');
});
