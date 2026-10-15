import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../routing/ordering.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const O = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const S = [
  { id: 'far', lat: 38.10, lng: 23.70, scheduledAt: '2026-10-16T09:00:00Z' },
  { id: 'none', lat: 37.98, lng: 23.73 },
  { id: 'near', lat: 37.99, lng: 23.73, scheduledAt: '2026-10-16T11:00:00Z' },
];

test('default provider keeps the scheduled-time order (unscheduled last); unknown setting falls back to it', async () => {
  assert.equal(O.getOrderingProvider(undefined).id, 'scheduled');
  assert.equal(O.getOrderingProvider('google').id, 'scheduled', 'no paid provider is wired');
  assert.deepEqual((await O.getOrderingProvider('scheduled').order(S)).stops.map((s) => s.id), ['far', 'near', 'none']);
});

test('nearest: greedy from the start, every stop exactly once', async () => {
  const r = await O.getOrderingProvider('nearest').order(S, { lat: 37.975, lng: 23.73 });
  assert.deepEqual(r.stops.map((s) => s.id), ['none', 'near', 'far']);
  assert.equal(r.provider, 'nearest');
  assert.deepEqual((await O.nearestOrdering.order([])).stops, []);
});
