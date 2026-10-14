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
  await page.waitForFunction(() => document.querySelectorAll('.atx-kpi-n').length === 5 && !document.querySelector('.atx-kpi-n.is-na'), { timeout: 15000 }).catch(() => {});
  const all = await text(page, '.atx-kpi-n');
  const stats = all.slice(0, 4); // the 5th card is the recorded value (money or «μη διαθέσιμο»)
  const [overdue, today, leads, cases] = stats.map(Number);
  check('Home: stats are numbers (no placeholders/negatives)', all.length === 5 && stats.every((s) => /^\d+$/.test(s)), all.join(','));
  check('Home: recorded value is money or «μη διαθέσιμο», never a bare 0', /€|μη διαθέσιμο/.test(all[4] ?? ''), all[4]);
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

/* ---- 6b. Home command center (admin, 1440×900) ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'admin');
  await page.waitForSelector('.cc-team .atx-team-row', { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const geo = await page.evaluate(() => {
    const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b && { left: b.left, top: b.top, right: b.right, width: b.width }; };
    const main = document.querySelector('main'), work = r('.cc-work'), pipe = r('.cc-pipe'), team = r('.cc-team');
    return { mainW: main.clientWidth, pageW: r('.atx-page.atx-wide')?.width, work, pipe, team, overflow: main.scrollWidth > main.clientWidth + 1 };
  });
  check('Home: uses the available width (no 880px column) and no horizontal overflow', geo.pageW > geo.mainW - 80 && !geo.overflow, `${geo.pageW} of ${geo.mainW}`);
  check('Home: work, pipeline and team side by side at 1440', geo.work && geo.pipe && geo.team && Math.abs(geo.work.top - geo.pipe.top) < 2 && Math.abs(geo.pipe.top - geo.team.top) < 2 && geo.work.right <= geo.pipe.left && geo.pipe.right <= geo.team.left,
    JSON.stringify([geo.work, geo.pipe, geo.team].map((x) => x && [Math.round(x.left), Math.round(x.top), Math.round(x.right)])));
  const body = await page.evaluate(() => document.body.innerText);
  check('Home: every module present (team, staffing, AI, summary, funnel, back office, docs, top cases, notifications)',
    ['Η ομάδα', 'Στελέχωση', 'Atlas AI', 'Ενεργά Cases', 'Funnel κατά στάδιο', 'Back Office ροή', 'Έγγραφα & Υπογραφές', 'Κορυφαία Cases', 'Τελευταία συμβάντα'].every((t) => body.includes(t)));
  check('Home: staffing shown once (moved, not duplicated)', (body.match(/Στελέχωση/g) || []).length === 1);
  await page.evaluate(() => document.querySelector('.atx-pipe-stage[aria-label^="Αίτηση"]')?.click());
  await sleep(1200);
  const listed = await page.evaluate(() => document.querySelector('main').innerText);
  check('Home: pipeline stage opens Cases filtered by that stage', listed.includes('CS-2026-004') && !listed.includes('CS-2026-001'));
  await click(page, 'Αρχική', '#shell-rail nav button');
  await sleep(1500);
  await click(page, 'Απόκρυψη αναλυτικού πίνακα');
  await sleep(400);
  const hidden = await page.evaluate(() => !document.body.innerText.includes('Funnel κατά στάδιο'));
  await click(page, 'Εμφάνιση αναλυτικού πίνακα');
  await sleep(400);
  check('Home: detailed panel can be hidden and shown again', hidden && (await page.evaluate(() => document.body.innerText.includes('Funnel κατά στάδιο'))));
  await browser.close();
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

/* ---- 8b. Website form files reach the CRM (lead + case documents) ---- */
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
  await sleep(1500);
  const t0 = await page.evaluate(() => document.body.innerText);
  check('Website files: listed in the case documents with open links', t0.includes('Αρχεία που έστειλε ο πελάτης') && t0.includes('IMG_4021.HEIC') && t0.includes('Λογαριασμός ΔΕΗ.pdf')
    && (await page.$$('[data-lead-file] a[href]')).length === 2);
  check('Website files: checklist tells staff to file them', t0.includes('Ο πελάτης έστειλε 2 αρχεία από την ιστοσελίδα'));
  await page.evaluate(() => [...document.querySelectorAll('[data-lead-file="Λογαριασμός ΔΕΗ.pdf"] button')].find((b) => b.textContent.includes('Καταχώρηση ως'))?.click());
  await sleep(500);
  await click(page, 'Λογαριασμός ρεύματος', '[role="radio"]');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Καταχώρηση')?.click());
  await sleep(1800);
  const log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  const ins = log.filter((l) => l.method === 'POST' && l.table === 'case_documents').pop();
  check('Website files: filed as a typed case document pointing at the same stored file (no re-upload)',
    ins?.body?.category === 'bill_electricity' && ins?.body?.file_url === 'hlektrismos_docs/contact-forms/1791950659862_ef34gh_file.pdf', JSON.stringify(ins?.body));
  const t1 = await page.evaluate(() => document.body.innerText);
  check('Website files: filed file no longer pending; bill item received', t1.includes('Προς καταχώρηση 1') && /Λογαριασμός ρεύματος[\s\S]{0,40}Παραλήφθηκε/.test(t1));
  await click(page, 'Leads', '#shell-rail nav button');
  await sleep(1200);
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => /ΜΕΤ/.test(b.textContent))?.click()); // converted tab
  await sleep(600);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === 'Δοκιμαστικό Lead 8' && e.offsetParent)[0];
    el && el.click();
  });
  await sleep(1500);
  const t2 = await page.evaluate(() => document.body.innerText);
  check('Website files: shown on the lead details', t2.includes('Αρχεία από τη φόρμα (2)') && t2.includes('IMG_4021.HEIC'));
  await browser.close();
}

