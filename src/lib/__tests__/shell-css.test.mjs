// Guards for the shell stylesheet (atlas-shell.css). Each test pins a bug that was found by looking at the real app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const shell = read('../../styles/atlas-shell.css');
const theme = read('../../styles/atlas-theme.css');
const ux = read('../../styles/atlas-ux.css');

test('the top bar out-ranks the old `.atx-shell header` rule (which repainted it light)', () => {
  assert.match(ux, /\.atx-shell header\s*\{/, 'the old rule still exists for other headers, so the top bar must beat it');
  assert.match(shell, /^\.atx-shell \.shell-topbar \{/m);
  assert.doesNotMatch(shell, /^\.shell-topbar \{/m, 'a bare .shell-topbar rule would lose to `.atx-shell header`');
});

test('responsive rules are ordered so the phone rules win over the desktop ones', () => {
  const at = (needle) => { const i = shell.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  assert.ok(at('@media (max-width: 1199px)') < at('@media (max-width: 767px)'), 'phone block must come last');
  assert.ok(at('@media (min-width: 768px) and (max-width: 1099px)') < at('@media (max-width: 767px)'));
  // phone: search collapses to an icon, labels and low-priority icons go, the module links become a strip
  const phone = shell.slice(at('@media (max-width: 767px)'));
  for (const rule of ['.shell-search { width: 42px', '.shell-create > span { display: none', '.shell-hide-narrow { display: none', '.shell-seg { order: 10; flex: 1 0 100%; overflow-x: auto']) {
    assert.ok(phone.includes(rule), `phone rule missing: ${rule}`);
  }
  // tablet: the bar must fit at 768-1099px (overflowed by 33px at 820px before the wordmark and label collapsed)
  const tablet = shell.slice(at('@media (min-width: 768px) and (max-width: 1099px)'), at('@media (max-width: 767px)'));
  assert.ok(tablet.includes('.shell-wordmark { display: none') && tablet.includes('.shell-create > span { display: none'));
});

test('every --shell-* variable the shell uses is defined by the theme file', () => {
  const used = new Set([...shell.matchAll(/var\((--shell-[a-z0-9-]+)\)/g)].map((m) => m[1]));
  assert.ok(used.size >= 8);
  for (const v of used) assert.match(theme, new RegExp(`${v}:`), `${v} is used but never defined`);
  // and the three sidebar modes the components emit exist
  for (const mode of ['compact', 'strip']) assert.ok(shell.includes(`.shell-sidebar[data-mode='${mode}']`), mode);
});

test('the old rail/drawer styles are gone', () => {
  const index = read('../../index.css');
  for (const css of [index, ux]) assert.doesNotMatch(css, /\.(glass-nav|glass-drawer|nav-leaf|nav-atlas|shell-backdrop)\b/);
});

test('Leads uses the shared status pills, chips and rows (no ad-hoc tone mapping)', () => {
  const page = read('../../components/app/LeadsPage.tsx');
  assert.match(page, /pillClass\(toneForLeadStatus\(/);
  assert.doesNotMatch(page, /info\.id === 'new' \? 'blue'/, 'the old inline tone chain is gone');
  assert.match(page, /className="ui-chip shrink-0"/);
  for (const rule of [".ui-chip[aria-pressed='true']", '.ui-row:hover', '.ui-tile']) assert.ok(theme.includes(rule), rule);
});
