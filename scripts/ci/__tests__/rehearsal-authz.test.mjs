// The CRM-only staging rehearsal script must refuse production and the shared staging project, plan offline,
// and cover every Edge Function in the repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
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
