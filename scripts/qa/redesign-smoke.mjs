#!/usr/bin/env node
// Smoke test of the redesigned shell against scripts/qa/mock-supabase.mjs (LOCAL, synthetic data).
// Needs: the mock on :54399, the app on :5199 (built with VITE_SUPABASE_URL=http://127.0.0.1:54399 VITE_SUPABASE_ANON_KEY=mock,
// then `vite preview --port 5199`), Chrome. Run: node scripts/qa/redesign-smoke.mjs
// The mock performs NO authorization: this proves what each role's profile renders, not data isolation.
// (scripts/qa/ui-smoke.mjs targets the pre-redesign navigation and needs porting; this script replaces its navigation checks.)
import { launch, signInAs, sleep } from './ui-session.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const clickText = (page, sel, label) => page.evaluate((s, l) => { const el = [...document.querySelectorAll(s)].find((b) => b.textContent.trim().includes(l)); if (el) { el.click(); return true; } return false; }, sel, label);
const texts = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' ')));
const IGNORED = /favicon|ResizeObserver|CARTO basemap key|\[map\]|Failed to load resource/; // map tiles need a build-time key; 404s are static-file probes

// What each role may see (module links in the top bar; derived from navForRole, never granted by the shell).
const MODULES = {
  admin: ['Αρχική', 'CRM', 'Πεδίο', 'Ανάλυση'],
  inside_sales: ['Αρχική', 'CRM'],
  back_office: ['Αρχική', 'CRM'],
};
const NO_LEADS = ['field_sales', 'back_office']; // neither role has a Leads page (navForRole)

async function session(role, w, h, dpr, steps) {
  const { browser, page, errors } = await launch(w, h, dpr);
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + String(e).slice(0, 160)));
  try {
    await signInAs(page, role);
    await page.waitForSelector('.shell-topbar', { timeout: 30000 });
    await sleep(1500);
    await steps(page, errors);
  } finally { await browser.close(); }
}

