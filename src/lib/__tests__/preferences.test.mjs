// Per-user preferences: validation, the local copy, optimistic apply + debounced save, load precedence, and the
// avatar helpers. The Supabase client and React are stubbed; the store takes its remote/storage/timers by injection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const stubs = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /^(\.\/supabase|react)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      contents: a.path === 'react' ? 'export const useSyncExternalStore=()=>{};export const useState=()=>{};export const useEffect=()=>{};' : 'export const supabase = null;',
      loader: 'js',
    }));
  },
};
const bundle = async (rel) => {
  const out = await build({ entryPoints: [path(rel)], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent', plugins: [stubs] });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const P = await bundle('../preferences.ts');
const A = await bundle('../avatar.ts');

const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), m }; };
const fakeTimers = () => { const q = []; return { setTimer: (fn) => { q.push(fn); return q.length - 1; }, clearTimer: (i) => { q[i] = null; }, run: () => { const f = q.splice(0).filter(Boolean); f.forEach((fn) => fn()); } }; };
const flushPromises = () => new Promise((r) => setImmediate(r));
function make(over = {}) {
  const calls = { saves: [], applied: [], changes: 0 };
  const timers = fakeTimers();
  const remote = over.remote ?? {
    load: async () => ({ row: null }),
    save: async (uid, p) => { calls.saves.push({ uid, p }); return { ok: true }; },
  };
  const storage = over.storage ?? memory();
  const store = P.createPreferencesStore({ remote, storage, apply: (t) => calls.applied.push(t), onChange: () => calls.changes++, ...timers });
  return { store, calls, timers, storage };
}

test('validateLayout keeps clean {id,size} items in order and drops everything else without throwing', () => {
  const v = P.validateLayout([
    { id: 'kpi-leads', size: 'M' }, { id: 'kpi-leads', size: 'L' }, { id: 'Bad Id', size: 'S' }, { id: 'tasks', size: 'XXL' },
    null, 'x', 5, { id: 'pipeline', size: 'XL' }, { size: 'S' }, { id: 7, size: 'S' },
  ]);
  assert.deepEqual(v, [{ id: 'kpi-leads', size: 'M' }, { id: 'pipeline', size: 'XL' }]);
  for (const bad of [null, undefined, 'x', 3, {}, { a: 1 }]) assert.deepEqual(P.validateLayout(bad), []);
  assert.equal(P.validateLayout(Array.from({ length: 80 }, (_, i) => ({ id: `t${i}`, size: 'S' }))).length, 40, 'capped');
});

test('normalizePreferences fills defaults and rejects unknown values', () => {
  assert.deepEqual(P.normalizePreferences(null), P.DEFAULT_PREFERENCES);
  const n = P.normalizePreferences({ shell_theme: 'neon', sidebar_compact: 'yes', dashboard_layout: 'nope', pipeline_lane: '  ' });
  assert.deepEqual(n, P.DEFAULT_PREFERENCES, 'unknown theme -> navy, non-boolean compact -> false, bad layout -> [], blank lane -> null');
  const ok = P.normalizePreferences({ shell_theme: 'plum', sidebar_compact: true, dashboard_layout: [{ id: 'a', size: 'S' }], pipeline_lane: ' won ' });
  assert.deepEqual(ok, { shell_theme: 'plum', sidebar_compact: true, dashboard_layout: [{ id: 'a', size: 'S' }], pipeline_lane: 'won' });
});

test('local copy: corrupt or blocked storage never throws; the old sidebar key is honoured once', () => {
  assert.equal(P.readCache(memory({ [P.CACHE_KEY]: '{not json' })), null);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(P.readCache(blocked), null);
  assert.equal(P.readCache(null), null);
  const old = P.readCache(memory({ [P.COMPACT_KEY]: '1' }));
  assert.equal(old.prefs.sidebar_compact, true);
  assert.equal(old.prefs.shell_theme, 'navy');
});

test('initFromCache applies the stored theme before anything loads (and the default when there is nothing)', () => {
  const a = make({ storage: memory({ [P.CACHE_KEY]: JSON.stringify({ uid: 'u1', shell_theme: 'forest', sidebar_compact: false, dashboard_layout: [], pipeline_lane: null }) }) });
  a.store.initFromCache();
  assert.deepEqual(a.calls.applied, ['forest']);
  const b = make(); b.store.initFromCache();
  assert.deepEqual(b.calls.applied, ['navy']);
});

