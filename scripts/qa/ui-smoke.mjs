#!/usr/bin/env node
// UI smoke tests for Αρχική / Η εργασία μου against scripts/qa/mock-supabase.mjs (LOCAL, synthetic data).
// Requires: mock on :54399, `npm run dev -- --port 5199`, Chrome. Run: node scripts/qa/ui-smoke.mjs
// NOTE: the mock performs no authorization; this verifies rendering/behaviour per role profile, NOT data isolation.
import { launch, signInAs, sleep } from './ui-session.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const text = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent.trim()));
const click = (page, label, scope = 'button') => page.evaluate((l, sc) => {
  const el = [...document.querySelectorAll(sc)].find((b) => b.textContent.trim().startsWith(l) && b.offsetParent);
  if (el) { el.click(); return true; } return false;
}, label, scope);

const ADMIN_ONLY = ['Αυτοματισμοί', 'AI Εργατικό Δυναμικό', 'Διαχείριση'];
const EXPECT = {
  admin: { must: ['Αρχική', 'Η εργασία μου', 'Leads', 'Cases', 'Ρυθμίσεις'.length && 'Προτιμήσεις', ...ADMIN_ONLY], mustNot: [] },
  manager: { must: ['Αρχική', 'Η εργασία μου', 'Leads', 'Cases', ...ADMIN_ONLY], mustNot: [] },
  inside_sales: { must: ['Αρχική', 'Η εργασία μου', 'Leads', 'Cases', 'Πελάτες'], mustNot: [...ADMIN_ONLY, 'Λειτουργίες', 'Χάρτης'] },
  field_sales: { must: ['Αρχική', 'Η εργασία μου', 'Ημέρα μου', 'Χάρτης', 'Cases'], mustNot: [...ADMIN_ONLY, 'Leads', 'Λειτουργίες', 'B2B Prospecting'] },
  back_office: { must: ['Αρχική', 'Η εργασία μου', 'Λειτουργίες', 'Cases'], mustNot: [...ADMIN_ONLY, 'Leads', 'Χάρτης', 'B2B Prospecting'] },
};

/* ---- 1. per-role navigation + role simulator ---- */
for (const role of Object.keys(EXPECT)) {
  const { browser, page, errors } = await launch(1440, 900);
  await signInAs(page, role);
  const nav = await text(page, '#shell-rail nav button');
  const label = (n) => nav.some((t) => t.startsWith(n));
  for (const m of EXPECT[role].must) check(`${role}: nav shows «${m}»`, label(m));
  for (const m of EXPECT[role].mustNot) check(`${role}: nav hides «${m}»`, !label(m));
  const sim = await page.evaluate(() => document.body.innerText.includes('Επίδειξη ρόλου'));
  // the simulator lives in the account area; check Preferences page for the section
  await click(page, 'Προτιμήσεις');
  await sleep(700);
  const simPref = await page.evaluate(() => document.body.innerText.includes('Προσομοίωση ρόλου'));
  check(`${role}: role simulator ${role === 'admin' ? 'available' : 'hidden'}`, (role === 'admin') === (simPref || sim));
  check(`${role}: no unexpected console errors`, errors.filter((e) => !/fetchPriority|fetchpriority|Failed to load resource/.test(e)).length === 0, errors.slice(0, 1).join('|'));
  await browser.close();
}

