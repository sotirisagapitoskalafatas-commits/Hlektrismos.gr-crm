// Release guard: no unresolved placeholder may reach the public legal pages.
// Do not weaken it to pass a build: supply the real facts in lib/legal.ts and
// the page text instead. The claim tests below keep material disclosures in and
// unverified promises / internal details out (see docs/legal/LEGAL_AUDIT_2026-10-27.md).
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

test('provider identity (owner-supplied 27 Oct 2026) is shown on Privacy and Terms; nothing unsupplied is invented', () => {
  for (const page of ['PrivacyPolicy', 'TermsOfUse']) {
    const text = visibleText(M.render[page]());
    for (const v of ['HLEKTRISMOS.GR ΜΟΝΟΠΡΟΣΩΠΗ Ι.Κ.Ε.', '801198034', '151552422000', 'Ζαλοκώστα 8, Αθήνα, Τ.Κ. 10671', '+30 210 22 55 000', 'info@hlektrismos.gr']) {
      assert.ok(text.includes(v), `${page}: ${v}`);
    }
    assert.doesNotMatch(text, /ΔΟΥ|Δ\.Ο\.Υ\.|DPO|Υπεύθυνος Προστασίας Δεδομένων/, `${page}: no ΔΟΥ/DPO was supplied`);
  }
  for (const page of ['PrivacyPolicy', 'Cookies', 'CopyrightPolicy']) {
    assert.doesNotMatch(M.render[page](), /privacy@|copyright@/, `${page}: unconfirmed mailboxes not published`);
  }
});

// Claim guard: material disclosures stay, unverified promises and internal details stay out.
const ALL = () => PAGES.map((p) => visibleText(M.render[p]())).join('\n');

test('privacy policy keeps the material chatbot / AI / voice disclosures', () => {
  const t = visibleText(M.render.PrivacyPolicy());
  assert.match(t, /Google \(υπηρεσία Gemini\)/, 'names the external AI provider of the chatbot');
  assert.match(t, /από το πρώτο μήνυμα/, 'says chat text leaves before any age declaration');
  assert.match(t, /ηχογραφείται\s+και απομαγνητοφωνείται/, 'voice calls are recorded and transcribed');
  assert.match(t, /εκτός\s+του Ευρωπαϊκού Οικονομικού Χώρου/, 'mentions possible transfers outside the EEA');
  assert.match(t, /απαραίτητα για να απαντήσουμε/, 'says which data are required and the consequence');
});

test('no unverified promises on the public legal pages', () => {
  const t = ALL();
  for (const re of [
    /Κάθε απόφαση[^.]*άνθρωπο/, // human review of every decision: not evidenced
    /ενημερ\S+ από την αρχή/, // voice disclosure timing: deployed function not verified
    /ενημερώνεστε στην αρχή/i,
    /αυτόματες κλήσεις AI είναι απενεργοποιημένες/, // production setting not verified
    /διαγράφονται με ασφάλεια/, // no implemented deletion process
    /αποκλειστικά υπό τις οδηγίες/, // provider roles not verified
    /Data Privacy Framework|Τυποποιημένων Συμβατικών Ρητρών/, // transfer safeguards not verified
    /100%|πλήρως συμμορφ/i,
  ]) assert.doesNotMatch(t, re, String(re));
});

test('no internal architecture or staff details on the public legal pages', () => {
  const t = ALL();
  for (const re of [/sb-\S*auth-token/, /atlas\.nav/, /\bGPS\b/, /check-in/i, /Supabase|SerpApi|OSRM|OpenRouteService|CARTO|Photon|Infobip|Resend|Vapi/, /edge functions?/i]) {
    assert.doesNotMatch(t, re, String(re));
  }
});
