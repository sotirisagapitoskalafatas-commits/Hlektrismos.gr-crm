// Phase 2 navigation map: five top-bar modules + a settings area, derived from navForRole().
// The point of these tests: the regroup must never give a role a page it could not open before, never hide a page
// it could, and every page must stay reachable (Follow-ups inside «Η εργασία μου», Λειτουργία Πεδίου inside «Ημέρα μου»).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url)); // …/src/
const entry = `export * from '@/components/shell/ModuleMap'; export { navForRole, NAV_SECTIONS } from '@/lib/roles';`;
const out = buildSync({ stdin: { contents: entry, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'error', alias: { '@': root.replace(/[\\/]$/, '') } });

let labs = false; // lib/labs.ts reads localStorage('atlas.labs')
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (k === 'atlas.labs' && labs ? 'on' : null) } });
const mod = { exports: {} };
new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, createRequire(import.meta.url));
const M = mod.exports;

const ROLES = ['admin', 'manager', 'inside_sales', 'field_sales', 'back_office'];
const ids = (role) => M.modulesForRole(role).map((m) => m.id);
const keysOf = (m) => M.flatItems(m).map((i) => i.key);

test('modules per role: hidden when the role has no page in them, labs modules only for an admin with the switch on', () => {
  labs = false;
  assert.deepEqual(ids('admin'), ['home', 'crm', 'field', 'analytics']);
  assert.deepEqual(ids('manager'), ['home', 'crm', 'field', 'analytics']);
  assert.deepEqual(ids('inside_sales'), ['home', 'crm']);
  assert.deepEqual(ids('field_sales'), ['home', 'crm', 'field']);
  assert.deepEqual(ids('back_office'), ['home', 'crm']);
  labs = true;
  assert.deepEqual(ids('admin'), ['home', 'crm', 'field', 'analytics', 'ai']);
  const ai = M.modulesForRole('admin').find((m) => m.id === 'ai');
  assert.deepEqual(keysOf(ai), ['automations', 'aiworkforce']);
  assert.ok(keysOf(M.modulesForRole('admin').find((m) => m.id === 'crm')).includes('prospecting'));
  for (const r of ['manager', 'inside_sales', 'back_office']) assert.ok(!ids(r).includes('ai'), `${r} never sees Atlas AI`);
  for (const r of ['manager', 'inside_sales', 'back_office']) {
    assert.ok(!M.modulesForRole(r).flatMap(keysOf).includes('prospecting'), `${r} never sees B2B Prospecting, even with the labs switch on`);
  }
  labs = false;
});

test('no role gains or loses a page: sidebar items + settings + hosted pages == navForRole', () => {
  for (const labsOn of [false, true]) {
    labs = labsOn;
    for (const role of ROLES) {
      const expected = M.navForRole(role).flatMap((s) => s.children).map((l) => l.key).sort();
      const mods = M.modulesForRole(role);
      const settings = M.settingsModule(role);
      const shown = [...mods, ...(settings ? [settings] : [])].flatMap(keysOf);
      assert.equal(new Set(shown).size, shown.length, `${role}: an item appears twice`);
      for (const k of shown) assert.ok(expected.includes(k), `${role}: ${k} is shown but the role cannot see it`);
      for (const k of expected) {
        if (shown.includes(k)) continue;
        const host = M.HOSTED[k];
        assert.ok(host, `${role}: ${k} is not in the sidebar and has no host`);
        assert.ok(shown.includes(host), `${role}: ${k} is hosted by ${host}, which this role does not have`);
      }
    }
  }
  labs = false;
});

test('every page the old menu had is still reachable: active item resolution', () => {
  const field = M.modulesForRole('admin'); const settings = M.settingsModule('admin');
  const where = (page, role = 'admin') => { const mods = M.modulesForRole(role); const s = M.settingsModule(role); const m = M.moduleOfPage(page, mods, s); return [m?.id, M.activeItem(m, page)?.key]; };
  assert.deepEqual(where('home'), ['home', 'dashboard']);
  assert.deepEqual(where('mywork'), ['home', 'mywork']);
  assert.deepEqual(where('followups'), ['home', 'mywork'], 'old #followups route lands in «Η εργασία μου»');
  assert.deepEqual(where('leads'), ['crm', 'leads']);
  assert.deepEqual(where('case'), ['crm', 'cases'], 'a case file belongs to Cases');
  assert.deepEqual(where('backoffice'), ['crm', 'backoffice']);
  assert.deepEqual(where('providers'), ['crm', 'providers']);
  assert.deepEqual(where('myday', 'field_sales'), ['field', 'myday']);
  assert.deepEqual(where('field', 'field_sales'), ['field', 'myday'], 'Λειτουργία Πεδίου is opened from «Ημέρα μου»');
  assert.deepEqual(where('map'), ['field', 'map']);
  assert.deepEqual(where('reports'), ['analytics', 'reports']);
  assert.deepEqual(where('account'), ['settings', 'account']);
  assert.deepEqual(where('preferences'), ['settings', 'preferences']);
  assert.deepEqual(where('admin'), ['settings', 'settings']);
  assert.equal(M.moduleOfPage('admin', M.modulesForRole('inside_sales'), M.settingsModule('inside_sales')), null, 'a sales agent has no Διαχείριση');
  assert.ok(field.length && settings);
});

test('module links open the first allowed page; badges follow the live counts', () => {
  const first = (role, id) => M.firstPage(M.modulesForRole(role).find((m) => m.id === id));
  assert.equal(first('admin', 'home'), 'home');
  assert.equal(first('admin', 'crm'), 'leads');
  assert.equal(first('field_sales', 'crm'), 'customers', 'field sales has no Leads page');
  assert.equal(first('back_office', 'crm'), 'cases');
  assert.equal(first('field_sales', 'field'), 'myday');
  const item = (role, key) => M.modulesForRole(role).flatMap(M.flatItems).find((i) => i.key === key);
  assert.equal(item('admin', 'mywork').badge, 'followups', 'follow-ups due are counted on «Η εργασία μου»');
  assert.equal(item('admin', 'leads').badge, 'leads');
  assert.equal(item('back_office', 'backoffice').badge, 'backoffice');
  assert.equal(item('admin', 'cases').badge, 'cases');
});

test('CRM groups and settings groups: labels and admin-only block', () => {
  const crm = M.modulesForRole('admin').find((m) => m.id === 'crm');
  assert.deepEqual(crm.groups.map((g) => g.label), ['Πελάτες', 'Δουλειά', 'Κατάλογος']);
  assert.deepEqual(M.modulesForRole('back_office').find((m) => m.id === 'crm').groups.map((g) => g.label), ['Δουλειά'], 'empty groups are dropped');
  const s = M.settingsModule('admin');
  assert.deepEqual(s.groups.map((g) => g.label), [undefined, 'Μόνο για διαχειριστές']);
  assert.deepEqual(M.settingsModule('inside_sales').groups.map((g) => g.label), [undefined]);
  assert.equal(M.settingsModule('inside_sales').groups[0].items.find((i) => i.key === 'account').label, 'Προφίλ & λογαριασμός');
});
