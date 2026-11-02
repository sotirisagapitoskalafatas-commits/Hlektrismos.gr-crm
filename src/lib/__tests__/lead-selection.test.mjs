import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = await build({
  entryPoints: [fileURLToPath(new URL('../lead-selection.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const selection = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('select all affects only the visible leads and preserves earlier selections from other tabs', () => {
  const firstTab = selection.toggleVisibleLeadSelection(new Set(), ['lead-1', 'lead-2']);
  assert.deepEqual([...firstTab].sort(), ['lead-1', 'lead-2']);

  const secondTab = selection.toggleVisibleLeadSelection(firstTab, ['lead-3']);
  assert.deepEqual([...secondTab].sort(), ['lead-1', 'lead-2', 'lead-3']);

  const deselectedSecondTab = selection.toggleVisibleLeadSelection(secondTab, ['lead-3']);
  assert.deepEqual([...deselectedSecondTab].sort(), ['lead-1', 'lead-2']);
});

test('select all on a partially selected visible page selects the whole visible page', () => {
  const next = selection.toggleVisibleLeadSelection(new Set(['lead-hidden', 'lead-1']), ['lead-1', 'lead-2']);
  assert.deepEqual([...next].sort(), ['lead-1', 'lead-2', 'lead-hidden']);
});

test('selections are pruned only when a lead is no longer in the active dataset', () => {
  const next = selection.pruneLeadSelection(new Set(['lead-1', 'lead-2', 'lead-3']), ['lead-1', 'lead-3']);
  assert.deepEqual([...next].sort(), ['lead-1', 'lead-3']);
});