/* 1. every page, every role: one h1, no horizontal overflow, no app errors */
for (const [role, w, h, dpr] of [['admin', 1440, 900, 1], ['back_office', 1440, 900, 1], ['inside_sales', 820, 1000, 1], ['field_sales', 390, 844, 2]]) {
  await session(role, w, h, dpr, async (page, errors) => {
    const bad = [];
    const visit = async (label) => {
      await sleep(1200);
      const o = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, main: (() => { const m = document.querySelector('main'); return m ? m.scrollWidth - m.clientWidth : 0; })(), h1: document.querySelectorAll('h1').length }));
      if (o.over > 1 || o.main > 1 || o.h1 !== 1) bad.push(`${label} (overflow ${o.over}/${o.main}, h1 ${o.h1})`);
    };
    const mods = await texts(page, '.shell-seg__link');
    if (MODULES[role]) check(`${role}: top-bar modules`, JSON.stringify(mods) === JSON.stringify(MODULES[role]), mods.join(' | '));
    for (const m of mods) {
      await page.evaluate((l) => [...document.querySelectorAll('.shell-seg__link')].find((b) => b.textContent.trim() === l)?.click(), m);
      await sleep(400);
      const items = await page.$$eval('.shell-sidebar__nav .shell-item', (e) => e.map((x) => (x.querySelector('.shell-item__text')?.textContent ?? '').trim()));
      if (m === 'CRM') check(`${role}: Leads ${NO_LEADS.includes(role) ? 'hidden' : 'visible'}`, items.includes('Leads') === !NO_LEADS.includes(role));
      for (const it of items) {
        await page.evaluate((l) => [...document.querySelectorAll('.shell-sidebar__nav .shell-item')].find((b) => (b.querySelector('.shell-item__text')?.textContent ?? '').trim() === l)?.click(), it);
        await visit(`${m}/${it}`);
      }
    }
    for (const label of ['Προσαρμογή CRM', 'Διαχείριση']) {
      await page.click('.shell-user').catch(() => undefined); await sleep(300);
      const ok = await page.evaluate((l) => { const el = [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent.trim().startsWith(l)); el?.click(); return !!el; }, label);
      if (!ok) { await page.keyboard.press('Escape'); continue; }
      await visit(`menu/${label}`);
    }
    check(`${role}@${w}: every page has one h1 and no horizontal overflow`, bad.length === 0, bad.join('; '));
    const errs = [...new Set(errors.filter((e) => !IGNORED.test(e)))];
    check(`${role}@${w}: no app errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
  });
}

/* 2. preferences: theme applies at once, survives a reload before render; compact sidebar */
await session('admin', 1440, 900, 1, async (page) => {
  await page.click('.shell-user'); await sleep(300); await clickText(page, '[role="menuitem"]', 'Προσαρμογή CRM'); await sleep(800);
  await page.click('button[aria-label="Θέμα Δάσος"]'); await sleep(250);
  check('theme: applied immediately', (await page.evaluate(() => document.documentElement.getAttribute('data-shell-theme'))) === 'forest');
  await page.click('button[role="switch"]'); await sleep(300);
  check('compact sidebar: toggled', (await page.$eval('.shell-sidebar', (e) => e.getAttribute('data-mode'))) === 'compact');
  await page.reload({ waitUntil: 'domcontentloaded' });
  check('theme: set before React renders after a reload', (await page.evaluate(() => document.documentElement.getAttribute('data-shell-theme'))) === 'forest');
});

/* 3. Home edit mode: edit, save, reload; foreign boxes never shown */
await session('admin', 1440, 900, 1, async (page) => {
  await page.waitForSelector('.home-w', { timeout: 20000 });
  await page.click('[data-home-customize]'); await sleep(300);
  await page.click('button[aria-label="Pipeline: Μεγάλο"]'); await sleep(150);
  await clickText(page, '.home-toolbar button', 'Ολοκλήρωση'); await sleep(700);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.home-w', { timeout: 30000 }); await sleep(1200);
  check('home: resized box persists across a reload', (await page.$$eval('.home-w', (e) => e.map((x) => `${x.dataset.widget}:${x.dataset.size}`))).includes('pipeline:L'));
});
await session('inside_sales', 1440, 900, 1, async (page) => {
  await page.evaluate(() => { const k = 'atlas.prefs.v1'; const j = JSON.parse(localStorage.getItem(k) || '{}'); j.dashboard_layout = [{ id: 'summary', size: 'XL' }, { id: 'team', size: 'M' }, { id: 'tasks', size: 'L' }]; localStorage.setItem(k, JSON.stringify(j)); });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.home-w', { timeout: 30000 }); await sleep(1200);
  check('home: admin-only boxes in a saved layout are not shown to a sales agent', JSON.stringify(await page.$$eval('.home-w', (e) => e.map((x) => x.dataset.widget))) === '["tasks"]');
});

/* 4. dialogs: role, focus trap, Esc, focus return, bottom sheet on a phone */
for (const [w, h, dpr] of [[1440, 900, 1], [390, 844, 2]]) {
  await session('inside_sales', w, h, dpr, async (page) => {
    await clickText(page, '.shell-seg__link', 'CRM'); await sleep(500); await clickText(page, '.shell-item', 'Leads'); await sleep(1500);
    const trigger = await page.evaluateHandle(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Νέο Lead')));
    await trigger.asElement().focus(); await trigger.asElement().click(); await sleep(500);
    check(`dialog@${w}: labelled, modal, focus inside`, await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return !!d && d.getAttribute('aria-modal') === 'true' && !!document.getElementById(d.getAttribute('aria-labelledby')) && d.contains(document.activeElement); }));
    for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
    check(`dialog@${w}: Tab stays inside`, await page.evaluate(() => document.querySelector('[role="dialog"]').contains(document.activeElement)));
    if (w < 700) check('dialog@390: bottom sheet', await page.evaluate(() => Math.abs(document.querySelector('[role="dialog"]').getBoundingClientRect().bottom - innerHeight) < 2));
    await page.keyboard.press('Escape'); await sleep(300);
    check(`dialog@${w}: Esc closes and focus returns to the trigger`, !(await page.$('[role="dialog"]')) && (await page.evaluate(() => document.activeElement?.textContent?.includes('Νέο Lead'))));
  });
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
