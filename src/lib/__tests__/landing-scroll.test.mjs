// Regression pin for the public contact form: opening the optional section made the footer unreachable. LOCAL source checks that run in CI;
// the real-wheel behaviour is covered by qa/landing-footer-scroll.spec.ts (Playwright) and was verified by hand in a real browser, see the PR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (rel) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

test('root cause: index.css pins html and body to the viewport, and the landing style releases them while Lenis is mounted', () => {
  assert.match(src('index.css'), /^html \{ height: 100%; \}/m, 'the CRM shell still relies on a viewport-height html');
  const css = src('styles/landing.css');
  assert.match(css, /html\.lenis, html\.lenis body \{ height: auto; \}/, 'Lenis observes <html>: its box must follow the content');
  // Scoped to html.lenis, which exists only while Lenis is mounted, so no CRM screen can be affected.
  assert.ok(!/^html \{ height: auto/m.test(css) && !/^body \{ height: auto/m.test(css), 'never an unconditional rule on html or body');
});

test('Lenis is told to re-measure after the browser has laid out a height change, without timers', () => {
  const hook = src('hooks/useLenis.ts');
  assert.match(hook, /export function refreshScrollLayout\(\)/);
  assert.match(hook, /requestAnimationFrame\(\(\) => \{\s*lenis\?\.resize\(\);\s*ScrollTrigger\.refresh\(\);/);
  assert.ok(!/setTimeout/.test(hook), 'no arbitrary delay');
  const page = src('pages/LandingPage.tsx');
  assert.match(page, /<details className="lp-optional" onToggle=\{refreshScrollLayout\}>/);
  assert.match(page, /useEffect\(\(\) => \{ refreshScrollLayout\(\); \}, \[form\.billFiles\.length\]\)/);
});

test('smooth scrolling, the footer and the form controls are all still there', () => {
  const hook = src('hooks/useLenis.ts');
  assert.match(hook, /new Lenis\(\{/);
  const page = src('pages/LandingPage.tsx');
  for (const must of ['<PublicFooter', 'id="lead-file-input"', 'type="submit"', 'form.consent', 'form.adult']) assert.ok(page.includes(must), must);
});
