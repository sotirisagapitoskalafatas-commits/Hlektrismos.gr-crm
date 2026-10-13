// Run: node --test src/lib/__tests__/escape-html.test.mjs  (regression for stored XSS via lead fields)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const src = readFileSync(new URL('../escape-html.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { escapeHtml } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('neutralises script/event-handler payloads', () => {
  const out = escapeHtml('<img src=x onerror=alert(1)>"\'`&');
  assert.ok(!/[<>"'`]/.test(out));
  assert.equal(out, '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&#96;&amp;');
});
test('null/undefined become empty string; numbers stringified', () => {
  assert.equal(escapeHtml(null), ''); assert.equal(escapeHtml(undefined), ''); assert.equal(escapeHtml(12.5), '12.5');
});
