// «Νέο Sale» handover without a Back Office assignee, and the customer-names check remembered for the session.
// The database client and API helpers are replaced by in-memory stubs (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const S = (globalThis.__stub = { case: null, bo: null, updates: [], activities: [], notes: [], requests: 0, namesError: null });
const STUBS = {
  './api': `const S = globalThis.__stub;
    export const fetchCase = async () => S.case;
    export const updateCase = async (_id, patch) => { S.updates.push(patch); return { error: null }; };
    export const addActivity = async (_id, a) => { S.activities.push(a); };
    export const pushNotification = async (n) => { S.notes.push(n); };
    export const createFollowUp = async (f) => ({ id: 'f1', ...f });`,
  './lead-intake': 'export const fetchDefaultBackofficeAssignee = async () => globalThis.__stub.bo;',
  './supabase': `const S = globalThis.__stub;
    const chain = { select() { return chain; }, limit() { S.requests++; return Promise.resolve({ data: [], error: S.namesError }); } };
    export const supabase = { from: () => chain };`,
};
const stub = (names) => ({
  name: 'stub',
  setup(b) {
    b.onResolve({ filter: /^\.\/[\w-]+$/ }, (a) => (names.includes(a.path) ? { path: a.path, namespace: 'stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
  },
});
const load = async (file, names, tag = '') => {
  const out = await build({ entryPoints: [fileURLToPath(new URL(`../${file}`, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', plugins: [stub(names)] });
  // a fresh module instance per tag (data: URLs are cached by content)
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text + `\n// ${tag}`).toString('base64'));
};

const H = await load('field-handover.ts', ['./api', './lead-intake']);
const ME = { id: 'u-field', role: 'field_sales' };

test('Νέο Sale with no Back Office assignee: the next-action owner and Back Office owner are left unchanged', async () => {
  S.case = { id: 'c1', title: 'Ρεύμα', field_sales_owner: null, next_action_owner_id: 'u-inside', back_office_owner: 'u-bo-old', customer: { full_name: 'Test Test' } };
  S.bo = null; S.updates = []; S.notes = []; S.activities = [];
  const r = await H.handoverNewSale('c1', ME, 'Συμφώνησε');
  assert.deepEqual(r, { ok: true, assignee: null });
  assert.equal(S.updates.length, 1);
  const patch = S.updates[0];
  assert.ok(!('next_action_owner_id' in patch), 'next_action_owner_id is not sent (never cleared)');
  assert.ok(!('back_office_owner' in patch));
  assert.equal(patch.field_sales_owner, 'u-field', 'the agent is recorded as originator');
  assert.equal(S.notes.length, 0, 'nobody to notify');
  assert.equal(S.activities[0].metadata.to_owner, null);
});

test('Νέο Sale with an assignee: responsibility moves to the assignee, who is notified', async () => {
  S.case = { id: 'c1', title: 'Ρεύμα', field_sales_owner: 'u-other', next_action_owner_id: 'u-inside', back_office_owner: null, customer: { full_name: 'Test Test' } };
  S.bo = { id: 'u-bo', full_name: 'Εύα' }; S.updates = []; S.notes = []; S.activities = [];
  const r = await H.handoverNewSale('c1', ME, '');
  assert.deepEqual(r, { ok: true, assignee: 'Εύα' });
  assert.equal(S.updates[0].next_action_owner_id, 'u-bo');
  assert.equal(S.updates[0].back_office_owner, 'u-bo');
  assert.equal(S.updates[0].field_sales_owner, 'u-other', 'an existing originator is kept');
  assert.equal(S.notes[0].user_id, 'u-bo');
});

test('customer-names check: a failure is remembered for the session, so later page loads send no request', async () => {
  const store = new Map();
  globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  S.requests = 0; S.namesError = { message: 'column customers.first_name does not exist', code: '42703' };
  const A1 = await load('api.ts', ['./supabase'], 'page-load-1');
  assert.equal(await A1.customerNamesAvailable(), false);
  assert.equal(await A1.customerNamesAvailable(), false);
  assert.equal(S.requests, 1, 'one request per page load');
  const A2 = await load('api.ts', ['./supabase'], 'page-load-2'); // a reload in the same browser session
  assert.equal(await A2.customerNamesAvailable(), false);
  assert.equal(S.requests, 1, 'no new failing request after a reload');
  store.clear(); S.namesError = null; // new session after phase4/11 is applied
  const A3 = await load('api.ts', ['./supabase'], 'page-load-3');
  assert.equal(await A3.customerNamesAvailable(), true);
  assert.equal(S.requests, 2);
});

test('customer-names check: blocked storage does not break the check', async () => {
  globalThis.sessionStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  S.requests = 0; S.namesError = { message: 'missing column' };
  const A = await load('api.ts', ['./supabase'], 'blocked-storage');
  assert.equal(await A.customerNamesAvailable(), false);
  delete globalThis.sessionStorage;
});
