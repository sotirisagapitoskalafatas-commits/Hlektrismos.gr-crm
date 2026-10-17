import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const L = await bundle('../lead-links.ts');
const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('B4: the roles that already open leads get the link; Field Sales keeps the text only', () => {
  for (const r of ['admin', 'manager', 'inside_sales', 'back_office']) assert.equal(L.canOpenLead(r), true, r);
  assert.equal(L.canOpenLead('field_sales'), false);
});

test('B4: Case → Lead and Customer → Lead are links, guarded by the role check', () => {
  const kase = src('../../components/app/CaseDetailPage.tsx');
  assert.ok(/\{canOpenLead\(role\) && <button[^>]*data-open-lead[^>]*onClick=\{\(\) => go\('leads', \{ lead: lead\.id \}\)\}/.test(kase));
  const cust = src('../../components/customers/CustomerDetail.tsx');
  assert.ok(/\{k\.lead_id && canOpenLead\(role\) && <button[^>]*data-open-lead/.test(cust));
});
