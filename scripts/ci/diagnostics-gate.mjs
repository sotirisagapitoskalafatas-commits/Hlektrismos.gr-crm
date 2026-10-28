#!/usr/bin/env node
// Baseline-aware CI gate: fails on any lint/type diagnostic that the change INTRODUCES, compared with the
// exact base commit checked out next to it, while still printing every pre-existing diagnostic.
//
//   node scripts/ci/diagnostics-gate.mjs --tool eslint|tsc|deno --base <dir> [--head <dir>]
//
// * Both trees are checked with the SAME tool binaries (the base tree uses the head's node_modules / the same
//   Deno), so a difference can only come from the source change.
// * Diagnostics are compared as a multiset keyed by file + rule/code + message (line numbers move with every
//   edit, so they are not part of the key). A key whose count grows is "introduced"; one that shrinks is "fixed".
//   Fixing one error therefore never hides a different new one, and a second copy of an existing error in the
//   same file still counts as new.
// * Fail closed: a tool that crashes, or exits non-zero without a single parsable diagnostic, fails the gate on
//   either tree. A tree that cannot be checked is never treated as "no errors".
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const norm = (root, file) => {
  let f = String(file);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(f) && !f.startsWith('file://')) return f; // remote module (https://, jsr:)
  if (f.startsWith('file://')) f = fileURLToPath(f);
  const r = relative(root, resolve(root, f));
  return (r.startsWith('..') ? f : r).split(sep).join('/');
};
const oneLine = (s) => String(s ?? '').split(/\r?\n/)[0].replace(/\s+/g, ' ').trim();
const key = (d) => `${d.file} | ${d.code} | ${d.message}`;

/** ESLint `--format json` output → diagnostics (errors only; warnings never fail CI today). */
export function parseEslint(json, root) {
  const out = [];
  for (const f of JSON.parse(json)) {
    for (const m of f.messages) {
      if (m.severity !== 2) continue;
      out.push({ file: norm(root, f.filePath), code: m.ruleId ?? 'parse-error', message: oneLine(m.message), line: m.line ?? 0 });
    }
  }
  return out;
}

/** `tsc --pretty false` output → diagnostics. Continuation lines of a multi-line message are folded away. */
export function parseTsc(text, root) {
  const out = [];
  for (const l of String(text).split(/\r?\n/)) {
    const m = l.match(/^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/);
    if (m) { out.push({ file: norm(root, m[1]), code: m[3], message: oneLine(m[4]), line: Number(m[2]) }); continue; }
    const g = l.match(/^error (TS\d+): (.*)$/); // global error (bad tsconfig etc.)
    if (g) out.push({ file: '(global)', code: g[1], message: oneLine(g[2]), line: 0 });
  }
  return out;
}

/** `deno check` output (NO_COLOR) → diagnostics. `entry` scopes the key, so a new error in a shared module is
 * reported for every function that imports it. Non-TypeScript failures (unresolvable imports) count too. */
export function parseDeno(text, root, entry) {
  const lines = String(text).replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const ts = lines[i].match(/^(TS\d+) \[ERROR\]: (.*)$/);
    const er = !ts && lines[i].match(/^error: (.*)$/);
    if (!ts && !er) continue;
    if (er && /^Type checking failed\.?$/.test(er[1].trim())) continue; // summary line, not a diagnostic
    let file = entry, line = 0;
    for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
      const at = lines[j].match(/^\s+at (.+):(\d+):(\d+)$/);
      if (at) { file = norm(root, at[1]); line = Number(at[2]); break; }
      if (/^(TS\d+ \[ERROR\]|error:)/.test(lines[j])) break;
    }
    out.push({ file: `${entry} -> ${file}`, code: ts ? ts[1] : 'deno-error', message: oneLine(ts ? ts[2] : er[1]), line });
  }
  return out;
}

/** Multiset comparison. Returns introduced (head-only occurrences), fixed (base-only) and the head total. */
export function compare(base, head) {
  const count = (list) => list.reduce((m, d) => m.set(key(d), (m.get(key(d)) ?? 0) + 1), new Map());
  const b = count(base), h = count(head);
  const introduced = [], fixed = [];
  for (const [k, n] of h) {
    const extra = n - (b.get(k) ?? 0);
    if (extra > 0) introduced.push(...head.filter((d) => key(d) === k).slice(-extra));
  }
  for (const [k, n] of b) {
    const gone = n - (h.get(k) ?? 0);
    if (gone > 0) fixed.push(...base.filter((d) => key(d) === k).slice(-gone));
  }
  return { introduced, fixed, baseTotal: base.length, headTotal: head.length };
}

class ToolCrash extends Error {}

