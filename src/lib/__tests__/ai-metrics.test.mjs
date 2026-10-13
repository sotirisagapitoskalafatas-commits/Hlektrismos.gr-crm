import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const js = ts.transpileModule(readFileSync(new URL('../ai-metrics.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { countByStatus } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('error count is exact and never negative (regression: it used to be length-1)', () => {
  assert.equal(countByStatus([], 'error'), 0);
  assert.equal(countByStatus([{ status: 'success' }], 'error'), 0);
  assert.equal(countByStatus([{ status: 'error' }, { status: 'error' }, { status: 'success' }, {}], 'error'), 2);
});