/* ---- 9. Customer details ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await click(page, 'Πελάτες', '#shell-rail nav button');
  await sleep(1200);
  await page.evaluate(() => { const el = [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Αθηνά Κωνσταντίνου')); el && el.click(); });
  await sleep(1800);
  const body = () => page.evaluate(() => document.querySelector('main').innerText);
  const t = await body();
  check('Customer detail: opens with next step, cases and contact', t.includes('Επόμενο βήμα') && t.includes('Επικοινωνία') && /CS-2026-00/.test(t));
  await click(page, 'Ιστορικό', '[role="tab"]'); await sleep(500);
  check('Customer detail: history merges case timeline events', (await body()).includes('Τηλεφωνική επικοινωνία'));
  await click(page, 'Επεξεργασία'); await sleep(400);
  await page.evaluate(() => { const i = [...document.querySelectorAll('main label')].find((l) => l.textContent.startsWith('Πόλη')).querySelector('input'); i.focus(); });
  await page.keyboard.type(' Κέντρο');
  await click(page, 'Αποθήκευση'); await sleep(1500);
  const log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Customer detail: edit saves via PATCH customers', log.some((l) => l.method === 'PATCH' && l.table === 'customers' && /Κέντρο/.test(l.body.city || '')));
  await browser.close();
}

/* ---- 10. Case details: stepper, next step, blockers, handover, exit needs a reason ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await click(page, 'Cases', '#shell-rail nav button'); await sleep(1200);
  await page.evaluate(() => { const el = [...document.querySelectorAll('main *')].find((e) => e.textContent.trim() === 'CS-2026-006' && e.offsetParent); el && el.click(); });
  await sleep(2000);
  const t = await page.evaluate(() => document.querySelector('main').innerText);
  check('Case detail: stepper uses full Greek labels, no 3-letter codes', t.includes('Έλεγχος εγγράφων') && t.includes('Καταχώρηση παρόχου') && !/\bΕΓΓ\b|\bΚΑΤ\b|\bΥΠΓ\b/.test(t));
  check('Case detail: next step lists missing documents as blockers', /Λείπει: Ταυτότητα/.test(t) && t.includes('Επόμενο βήμα'));
  await click(page, 'Παράδοση'); await sleep(500);
  // dialog is portaled to <body>; team defaults to Back Office; pick the first colleague listed
  const opts = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('body > .fixed.inset-0 .card')].at(-1);
    const sel = dlg.querySelectorAll('select')[1];
    const values = [...sel.options].map((o) => o.value).filter(Boolean);
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    set.call(sel, values[0]); sel.dispatchEvent(new Event('change', { bubbles: true }));
    return values;
  });
  await sleep(200);
  await page.type('body > .fixed.inset-0 .card textarea', 'Έλεγχος εγγράφων και καταχώρηση');
  await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Παράδοση').at(-1).click());
  await sleep(1800);
  const log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Handover: case updated with the new next-action owner', log.some((l) => l.method === 'PATCH' && l.table === 'cases' && l.body.next_action_owner_id === opts[0]));
  check('Handover: recorded on the shared timeline', log.some((l) => l.method === 'POST' && l.table === 'timeline_events' && l.body.activity_type === 'assignment'));
  await click(page, 'Χάθηκε'); await sleep(500);
  const dis = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Επιβεβαίωση').disabled);
  check('Closing as Χάθηκε requires a reason', dis === true);
  await browser.close();
}

/* ---- 11. Field day: order, GPS-less fallback, check-in, outcome-gated check-out ---- */
{
  const { browser, page } = await launch(390, 844);
  await signInAs(page, 'field_sales');
  await page.evaluate(() => { const el = [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Ημέρα μου')); el && el.click(); });
  await sleep(2000);
  const main = () => page.evaluate(() => document.querySelector('main').innerText);
  const t = await main();
  check('Field: next visit shown first with call and check-in', t.includes('Επόμενη επίσκεψη') && t.includes('Πέτρος Νικολάου') && t.includes('Κλήση') && t.includes('Check In'));
  check('Field: overdue visits from previous days listed separately', t.includes('Εκκρεμείς από προηγούμενες ημέρες'));
  check('Field: only my follow-ups (no other employees\' items)', !t.includes('Επιβεβαίωση προσφοράς'));
  await click(page, 'Check In'); await sleep(1800);
  check('Field: without GPS the server rejects and a labelled fallback is offered', (await main()).includes('Καταγραφή χωρίς GPS') && (await main()).includes('Δεν μετράει ως Check In'));
  await page.type('[aria-label="Αιτία καταγραφής χωρίς GPS"]', 'Χωρίς σήμα στο υπόγειο');
  await click(page, 'Καταγραφή χωρίς GPS'); await sleep(1800);
  let log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Field: fallback recorded as a case note, not a check-in', log.some((l) => l.method === 'POST' && l.table === 'timeline_events' && l.body.title === 'Επίσκεψη χωρίς επιβεβαίωση GPS'));
  await browser.close();

  const s2 = await launch(390, 844);
  const ctx = s2.browser.defaultBrowserContext();
  await ctx.overridePermissions('http://localhost:5199', ['geolocation']);
  await s2.page.setGeolocation({ latitude: 37.9838, longitude: 23.7275, accuracy: 12 });
  await signInAs(s2.page, 'field_sales');
  await s2.page.evaluate(() => { const el = [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Ημέρα μου')); el && el.click(); });
  await sleep(2000);
  await click(s2.page, 'Check In'); await sleep(2000);
  const t2 = await s2.page.evaluate(() => document.querySelector('main').innerText);
  check('Field: with GPS the check-in is accepted and the visit is in progress', t2.includes('Σε εξέλιξη') && t2.includes('Ολοκλήρωση επίσκεψης'));
  const disabled = await s2.page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Επιλέξτε αποτέλεσμα/.test(b.textContent)).disabled);
  check('Field: check-out blocked until an outcome is chosen', disabled === true);
  await click(s2.page, 'Υπογραφή / συλλογή εγγράφων', '[role="radio"]');
  await s2.page.type('[aria-label="Σημειώσεις επίσκεψης"]', 'Πήρα ΑΤ και λογαριασμό');
  await s2.page.evaluate(() => { const i = document.querySelector('input[type="datetime-local"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '2030-01-10T10:00'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(s2.page, 'Check Out'); await sleep(2200);
  log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Field: check-out sent with the outcome in the note', log.some((l) => l.table === 'field_checkout' && /Αποτέλεσμα: Υπογραφή/.test(l.body.p_notes)));
  check('Field: outcome stored on the visit', log.some((l) => l.method === 'PATCH' && l.table === 'case_visits' && l.body.result === 'Υπογραφή / συλλογή εγγράφων'));
  check('Field: next follow-up created on the case', log.some((l) => l.method === 'POST' && l.table === 'follow_ups'));
  const over = await s2.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Field: no horizontal overflow at 390px', over <= 0, `overflow=${over}`);
  await s2.browser.close();
}

/* ---- 12. Operations queue ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'back_office');
  await click(page, 'Λειτουργίες', '#shell-rail nav button'); await sleep(2000);
  const t = await page.evaluate(() => document.querySelector('main').innerText);
  check('Ops: one queue with blockers and days in stage (no stage columns)', t.includes('Λείπει: Ταυτότητα') && /στο στάδιο/.test(t) && !t.includes('Κενό — κανένα case εδώ'));
  check('Ops: only back-office stages (no Νέο/Προσφορά cases)', !/· Προσφορά ·|· Νέο ·/.test(t));
  await click(page, 'Με εκκρεμότητες', '[role="tab"]'); await sleep(300);
  const blockedRows = await page.$$eval('main li.atx-row', (r) => r.length);
  await click(page, 'Έτοιμα να προχωρήσουν', '[role="tab"]'); await sleep(300);
  const readyRows = await page.$$eval('main li.atx-row', (r) => r.length);
  check('Ops: filters split blocked and ready cases', blockedRows > 0 && readyRows > 0, `${blockedRows}/${readyRows}`);
  await click(page, 'Ολοκληρώθηκε', 'main button'); await sleep(600);
  await click(page, 'Επιβεβαίωση'); await sleep(1800);
  const log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Ops: ready case advanced through the confirmed stage change', log.some((l) => l.method === 'PATCH' && l.table === 'cases' && l.body.current_stage === 'completed'));
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
