// Central page-access enforcement. Hiding a navigation item is not access control: every route a user can reach (sidebar,
// palette, a link inside a page, go() / openCase(), a stale view) ends in AppShell, which must refuse a page the role may not
// open BEFORE the page component is mounted (a mounted page fetches its data in effects).
// LOCAL unit + source tests of the client rules; the database / Edge Functions remain the authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url)); // …/src/
const alias = { '@': root.replace(/[\\/]$/, '') };
let labs = 'off';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (k === 'atlas.labs' && labs === 'on' ? 'on' : null) } });
const out = buildSync({ stdin: { contents: `export * from '@/lib/roles';`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'error', alias });
const mod = { exports: {} };
new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
const R = mod.exports;

const ROLES = ['admin', 'inside_sales', 'field_sales', 'manager', 'back_office'];
// page -> roles allowed with the Labs switch OFF (lib/labs.ts: Labs modules are additionally admin-only and need the switch)
const EXPECTED = {
  home: ['admin', 'inside_sales', 'field_sales'],
  mywork: ['admin', 'inside_sales', 'field_sales'],
  followups: ['admin', 'inside_sales', 'field_sales'],
  cases: ['admin', 'inside_sales', 'field_sales'],
  case: ['admin', 'inside_sales', 'field_sales'], // record-level authorization stays in the case page / database
  customers: ['admin', 'inside_sales', 'field_sales'],
  providers: ['admin', 'inside_sales', 'field_sales'],
  account: ['admin', 'inside_sales', 'field_sales'],
  preferences: ['admin', 'inside_sales', 'field_sales'],
  homelayout: ['admin', 'inside_sales', 'field_sales'],
  leads: ['admin', 'inside_sales'],
  map: ['admin', 'field_sales'],
  myday: ['admin', 'field_sales'],
  field: ['admin', 'field_sales'],
  backoffice: ['admin'],
  reports: ['admin'],
  revenue: ['admin'],
  admin: ['admin'],
  prospecting: [], // Labs
  automations: [], // Labs
  aiworkforce: [], // Labs
};
const LABS_PAGES = ['prospecting', 'automations', 'aiworkforce'];

test('every page × role: canOpenPage matches the expected matrix (Labs off)', () => {
  labs = 'off';
  for (const [page, allowed] of Object.entries(EXPECTED)) {
    for (const role of ROLES) {
      assert.equal(R.canOpenPage(page, role), allowed.includes(role), `${role} → ${page}`);
    }
  }
});

test('Labs pages: only the Admin with the Labs switch on; never a Sales Agent, never legacy', () => {
  labs = 'on';
  try {
    for (const page of LABS_PAGES) {
      for (const role of ROLES) assert.equal(R.canOpenPage(page, role), role === 'admin', `labs on: ${role} → ${page}`);
    }
    // turning Labs on grants nothing outside the Labs pages
    for (const [page, allowed] of Object.entries(EXPECTED)) {
      if (LABS_PAGES.includes(page)) continue;
      for (const role of ROLES) assert.equal(R.canOpenPage(page, role), allowed.includes(role), `labs on: ${role} → ${page}`);
    }
  } finally { labs = 'off'; }
});

test('direct / programmatic navigation: a Sales Agent cannot open any Admin-only page', () => {
  for (const role of ['inside_sales', 'field_sales']) {
    for (const page of ['backoffice', 'reports', 'revenue', 'admin', ...LABS_PAGES]) {
      assert.equal(R.canOpenPage(page, role), false, `${role} must not open ${page}`);
    }
  }
  // Sales Agents keep what they legitimately use
  for (const page of ['home', 'mywork', 'followups', 'cases', 'case', 'customers', 'providers', 'account']) {
    for (const role of ['inside_sales', 'field_sales']) assert.equal(R.canOpenPage(page, role), true, `${role} keeps ${page}`);
  }
  assert.equal(R.canOpenPage('leads', 'inside_sales'), true);
  assert.equal(R.canOpenPage('field', 'field_sales'), true);
});

test('unknown pages and unknown / missing roles are refused (nothing falls through to a default)', () => {
  assert.equal(R.canOpenPage('nonexistent', 'admin'), false);
  assert.equal(R.canOpenPage('__proto__', 'admin'), false);
  for (const role of ['intern', '', null, undefined]) {
    for (const page of Object.keys(EXPECTED)) assert.equal(R.canOpenPage(page, role), false, `${String(role)} → ${page}`);
  }
});

test('the matrix covers every page the shell can render', () => {
  const shell = readFileSync(join(root, 'components/app/AppShell.tsx'), 'utf8');
  const sw = shell.slice(shell.indexOf('switch (view.page)'));
  const rendered = [...sw.slice(0, sw.indexOf('})();')).matchAll(/case '([a-z]+)':/g)].map((m) => m[1]);
  assert.ok(rendered.length >= 20, 'found the page switch');
  for (const page of rendered) assert.ok(page in EXPECTED, `${page} is rendered by the shell but missing from the guard matrix`);
  const keys = readFileSync(join(root, 'lib/roles.ts'), 'utf8');
  const pageKeyBlock = keys.slice(keys.indexOf('export type PageKey'), keys.indexOf('export type NavBadge'));
  for (const m of pageKeyBlock.matchAll(/'([a-z]+)'/g)) assert.ok(m[1] in EXPECTED, `PageKey ${m[1]} missing from the guard matrix`);
});

test('AppShell enforces canOpenPage at the page boundary, before any page component is created', () => {
  const shell = readFileSync(join(root, 'components/app/AppShell.tsx'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(shell, /canOpenPage\(view\.page, role\)/, 'the shell asks canOpenPage for the current page and role');
  const denied = shell.indexOf('if (pageDenied) return <PageDenied />');
  const sw = shell.indexOf('switch (view.page)');
  assert.ok(denied > 0 && sw > 0 && denied < sw, 'the denied branch returns before the page switch');
  // every lazily loaded page is referenced as JSX only inside the switch, i.e. after the guard
  const body = shell.slice(sw, shell.indexOf('})();'));
  for (const m of shell.matchAll(/const (\w+Page) = lazy\(/g)) {
    const first = shell.indexOf(`<${m[1]} `) >= 0 ? shell.indexOf(`<${m[1]} `) : shell.indexOf(`<${m[1]}/>`);
    assert.ok(first >= sw, `${m[1]} is not rendered before the guard`);
    assert.ok(body.includes(`<${m[1]}`), `${m[1]} is rendered only by the guarded switch`);
  }
  // the old fallthrough (render Home / the requested page for anyone) must not come back
  assert.ok(!/labsPageAllowed/.test(shell), 'the shell no longer uses the labs-only check');
  // the denied state is explicit, and mounts nothing that fetches
  const pd = readFileSync(join(root, 'components/app/PageDenied.tsx'), 'utf8');
  assert.match(pd, /role="alert"/);
  assert.ok(!/useEffect|supabase|fetch\(|useQuery|from '@\/lib\/api/.test(pd), 'PageDenied fetches nothing');
});

test('AppShell is the only place that renders pages from the route', () => {
  const pages = ['ReportsPage', 'RevenuePage', 'SettingsPage', 'BackOfficePage', 'LeadsPage', 'MapPage', 'MyDayPage', 'FieldModePage', 'ProspectingPage', 'AutomationBuilderPage', 'AIWorkforcePage', 'CasesPage', 'CustomersPage'];
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === '__tests__' ? [] : walk(p)) : /\.(tsx|ts)$/.test(f) ? [p] : []; });
  for (const f of walk(root)) {
    if (f.endsWith('AppShell.tsx')) continue;
    const s = readFileSync(f, 'utf8');
    for (const p of pages) assert.ok(!new RegExp(`<${p}[\\s/>]`).test(s), `${f} must not render ${p} outside the guarded shell`);
  }
});

test('navigation helpers only change the route (view); they cannot bypass the shell guard', () => {
  const nav = readFileSync(join(root, 'lib/nav.tsx'), 'utf8');
  assert.ok(!/canOpenPage|fetch|supabase/.test(nav), 'nav.tsx just holds the view state');
  assert.match(nav, /setView\(\{ page: p/);
  assert.match(nav, /setView\(\{ page: 'case'/);
});
