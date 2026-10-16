// Back Office queue row text and the planned visit's meeting point (pure helpers).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const load = (f) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(`../${f}`, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const Q = await load('ops-queue.ts');
const V = await load('visit-location.ts');

test('queue row: no double separator when a part is empty', () => {
  assert.equal(Q.opsRowSub({ stageLabel: 'Αίτηση', caseNo: '', daysInStage: 0 }, 'Εύα'), 'Αίτηση · σήμερα στο στάδιο · Εύα');
  assert.equal(Q.opsRowSub({ stageLabel: 'Αίτηση', caseNo: 'CS-2026-004', daysInStage: 1 }, 'Χωρίς υπεύθυνο'), 'Αίτηση · CS-2026-004 · 1 ημέρα στο στάδιο · Χωρίς υπεύθυνο');
  assert.equal(Q.opsRowSub({ stageLabel: 'Υπογραφή', caseNo: null, daysInStage: 5 }, '  '), 'Υπογραφή · 5 ημέρες στο στάδιο');
  assert.doesNotMatch(Q.opsRowSub({ stageLabel: '', caseNo: '', daysInStage: 2 }, ''), /·\s*·|^·|·$/);
});

test('meeting point: the case address first, then the customer, never a guess', () => {
  const c = { lat: 37.98, lng: 23.73, address: 'Πατησίων 10', customer: { lat: 38, lng: 23.7, address: 'Άλλη 1', city: 'Αθήνα' } };
  assert.deepEqual(V.meetingPoint(c), { label: 'Πατησίων 10', lat: 37.98, lng: 23.73 });
  assert.deepEqual(V.meetingPoint({ ...c, lat: null, lng: null }), { label: 'Άλλη 1, Αθήνα', lat: 38, lng: 23.7 });
  assert.equal(V.meetingPoint({ lat: null, lng: null, address: 'Πατησίων 10', customer: { lat: null, lng: null, address: 'x' } }), null, 'an address without coordinates is not a point');
  assert.equal(V.meetingPoint({ lat: null, lng: null, customer: null }), null);
  assert.equal(V.meetingPoint({ lat: 37.9, lng: null, customer: null }), null, 'half a coordinate is not a point');
  assert.equal(V.meetingPoint({ lat: 37.98, lng: 23.73, address: '', customer: null }).label, 'Διεύθυνση case');
});
