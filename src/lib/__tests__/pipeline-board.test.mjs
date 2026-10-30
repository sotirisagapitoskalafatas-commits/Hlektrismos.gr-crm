// Pipeline board grouping: one lane per active stage, honest totals, phone lane choice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = await build({ entryPoints: [fileURLToPath(new URL('../pipeline-board.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
const B = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const S = ['new', 'contacted', 'offer', 'application', 'signed', 'document_check', 'submitted', 'activation'];
const mk = (id, stage, value) => ({ id, current_stage: stage, value });

test('one lane per stage, in order; lost/completed/cancelled are not lanes', () => {
  const lanes = B.groupByStage([mk('a', 'new', 100), mk('b', 'lost', 50), mk('c', 'completed', 9), mk('d', 'offer', 0)], S);
  assert.deepEqual(lanes.map((l) => l.stage), S);
  assert.equal(lanes.flatMap((l) => l.cases).length, 2);
});

test('lane totals never turn unknown into €0', () => {
  const lanes = B.groupByStage([mk('a', 'new', 100), mk('b', 'new', 250.5), mk('c', 'new', 0), mk('d', 'new', null), mk('e', 'offer', undefined)], S);
  const by = Object.fromEntries(lanes.map((l) => [l.stage, l]));
  assert.equal(by.new.total, 350.5); assert.equal(by.new.withoutValue, 2);
  assert.equal(by.offer.total, null, 'a lane whose cases have no value has no total, not 0'); assert.equal(by.offer.withoutValue, 1);
  assert.equal(by.contacted.total, null); assert.equal(by.contacted.cases.length, 0);
});

test('pickLane: saved lane if it exists, else the first lane with cases, else the first', () => {
  const lanes = B.groupByStage([mk('a', 'offer', 1)], S);
  assert.equal(B.pickLane(lanes, 'activation'), 'activation');
  assert.equal(B.pickLane(lanes, 'nonsense'), 'offer');
  assert.equal(B.pickLane(lanes, null), 'offer');
  assert.equal(B.pickLane(B.groupByStage([], S), undefined), 'new');
});