// Fixed argument lists only; a shell is used solely for a DENO_BIN such as "npx deno@x" on Windows.
function exec(cmd, args, cwd, { shell = false } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, shell, env: { ...process.env, NO_COLOR: '1' } });
  if (r.error) throw new ToolCrash(`${cmd} could not start in ${cwd}: ${r.error.message}`);
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Runs one tool on one tree, always with the head tree's binaries (`headRoot`). */
export function collect(tool, root, headRoot) {
  if (tool === 'eslint') {
    const r = exec(process.execPath, [join(headRoot, 'node_modules/eslint/bin/eslint.js'), '.', '--format', 'json'], root);
    if (r.status !== 0 && r.status !== 1) throw new ToolCrash(`eslint crashed in ${root} (exit ${r.status}): ${r.stderr.slice(0, 2000)}`);
    try { return parseEslint(r.stdout, root); } catch { throw new ToolCrash(`eslint output in ${root} is not JSON: ${r.stderr.slice(0, 2000)}`); }
  }
  if (tool === 'tsc') {
    const r = exec(process.execPath, [join(headRoot, 'node_modules/typescript/bin/tsc'), '--noEmit', '--pretty', 'false', '-p', 'tsconfig.app.json'], root);
    const d = parseTsc(r.stdout + '\n' + r.stderr, root);
    if (r.status !== 0 && d.length === 0) throw new ToolCrash(`tsc failed in ${root} (exit ${r.status}) without diagnostics: ${(r.stdout + r.stderr).slice(0, 2000)}`);
    // A global (configuration) error means the project was not type-checked at all.
    const global = d.find((x) => x.file === '(global)');
    if (global) throw new ToolCrash(`tsc could not check ${root}: ${global.code} ${global.message}`);
    return d;
  }
  if (tool === 'deno') {
    const deno = process.env.DENO_BIN || 'deno';
    const fnRoot = join(root, 'supabase/functions');
    const out = [];
    for (const name of readdirSync(fnRoot).sort()) {
      if (name.startsWith('_') || name.startsWith('.')) continue;
      const entry = join(fnRoot, name, 'index.ts');
      if (!statSync(join(fnRoot, name)).isDirectory() || !existsSync(entry)) continue;
      const [cmd, ...pre] = deno.split(' ');
      const r = exec(cmd, [...pre, 'check', '--no-lock', '--node-modules-dir=none', `${name}/index.ts`], fnRoot, { shell: process.platform === 'win32' && pre.length > 0 });
      const d = parseDeno(r.stdout + '\n' + r.stderr, root, name);
      if (r.status !== 0 && d.length === 0) throw new ToolCrash(`deno check ${name} failed in ${root} (exit ${r.status}) without diagnostics: ${(r.stdout + r.stderr).slice(0, 2000)}`);
      // A non-TypeScript error (unresolvable import, broken module graph) means the function was not
      // type-checked, so its silence would prove nothing.
      const graph = d.find((x) => x.code === 'deno-error');
      if (graph) throw new ToolCrash(`deno could not type-check ${name} in ${root}: ${graph.message} (${graph.file})`);
      out.push(...d);
    }
    return out;
  }
  throw new ToolCrash(`unknown tool ${tool}`);
}

function report(tool, res) {
  const lines = [`[${tool}] base: ${res.baseTotal} diagnostics, head: ${res.headTotal}; introduced: ${res.introduced.length}, fixed: ${res.fixed.length}`];
  for (const d of res.introduced) lines.push(`  NEW   ${d.file}:${d.line}  ${d.code}  ${d.message}`);
  for (const d of res.fixed) lines.push(`  fixed ${d.file}  ${d.code}  ${d.message}`);
  return lines.join('\n');
}

/** Runs the gate. `binRoot` holds the tool binaries (defaults to the head tree). Returns the exit code. */
export function gate(tool, base, head, { binRoot = head, listExisting = false, log = console.log, err = console.error } = {}) {
  try {
    const headD = collect(tool, head, binRoot);
    const baseD = collect(tool, base, binRoot);
    const res = compare(baseD, headD);
    log(report(tool, res));
    if (listExisting) for (const d of headD) log(`  existing ${d.file}:${d.line}  ${d.code}  ${d.message}`);
    if (res.introduced.length) { err(`FAIL: ${res.introduced.length} new ${tool} diagnostic(s) introduced by this change.`); return 1; }
    log(`OK: no new ${tool} diagnostics. ${res.headTotal} pre-existing diagnostic(s) remain (shown with --list-existing).`);
    return 0;
  } catch (e) {
    err(`FAIL (tool error, fail closed): ${e.message}`);
    return 1;
  }
}

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const tool = arg('tool'), base = arg('base') && resolve(arg('base')), head = resolve(arg('head') ?? '.');
  if (!tool || !base) { console.error('usage: diagnostics-gate.mjs --tool eslint|tsc|deno --base <dir> [--head <dir>] [--list-existing]'); return 2; }
  return gate(tool, base, head, { listExisting: argv.includes('--list-existing') });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
