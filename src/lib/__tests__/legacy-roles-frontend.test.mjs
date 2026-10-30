// Frontend role alignment: exactly two account categories. Admin / Back Office = `admin` (one shared login); Sales Agent =
// `field_sales` + the legacy-compatible `inside_sales`. The legacy identifiers `manager` and `back_office` stay in the data
// (profiles, history) but hold NO category, permission, navigation, record access or privilege.
// LOCAL unit tests of the client rules. The database / Edge Functions are the authority (phase6/23, #135); this is not
// production authorization evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url)); // …/src/
const alias = { '@': root.replace(/[\\/]$/, '') };
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
const load = (entry) => {
  const out = buildSync({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'error', alias });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
  return mod.exports;
};
const R = load(`export * from '@/lib/roles';`);
const S = load(`export { CREATEABLE_SALES_ROLES, STAFF_ROLES, manageableRoles, canManage, isSalesAgentRole } from '../supabase/functions/_shared/staff-admin';`);

const LEGACY = ['manager', 'back_office'];
const SALES = ['inside_sales', 'field_sales'];
const PAGES = ['home', 'mywork', 'leads', 'prospecting', 'providers', 'cases', 'followups', 'customers', 'map', 'myday', 'field', 'backoffice', 'reports', 'revenue', 'admin', 'automations', 'aiworkforce', 'account', 'preferences', 'homelayout'];
const ACTIONS = ['create_case', 'edit_case', 'log_call', 'log_email', 'log_sms', 'log_whatsapp', 'create_offer', 'send_offer', 'create_followup', 'complete_followup', 'add_note', 'add_document', 'verify_document', 'schedule_visit', 'check_in', 'check_out', 'photo', 'meeting', 'capture_signature', 'create_application', 'submit_provider', 'change_stage', 'assign', 'delete'];

test('the roles offered are exactly the two categories; legacy identifiers are kept only as identifiers', () => {
  assert.deepEqual(R.ROLES.map((r) => r.id).sort(), ['admin', 'field_sales', 'inside_sales']);
  for (const r of LEGACY) assert.ok(!R.ROLES.some((x) => x.id === r), `${r} is not selectable`);
  assert.deepEqual([...R.LEGACY_ROLES], LEGACY);
  assert.deepEqual([...R.ACTIVE_ROLES].sort(), ['admin', 'field_sales', 'inside_sales']);
  assert.deepEqual(R.ACCESS_GROUPS.map((g) => [g.id, g.roles]), [['office', ['admin']], ['sales', ['inside_sales', 'field_sales']]]);
  // historical display keeps working for the identifiers (colour map, label), without implying access
  for (const r of LEGACY) { assert.ok(R.ROLE_COLOR[r]); assert.equal(R.isLegacyRole(r), true); assert.equal(R.hasAccess(r), false); }
  for (const r of ['admin', ...SALES]) { assert.equal(R.isLegacyRole(r), false); assert.equal(R.hasAccess(r), true); }
});

test('labels and groups: legacy roles are never shown as Admin / Back Office or Sales Agent', () => {
  assert.equal(R.roleLabel('admin'), 'Admin / Back Office');
  for (const r of SALES) { assert.equal(R.roleLabel(r), 'Sales Agent'); assert.equal(R.accessGroup(r), 'sales'); assert.equal(R.accessGroupLabel(r), 'Sales Agent'); }
  assert.equal(R.accessGroup('admin'), 'office');
  for (const r of LEGACY) {
    assert.equal(R.roleLabel(r), R.LEGACY_ROLE_LABEL);
    assert.equal(R.accessGroup(r), null, `${r} belongs to no access category`);
    assert.equal(R.accessGroupLabel(r), R.LEGACY_ROLE_LABEL);
    assert.notEqual(R.accessGroupColor(r), R.ACCESS_GROUP_COLOR.office);
  }
  assert.equal(R.accessGroup('intern'), null, 'unknown roles also have no category');
});