/* ---- 2. a tampered override must NOT escalate a non-admin ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await page.evaluate(() => localStorage.setItem('atlas.role.override', 'admin'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const nav = await text(page, '#shell-rail nav button');
  check('inside_sales with stored admin override: admin items stay hidden', !nav.some((t) => ADMIN_ONLY.some((a) => t.startsWith(a))));
  await browser.close();
}

/* ---- 3. Home and My Work agree; actions really work ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  const stats = await text(page, '.atx-stat-n');
  const [overdue, today, leads, cases] = stats.map(Number);
  check('Home: stats are numbers (no placeholders/negatives)', stats.length === 4 && stats.every((s) => /^\d+$/.test(s)), stats.join(','));
  await click(page, 'Η εργασία μου', '#shell-rail nav button');
  await sleep(900);
  const chips = await text(page, '[aria-label="Τύπος εργασίας"] button');
  const n = (k) => Number((chips.find((c) => c.startsWith(k)) || '').replace(/\D+/g, ''));
  check('My Work counts equal Home stats (follow-ups = overdue + today)', n('Follow-ups') === overdue + today, `${n('Follow-ups')} vs ${overdue + today}`);
  check('My Work leads count equals Home', n('Leads') === leads);
  check('My Work cases count equals Home', n('Cases') === cases);
  const fuRows = () => page.$$eval('.atx-row', (rows) => rows.filter((r) => [...r.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Ολοκλήρωση')).length);
  const fu0 = await fuRows();
  await click(page, 'Ολοκλήρωση', 'button');
  await sleep(1800);
  const fu1 = await fuRows();
  check('complete follow-up: one fewer follow-up row after the backend confirms', fu1 === fu0 - 1, `${fu0} -> ${fu1}`);
  check('complete follow-up: success toast shown', await page.evaluate(() => document.body.innerText.includes('Το follow-up ολοκληρώθηκε')));
  const log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('complete follow-up: PATCH sent to follow_ups with status completed', log.some((l) => l.method === 'PATCH' && l.table === 'follow_ups' && l.body.status === 'completed'));
  await click(page, 'Αναβολή', 'button');
  await sleep(1500);
  const log2 = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('snooze: PATCH with status snoozed sent', log2.some((l) => l.method === 'PATCH' && l.body.status === 'snoozed'));
  // keyboard: palette
  await page.keyboard.down('Control'); await page.keyboard.press('k'); await page.keyboard.up('Control');
  await sleep(500);
  check('Ctrl+K opens the existing search palette', await page.evaluate(() => !!document.querySelector('input[placeholder*="Πληκτρολογήστε"]')));
  await browser.close();
}

/* ---- 4. empty state for a role with no work ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'back_office');
  await click(page, 'Η εργασία μου', '#shell-rail nav button');
  await sleep(900);
  const body = await page.evaluate(() => document.body.innerText);
  check('back_office My Work: shows its real item (case/follow-up), no fake rows', /Έλεγχος εγγράφων|Πελάτης|CS-2026/.test(body) || /Δεν υπάρχει εργασία/.test(body));
  await browser.close();
}

/* ---- 5. responsive: no horizontal overflow ---- */
for (const w of [1440, 1280, 1024, 820, 390]) {
  for (const hash of ['-', 'Η εργασία μου']) {
    const { browser, page } = await launch(w, w < 500 ? 844 : 900);
    await signInAs(page, 'inside_sales');
    if (hash !== '-') {
      await page.evaluate((l) => { const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(l) && b.offsetParent); el && el.click(); }, hash);
      await sleep(900);
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${w}px ${hash === '-' ? 'Αρχική' : 'Η εργασία μου'}: no horizontal overflow`, over <= 0, `overflow=${over}`);
    await browser.close();
  }
}

/* ---- 6. CRM has its own assistant, not the visitor chatbot ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  check('CRM: visitor chatbot launcher is not rendered', !(await page.$('.jv-launcher')));
  await click(page, 'Atlas AI');
  await sleep(600);
  check('CRM: Atlas AI panel opens from the top bar', !!(await page.$('[aria-label="Atlas AI βοηθός CRM"]')));
  await page.type('[aria-label="Ερώτηση προς τον βοηθό"]', 'βρες λεαδ 1');
  await page.keyboard.press('Enter');
  await sleep(500);
  await page.type('[aria-label="Ερώτηση προς τον βοηθό"]', 'Τι έχω σήμερα;');
  await page.keyboard.press('Enter');
  await sleep(600);
  const results = await text(page, '[aria-label="Atlas AI βοηθός CRM"] li button');
  check('Atlas AI: «Τι έχω σήμερα;» returns real work items', results.length > 0, results.slice(0, 2).join(' | '));
  await page.type('[aria-label="Ερώτηση προς τον βοηθό"]', 'Άνοιξε Έσοδα');
  await page.keyboard.press('Enter');
  await sleep(500);
  check('Atlas AI: refuses a page outside the role', await page.evaluate(() => document.body.innerText.includes('δεν είναι διαθέσιμη για τον ρόλο σας')));
  await browser.close();
  // public site keeps the visitor chatbot
  const p2 = await launch(1440, 900);
  await p2.page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  check('Public site: visitor chatbot still present', !!(await p2.page.$('.jv-launcher')));
  await p2.browser.close();
}

/* ---- 7. Lead details: open from My Work, record first contact, convert ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await click(page, 'Η εργασία μου', '#shell-rail nav button');
  await sleep(900);
  await click(page, 'Άνοιγμα lead');
  await sleep(1500);
  const body = () => page.evaluate(() => document.body.innerText);
  check('Lead detail: opens from My Work with the recommended action', (await body()).includes('Προτεινόμενη ενέργεια') && (await body()).includes('Καταγραφή πρώτης επικοινωνίας'));
  await click(page, 'Καταγραφή πρώτης επικοινωνίας');
  await sleep(1500);
  const log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Lead detail: status PATCH contacted sent', log.some((l) => l.method === 'PATCH' && l.table === 'leads' && l.body.status === 'contacted'));
  check('Lead detail: status change audited', log.some((l) => l.method === 'POST' && l.table === 'activity_log' && l.body.action === 'status_change'));
  check('Lead detail: next action advances to qualification', (await body()).includes('Σήμανση ως ειδικευμένο'));
  await click(page, 'Σήμανση ως ειδικευμένο');
  await sleep(1500);
  await click(page, 'Μετατροπή σε Case');
  await sleep(2000);
  const log2 = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Lead detail: conversion uses the existing RPC', log2.some((l) => l.table === 'convert_lead_to_case'));
  await browser.close();
}

/* ---- 8. Documents: type first, then file; checklist updates ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await click(page, 'Cases', '#shell-rail nav button');
  await sleep(1200);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === 'CS-2026-001' && e.offsetParent)[0];
    el && el.click();
  });
  await sleep(1500);
  await click(page, 'Έγγραφα');
  await sleep(1200);
  const t0 = await page.evaluate(() => document.body.innerText);
  check('Documents: checklist lists ID, bill and proof of use', t0.includes('Ταυτότητα ή διαβατήριο') && t0.includes('Λογαριασμός ρεύματος') && /Ε9, μισθωτήριο/.test(t0));
  await click(page, 'Προσθήκη εγγράφου');
  await sleep(500);
  const disabledBefore = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Επιλογή αρχείου')).disabled);
  check('Documents: file choice is blocked until a type is chosen', disabledBefore === true);
  await click(page, 'Μισθωτήριο', '[role="radio"]');
  const input = await page.$('input[type="file"][accept="image/*,application/pdf"]');
  await input.uploadFile('C:/Users/kalaf/hlek/docs/product/screenshots/after/inside_sales-home-1440.jpg');
  await sleep(2000);
  const log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  const ins = log.find((l) => l.method === 'POST' && l.table === 'case_documents');
  check('Documents: saved with the chosen type (category=lease)', ins?.body?.category === 'lease', JSON.stringify(ins?.body?.category));
  const t1 = await page.evaluate(() => document.body.innerText);
  check('Documents: proof-of-use item now shows Παραλήφθηκε', /Ε9, μισθωτήριο ή παραχώρηση\)[\s\S]{0,40}Παραλήφθηκε/.test(t1));
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
