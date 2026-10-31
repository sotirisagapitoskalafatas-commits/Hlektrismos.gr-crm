// CRM navigation lives in the URL: refresh, new tab, Back and Forward keep the section. LOCAL unit tests of the pure module with a fake window
// (hash + history + hashchange), plus source checks that the provider is wired to it and that the page guard is untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const load = (spec) => {
  const out = buildSync({ stdin: { contents: `export * from '${spec}';`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent', alias: { '@': root.replace(/[\\/]$/, '') } });
  const m = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, createRequire(import.meta.url));
  return m.exports;
};
globalThis.localStorage ??= { getItem: () => null };
const N = load('@/lib/nav-url');
const R = load('@/lib/roles');

/** A browser tab: a hash, a history list, and hashchange fired when the hash changes (like a real browser, asynchronously ignored here). */
function tab(initial = '') {
  const listeners = new Set();
  const history = [initial]; let index = 0;
  const win = {
    location: { get hash() { return history[index]; }, set hash(v) { const h = v.startsWith('#') ? v : `#${v}`; if (h === history[index]) return; history.splice(index + 1); history.push(h); index++; fire(); } },
    addEventListener: (_t, fn) => listeners.add(fn), removeEventListener: (_t, fn) => listeners.delete(fn),
  };
  const fire = () => [...listeners].forEach((l) => l());
  return { win, back() { if (index > 0) { index--; fire(); } }, forward() { if (index < history.length - 1) { index++; fire(); } }, history };
}
const open = (t) => { const s = N.createNavStore(t.win); s.subscribe(() => {}); return s; };

test('every page key is known: PAGE_KEYS matches the roles module exactly', () => {
  assert.deepEqual([...N.PAGE_KEYS].sort(), Object.keys(R.PAGE_TITLES).sort());
});

test('1. Πελάτες, refresh, still Πελάτες (a refresh is a new store reading the same hash)', () => {
  const t = tab(); const a = open(t);
  a.go('customers');
  assert.equal(t.win.location.hash, '#/dashboard?view=customers');
  assert.equal(open(t).get().page, 'customers');
});

test('2. Cases, refresh, still Cases; and the same for leads, follow-ups, reports and account', () => {
  for (const page of ['cases', 'leads', 'followups', 'reports', 'account', 'home']) {
    const t = tab(); open(t).go(page);
    assert.equal(open(t).get().page, page, page);
  }
});

test('3. a specific Case, refresh, the same Case', () => {
  const id = '3f2b8a52-1c6e-4d1a-9a52-0d5b7c9e1a11';
  const t = tab(); open(t).openCase(id);
  assert.equal(t.win.location.hash, `#/dashboard?view=case&caseId=${id}`);
  const v = open(t).get();
  assert.deepEqual([v.page, v.caseId], ['case', id]);
});

test('4 and 5. Πελάτες, Cases, Back is Πελάτες, Forward is Cases, Back again past the start', () => {
  const t = tab('#/dashboard?view=home'); const s = open(t);
  s.go('customers'); s.go('cases');
  assert.equal(s.get().page, 'cases');
  t.back(); assert.equal(s.get().page, 'customers');
  t.forward(); assert.equal(s.get().page, 'cases');
  t.back(); t.back(); assert.equal(s.get().page, 'home');
});

test('6. unknown, manipulated or oversized parameters fail safely to home and never throw', () => {
  const hashes = ['#/dashboard?view=nope', '#/dashboard?view=__proto__', '#/dashboard?view=', '#/dashboard?view=case', '#/dashboard?view=case&caseId=../../etc', '#/dashboard?view=case&caseId=' + 'a'.repeat(200),
    '#/dashboard?view=leads%00', '#/dashboard?%E0%A4%A', '#/dashboard?view[]=leads', '#/dashboard?view=constructor', '#/dashboard?' + 'x'.repeat(5000), '#/dashboard?view=<script>'];
  for (const h of hashes) {
    const v = open(tab(h)).get();
    assert.ok(v.page === 'home' || N.PAGE_KEYS.includes(v.page), `${h.slice(0, 40)} -> ${v.page}`);
    if (v.page === 'case') assert.match(v.caseId, /^[A-Za-z0-9_-]{1,64}$/);
  }
  assert.equal(open(tab('#/dashboard?view=nope')).get().page, 'home');
  assert.equal(open(tab('#/dashboard?view=case&caseId=../../etc')).get().page, 'home');
});

test('6b. filters: only identifier-shaped values and keys are read; the rest is dropped', () => {
  const v = open(tab('#/dashboard?view=leads&f.status=new&f.q=Νίκος&f.email=a@b.gr&f.__proto__=x&f.ok=a_b-1&g.status=zzz')).get();
  assert.deepEqual(v.filters, { status: 'new', ok: 'a_b-1' });
});

test('privacy: no name, e-mail address or phone number can reach the URL, whatever a page passes to go()', () => {
  const t = tab(); const s = open(t);
  s.go('leads', { q: 'Νίκος Παπαδόπουλος', email: 'maria@example.gr', phone: '+30 690 000 0001', status: 'new', customer: 'c0ffee00-0000-4000-8000-000000000001' });
  const h = decodeURIComponent(t.win.location.hash);
  for (const leak of ['Νίκος', 'maria', '@', '690', '+30']) assert.ok(!h.includes(leak), leak);
  assert.match(h, /f\.status=new/); assert.match(h, /f\.customer=c0ffee00/);
  assert.equal(s.get().filters.q, 'Νίκος Παπαδόπουλος', 'the current session still has the filter; only the URL leaves it out');
  s.openCase('has spaces and Ελληνικά'); assert.equal(t.win.location.hash, '#/dashboard', 'an unsafe case id is not written');
});

test('8. #/dashboard and #/app (no view) open home; other routes name no CRM view and keep the current one', () => {
  assert.equal(open(tab('#/dashboard')).get().page, 'home');
  assert.equal(open(tab('#/app')).get().page, 'home');
  assert.equal(N.parseView('#/login'), null);
  assert.equal(N.parseView('#kontakt'), null);
  assert.equal(N.parseView(''), null);
  const t = tab('#/dashboard?view=cases'); const s = open(t);
  t.win.location.hash = '#/login'; // another route names no CRM view: the current view is kept
  assert.equal(s.get().page, 'cases');
  t.win.location.hash = '#/dashboard'; // an explicit "go to the dashboard" (the login redirect does this): Home
  assert.equal(s.get().page, 'home');
});

test('the store subscribes to hashchange only while something listens', () => {
  const t = tab(); const s = N.createNavStore(t.win);
  let n = 0; const off = s.subscribe(() => n++);
  s.go('leads'); assert.ok(n >= 1);
  off(); const before = n; t.win.location.hash = '#/dashboard?view=cases';
  assert.equal(n, before);
});

test('7. a Sales Agent opening a restricted URL is still denied by the page guard (the URL decides nothing)', () => {
  const adminOnly = ['admin', 'revenue', 'automations'].filter((p) => !R.canOpenPage(p, 'sales_agent'));
  assert.ok(adminOnly.length >= 1, 'at least one page is closed to a Sales Agent');
  for (const p of adminOnly) {
    const view = open(tab(`#/dashboard?view=${p}`)).get();
    assert.equal(view.page, p, 'the URL names the page');
    assert.equal(R.canOpenPage(view.page, 'sales_agent'), false, 'and the guard still refuses it');
    assert.equal(R.canOpenPage(view.page, 'manager'), false, 'legacy manager too');
    assert.equal(R.canOpenPage(view.page, 'back_office'), false, 'legacy back_office too');
  }
  assert.equal(R.canOpenPage('admin', 'admin'), true, 'Admin keeps it');
});

test('wiring: AppShell still asks the guard before mounting a page, and the provider uses the URL store', () => {
  const shell = readFileSync(root + 'components/app/AppShell.tsx', 'utf8');
  assert.match(shell, /const pageDenied = !canOpenPage\(view\.page, role\)/);
  const nav = readFileSync(root + 'lib/nav.tsx', 'utf8');
  assert.match(nav, /createNavStore\(window\)/);
  assert.ok(!/useState<AppView>/.test(nav), 'the view is no longer only React state');
  assert.match(readFileSync(root + 'lib/router.ts', 'utf8'), /'\/dashboard': 'app'/);
});