test('navigation: legacy roles get NO page; admin keeps every page; Sales Agents keep theirs', () => {
  for (const r of LEGACY) {
    assert.deepEqual(R.navForRole(r), [], `${r} has no navigation`);
    for (const p of [...PAGES, 'case']) assert.equal(R.canOpenPage(p, r), false, `${r} must not open ${p}`);
  }
  const adminPages = R.navForRole('admin').flatMap((s) => s.children.map((c) => c.page));
  const LABS_PAGES = ['prospecting', 'automations', 'aiworkforce']; // shown only with the admin's labs switch (lib/labs.ts)
  for (const p of PAGES.filter((x) => !LABS_PAGES.includes(x))) assert.ok(adminPages.includes(p), `admin keeps ${p}`);
  const labsOn = (() => { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (k === 'atlas.labs' ? 'on' : null) } }); return R.navForRole('admin').flatMap((s) => s.children.map((c) => c.page)); })();
  for (const p of LABS_PAGES) assert.ok(labsOn.includes(p), `admin keeps ${p} when labs are on`);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  assert.ok(adminPages.includes('backoffice') && adminPages.includes('reports') && adminPages.includes('revenue') && adminPages.includes('admin'));
  const sales = (r) => R.navForRole(r).flatMap((s) => s.children.map((c) => c.page));
  for (const r of SALES) {
    assert.ok(sales(r).includes('cases') && sales(r).includes('customers') && sales(r).includes('home'), `${r} keeps its pages`);
    for (const p of ['admin', 'backoffice', 'reports', 'revenue']) assert.ok(!sales(r).includes(p), `${r} has no ${p}`);
  }
  assert.ok(sales('inside_sales').includes('leads') && !sales('field_sales').includes('leads'));
  assert.ok(sales('field_sales').includes('myday') && sales('field_sales').includes('map'));
  // no navigation entry names a legacy role any more
  for (const s of R.NAV_SECTIONS) for (const i of s.children) for (const l of LEGACY) assert.ok(!i.roles.includes(l), `${i.key} must not list ${l}`);
});

test('permissions: legacy roles can do nothing — by default, by mutation of the table, or by any helper', () => {
  for (const r of LEGACY) {
    assert.deepEqual(R.PERMS[r], [], `${r}: PERMS is empty`);
    for (const a of ACTIONS) assert.equal(R.can(r, a), false, `${r} must not ${a}`);
  }
  // an override that wrote actions into the legacy row would still not grant anything
  const saved = R.PERMS.manager; R.PERMS.manager = [...ACTIONS];
  for (const a of ACTIONS) assert.equal(R.can('manager', a), false, 'a tampered PERMS row grants nothing');
  R.PERMS.manager = saved;
  for (const a of ACTIONS) assert.equal(R.can('admin', a), a !== 'delete' ? true : true, `admin ${a}`);
  for (const a of ['create_case', 'edit_case', 'log_call', 'create_offer', 'add_document', 'change_stage']) assert.equal(R.can('inside_sales', a), true, `inside_sales ${a}`);
  for (const a of ['check_in', 'check_out', 'capture_signature', 'schedule_visit']) assert.equal(R.can('field_sales', a), true, `field_sales ${a}`);
  for (const r of SALES) for (const a of ['delete', 'verify_document', 'create_application', 'submit_provider']) assert.equal(R.can(r, a), false, `${r} must not ${a}`);
  assert.equal(R.can(null, 'create_case'), false); assert.equal(R.can('intern', 'create_case'), false);
});

test('hierarchy and helpers: legacy roles rank below everything and cannot be lifted', () => {
  assert.equal(R.ROLE_LEVEL.manager, 0); assert.equal(R.ROLE_LEVEL.back_office, 0);
  for (const min of ['inside_sales', 'field_sales', 'admin']) {
    assert.equal(R.isAtLeastRole(['manager'], min), false, `manager vs ${min}`);
    assert.equal(R.isAtLeastRole(['back_office'], min), false, `back_office vs ${min}`);
    assert.equal(R.isAtLeastRole(['manager', 'back_office'], min), false);
  }
  assert.equal(R.isAtLeastRole(['manager'], 'manager'), false, 'a legacy minimum is never satisfied');
  assert.equal(R.isAtLeastRole(['admin'], 'field_sales'), true);
  assert.equal(R.isAtLeastRole(['field_sales'], 'inside_sales'), true);
  assert.equal(R.isAtLeastRole(['inside_sales'], 'field_sales'), false);
  for (const r of LEGACY) { assert.equal(R.isOrgRole(r), false); assert.equal(R.asOrgRole(r), null, `${r} is never promoted to an org role`); }
  for (const r of ['admin', ...SALES]) assert.equal(R.asOrgRole(r), r);
  assert.deepEqual([...R.ORG_ROLES].sort(), ['admin', 'field_sales', 'inside_sales']);
});

