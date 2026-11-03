import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('package and lockfile share a real Semantic Versioning release number', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.match(pkg.version, /^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$/);
  assert.notEqual(pkg.version, '0.0.0', 'the scaffold placeholder must not be presented as a release');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});

test('changelog and in-app release history both describe the current tracked version', () => {
  const pkg = JSON.parse(read('package.json'));
  const changelog = read('CHANGELOG.md');
  const notes = read('src/lib/release-notes.ts');
  assert.ok(changelog.includes(`## [${pkg.version}] - `), 'the current package version has a dated changelog entry');
  assert.ok(notes.includes(`version: '${pkg.version}'`), 'the current package version appears in the in-app release notes');
});

test('Vite embeds deployment identifiers but does not expose secrets or infer Production from a local build', () => {
  const vite = read('vite.config.ts');
  assert.match(vite, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(vite, /VERCEL_GIT_COMMIT_REF/);
  assert.match(vite, /VERCEL_ENV/);
  assert.match(vite, /command === 'serve' \? 'development'/);
  assert.match(vite, /: process\.env\.CI \? 'ci' : 'build'/);
  assert.match(vite, /__BUILD_TIME__/);
  assert.doesNotMatch(vite, /SUPABASE_SERVICE_ROLE|API_SECRET|PRIVATE_KEY/);
});

test('the CRM shell and authentication layout both display the shared release metadata', () => {
  assert.match(read('src/components/shell/Sidebar.tsx'), /releaseInfo\.version/);
  assert.match(read('src/components/shell/TopBar.tsx'), /ReleaseInfoButton/);
  assert.match(read('src/components/auth/AuthLayout.tsx'), /releaseInfo\.version/);
});
