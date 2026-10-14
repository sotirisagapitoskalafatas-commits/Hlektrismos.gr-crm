import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../b2b-search.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const B = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('validation: multi-select, limits, unknown values dropped, old single-value form still accepted', () => {
  const v = B.validateSearch({ categories: ['hotel', 'restaurant', 'nope'], regions: ['Αττική'], cities: [' Γλυφάδα ', 'Γλυφάδα', 'Βούλα'], keywords: ['καφέ'], max_per_query: 99 });
  assert.equal(v.ok, true);
  assert.deepEqual(v.params, { categories: ['hotel', 'restaurant'], regions: ['Αττική'], cities: ['Γλυφάδα', 'Βούλα'], keywords: ['καφέ'], max_per_query: 20 });
  const old = B.validateSearch({ category: 'hotel', region: 'Κρήτη', maxResults: 10 });
  assert.deepEqual(old.params, { categories: ['hotel'], regions: ['Κρήτη'], cities: [], keywords: [], max_per_query: 10 });
  assert.equal(B.validateSearch({ regions: ['Αττική'] }).ok, false, 'needs a category or keyword');
  assert.equal(B.validateSearch({ categories: ['hotel'] }).ok, false, 'needs a region or city');
  assert.equal(B.validateSearch({ categories: ['hotel'], regions: ['Ατλαντίδα'] }).ok, false, 'unknown region dropped');
});

test('planning: categories/keywords × cities (or regions); capped with a truncation count', () => {
  const p = B.planQueries({ categories: ['hotel', 'restaurant'], regions: ['Αττική'], cities: ['Γλυφάδα', 'Βούλα'], keywords: ['καφέ'], max_per_query: 20 });
  assert.equal(p.queries.length, 6); assert.equal(p.truncated, 0);
  assert.deepEqual(p.queries[0], { q: 'Ξενοδοχεία Γλυφάδα', ll: '@37.9838,23.7275,12z', category: 'hotel', region: 'Αττική', city: 'Γλυφάδα' });
  assert.equal(p.queries[5].q, 'καφέ Βούλα'); assert.equal(p.queries[5].category, null);
  const r = B.planQueries({ categories: ['hotel'], regions: ['Αττική', 'Κρήτη'], cities: [], keywords: [], max_per_query: 20 });
  assert.deepEqual(r.queries.map((x) => x.region), ['Αττική', 'Κρήτη']);
  const big = B.planQueries({ categories: Object.keys(B.CATEGORY_QUERIES).slice(0, 10), regions: ['Αττική'], cities: ['α', 'β', 'γ'], keywords: [], max_per_query: 20 }, 24);
  assert.equal(big.queries.length, 24); assert.equal(big.truncated, 6);
});

test('quota: never more than the daily remainder or the per-job cap', () => {
  assert.equal(B.allowedQueries(6, 90, 100, 24), 6);
  assert.equal(B.allowedQueries(30, 90, 100, 24), 10);
  assert.equal(B.allowedQueries(30, 0, 100, 24), 24);
  assert.equal(B.allowedQueries(5, 100, 100, 24), 0);
  assert.equal(B.allowedQueries(5, 120, 100, 24), 0);
});

test('mapping a Google Maps result to a prospect row', () => {
  const q = { q: 'Ξενοδοχεία Γλυφάδα', ll: null, category: 'hotel', region: 'Αττική', city: 'Γλυφάδα' };
  const row = B.toProspect({ title: ' Hotel Glyfada ', phone: '+30 210 000 0000', website: 'https://hg.gr', address: 'Γλυφάδα', place_id: 'ChIJ', rating: 4.5, reviews: 120, gps_coordinates: { latitude: 37.8, longitude: 23.7 } }, q);
  assert.equal(row.company_name, 'Hotel Glyfada'); assert.equal(row.place_id, 'ChIJ'); assert.equal(row.lat, 37.8); assert.equal(row.source_query, 'Ξενοδοχεία Γλυφάδα');
  assert.equal(B.toProspect({ phone: '1' }, q), null, 'no name, no row');
  assert.equal(B.toProspect({ title: 'X', phone: '  ' }, q).phone, null);
});