test('account management: only admin; legacy roles (alone or beside another role) cannot manage accounts', () => {
  assert.equal(R.canManageRoles(['admin']), true);
  for (const r of [['manager'], ['back_office'], ['manager', 'back_office'], ['field_sales'], ['inside_sales'], [], null, undefined]) assert.equal(R.canManageRoles(r), false, JSON.stringify(r));
  assert.equal(R.canManageRoles(['manager', 'field_sales']), false);
});

test('new accounts: only Sales Agent roles are offered for creation; manager / back_office can never be created or assigned', () => {
  assert.deepEqual([...S.CREATEABLE_SALES_ROLES].sort(), ['field_sales', 'inside_sales'].filter((r) => S.CREATEABLE_SALES_ROLES.includes(r)).sort());
  for (const r of LEGACY) assert.ok(!S.CREATEABLE_SALES_ROLES.includes(r), `${r} is not creatable`);
  for (const r of LEGACY) assert.equal(S.isSalesAgentRole(r), false);
  // the role picker the staff screen builds from the group definition offers no legacy role either
  for (const g of R.ACCESS_GROUPS) for (const r of g.roles) assert.ok(!R.isLegacyRole(r), `${g.id}: ${r}`);
  const manageableByAdmin = S.manageableRoles('admin');
  for (const r of LEGACY) assert.ok(!manageableByAdmin.includes(r), `admin cannot assign ${r}`);
  for (const actor of LEGACY) assert.deepEqual(S.manageableRoles(actor), [], `${actor} manages nobody`);
});

test('historical profiles stay intact: no helper converts a legacy identifier into another role', () => {
  for (const r of LEGACY) {
    assert.equal(R.accessGroup(r), null);
    assert.notEqual(R.asOrgRole(r), 'admin');
    assert.equal(R.canOpenPage('admin', r), false);
    // the identifier itself is still a valid member of the Role union for display of history (colour, label)
    assert.ok(typeof R.roleLabel(r) === 'string' && R.roleLabel(r).length > 0);
  }
  assert.equal(R.roleLabel('manager').includes('Admin'), false);
  assert.equal(R.roleLabel('back_office').includes('Admin'), false);
});

// ───────────────────────────── source-level guards (no hidden legacy authorization path) ─────────────────────────────
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (n === '__tests__' || n === 'node_modules') return [];
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
});
const files = walk(root);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('no source file grants anything to a legacy role: no role === manager/back_office, no legacy in role lists', () => {
  const offenders = [];
  for (const f of files) {
    if (f.endsWith('roles.ts')) continue; // the single place that names them, as identifiers
    const src = strip(readFileSync(f, 'utf8'));
    src.split('\n').forEach((line, i) => {
      if (/\brole\s*[!=]==?\s*'(manager|back_office)'/.test(line)) offenders.push(`${f}:${i + 1} ${line.trim()}`);
      if (/\['admin',[^\]]*'(manager|back_office)'/.test(line)) offenders.push(`${f}:${i + 1} ${line.trim()}`);
      if (/\.includes\(\s*(current)?[rR]ole\s*\)/.test(line) && /'(manager|back_office)'/.test(line)) offenders.push(`${f}:${i + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('the CRM shell is closed to a legacy profile: App shows the no-access page, AppShell blocks every page', () => {
  const app = readFileSync(join(root, 'App.tsx'), 'utf8');
  assert.ok(/hasAccess\(profile\?\.role\)\s*\?\s*<AppShell\s*\/>\s*:\s*<NoAccessPage\s*\/>/.test(app), 'App: legacy / unknown / missing profile → NoAccessPage');
  const shell = readFileSync(join(root, 'components/app/AppShell.tsx'), 'utf8');
  assert.ok(/canOpenPage\(view\.page, role\)/.test(shell) && /if \(pageDenied\) return <PageDenied \/>/.test(shell), 'AppShell: canOpenPage (false for a role without access) refuses every page; see page-guard.test.mjs');
  const na = readFileSync(join(root, 'components/app/NoAccessPage.tsx'), 'utf8');
  assert.ok(/signOut/.test(na) && !/promot|convert|setRole|update\(/i.test(strip(na)), 'the page only offers sign-out; it converts nothing');
});
