// Tests for the baseline-aware CI gate: it must never let a NEW diagnostic through, whatever else changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, gate, parseDeno, parseEslint, parseTsc } from '../diagnostics-gate.mjs';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const d = (file, code, message, line = 1) => ({ file, code, message, line });

test('compare: identical diagnostics on moved lines are pre-existing, not new', () => {
  const r = compare([d('a.ts', 'TS1', 'x', 10)], [d('a.ts', 'TS1', 'x', 42)]);
  assert.equal(r.introduced.length, 0);
  assert.equal(r.fixed.length, 0);
});

test('compare: fixing one error never hides a different new one (swap in the same file)', () => {
  const r = compare([d('a.ts', 'no-explicit-any', 'Unexpected any')], [d('a.ts', 'no-unused-vars', "'y' is unused")]);
  assert.equal(r.introduced.length, 1);
  assert.equal(r.introduced[0].code, 'no-unused-vars');
  assert.equal(r.fixed.length, 1);
});

test('compare: a second copy of an existing error counts as new (multiset, not set)', () => {
  const base = [d('a.ts', 'no-explicit-any', 'Unexpected any', 3)];
  const head = [d('a.ts', 'no-explicit-any', 'Unexpected any', 3), d('a.ts', 'no-explicit-any', 'Unexpected any', 9)];
  assert.equal(compare(base, head).introduced.length, 1);
});

test('compare: the same error moved to another file is new there', () => {
  const r = compare([d('a.ts', 'TS2322', 'm')], [d('b.ts', 'TS2322', 'm')]);
  assert.equal(r.introduced.length, 1);
  assert.equal(r.introduced[0].file, 'b.ts');
});

test('parsers: eslint JSON (errors only), tsc lines, deno blocks with colour codes', () => {
  const root = process.platform === 'win32' ? 'C:\\r' : '/r';
  const fp = process.platform === 'win32' ? 'C:\\r\\src\\a.ts' : '/r/src/a.ts';
  const es = parseEslint(JSON.stringify([{ filePath: fp, messages: [
    { severity: 2, ruleId: 'no-undef', message: "'x' is not defined.", line: 4 },
    { severity: 1, ruleId: 'no-console', message: 'warn', line: 5 },
    { severity: 2, ruleId: null, message: 'Parsing error: Unexpected token', line: 7 },
  ] }]), root);
  assert.deepEqual(es.map((x) => [x.file, x.code]), [['src/a.ts', 'no-undef'], ['src/a.ts', 'parse-error']]);

  const ts = parseTsc("src/a.ts(3,5): error TS2322: Type 'string' is not assignable to type 'number'.\n  more detail\nerror TS5083: Cannot read file 'x'.", root);
  assert.deepEqual(ts.map((x) => [x.file, x.code, x.line]), [['src/a.ts', 'TS2322', 3], ['(global)', 'TS5083', 0]]);

  const url = process.platform === 'win32' ? 'file:///C:/r/supabase/functions/send-email/index.ts' : 'file:///r/supabase/functions/send-email/index.ts';
  const out = `\u001b[1mTS2339 \u001b[0m[ERROR]: Property 'x' does not exist.\n  code\n    at ${url}:25:19\n\nerror: Failed resolving types. Could not find 'npm:openai'\n    at https://jsr.io/x.d.ts:1:2\n\nerror: Type checking failed.`;
  const dn = parseDeno(out, root, 'send-email');
  assert.deepEqual(dn.map((x) => [x.file, x.code]), [
    ['send-email -> supabase/functions/send-email/index.ts', 'TS2339'],
    ['send-email -> https://jsr.io/x.d.ts', 'deno-error'],
  ]);
});

// End to end with the real TypeScript compiler on two throw-away trees.
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gate-'));
  writeFileSync(join(dir, 'tsconfig.app.json'), JSON.stringify({ compilerOptions: { strict: true, noEmit: true }, include: ['src'] }));
  mkdirSync(join(dir, 'src'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'src', name), body);
  return dir;
}
const quiet = { log: () => {}, err: () => {} };

test('gate (real tsc): pre-existing errors pass, a new one fails even when another is fixed', () => {
  const base = tree({ 'a.ts': 'export const a: number = "x";\nexport const b: string = 1;\n' });
  const same = tree({ 'a.ts': '// edited\nexport const a: number = "x";\nexport const b: string = 1;\n' });
  const swap = tree({ 'a.ts': 'export const a: number = 1;\nexport const b: string = 1;\nexport const c: boolean = "no";\n' });
  const clean = tree({ 'a.ts': 'export const a = 1;\n' });
  try {
    assert.equal(gate('tsc', base, same, { binRoot: repo, ...quiet }), 0, 'unchanged errors must pass');
    assert.equal(gate('tsc', base, clean, { binRoot: repo, ...quiet }), 0, 'fixing errors must pass');
    assert.equal(gate('tsc', base, swap, { binRoot: repo, ...quiet }), 1, 'a new error must fail despite a fix');
    assert.equal(gate('tsc', clean, base, { binRoot: repo, ...quiet }), 1, 'errors on a clean base must fail');
  } finally { for (const t of [base, same, swap, clean]) rmSync(t, { recursive: true, force: true }); }
});

test('gate fails closed when a tree cannot be checked', () => {
  const ok = tree({ 'a.ts': 'export const a = 1;\n' });
  const broken = mkdtempSync(join(tmpdir(), 'gate-')); // no tsconfig.app.json: a global tsc error, nothing checked
  try {
    assert.equal(gate('tsc', broken, ok, { binRoot: repo, ...quiet }), 1, 'an uncheckable base is not "no errors"');
    assert.equal(gate('nope', ok, ok, { binRoot: repo, ...quiet }), 1, 'an unknown tool fails');
    assert.equal(gate('eslint', ok, ok, { binRoot: join(ok, 'missing'), ...quiet }), 1, 'a missing binary fails');
    assert.equal(gate('tsc', ok, broken, { binRoot: repo, ...quiet }), 1, 'an uncheckable head is not "no errors"');
  } finally { rmSync(ok, { recursive: true, force: true }); rmSync(broken, { recursive: true, force: true }); }
});
