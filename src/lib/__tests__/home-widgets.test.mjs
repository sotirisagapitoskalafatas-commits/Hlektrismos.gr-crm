// Home widgets: role defaults, layout validation against the registry, and the pure edit operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const stubs = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /^(\.\/supabase|react)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      contents: a.path === 'react' ? 'export const useSyncExternalStore=()=>{};' : 'export const supabase = null;', loader: 'js',
    }));
  },
};
const out = await build({ entryPoints: [path('../home-widgets.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent', plugins: [stubs] });
const W = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const ids = (l) => l.map((x) => x.id);
const ROLES = ['admin', 'inside_sales', 'field_sales']; // the roles that hold access; legacy manager / back_office never reach Home

test('every role has a default layout of only the boxes it may have; team and summary are for admins/managers', () => {
  for (const r of ROLES) {
    const d = W.defaultLayout(r);
    assert.ok(d.length >= 8, r);
    assert.equal(new Set(ids(d)).size, d.length, 'no duplicates');
    for (const it of d) assert.ok(W.widgetMeta(it.id).sizes.includes(it.size), `${r}:${it.id} default size allowed`);
  }
  assert.ok(ids(W.defaultLayout('admin')).includes('summary'));
  assert.ok(ids(W.defaultLayout('admin')).includes('team'));
  for (const r of ['manager', 'inside_sales', 'field_sales', 'back_office']) {
    assert.ok(!ids(W.defaultLayout(r)).includes('team') && !ids(W.defaultLayout(r)).includes('summary'), r);
  }
  assert.equal(W.defaultLayout('inside_sales').find((x) => x.id === 'ai').size, 'XL', 'no team column: AI fills the row');
});

test('resolveLayout: empty or unusable -> the role default; foreign/unknown boxes and bad sizes never survive', () => {
  for (const bad of [null, undefined, [], 'x', {}, [{ id: 'nope', size: 'S' }]]) assert.deepEqual(W.resolveLayout(bad, 'admin'), W.defaultLayout('admin'));
  // a sales agent whose saved layout (e.g. copied from an admin, or from before a role change) lists admin-only boxes
  const l = W.resolveLayout([{ id: 'summary', size: 'XL' }, { id: 'team', size: 'M' }, { id: 'tasks', size: 'L' }, { id: 'pipeline', size: 'S' }], 'inside_sales');
  assert.deepEqual(l, [{ id: 'tasks', size: 'L' }, { id: 'pipeline', size: 'M' }], 'summary/team dropped; pipeline S is not allowed -> its default size');
});

test('layoutToSave stores [] for the default so later default changes still reach people who never customised', () => {
  assert.deepEqual(W.layoutToSave(W.defaultLayout('admin'), 'admin'), []);
  const custom = W.setSize(W.defaultLayout('admin'), 'tasks', 'XL');
  assert.deepEqual(W.layoutToSave(custom, 'admin'), custom);
  assert.equal(W.sameLayout(custom, W.defaultLayout('admin')), false);
});

test('edit operations are pure, bounded and validated', () => {
  const base = [{ id: 'tasks', size: 'M' }, { id: 'pipeline', size: 'M' }, { id: 'ai', size: 'M' }];
  assert.deepEqual(ids(W.moveBy(base, 'tasks', 1)), ['pipeline', 'tasks', 'ai']);
  assert.deepEqual(ids(W.moveBy(base, 'tasks', -1)), ['tasks', 'pipeline', 'ai'], 'cannot go before the first');
  assert.deepEqual(ids(W.moveBy(base, 'ai', 1)), ['tasks', 'pipeline', 'ai'], 'cannot go after the last');
  assert.deepEqual(ids(W.moveTo(base, 'ai', 'tasks')), ['ai', 'tasks', 'pipeline']);
  assert.deepEqual(ids(W.moveTo(base, 'tasks', 'ai')), ['pipeline', 'ai', 'tasks']);
  assert.equal(W.moveTo(base, 'x', 'tasks'), base);
  assert.equal(W.setSize(base, 'tasks', 'S'), base, 'S is not allowed for tasks');
  assert.equal(W.setSize(base, 'tasks', 'XL').find((x) => x.id === 'tasks').size, 'XL');
  assert.equal(base[0].size, 'M', 'input untouched');
  assert.deepEqual(ids(W.removeWidget(base, 'pipeline')), ['tasks', 'ai']);
  assert.equal(W.removeWidget([{ id: 'tasks', size: 'M' }], 'tasks').length, 1, 'the last box stays');
});

test('add/hidden: only boxes the role may have, once each', () => {
  const l = W.removeWidget(W.defaultLayout('inside_sales'), 'pipeline');
  assert.deepEqual(W.hiddenWidgets(l, 'inside_sales').map((w) => w.id), ['pipeline']);
  assert.deepEqual(ids(W.addWidget(l, 'pipeline', 'inside_sales')).at(-1), 'pipeline');
  assert.equal(W.addWidget(l, 'team', 'inside_sales'), l, 'a sales agent cannot add the team box');
  assert.equal(W.addWidget(W.defaultLayout('admin'), 'tasks', 'admin').length, W.defaultLayout('admin').length, 'no duplicates');
});

test('the Home page renders every registered box (registry and page cannot drift apart)', () => {
  const page = readFileSync(path('../../components/app/HomePage.tsx'), 'utf8');
  for (const w of W.WIDGETS) assert.ok(new RegExp(`(^|\\s)'?${w.id}'?:\\s`, 'm').test(page), `HomePage has no body for ${w.id}`);
  const css = readFileSync(path('../../styles/atlas-home.css'), 'utf8');
  for (const s of ['S', 'M', 'L', 'XL']) assert.ok(css.includes(`data-size='${s}'`), `grid rule for ${s}`);
});
