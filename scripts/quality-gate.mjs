#!/usr/bin/env node
// Prevents NEW type/lint failures without hiding the existing ones: compares current counts with
// quality-baseline.json. Lower the baseline whenever counts improve; raising it requires an explicit review.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const baselineFile = new URL('../quality-baseline.json', import.meta.url);
const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));
const run = (cmd) => { try { return execSync(cmd, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } };

const tsc = run('npx tsc --noEmit -p tsconfig.app.json');
const typeErrors = (tsc.match(/error TS\d+/g) || []).length;
const eslint = run('npx eslint src --format json');
let lintErrors = 0, lintWarnings = 0;
try { for (const f of JSON.parse(eslint)) { lintErrors += f.errorCount; lintWarnings += f.warningCount; } }
catch { console.error('Could not parse eslint output'); process.exit(2); }

console.log(`type errors: ${typeErrors} (baseline ${baseline.typeErrors})`);
console.log(`lint errors: ${lintErrors} (baseline ${baseline.lintErrors}), warnings: ${lintWarnings} (baseline ${baseline.lintWarnings})`);

let failed = false;
if (typeErrors > baseline.typeErrors) { console.error('FAIL: new TypeScript errors introduced'); failed = true; }
if (lintErrors > baseline.lintErrors) { console.error('FAIL: new ESLint errors introduced'); failed = true; }
if (lintWarnings > baseline.lintWarnings) { console.error('FAIL: new ESLint warnings introduced'); failed = true; }
if (process.argv.includes('--update') && !failed) {
  writeFileSync(baselineFile, JSON.stringify({ typeErrors, lintErrors, lintWarnings }, null, 2) + '\n');
  console.log('baseline updated (counts only ever go down)');
}
process.exit(failed ? 1 : 0);