test('update is optimistic: applied and cached at once, saved once after the debounce', async () => {
  const { store, calls, timers, storage } = make();
  await store.loadForUser('u1');
  store.update({ shell_theme: 'ocean' });
  store.update({ sidebar_compact: true });
  store.update({ shell_theme: 'plum' });
  assert.equal(store.getState().prefs.shell_theme, 'plum');
  assert.equal(calls.applied.at(-1), 'plum');
  assert.equal(JSON.parse(storage.m.get(P.CACHE_KEY)).shell_theme, 'plum');
  assert.equal(storage.m.get(P.COMPACT_KEY), '1', 'old key mirrored');
  assert.equal(calls.changes, 1, 'sidebar listeners told once, for the compact change');
  assert.equal(calls.saves.length, 0, 'nothing saved before the pause');
  timers.run(); await flushPromises();
  assert.equal(calls.saves.length, 1, 'three changes -> one write');
  assert.deepEqual(calls.saves[0].p, { shell_theme: 'plum', sidebar_compact: true, dashboard_layout: [], pipeline_lane: null });
  assert.equal(calls.saves[0].uid, 'u1');
});

test('the server row wins over the local copy; with no row the local copy stays', async () => {
  const storage = memory({ [P.CACHE_KEY]: JSON.stringify({ uid: 'u1', shell_theme: 'forest' }) });
  const withRow = make({ storage, remote: { load: async () => ({ row: { shell_theme: 'graphite', sidebar_compact: true, dashboard_layout: [{ id: 'a', size: 'L' }] } }), save: async () => ({ ok: true }) } });
  withRow.store.initFromCache();
  await withRow.store.loadForUser('u1');
  assert.equal(withRow.store.getState().prefs.shell_theme, 'graphite');
  assert.equal(withRow.store.getState().remote, 'ready');
  assert.deepEqual(withRow.store.getState().prefs.dashboard_layout, [{ id: 'a', size: 'L' }]);

  const none = make({ storage: memory({ [P.CACHE_KEY]: JSON.stringify({ uid: 'u1', shell_theme: 'forest' }) }) });
  none.store.initFromCache(); await none.store.loadForUser('u1');
  assert.equal(none.store.getState().prefs.shell_theme, 'forest', 'first sign-in on a device keeps what was chosen locally');
  assert.equal(none.calls.saves.length, 0, 'loading alone never writes');
});

test('another person on the same browser starts from the defaults, not the previous user\'s look', async () => {
  const { store } = make({ storage: memory({ [P.CACHE_KEY]: JSON.stringify({ uid: 'u1', shell_theme: 'plum', sidebar_compact: true }) }) });
  store.initFromCache();
  await store.loadForUser('u2');
  assert.deepEqual(store.getState().prefs, P.DEFAULT_PREFERENCES);
});

test('missing table or failing server: stays usable and local, no retry storm, no throw', async () => {
  const { store, calls, timers } = make({ remote: { load: async () => ({ row: null, unavailable: true }), save: async () => { calls.saves.push(1); return { ok: false, unavailable: true }; } } });
  await store.loadForUser('u1');
  assert.equal(store.getState().remote, 'unavailable');
  store.update({ shell_theme: 'ocean' });
  assert.equal(store.getState().prefs.shell_theme, 'ocean');
  timers.run(); await flushPromises();
  assert.equal(calls.saves.length, 0, 'does not even try to save when the table is unavailable');

  const flaky = make({ remote: { load: async () => ({ row: null }), save: async () => ({ ok: false }) } });
  await flaky.store.loadForUser('u1');
  flaky.store.update({ shell_theme: 'plum' });
  flaky.timers.run(); await flushPromises();
  assert.equal(flaky.store.getState().saveFailed, true);
  assert.equal(flaky.store.getState().prefs.shell_theme, 'plum', 'the local change survives a failed save');
});

test('resetHomeLayout empties only the layout; a late load after sign-out is ignored', async () => {
  const { store } = make();
  await store.loadForUser('u1');
  store.update({ dashboard_layout: [{ id: 'a', size: 'S' }], shell_theme: 'forest' });
  store.resetHomeLayout();
  assert.deepEqual(store.getState().prefs.dashboard_layout, []);
  assert.equal(store.getState().prefs.shell_theme, 'forest');

  let release;
  const slow = make({ remote: { load: () => new Promise((r) => { release = () => r({ row: { shell_theme: 'plum' } }); }), save: async () => ({ ok: true }) } });
  const p = slow.store.loadForUser('u1');
  slow.store.signOut();
  release(); await p;
  assert.equal(slow.store.getState().prefs.shell_theme, 'navy', 'a response that arrives after sign-out is dropped');
});

test('avatar: centered square crop, input checks, fixed private path', () => {
  assert.deepEqual(A.squareCrop(1000, 600), { sx: 200, sy: 0, side: 600 });
  assert.deepEqual(A.squareCrop(300, 900), { sx: 0, sy: 300, side: 300 });
  assert.deepEqual(A.squareCrop(256, 256), { sx: 0, sy: 0, side: 256 });
  assert.equal(A.AVATAR_SIZE, 256);
  assert.equal(A.avatarPath('abc'), 'abc/avatar.jpg');
  assert.equal(A.checkAvatarFile({ type: 'image/png', size: 1000 }), null);
  assert.ok(A.checkAvatarFile({ type: 'application/pdf', size: 10 }));
  assert.ok(A.checkAvatarFile({ type: 'image/jpeg', size: 20 * 1024 * 1024 }));
});
