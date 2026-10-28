// UI redesign foundation: shell themes, status pills, the shared button and the CSS tokens.
// Guards: CSS <-> TypeScript stay in sync, every colour pair is WCAG AA (>= 4.5:1), the new CSS cannot restyle the
// public pages, and the raised button effect is on the right variants only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(path(rel), 'utf8');
const bundle = (rel) => {
  const out = buildSync({ entryPoints: [path(rel)], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const T = await bundle('../theme.ts');
const S = await bundle('../status-style.ts');
const B = await bundle('../btn-style.ts');
const css = read('../../styles/atlas-theme.css');
const roles = read('../roles.ts');
const uiTsx = read('../ui.tsx');

// WCAG 2.x contrast
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const cssVar = (name) => { const m = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`)); assert.ok(m, `${name} missing in atlas-theme.css`); return m[1].toLowerCase(); };
const block = (selector) => { const m = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); assert.ok(m, `rule ${selector} missing`); return m[1]; };

test('themes: six unique keys, navy is the default, unknown values never throw', () => {
  assert.deepEqual([...T.THEME_KEYS], ['navy', 'ocean', 'graphite', 'forest', 'plum', 'light']);
  assert.equal(T.DEFAULT_THEME, 'navy');
  for (const bad of [undefined, null, '', 'NAVY', 'red', 42, {}, '__proto__']) assert.equal(T.resolveTheme(bad), 'navy', String(bad));
  assert.equal(T.resolveTheme('plum'), 'plum');
  assert.equal(T.themeByKey('nope').key, 'navy');
});

test('applyTheme sets data-shell-theme on the root and returns the key it applied', () => {
  const attrs = {};
  const root = { setAttribute: (k, v) => { attrs[k] = v; } };
  assert.equal(T.applyTheme('forest', root), 'forest');
  assert.equal(attrs['data-shell-theme'], 'forest');
  assert.equal(T.applyTheme('garbage', root), 'navy');
  assert.equal(attrs['data-shell-theme'], 'navy');
});

test('CSS shell themes match theme.ts (no drift between the swatches and the real colours)', () => {
  for (const t of T.THEMES) {
    const b = block(`:root[data-shell-theme='${t.key}']`).toLowerCase();
    for (const [v, val] of [['--shell-top', t.top], ['--shell-side', t.side], ['--shell-accent', t.accent], ['--shell-accent-2', t.accent2], ['--shell-muted', t.muted]]) {
      assert.match(b, new RegExp(`${v}:\\s*${val}`), `${t.key}: ${v} should be ${val}`);
    }
  }
  const root = block(':root').toLowerCase(); // the unscoped default must equal navy
  const navy = T.themeByKey('navy');
  for (const [v, val] of [['--shell-top', navy.top], ['--shell-side', navy.side], ['--shell-accent', navy.accent]]) assert.match(root, new RegExp(`${v}:\\s*${val}`));
});

test('every shell theme is readable: muted/white text on the bar and sidebar, dark/white text on the accent gradient (>= 4.5:1)', () => {
  for (const t of T.THEMES) {
    const text = t.light ? '#1d1d1f' : '#ffffff';
    const onAccent = t.light ? '#ffffff' : '#071427';
    for (const bg of [t.top, t.side]) {
      assert.ok(contrast(t.muted, bg) >= 4.5, `${t.key}: muted ${t.muted} on ${bg} = ${contrast(t.muted, bg).toFixed(2)}`);
      assert.ok(contrast(text, bg) >= 4.5, `${t.key}: text on ${bg}`);
    }
    for (const a of [t.accent, t.accent2]) assert.ok(contrast(onAccent, a) >= 4.5, `${t.key}: ${onAccent} on accent ${a} = ${contrast(onAccent, a).toFixed(2)}`);
  }
});

test('content tokens are AA on both surfaces', () => {
  const surface = cssVar('--ui-surface'), bg = cssVar('--ui-bg'), soft = cssVar('--ui-primary-soft');
  for (const name of ['--ui-text', '--ui-text-2', '--ui-muted']) for (const on of [surface, bg]) assert.ok(contrast(cssVar(name), on) >= 4.5, `${name} on ${on}`);
  assert.ok(contrast(cssVar('--ui-primary'), surface) >= 4.5, 'primary link/text on white');
  assert.ok(contrast('#ffffff', cssVar('--ui-primary')) >= 4.5, 'white on the primary button');
  assert.ok(contrast('#ffffff', cssVar('--ui-primary-hover')) >= 4.5, 'white on the hovered primary button');
  assert.ok(contrast(cssVar('--ui-primary-hover'), soft) >= 4.5, 'primary text on the soft chip');
});

test('status pills: CSS classes equal PILL_COLORS and every pair is AA', () => {
  for (const [tone, { bg, fg }] of Object.entries(S.PILL_COLORS)) {
    const b = block(`.ui-pill--${tone}`).toLowerCase();
    assert.match(b, new RegExp(`background:\\s*${bg}`), `${tone} background`);
    assert.match(b, new RegExp(`color:\\s*${fg}`), `${tone} colour`);
    assert.ok(contrast(fg, bg) >= 4.5, `${tone}: ${fg} on ${bg} = ${contrast(fg, bg).toFixed(2)}`);
  }
  assert.equal(S.pillClass('teal'), 'ui-pill ui-pill--teal');
});

test('every lead status and every case stage in roles.ts has a tone, and unknown ids fall back to gray', () => {
  const ids = (marker) => {
    const start = roles.indexOf(marker); assert.ok(start > 0, marker);
    const body = roles.slice(start, roles.indexOf('];', start));
    return [...body.matchAll(/\{\s*id:\s*'([a-z_]+)'/g)].map((m) => m[1]);
  };
  const stages = ids('export const STAGES:'), statuses = ids('export const LEAD_STATUSES:');
  assert.equal(stages.length, 11); assert.equal(statuses.length, 9);
  for (const s of stages) assert.ok(S.STAGE_TONE[s], `stage ${s}`);
  for (const s of statuses) assert.ok(S.LEAD_STATUS_TONE[s], `lead status ${s}`);
  for (const tone of [...Object.values(S.STAGE_TONE), ...Object.values(S.LEAD_STATUS_TONE)]) assert.ok(S.PILL_COLORS[tone], tone);
  assert.equal(S.toneForStage('nope'), 'gray'); assert.equal(S.toneForStage(null), 'gray');
  assert.equal(S.toneForLeadStatus(undefined), 'gray');
  // Spec examples
  assert.equal(S.toneForLeadStatus('new'), 'blue'); assert.equal(S.toneForLeadStatus('contacted'), 'purple');
  assert.equal(S.toneForLeadStatus('qualified'), 'green'); assert.equal(S.toneForLeadStatus('meeting'), 'teal');
  assert.equal(S.toneForLeadStatus('offer'), 'orange');
});

test('shared button: raised effect on every variant that has a background, not on ghost; touch target; no layout change', () => {
  for (const v of ['primary', 'outline', 'danger', 'ok', 'brand']) assert.match(B.btnClassName(v), /(^| )b3( |$)/, v);
  assert.doesNotMatch(B.btnClassName('ghost'), /(^| )b3( |$)/);
  assert.match(B.btnClassName('primary', 'w-full'), /w-full$/, 'extra classes are kept');
  assert.match(B.btnClassName('primary'), /\[@media\(pointer:coarse\)\]:min-h-\[44px\]/, '44px hit target on touch');
  assert.doesNotMatch(B.btnClassName('primary'), /justify-center/, 'alignment is unchanged from the old Btn');
  assert.match(B.ICON_BTN_RAISED, /(^| )b3( |$)/);
  assert.doesNotMatch(B.ICON_BTN_BASE, /(^| )b3( |$)/, 'background-less icon buttons stay flat');
  assert.match(uiTsx, /btnClassName\(variant, className\)/, 'ui.tsx Btn uses the helper');
  assert.match(uiTsx, /ICON_BTN_RAISED/, 'IconBtn offers the raised chip');
});

test('.b3 effect: hover lift, soft press, focus ring, disabled state and reduced-motion are all defined', () => {
  assert.match(css, /\.b3:hover:not\(:disabled\)[^{]*\{[^}]*translateY\(-2px\)/);
  assert.match(css, /\.b3:active:not\(:disabled\)[^{]*\{[^}]*translateY\(1px\) scale\(0\.98\)/);
  assert.match(css, /\.b3:focus-visible\s*\{[^}]*outline:\s*3px solid/);
  assert.match(css, /\.b3:disabled[^{]*\{[^}]*transform:\s*none/);
  const rm = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(rm && /\.b3/.test(rm[1]) && /transform:\s*none/.test(rm[1]) && /transition:\s*none/.test(rm[1]), 'reduced motion switches the effect off');
});

test('the new CSS cannot restyle the public pages', () => {
  // The landing page defines --bg, --surface, --border, --text, --primary globally; this file must not redefine those names.
  assert.doesNotMatch(css, /^\s*--(bg|bg-2|surface|surface-2|border|text|text-muted|primary|accent)\s*:/m);
  // Semantic tokens and the font stack are scoped to the CRM shell (and portaled dialogs).
  assert.match(css, /\.atx-shell, body\.atx-app \{[^}]*--ui-bg:/);
  assert.match(css, /html \.atx-shell, html body\.atx-app \{\s*font-family:/);
  // Only --shell-* is on :root.
  const root = block(':root');
  assert.doesNotMatch(root, /--ui-/);
  // index.css pulls the file in before Tailwind.
  assert.match(read('../../index.css'), /^@import '\.\/styles\/atlas-theme\.css';/);
});
