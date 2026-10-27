// Release guard: no unresolved placeholder may reach the public legal pages.
// This test is EXPECTED to fail until the owner supplies the missing facts
// (legal name, ΑΦΜ/ΔΟΥ, ΓΕΜΗ, retention periods). Do not weaken it to pass a
// build: fill in the real values in lib/legal.ts and the page text instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const PAGES = ['PrivacyPolicy', 'TermsOfUse', 'Cookies', 'CopyrightPolicy'];
const PLACEHOLDERS = [/TODO\(owner\)/i, /\bTODO\b/, /DMCA-x+/i, /\[_+\]/, /x{5,}/i, /\bFIXME\b/, /\bTBD\b/, /lorem ipsum/i];
const found = (text) => PLACEHOLDERS.filter((re) => re.test(text)).map((re) => {
  const m = text.match(re);
  return `${re} near «${text.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ')}»`;
});

// Minimal browser globals: the pages only read them during render.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.window ??= globalThis;
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.window.location ??= { hash: '#/privacy', pathname: '/', href: 'https://example.test/#/privacy' };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

const out = buildSync({
  stdin: {
    contents: `import { renderToStaticMarkup } from 'react-dom/server';
      import { createElement } from 'react';
      ${PAGES.map((p) => `import ${p} from '@/pages/${p}';`).join('\n')}
      export const render = { ${PAGES.map((p) => `${p}: () => renderToStaticMarkup(createElement(${p}))`).join(', ')} };
      export * as legal from '@/lib/legal';`,
    resolveDir: SRC, loader: 'tsx',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent', jsx: 'automatic',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  alias: { '@': SRC.replace(/[\\/]$/, '') },
  loader: { '.css': 'empty', '.png': 'empty', '.jpg': 'empty', '.jpeg': 'empty', '.webp': 'empty', '.svg': 'empty', '.avif': 'empty', '.woff2': 'empty', '.woff': 'empty' },
});
// React is bundled in, so the CommonJS output loads from a temp file without node_modules.
const file = join(mkdtempSync(join(tmpdir(), 'legal-guard-')), 'pages.cjs');
writeFileSync(file, out.outputFiles[0].text);
const M = createRequire(import.meta.url)(file);
const visibleText = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

test('the legal source constants contain no unresolved placeholders', () => {
  const values = JSON.stringify(M.legal);
  assert.deepEqual(found(values), [], 'lib/legal.ts exports');
});

for (const page of PAGES) {
  test(`${page}: page source contains no unresolved placeholders`, () => {
    const src = readFileSync(`${SRC}pages/${page}.tsx`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    assert.deepEqual(found(src), []);
  });

  test(`${page}: rendered page shows no unresolved placeholders`, () => {
    const html = M.render[page]();
    assert.ok(html.length > 500, 'page rendered');
    assert.deepEqual(found(visibleText(html)), []);
  });
}

test('the guard itself catches each placeholder form', () => {
  for (const s of ['TODO(owner): ΑΦΜ', 'DMCA-xxxxxxx', 'μετά από [__] μήνες']) assert.notDeepEqual(found(s), [], s);
  assert.deepEqual(found('Ζαλοκώστα 8, 10671 Αθήνα · +30 210 22 55 000'), []);
});
