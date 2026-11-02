import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../../../public/sw.js', import.meta.url), 'utf8');

function loadWorker(networkFetch) {
  const listeners = new Map();
  const cacheWrites = [];
  const deletedCaches = [];
  const cache = {
    addAll: async () => undefined,
    put: async (request, response) => cacheWrites.push({ url: request.url, response }),
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['atlas-crm-v1', 'atlas-crm-shell-v1', 'atlas-crm-v2', 'atlas-crm-shell-v2'],
    delete: async name => { deletedCaches.push(name); return true; },
    match: async () => null,
  };
  const self = {
    location: { origin: 'https://atlas.test' },
    clients: { claim: async () => undefined },
    skipWaiting: () => Promise.resolve(),
    addEventListener: (name, handler) => listeners.set(name, handler),
  };
  vm.runInNewContext(source, { self, caches, fetch: networkFetch, URL, Response: { error: () => ({ error: true }) } });
  return { listeners, cacheWrites, deletedCaches };
}

function request(url, destination = '', mode = 'cors') {
  return { method: 'GET', url: `https://atlas.test${url}`, destination, mode };
}

test('service worker refreshes static assets from network before using the offline cache', async () => {
  const networkResponse = { ok: true, clone: () => ({ body: 'network' }), body: 'network' };
  const worker = loadWorker(async () => networkResponse);
  let responsePromise;
  worker.listeners.get('fetch')({
    request: request('/assets/index-a1b2c3d4.js', 'script'),
    respondWith: promise => { responsePromise = promise; },
  });

  assert.equal(await responsePromise, networkResponse);
  await Promise.resolve();
  assert.equal(worker.cacheWrites.length, 1);
  assert.equal(worker.cacheWrites[0].url, 'https://atlas.test/assets/index-a1b2c3d4.js');
});

test('service worker never intercepts or caches CRM API responses', () => {
  const worker = loadWorker(async () => ({ ok: true, clone: () => ({} ) }));
  let intercepted = false;
  worker.listeners.get('fetch')({
    request: request('/rest/v1/leads'),
    respondWith: () => { intercepted = true; },
  });

  assert.equal(intercepted, false);
  assert.equal(worker.cacheWrites.length, 0);
});

test('service worker activation removes previous cache versions', async () => {
  const worker = loadWorker(async () => ({ ok: true, clone: () => ({}) }));
  let activation;
  worker.listeners.get('activate')({ waitUntil: promise => { activation = promise; } });
  await activation;

  assert.deepEqual(worker.deletedCaches, ['atlas-crm-v1', 'atlas-crm-shell-v1']);
});
