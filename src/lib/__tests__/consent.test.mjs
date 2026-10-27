// Optional performance measurement: off until «Αποδοχή», and a withdrawal stops it at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
globalThis.Event = class { constructor(t) { this.type = t; } };
const out = buildSync({
  stdin: { contents: "export * from './consent';", resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent', external: ['react'],
});
const C = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text.replace(/import[^;]*from\s*"react";/, 'const useEffect = () => {}, useState = (v) => [typeof v === "function" ? v() : v, () => {}];')).toString('base64'));
const metric = { name: 'LCP', value: 1234 };

test('no choice yet: optional measurement is off and nothing would be sent', () => {
  store.clear();
  assert.equal(C.hasConsent('analytics'), false);
  assert.equal(C.speedInsightsBeforeSend(metric), null);
});

test('«Αποδοχή» lets measurements through; «Απόρριψη»/withdrawal drops them immediately', () => {
  store.clear();
  C.saveConsent({ analytics: true });
  assert.equal(C.speedInsightsBeforeSend(metric), metric);
  C.saveConsent({ analytics: false });
  assert.equal(C.speedInsightsBeforeSend(metric), null, 'withdrawal without reload');
  C.saveConsent({ analytics: true });
  assert.equal(C.speedInsightsBeforeSend(metric), metric, 're-acceptance resumes');
  C.resetConsent();
  assert.equal(C.speedInsightsBeforeSend(metric), null);
});

test('a choice from an older consent version counts as no choice', () => {
  store.clear();
  store.set('atlas.consent', JSON.stringify({ version: C.CONSENT_VERSION - 1, decidedAt: '2026-01-01T00:00:00Z', choices: { analytics: true } }));
  assert.equal(C.readConsent(), null);
  assert.equal(C.speedInsightsBeforeSend(metric), null);
});

test('Speed Insights is mounted only with consent and always with the consent gate', () => {
  const src = readFileSync(fileURLToPath(new URL('../../components/ConsentBanner.tsx', import.meta.url)), 'utf8');
  const uses = src.match(/<SpeedInsights\b[^>]*>/g) || [];
  assert.equal(uses.length, 1, 'one mount point');
  assert.match(uses[0], /beforeSend=\{speedInsightsBeforeSend\}/);
  assert.match(src, /\{choices\.analytics && <SpeedInsights /, 'rendered only when analytics consent is true');
  assert.doesNotMatch(src, /<script|va\.vercel-scripts|jsdelivr/i, 'no hand-injected analytics script');
});
