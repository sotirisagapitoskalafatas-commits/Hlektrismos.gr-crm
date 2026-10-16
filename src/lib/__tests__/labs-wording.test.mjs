// Admin-only «Πειραματικές λειτουργίες» (lib/labs.ts) and no developer wording shown to users.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const out = buildSync({
  stdin: { contents: "export * from './roles'; export * from './labs'; export * from './pending-text';", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const R = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const LABS = ['B2B Prospecting', 'Αυτοματισμοί', 'AI Εργατικό Δυναμικό'];
const labels = (role) => R.navForRole(role).flatMap((s) => s.children.map((c) => c.label));

test('labs modules are hidden by default for every role, including admin', () => {
  store.clear();
  for (const role of ['admin', 'manager', 'inside_sales', 'field_sales', 'back_office']) {
    assert.deepEqual(labels(role).filter((l) => LABS.includes(l)), [], role);
  }
  assert.ok(labels('admin').includes('Διαχείριση'), 'the rest of the admin menu is unchanged');
  assert.ok(labels('field_sales').includes('Λειτουργία Πεδίου'), 'field mode is not a labs module');
});

test('only an admin with the switch on sees them; the switch does nothing for other roles', () => {
  store.clear(); R.setLabsEnabled(true);
  assert.deepEqual(labels('admin').filter((l) => LABS.includes(l)).sort(), [...LABS].sort());
  for (const role of ['manager', 'inside_sales', 'back_office']) assert.deepEqual(labels(role).filter((l) => LABS.includes(l)), [], role);
  R.setLabsEnabled(false);
  assert.equal(store.has('atlas.labs'), false);
});

test('opening a labs page directly falls back to Αρχική unless allowed', () => {
  store.clear();
  for (const page of ['prospecting', 'automations', 'aiworkforce']) {
    assert.equal(R.labsPageAllowed(page, 'admin'), false, `${page} admin, switch off`);
    assert.equal(R.labsPageAllowed(page, 'manager'), false);
  }
  R.setLabsEnabled(true);
  assert.equal(R.labsPageAllowed('aiworkforce', 'admin'), true);
  assert.equal(R.labsPageAllowed('aiworkforce', 'manager'), false, 'a manager who sets the browser flag by hand still cannot');
  assert.equal(R.labsPageAllowed('cases', 'field_sales'), true, 'other pages are unaffected');
  assert.equal(R.labsPageAllowed('case', 'field_sales'), true);
  R.setLabsEnabled(false);
});

test('blocked storage: the switch reads as off', () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  assert.equal(R.labsEnabled(), false);
  assert.doesNotThrow(() => R.setLabsEnabled(true));
  globalThis.localStorage = saved;
});

test('pending text: admins see which update it waits for, everybody else a neutral sentence', () => {
  assert.equal(R.pendingText('admin', 'Εκκρεμεί η ενημέρωση (phase2/07)'), 'Εκκρεμεί η ενημέρωση (phase2/07)');
  assert.equal(R.pendingText('back_office', 'Εκκρεμεί η ενημέρωση (phase2/07)'), R.NOT_YET);
  assert.equal(R.pendingText(null, 'x', 'Άλλο'), 'Άλλο');
  assert.deepEqual(Object.values(R.MATURITY_LABEL).map((m) => m.label), ['Σε λειτουργία', 'Δοκιμαστικό', 'Προγραμματισμένο', 'Μπλοκαρισμένο']);
});

// Source scan: no string shown to users mentions a «migration» or «εκκρεμεί έγκριση».
// Excluded on purpose: the admin-only security findings (admin-checks.ts, Ασφάλεια tab) and the unrouted legacy DashboardPage.
test('no developer wording in user-facing strings', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== '__tests__') walk(p); } else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
  walk(root);
  const skip = /[\\/](admin-checks\.ts|DashboardPage\.tsx)$/;
  const hits = [];
  for (const f of files.filter((x) => !skip.test(x))) {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const strings = code.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|>[^<>{}\n]*</g) ?? [];
    for (const s of strings) if (/migration|εκκρεμεί έγκριση/i.test(s)) hits.push(`${f.slice(root.length)}: ${s.slice(0, 90)}`);
  }
  assert.deepEqual(hits, []);
});
