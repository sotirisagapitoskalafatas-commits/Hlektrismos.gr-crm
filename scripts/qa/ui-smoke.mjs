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
  // Back Office reviews and distributes B2B prospects (phase3/08), so it sees B2B Prospecting.
  back_office: { must: ['Αρχική', 'Η εργασία μου', 'Λειτουργίες', 'Cases', 'Διαχείριση', 'B2B Prospecting'], mustNot: ['Αυτοματισμοί', 'AI Εργατικό Δυναμικό', 'Leads', 'Χάρτης'] },
};

/* ---- 1. per-role navigation + role simulator ---- */
for (const role of Object.keys(EXPECT)) {
  const { browser, page, errors } = await launch(1440, 900);
  await signInAs(page, role);
  const nav = await text(page, '#shell-rail nav button');
  const label = (n) => nav.some((t) => t.startsWith(n));
  for (const m of EXPECT[role].must) check(`${role}: nav shows «${m}»`, label(m));
  for (const m of EXPECT[role].mustNot) check(`${role}: nav hides «${m}»`, !label(m));
  // The demo selector exists only in the account menu, only for the server-allowlisted admin (mock: admin).
  await page.evaluate(() => document.querySelector('[aria-label="Λογαριασμός"]')?.click());
  await sleep(500);
  const menu = await page.evaluate(() => document.querySelector('[role="menu"]')?.innerText ?? '');
  check(`${role}: account menu = identity, real role, Λογαριασμός, Προτιμήσεις, Κέντρο βοήθειας, Αποσύνδεση`,
    ['Λογαριασμός', 'Προτιμήσεις', 'Κέντρο βοήθειας', 'Αποσύνδεση', 'Ρόλος'].every((t) => menu.includes(t)) && !/\bsim\b|πραγματικός/.test(menu));
  check(`${role}: demo role selector ${role === 'admin' ? 'shown (allowed)' : 'absent'}`, (role === 'admin') === menu.includes('Επίδειξη ρόλου'));
  await page.evaluate(() => document.querySelector('.fixed.inset-0.z-40')?.click());
  await click(page, 'Προτιμήσεις');
  await sleep(700);
  check(`${role}: no role simulator on Preferences`, !(await page.evaluate(() => document.body.innerText.includes('Προσομοίωση ρόλου'))));
  check(`${role}: no unexpected console errors`, errors.filter((e) => !/fetchPriority|fetchpriority|Failed to load resource/.test(e)).length === 0, errors.slice(0, 1).join('|'));
  await browser.close();
}

/* ---- 2. a tampered override must NOT escalate a non-admin ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await page.evaluate(() => { localStorage.setItem('atlas.role.override', 'admin'); sessionStorage.setItem('atlas.preview.role', 'admin'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const nav = await text(page, '#shell-rail nav button');
  check('inside_sales with stored admin override: admin items stay hidden', !nav.some((t) => ADMIN_ONLY.some((a) => t.startsWith(a))));
  check('inside_sales with stored preview: no preview banner', !(await page.evaluate(() => document.body.innerText.includes('ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΡΟΛΟΥ'))));
  await browser.close();
}

/* ---- 2b. Role preview (presentation): banner, read-only, exit, expiry ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'admin');
  await sleep(1200);
  await page.evaluate(() => document.querySelector('[aria-label="Λογαριασμός"]')?.click());
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="radio"]')].find((b) => b.textContent.includes('Back Office'))?.click());
  await sleep(1500);
  const body = () => page.evaluate(() => document.body.innerText);
  check('Preview: banner says DEMO, real role and read-only', /ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΡΟΛΟΥ — DEMO/.test(await body()) && (await body()).includes('Πραγματικός ρόλος: Διαχειριστής') && (await body()).includes('μόνο ανάγνωση'));
  const nav = await text(page, '#shell-rail nav button');
  check('Preview: navigation shows the Back Office view', nav.some((t) => t.startsWith('Λειτουργίες')) && !nav.some((t) => t.startsWith('Leads')));
  let log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Preview: start recorded on the server (audited)', log.some((l) => l.table === 'role_preview_event' && l.body.p_action === 'start' && l.body.p_role === 'back_office'));
  // a write while previewing never leaves the browser
  await click(page, 'Διαχείριση', '#shell-rail nav button');
  await sleep(1500);
  await page.evaluate(() => document.querySelector('[data-staff="bo2@example.invalid"] button[title="Επεξεργασία"]')?.click());
  await sleep(800);
  await page.evaluate(() => { const i = [...document.querySelectorAll('input.field')][0]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Αλλαγμένο Όνομα'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(page, 'Αποθήκευση');
  await sleep(1200);
  log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Preview: writes are blocked before reaching the server', !log.some((l) => l.table === 'staff_update') && (await body()).includes('μόνο ανάγνωση'));
  await page.keyboard.press('Escape');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Άκυρο')?.click());
  await click(page, 'Επιστροφή στον πραγματικό ρόλο');
  await sleep(1200);
  log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Preview: exit restores the real role and is audited', !(await body()).includes('ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΡΟΛΟΥ') && log.some((l) => l.table === 'role_preview_event' && l.body.p_action === 'end'));
  // after expiry the selector disappears and a stored preview is ignored (server says no)
  await page.evaluate(() => sessionStorage.setItem('atlas.preview.role', 'field_sales'));
  await fetch('http://127.0.0.1:54399/__preview?state=expired');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await page.evaluate(() => document.querySelector('[aria-label="Λογαριασμός"]')?.click());
  await sleep(400);
  check('Preview expired: selector gone and stored preview ignored', !(await body()).includes('Επίδειξη ρόλου') && !(await body()).includes('ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΡΟΛΟΥ'));
  await fetch('http://127.0.0.1:54399/__preview?state=on');
  await browser.close();
}

/* ---- 2c. Admin Center: tabs per role, honest security, user management ---- */
{
  const tabsOf = async (page) => page.evaluate(() => [...document.querySelectorAll('[role="tablist"][aria-label="Ενότητες διαχείρισης"] [role="tab"]')].map((t) => t.textContent.trim()));
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'admin');
  await click(page, 'Διαχείριση', '#shell-rail nav button');
  await sleep(1500);
  const tabs = await tabsOf(page);
  check('Admin Center (admin): 8 grouped tabs', ['Επισκόπηση', 'Χρήστες & Ρόλοι', 'Δικαιώματα', 'Cases & Ροή εργασίας', 'Έγγραφα', 'B2B Scraper', 'Ασφάλεια & Έλεγχοι', 'Audit Log'].every((t) => tabs.includes(t)), tabs.join(','));
  check('Admin Center: no unverified green claims', !(await page.evaluate(() => /Όλα τα tables προστατεύονται|Ιδιωτικό bucket μόνο για staff|Role-check policies/.test(document.body.innerText))));
  await click(page, 'Ασφάλεια & Έλεγχοι', '[role="tab"]');
  await sleep(500);
  check('Security: unverified items are labelled «Δεν έχει επαληθευτεί ζωντανά»', await page.evaluate(() => document.querySelectorAll('[data-status="unverified"]').length >= 4 && document.body.innerText.includes('Δεν έχει επαληθευτεί ζωντανά')));
  check('Security: the profile self-promotion finding is flagged', await page.evaluate(() => document.querySelector('[data-check="profiles-self-promotion"]')?.getAttribute('data-status') === 'action'));
  await click(page, 'Χρήστες & Ρόλοι', '[role="tab"]');
  await sleep(1200);
  check('Users: directory with e-mail and status; no actions on your own row', await page.evaluate(() => !!document.querySelector('[data-staff="manager@example.invalid"]') && !document.querySelector('[data-staff="admin@example.invalid"] button[title="Διαγραφή"]')));
  // create (invite)
  await click(page, 'Νέος χρήστης');
  await sleep(500);
  await page.evaluate(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const ins = [...document.querySelectorAll('input.field')];
    set(ins[0], 'Δοκιμαστικός Χρήστης'); set(ins[1], 'new.staff@example.invalid');
    [...document.querySelectorAll('[role="radiogroup"][aria-label="Ρόλος"] [role="radio"]')].find((b) => b.querySelector('span')?.textContent.trim() === 'Field Sales')?.click();
  });
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Δημιουργία')?.click());
  await sleep(1500);
  let log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  const created = log.filter((l) => l.table === 'admin-users').pop();
  check('Users: create sends role + invite to the admin-users function (no password)', created?.body?.action === 'create' && created.body.role === 'field_sales' && created.body.mode === 'invite' && !created.body.password);
  check('Users: new account appears after re-reading the directory', await page.evaluate(() => !!document.querySelector('[data-staff="new.staff@example.invalid"]')));
  // delete someone with CRM history → refused, deactivation offered
  await page.evaluate(() => document.querySelector('[data-staff="inside_sales@example.invalid"] button[title="Διαγραφή"]')?.click());
  await sleep(800);
  check('Users: deleting someone with CRM history is refused (deactivate instead)', await page.evaluate(() => document.body.innerText.includes('εγγραφές του CRM') && !![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Απενεργοποίηση')));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Απενεργοποίηση')?.click());
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Απενεργοποίηση').pop()?.click());
  await sleep(1200);
  log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Users: deactivation goes through staff_set_active', log.some((l) => l.table === 'staff_set_active' && l.body.p_active === false));
  // delete the new account (no history) with typed confirmation
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === 'Όλοι')?.click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('[data-staff="new.staff@example.invalid"] button[title="Διαγραφή"]')?.click());
  await sleep(800);
  const delBtnDisabled = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Οριστική διαγραφή'))?.disabled);
  await page.evaluate(() => { const i = [...document.querySelectorAll('input.field')].pop(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'new.staff@example.invalid'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Οριστική διαγραφή'))?.click());
  await sleep(1500);
  check('Users: permanent delete needs the typed e-mail and removes the account', delBtnDisabled === true && !(await page.evaluate(() => !!document.querySelector('[data-staff="new.staff@example.invalid"]'))));
  await click(page, 'Audit Log', '[role="tab"]');
  await sleep(1000);
  check('Audit Log: create / deactivate / delete are listed', await page.evaluate(() => ['Δημιουργία χρήστη', 'Απενεργοποίηση', 'Οριστική διαγραφή'].every((t) => document.body.innerText.includes(t))));
  await browser.close();
}
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'manager');
  await click(page, 'Διαχείριση', '#shell-rail nav button');
  await sleep(1200);
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === 'Χρήστες & Ρόλοι')?.click());
  await sleep(1000);
  await click(page, 'Νέος χρήστης');
  await sleep(500);
  const opts = await page.evaluate(() => [...document.querySelectorAll('[role="radiogroup"][aria-label="Ρόλος"] [role="radio"]')].map((b) => b.textContent));
  check('Manager: can create only Inside Sales / Field Sales / Back Office', opts.length === 3 && !opts.some((o) => /Διαχειριστής|Διευθυντής/.test(o)), opts.join('|'));
  check('Manager: no actions on admin rows', await page.evaluate(() => !document.querySelector('[data-staff="admin@example.invalid"] button[title="Επεξεργασία"]')));
  await browser.close();
}
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'back_office');
  await click(page, 'Διαχείριση', '#shell-rail nav button');
  await sleep(1500);
  const roles = await page.evaluate(() => [...document.querySelectorAll('[data-staff] .atx-role')].map((x) => x.textContent));
  check('Back Office: sees and manages Back Office colleagues only', roles.length >= 1 && roles.every((r) => r === 'Back Office') && (await page.evaluate(() => !document.body.innerText.includes('Ασφάλεια & Έλεγχοι'))), roles.join(','));
  await browser.close();
}
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await click(page, 'Λογαριασμός', '#shell-rail nav button');
  await sleep(1000);
  const t = await page.evaluate(() => document.body.innerText);
  check('Account page: real role read-only with the administrator note; no role list', t.includes('Ο ρόλος και τα δικαιώματά σας ορίζονται από τον διαχειριστή.') && !t.includes('τρέχων'));
  await browser.close();
}

/* ---- 2d. Κάδος: trash, restore, permanent delete (admin), refusals ---- */
{
  const fill = (page, v) => page.evaluate((val) => { const i = [...document.querySelectorAll('input.field')].pop(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const btn = (page, label) => page.evaluate((l) => { const b = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim().includes(l) && x.offsetParent).pop(); b?.click(); return !!b; }, label);
  const leadsAll = async (page) => { await click(page, 'Leads', '#shell-rail nav button'); await sleep(1000); await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => /^🗂️?\s*Όλα/.test(b.textContent.trim()) || b.textContent.trim().startsWith('Όλα'))?.click()); await sleep(500); };
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'inside_sales');
    await leadsAll(page);
    check('Trash: inside sales has no delete button', await page.evaluate(() => !document.querySelector('button[title="Διαγραφή (μεταφορά στον κάδο)"]')));
    await browser.close();
  }
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'admin');
  await leadsAll(page);
  await page.evaluate(() => document.querySelector('button[aria-label="Διαγραφή Δοκιμαστικό Lead 2"]')?.click());
  await sleep(500);
  await fill(page, 'Διπλότυπο');
  await btn(page, 'Μεταφορά στον κάδο');
  await sleep(1500);
  let log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  const trashed = log.filter((l) => l.table === 'trash_record').pop();
  check('Trash: lead moved to trash through trash_record with the reason', trashed?.body?.p_type === 'lead' && trashed.body.p_reason === 'Διπλότυπο');
  check('Trash: trashed lead disappears from the list', !(await page.evaluate(() => document.querySelector('main').innerText.includes('Δοκιμαστικό Lead 2'))));
  await click(page, 'Διαχείριση', '#shell-rail nav button');
  await sleep(1200);
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === 'Κάδος')?.click());
  await sleep(1000);
  check('Trash: listed in Admin Center → Κάδος with reason and who deleted it', await page.evaluate(() => { const r = document.querySelector('[data-trash="Δοκιμαστικό Lead 2"]'); return !!r && r.innerText.includes('Διπλότυπο') && r.innerText.includes('Μαρία'); }));
  await page.evaluate(() => [...document.querySelectorAll('[data-trash="Δοκιμαστικό Lead 2"] button')].find((b) => b.textContent.includes('Επαναφορά'))?.click());
  await sleep(1200);
  check('Trash: restore removes it from the trash', await page.evaluate(() => !document.querySelector('[data-trash="Δοκιμαστικό Lead 2"]')));
  await leadsAll(page);
  check('Trash: restored lead is back in the list', await page.evaluate(() => document.querySelector('main').innerText.includes('Δοκιμαστικό Lead 2')));
  // trash again, then delete permanently (typed confirmation)
  await page.evaluate(() => document.querySelector('button[aria-label="Διαγραφή Δοκιμαστικό Lead 2"]')?.click());
  await sleep(400);
  await btn(page, 'Μεταφορά στον κάδο');
  await sleep(1200);
  // and a converted lead (has a case) → can be trashed but not purged
  await page.evaluate(() => document.querySelector('button[aria-label="Διαγραφή Δοκιμαστικό Lead 8"]')?.click());
  await sleep(400);
  await btn(page, 'Μεταφορά στον κάδο');
  await sleep(1200);
  await click(page, 'Διαχείριση', '#shell-rail nav button');
  await sleep(1000);
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === 'Κάδος')?.click());
  await sleep(1000);
  await page.evaluate(() => [...document.querySelectorAll('[data-trash="Δοκιμαστικό Lead 8"] button')].find((b) => b.textContent.includes('Οριστική'))?.click());
  await sleep(500);
  check('Trash: a lead with a case cannot be deleted permanently (history kept)', await page.evaluate(() => document.body.innerText.includes('Δεν επιτρέπεται: η εγγραφή συνδέεται με 1 cases') && ![...document.querySelectorAll('[role="dialog"] button, .card button')].some((b) => b.textContent.trim() === 'Οριστική διαγραφή' && !b.closest('tr'))));
  await btn(page, 'Άκυρο');
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll('[data-trash="Δοκιμαστικό Lead 2"] button')].find((b) => b.textContent.includes('Οριστική'))?.click());
  await sleep(500);
  const disabledFirst = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Οριστική διαγραφή' && !b.closest('tr')).pop()?.disabled);
  await fill(page, 'Δοκιμαστικό Lead 2');
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Οριστική διαγραφή' && !b.closest('tr')).pop()?.click());
  await sleep(1500);
  log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Trash: permanent delete needs the typed name, then purges and leaves the trash', disabledFirst === true && log.some((l) => l.table === 'purge_record' && l.body.p_type === 'lead')
    && (await page.evaluate(() => !document.querySelector('[data-trash="Δοκιμαστικό Lead 2"]'))));
  // customer with open cases → refused with a clear reason
  await click(page, 'Πελάτες', '#shell-rail nav button');
  await sleep(1000);
  await page.evaluate(() => document.querySelector('button[aria-label^="Διαγραφή Αθηνά"]')?.click());
  await sleep(400);
  await btn(page, 'Μεταφορά στον κάδο');
  await sleep(1000);
  check('Trash: customer with open cases is refused with the reason', await page.evaluate(() => /έχει \d+ ανοιχτά cases/.test(document.body.innerText)));
  await browser.close();
  {
    const m = await launch(1440, 900);
    await signInAs(m.page, 'manager');
    await click(m.page, 'Διαχείριση', '#shell-rail nav button');
    await sleep(1000);
    await m.page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === 'Κάδος')?.click());
    await sleep(1000);
    check('Trash: manager can restore but has no permanent delete', await m.page.evaluate(() => !![...document.querySelectorAll('[data-trash] button')].find((b) => b.textContent.includes('Επαναφορά')) && ![...document.querySelectorAll('[data-trash] button')].some((b) => b.textContent.includes('Οριστική'))));
    // leave the shared mock as we found it: the manager restores Lead 8 (used by later sections)
    await m.page.evaluate(() => [...document.querySelectorAll('[data-trash="Δοκιμαστικό Lead 8"] button')].find((b) => b.textContent.includes('Επαναφορά'))?.click());
    await sleep(1200);
    check('Trash: manager restore works', await m.page.evaluate(() => !document.querySelector('[data-trash="Δοκιμαστικό Lead 8"]')));
    await m.browser.close();
  }
}

/* ---- 2e. Case workflow: server document gates, override, Back Office return & resubmit ---- */
{
  const M = 'http://127.0.0.1:54399';
  await fetch(`${M}/__gates?state=on&mode=warn`);
  const openCaseNo = async (page, no) => {
    await click(page, 'Cases', '#shell-rail nav button');
    await sleep(1200);
    await page.evaluate((n) => { const el = [...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === n && e.offsetParent)[0]; el && el.click(); }, no);
    await sleep(1600);
  };
  // the forward-stage actions under the «Πορεία» stepper
  const pickStep = (page, label) => page.evaluate((l) => { const b = [...document.querySelectorAll('main button.atx-btn')].find((x) => x.textContent.trim() === l && !x.disabled); b?.click(); return !!b; }, label);
  const body = (page) => page.evaluate(() => document.body.innerText);
  const setVal = (page, sel, v) => page.evaluate((q, val) => { const el = document.querySelector(q); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
  // 0a) default «warn»: missing documents are listed, the move is allowed («Συνέχεια με ελλείψεις»)
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await openCaseNo(page, 'CS-2026-005'); // «Υπογραφή»
    await pickStep(page, 'Έλεγχος εγγράφων');
    await sleep(900);
    const t = await body(page);
    const go = await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Συνέχεια με ελλείψεις' && !b.disabled));
    check('Gates (warn, default): missing documents listed but the handover to Back Office is allowed', t.includes('Λείπουν έγγραφα — η μετάβαση επιτρέπεται') && t.includes('Ταυτότητα — εμπρός όψη — λείπει') && go && !t.includes('Δεν μπορεί να προχωρήσει ακόμη'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Άκυρο')?.click());
    await browser.close();
  }
  // 0b) admin sees the per-stage setting (all «Προειδοποίηση») and switches one stage through set_stage_gate_mode
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'admin');
    await click(page, 'Διαχείριση', '#shell-rail nav button');
    await sleep(1200);
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === 'Έγγραφα')?.click());
    await sleep(1200);
    const modes = await page.evaluate(() => [...document.querySelectorAll('[data-gate-modes] [data-gate]')].map((li) => li.querySelector('[aria-checked="true"]')?.textContent.trim()));
    await page.evaluate(() => [...document.querySelectorAll('[data-gate="submitted"] [role="radio"]')].find((b) => b.textContent.trim() === 'Μπλοκάρισμα')?.click());
    await sleep(1200);
    const log = await (await fetch(`${M}/__log`)).json();
    check('Gates: every stage ships as «Προειδοποίηση»; the admin switch goes through set_stage_gate_mode', modes.length === 4 && modes.every((m) => m === 'Προειδοποίηση')
      && log.some((l) => l.table === 'set_stage_gate_mode' && l.body.p_stage === 'submitted' && l.body.p_mode === 'block'), JSON.stringify(modes));
    await browser.close();
  }
  await fetch(`${M}/__gates?state=on&mode=block`);
  // 1) Back Office: blocked by the server, sees what is missing, no override
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await openCaseNo(page, 'CS-2026-005'); // «Υπογραφή»
    const opened = await pickStep(page, 'Έλεγχος εγγράφων');
    await sleep(900);
    const t = await body(page);
    check('Gates: the stage action exists for Back Office', opened);
    check('Gates: moving to «Έλεγχος εγγράφων» without documents shows the server blockers', t.includes('Δεν μπορεί να προχωρήσει ακόμη') && t.includes('Ταυτότητα — εμπρός όψη — λείπει'));
    check('Gates: no confirm and no override for Back Office', await page.evaluate(() => ![...document.querySelectorAll('button')].some((b) => ['Επιβεβαίωση', 'Παράκαμψη & μετάβαση'].includes(b.textContent.trim()))));
    await browser.close();
  }
  // 2) Admin: override with a written reason
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'admin');
    await openCaseNo(page, 'CS-2026-005');
    await pickStep(page, 'Έλεγχος εγγράφων');
    await sleep(900);
    const disabled = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Παράκαμψη & μετάβαση')?.disabled);
    await setVal(page, '#override-reason', 'Ο πάροχος δέχεται τα έγγραφα μέσα στην εβδομάδα');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Παράκαμψη & μετάβαση')?.click());
    await sleep(1500);
    const log = await (await fetch(`${M}/__log`)).json();
    check('Gates: admin override needs a reason, goes through change_case_stage_override and moves the case', disabled === true
      && log.some((l) => l.table === 'change_case_stage_override' && l.body.p_stage === 'document_check' && l.body.p_reason.length >= 10)
      && (await body(page)).includes('με παράκαμψη'));
    await browser.close();
  }
  // 3) Back Office returns CS-2026-006 («Έλεγχος εγγράφων») for correction
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await openCaseNo(page, 'CS-2026-006');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Επιστροφή για διόρθωση')?.click());
    await sleep(600);
    const submitDisabled = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.includes('Επιστροφή για διόρθωση')).pop()?.disabled);
    await setVal(page, '#return-reason', 'Λείπει η υπογραφή στη σελίδα 2 και ο λογαριασμός είναι παλιός');
    await sleep(200);
    const toField = await page.evaluate(() => [...document.querySelectorAll('[role="radiogroup"][aria-label="Επιστροφή σε"] [role="radio"]')].find((b) => b.getAttribute('aria-checked') === 'true')?.textContent.includes('Field Sales'));
    await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.includes('Επιστροφή για διόρθωση')).pop()?.click());
    await sleep(1500);
    const log = await (await fetch(`${M}/__log`)).json();
    const r = log.filter((l) => l.table === 'return_case_for_correction').pop();
    check('Return: needs a reason; missing items preselected; signature → Field Sales by default', submitDisabled === true && toField === true && r?.body?.p_to_team === 'field_sales' && r.body.p_items.length >= 1);
    check('Return: banner on the case, same stage, no second return', (await body(page)).includes('Επιστράφηκε για διόρθωση → Field Sales')
      && (await body(page)).includes('Έλεγχος εγγράφων') && !(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Επιστροφή για διόρθωση'))));
    await click(page, 'Λειτουργίες', '#shell-rail nav button');
    await sleep(1500);
    check('Return: Λειτουργίες shows the case waits on Field Sales', (await body(page)).includes('Επιστράφηκε για διόρθωση σε Field Sales'));
    await browser.close();
  }
  // 4) Field Sales resubmits
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'field_sales');
    await openCaseNo(page, 'CS-2026-006');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Επανυποβολή στο Back Office'))?.click());
    await sleep(400);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Επανυποβολή')?.click());
    await sleep(1500);
    const log = await (await fetch(`${M}/__log`)).json();
    check('Return: the receiving team resubmits to Back Office; banner disappears', log.some((l) => l.table === 'resubmit_returned_case') && !(await page.evaluate(() => !!document.querySelector('[data-returned]'))));
    await browser.close();
  }
  await fetch(`${M}/__gates?state=off&mode=warn`);
}

/* ---- 2f. B2B: discover → review → distribute (never leads directly, never outreach) ---- */
{
  const M = 'http://127.0.0.1:54399';
  const openB2B = async (page) => { await click(page, 'B2B Prospecting', '#shell-rail nav button'); await sleep(1200); };
  const tabTo = (page, t) => page.evaluate((x) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim().startsWith(x))?.click(), t);
  const setInput = (page, idx, v) => page.evaluate((i, val) => { const el = [...document.querySelectorAll('input.field')][i]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, idx, v);
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'field_sales');
    const nav = await text(page, '#shell-rail nav button');
    check('B2B: field sales has no prospecting', !nav.some((t) => t.startsWith('B2B Prospecting')));
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'inside_sales');
    await openB2B(page);
    const leadsBefore = (await (await fetch(`${M}/__log`)).json()).filter((l) => l.method === 'POST' && l.table === 'leads').length;
    await setInput(page, 0, 'Γλυφάδα, Βούλα');
    await page.evaluate(() => [...document.querySelectorAll('[aria-label="Κατηγορίες"] button')].find((b) => b.textContent.includes('Εστιατόρια'))?.click());
    await sleep(200);
    const preview = await page.evaluate(() => document.body.innerText.match(/(\d+) αναζητήσεις/)?.[1]);
    await page.evaluate(() => [...document.querySelectorAll('button.atx-btn-primary')].find((b) => b.textContent.trim() === 'Αναζήτηση')?.click());
    await sleep(1500);
    const log = await (await fetch(`${M}/__log`)).json();
    const call = log.filter((l) => l.table === 'scrape-b2b').pop();
    check('B2B: multi-select search (2 categories × 2 cities = 4 searches) goes to scrape-b2b', preview === '4' && call?.body?.categories?.length === 2 && call.body.cities.length === 2);
    check('B2B: results go to the review queue, not to leads', (await page.evaluate(() => document.querySelector('[data-outcome="ok"]')?.innerText ?? '')).includes('νέες για έλεγχο')
      && log.filter((l) => l.method === 'POST' && l.table === 'leads').length === leadsBefore);
    await tabTo(page, 'Έλεγχος');
    await sleep(1000);
    check('B2B: inside sales sees the queue but cannot approve', (await page.evaluate(() => document.querySelectorAll('[data-prospect]').length)) >= 8
      && (await page.evaluate(() => { document.querySelector('[data-prospect] input[type="checkbox"]')?.click(); return ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Έγκριση'); })));
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await openB2B(page);
    await tabTo(page, 'Έλεγχος');
    await sleep(1000);
    check('B2B: duplicate of an existing lead is flagged', (await page.evaluate(() => document.body.innerText)).includes('Υπάρχει ήδη ως lead (ίδιο τηλέφωνο)'));
    // exclude the flagged one with a reason
    await page.evaluate(() => [...document.querySelectorAll('[data-prospect]')].find((r) => r.innerText.includes('Υπάρχει ήδη'))?.querySelector('input[type="checkbox"]')?.click());
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Εξαίρεση')?.click());
    await sleep(400);
    const disabled = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Επιβεβαίωση')?.disabled);
    await page.evaluate((val) => { const el = [...document.querySelectorAll('input.field')].pop(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, 'Υπάρχει ήδη ως πελάτης μας');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Επιβεβαίωση')?.click());
    await sleep(1000);
    let log = await (await fetch(`${M}/__log`)).json();
    check('B2B: exclusion needs a reason and goes through b2b_review', disabled === true && log.some((l) => l.table === 'b2b_review' && l.body.p_action === 'exclude' && l.body.p_reason.length >= 3));
    // approve three
    await page.evaluate(() => [...document.querySelectorAll('[data-prospect] input[type="checkbox"]')].slice(0, 3).forEach((b) => b.click()));
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Έγκριση')?.click());
    await sleep(1000);
    await tabTo(page, 'Ανάθεση');
    await sleep(1500);
    check('B2B: approved businesses wait in «Ανάθεση»', (await page.evaluate(() => document.querySelectorAll('[data-prospect]').length)) === 3);
    await page.evaluate(() => document.querySelector('[data-prospect] input[type="checkbox"]')?.closest('table')?.querySelector('thead input[type="checkbox"]')?.click());
    await page.evaluate(() => [...document.querySelectorAll('[aria-label="Πωλητές"] label')].forEach((l) => l.querySelector('input')?.click()));
    await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes('Εκ περιτροπής'))?.click());
    await sleep(200);
    await page.evaluate(() => [...document.querySelectorAll('button.atx-btn-primary')].find((b) => b.textContent.includes('Ανάθεση'))?.click());
    await sleep(1500);
    log = await (await fetch(`${M}/__log`)).json();
    const d = log.filter((l) => l.table === 'b2b_distribute').pop();
    check('B2B: round-robin distribution to two agents through b2b_distribute', d?.body?.p_mode === 'round_robin' && d.body.p_agents.length === 2 && d.body.p_ids.length === 3);
    check('B2B: nothing left to assign; no message was sent', (await page.evaluate(() => document.querySelectorAll('[data-prospect]').length)) === 0
      && !log.some((l) => /send-campaign|send-sms|make-voice-call|send-email/.test(l.table ?? '')));
    await tabTo(page, 'Ιστορικό');
    await sleep(1000);
    check('B2B: search history shows who, what and counts', (await page.evaluate(() => document.body.innerText)).includes('Ελένη Δημητρίου'));
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'inside_sales');
    await click(page, 'Leads', '#shell-rail nav button');
    await sleep(1200);
    check('B2B: the assigned business appears as a B2B lead for the agent', (await page.evaluate(() => document.querySelector('main').innerText)).includes('Δοκιμαστική Επιχείρηση'));
    await browser.close();
  }
}

/* ---- 2g. Contact eligibility: «μπορώ να καλέσω;» before any sales contact (phase3/09; display only, nothing is sent) ---- */
{
  const M = 'http://127.0.0.1:54399';
  const MODAL = '.fixed.inset-0.z-50';
  const openLead = async (page, name) => {
    await click(page, 'Leads', '#shell-rail nav button');
    await sleep(1200);
    await page.evaluate((n) => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === n)?.click(), name);
    await sleep(1800);
  };
  const row = (page, ch) => page.evaluate((c) => { const r = document.querySelector(`[data-contact-eligibility] [data-channel="${c}"]`); return r ? { allowed: r.dataset.allowed, text: r.innerText } : null; }, ch);
  const cardButton = (page, label) => page.evaluate((l) => [...document.querySelectorAll('[data-contact-eligibility] button')].some((b) => b.textContent.trim() === l), label);
  const pressCard = (page, label) => page.evaluate((l) => [...document.querySelectorAll('[data-contact-eligibility] button')].find((b) => b.textContent.trim() === l)?.click(), label);
  const modalInput = (page, idx, v) => page.evaluate((m, i, val) => { const el = [...document.querySelectorAll(`${m} input.field`)][i]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, MODAL, idx, v);
  const modalButton = (page, label) => page.evaluate((m, l) => { const b = [...document.querySelectorAll(`${m} button`)].find((x) => x.textContent.trim() === l); if (!b) return 'missing'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; }, MODAL, label);
  const rpc = async (name) => (await (await fetch(`${M}/__log`)).json()).filter((l) => l.table === name).pop();

  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'inside_sales');
    await openLead(page, 'Δοκιμαστικό Lead 1');
    const call = await row(page, 'call');
    check('Contact: lead shows «Επικοινωνία & συγκαταθέσεις»; a sales call needs the Article 11 check first', call?.allowed === 'no' && call.text.includes('μητρώο του Άρθρου 11'));
    const email = await row(page, 'email');
    check('Contact: promotional email needs recorded consent; automated sends shown as closed system-wide',
      email?.allowed === 'no' && email.text.includes('συγκατάθεση') && (await page.evaluate(() => document.querySelector('[data-contact-eligibility]').innerText.includes('κλειστές σε όλο το σύστημα'))));
    check('Contact: inside sales cannot record consent or register checks', !(await cardButton(page, 'Καταγραφή συγκατάθεσης')) && !(await cardButton(page, 'Έλεγχος Άρθρου 11')));
    await pressCard(page, 'Δεν θέλει επικοινωνία');
    await sleep(400);
    const before = await modalButton(page, 'Καταγραφή');
    await modalInput(page, 0, 'Μην με ξαναπάρετε για προσφορές');
    await sleep(150);
    await modalButton(page, 'Καταγραφή');
    await sleep(1200);
    const o = await rpc('record_contact_objection');
    check('Contact: anyone on staff records «δεν θέλει επικοινωνία» (reason required) through record_contact_objection',
      before === 'disabled' && o?.body?.p_scope === 'marketing' && o.body.p_channels === null && o.body.p_phone === '+30 6910000010' && o.body.p_lead_id?.endsWith('01'),
      JSON.stringify({ before, body: o?.body }));
    const after = await row(page, 'call');
    check('Contact: the objection shows at once and stops calls', after?.allowed === 'no' && after.text.includes('δεν θέλει επικοινωνία')
      && (await page.$$('[data-contact-eligibility] [data-objection]')).length === 1
      && (await page.evaluate(() => document.querySelector('[data-contact-eligibility] [data-objection]').innerText.includes('τηλέφωνο + email'))));
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'manager');
    await openLead(page, 'Δοκιμαστικό Lead 3');
    await pressCard(page, 'Έλεγχος Άρθρου 11');
    await sleep(400);
    await modalButton(page, 'Καταγραφή');
    await sleep(1200);
    const a = await rpc('record_article11_screening');
    const call = await row(page, 'call');
    check('Contact: manager records an Article 11 screening; the «not screened» block clears', a?.body?.p_result === 'not_listed' && a.body.p_register_source.includes('Άρθρου 11')
      && !call.text.includes('μητρώο του Άρθρου 11') && (await page.evaluate(() => document.querySelector('[data-contact-eligibility]').innerText.includes('δεν είναι εγγεγραμμένος'))),
      JSON.stringify({ a: a?.body, call }));
    await pressCard(page, 'Καταγραφή συγκατάθεσης');
    await sleep(400);
    const noEvidence = await modalButton(page, 'Καταγραφή');
    await page.evaluate((m) => { const sel = document.querySelector(`${m} select.field`); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'email'); sel.dispatchEvent(new Event('change', { bubbles: true })); }, MODAL);
    await modalInput(page, 0, 'Έντυπο 0042');
    await sleep(150);
    await modalButton(page, 'Καταγραφή');
    await sleep(1200);
    const c = await rpc('record_contact_consent');
    const email = await row(page, 'email');
    check('Contact: consent needs evidence; recorded consent for email clears the «no consent» reason', noEvidence === 'disabled' && c?.body?.p_channel === 'email'
      && c.body.p_evidence_ref === 'Έντυπο 0042' && !email.text.includes('καταγεγραμμένη συγκατάθεση'), JSON.stringify({ noEvidence, c: c?.body, email }));
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'admin');
    await openLead(page, 'Δοκιμαστικό Lead 1');
    await page.evaluate(() => [...document.querySelectorAll('[data-contact-eligibility] [data-objection] button')].find((b) => b.textContent.trim() === 'Άρση')?.click());
    await sleep(400);
    await modalInput(page, 0, 'Νέα έγγραφη συγκατάθεση 12/11, αρ. 0042');
    await sleep(150);
    await modalButton(page, 'Άρση');
    await sleep(1200);
    check('Contact: only the admin lifts an objection, with a reason', (await rpc('lift_contact_objection'))?.body?.p_reason?.length > 3
      && (await page.$$('[data-contact-eligibility] [data-objection]')).length === 0);
    await browser.close();
  }
  {
    const { browser, page } = await launch(390, 844);
    await signInAs(page, 'field_sales');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Πελάτες')?.click());
    await sleep(1200);
    await page.evaluate(() => document.querySelector('main button.atx-row-main')?.click());
    await sleep(1800);
    check('Contact: field sales sees the card on a customer (mobile) but cannot record consent',
      !!(await row(page, 'call')) && !(await cardButton(page, 'Καταγραφή συγκατάθεσης')) && (await cardButton(page, 'Δεν θέλει επικοινωνία'))
      && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
    const log = await (await fetch(`${M}/__log`)).json();
    check('Contact: nothing was sent while recording (no campaign/SMS/voice/email calls)', !log.some((l) => /send-campaign|send-sms|make-voice-call|send-email|send-offer/.test(l.table ?? '')));
    await browser.close();
  }
}

/* ---- 2h. Lead creation: name-only quick lead, specific error inside the dialog, edits send only changed fields ---- */
{
  const M = 'http://127.0.0.1:54399';
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await click(page, 'Leads', '#shell-rail nav button');
  await sleep(1200);
  const openNew = async () => { await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Νέο Lead')?.click()); await sleep(500); };
  const typeName = (v) => page.evaluate((val) => { const el = [...document.querySelectorAll('.fixed.inset-0.z-50 input.field')][0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const create = () => page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0.z-50 button')].find((b) => b.textContent.trim() === 'Δημιουργία')?.click());
  // 1) the server refuses (RLS) → the message is shown INSIDE the dialog, specific, and the dialog stays open
  await fetch(`${M}/__leadfail?code=42501`);
  await openNew();
  await typeName('Καφέ Αθηνά');
  await create();
  await sleep(1200);
  const errText = await page.evaluate(() => document.querySelector('.fixed.inset-0.z-50 [data-lead-error]')?.innerText ?? '');
  check('Leads: a refused save shows a specific Greek message inside the dialog', errText.includes('Δεν έχετε δικαίωμα') && !errText.includes('Failing row'), errText);
  // 2) retry: a name-only quick lead is saved (first_name derived, client_contact '' — the NOT NULL columns the old code sent as null)
  await create();
  const dialogOpen = () => page.evaluate(() => [...document.querySelectorAll('h2')].some((h) => h.textContent.trim() === 'Νέο Lead'));
  for (let i = 0; i < 25 && (await dialogOpen()); i++) await sleep(200);
  await sleep(500);
  const log = await (await fetch(`${M}/__log`)).json();
  const post = log.filter((l) => l.method === 'POST' && l.table === 'leads').pop();
  check('Leads: name-only quick lead is saved (no program, no phone/email needed)', post?.body?.first_name === 'Καφέ' && post.body.client_contact === '' && post.body.client_name === 'Καφέ Αθηνά' && post.body.program === null
    && !(await dialogOpen()) && (await page.evaluate(() => document.querySelector('main').innerText.includes('Καφέ Αθηνά'))));
  // 3) open it and edit only the phone → only changed fields (+ contact) are sent, no nulls in the name columns
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Καφέ Αθηνά')?.click());
  await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Επεξεργασία'))?.click());
  await sleep(500);
  await page.evaluate(() => { const el = [...document.querySelectorAll('.fixed.inset-0.z-50 input.field')][1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2101234567'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0.z-50 button')].find((b) => b.textContent.trim() === 'Αποθήκευση')?.click());
  await sleep(1500);
  const patch = (await (await fetch(`${M}/__log`)).json()).filter((l) => l.method === 'PATCH' && l.table === 'leads').pop();
  check('Leads: editing sends no nulls into the name columns and keeps client_contact in step', patch && patch.body.first_name === 'Καφέ' && patch.body.client_contact === '2101234567' && !Object.values(patch.body).includes(undefined)
    && !['first_name', 'client_name', 'client_contact'].some((k) => k in patch.body && patch.body[k] === null), JSON.stringify(patch?.body));
  await browser.close();
}

/* ---- 2i. Lead with documents → default Back Office assignee (a setting, staged phase4/12); partner field ---- */
{
  const M = 'http://127.0.0.1:54399';
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'admin');
    await click(page, 'Διαχείριση', '#shell-rail nav button');
    await sleep(1200);
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim().startsWith('Cases & Ροή'))?.click());
    await sleep(1200);
    const unset = await page.evaluate(() => document.querySelector('[data-bo-assignee] select')?.value === '');
    await page.evaluate(() => { const sel = document.querySelector('[data-bo-assignee] select'); const o = [...sel.options].find((x) => x.textContent.includes('Κατερίνα')); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, o.value); sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(200);
    await page.evaluate(() => [...document.querySelectorAll('[data-bo-assignee] button')].find((b) => b.textContent.trim() === 'Αποθήκευση')?.click());
    await sleep(1200);
    const log = await (await fetch(`${M}/__log`)).json();
    check('Leads+docs: the Back Office assignee is a setting pointing to a user (admin picks from Back Office users)', unset && log.some((l) => l.table === 'set_default_backoffice_assignee' && l.body.p_user === '10000000-0000-4000-8000-000000000005'));
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'inside_sales');
    await click(page, 'Leads', '#shell-rail nav button');
    await sleep(1200);
    await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Νέο Lead')?.click());
    await sleep(500);
    await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === 'Lead με έγγραφα')?.click());
    await sleep(300);
    const set = (idx, v) => page.evaluate((i, val) => { const el = [...document.querySelectorAll('.fixed.inset-0.z-50 input.field:not([type="file"])')][i]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, idx, v);
    await set(0, 'Φούρνος Δοκιμή');
    await set(3, 'Γιώργος Συνεργάτης'); // name, phone, email, partner
    const input = await page.$('[data-lead-files]');
    await input.uploadFile('C:/Users/kalaf/hlek/docs/product/screenshots/after/inside_sales-home-1440.jpg');
    await sleep(400);
    await page.evaluate(() => [...document.querySelectorAll('.fixed.inset-0.z-50 button')].find((b) => b.textContent.trim() === 'Δημιουργία')?.click());
    let route = null;
    for (let i = 0; i < 30 && !route; i++) { await sleep(250); route = (await (await fetch(`${M}/__log`)).json()).find((l) => l.table === 'route_lead_to_backoffice'); }
    await sleep(600);
    const log = await (await fetch(`${M}/__log`)).json();
    const post = log.filter((l) => l.method === 'POST' && l.table === 'leads').pop();
    const patch = log.filter((l) => l.method === 'PATCH' && l.table === 'leads' && l.body.attached_files).pop();
    check('Leads+docs: lead saved with the partner, file uploaded under the lead, then routed to Back Office', post?.body?.partner === 'Γιώργος Συνεργάτης'
      && patch?.body?.attached_files?.some((f) => f.path.startsWith('leads/')) && !!route, JSON.stringify({ partner: post?.body?.partner, files: patch?.body?.attached_files?.length, route: !!route }));
    check('Leads+docs: the user is told who received it', await page.evaluate(() => document.body.innerText.includes('Στάλθηκε στο Back Office: Κατερίνα')));
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await click(page, 'Λειτουργίες', '#shell-rail nav button');
    await sleep(1800);
    check('Leads+docs: the assignee sees it in «Νέα leads με έγγραφα» in Λειτουργίες', await page.evaluate(() => (document.querySelector('[data-bo-leads]')?.innerText ?? '').includes('Φούρνος Δοκιμή')));
    await page.evaluate(() => [...document.querySelectorAll('[data-bo-leads] button')].find((b) => b.textContent.trim() === 'Άνοιγμα')?.click());
    await sleep(1500);
    const t = await page.evaluate(() => document.querySelector('main').innerText);
    check('Leads+docs: Back Office opens the lead, sees the partner and can convert it', t.includes('Γιώργος Συνεργάτης') && t.includes('Φούρνος Δοκιμή'));
    await browser.close();
  }
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
    await sleep(1200); // measure the settled page, not a frame during data loading
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
  check('Documents: checklist lists ID, bill and proof of use', t0.includes('Ταυτότητα — εμπρός όψη') && t0.includes('Ταυτότητα — πίσω όψη') && t0.includes('Λογαριασμός ρεύματος') && /Ε9, μισθωτήριο/.test(t0));
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

/* ---- 11. Field day: order, arrival prompt, check-in without GPS (accepted + flagged), outcome-gated check-out ---- */
{
  {
    // standing at the stored address of the next planned visit, with location permission already granted
    const a = await launch(390, 844);
    await a.browser.defaultBrowserContext().overridePermissions('http://localhost:5199', ['geolocation']);
    await a.page.setGeolocation({ latitude: 37.98385, longitude: 23.7275, accuracy: 10 });
    await signInAs(a.page, 'field_sales');
    await a.page.evaluate(() => { const el = [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Ημέρα μου')); el && el.click(); });
    let arrivalText = '';
    for (let i = 0; i < 20 && !arrivalText; i++) { await sleep(250); arrivalText = await a.page.evaluate(() => document.querySelector('[data-arrival]')?.innerText ?? ''); }
    check('Field: at a planned visit’s address the app asks «Φτάσατε στο…;» with one-tap Check In', arrivalText.includes('Φτάσατε στο') && arrivalText.includes('Check In'), arrivalText.slice(0, 80));
    await a.page.evaluate(() => [...document.querySelectorAll('[data-arrival] button')].find((b) => b.textContent.trim() === 'Όχι ακόμη')?.click());
    await sleep(300);
    check('Field: «Όχι ακόμη» dismisses the prompt (nothing is recorded)', await a.page.evaluate(() => !document.querySelector('[data-arrival]'))
      && !(await (await fetch('http://127.0.0.1:54399/__log')).json()).some((l) => l.table === 'field_checkin'));
    await a.browser.close();
  }
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
  const noGps = await main();
  check('Field: without GPS the manual check-in is still accepted (flagged for review, no rejection)', noGps.includes('Σε εξέλιξη') && !noGps.includes('Το Check In απορρίφθηκε')
    && (await page.evaluate(() => document.body.innerText.includes('χωρίς θέση GPS'))));
  let log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Field: the check-in went to field_checkin without coordinates (nothing faked)', log.some((l) => l.table === 'field_checkin' && l.body.p_lat == null));
  await browser.close();

  const s2 = await launch(390, 844);
  const ctx = s2.browser.defaultBrowserContext();
  await ctx.overridePermissions('http://localhost:5199', ['geolocation']);
  await s2.page.setGeolocation({ latitude: 37.9838, longitude: 23.7275, accuracy: 12 });
  await signInAs(s2.page, 'field_sales');
  await s2.page.evaluate(() => { const el = [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Ημέρα μου')); el && el.click(); });
  await sleep(2000);
  const t2 = await s2.page.evaluate(() => document.querySelector('main').innerText);
  check('Field: the visit checked in without GPS stays in progress with the check-out form', t2.includes('Σε εξέλιξη') && t2.includes('Ολοκλήρωση επίσκεψης'));
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
  for (let i = 0; i < 20 && !(await s2.page.evaluate(() => [...document.querySelectorAll('main button')].some((b) => b.textContent.trim().startsWith('Check In') && b.offsetParent && !b.disabled))); i++) await sleep(250);
  await click(s2.page, 'Check In');
  let gpsIn = null;
  for (let i = 0; i < 20 && !(gpsIn?.body?.p_lat != null); i++) {
    await sleep(250);
    gpsIn = (await (await fetch('http://127.0.0.1:54399/__log')).json()).filter((l) => l.table === 'field_checkin').pop();
  }
  await sleep(800);
  check('Field: with GPS the next check-in is accepted and sends the position', gpsIn?.body?.p_lat === 37.9838 && (await s2.page.evaluate(() => document.querySelector('main').innerText.includes('Σε εξέλιξη'))),
    JSON.stringify(gpsIn?.body ?? null));
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
  check('Ops: «Check-in προς έλεγχο» lists the check-in without GPS', await page.evaluate(() => { const r = document.querySelector('[data-checkin-review] [data-flag="no_gps"]'); return !!r && r.innerText.includes('Χωρίς θέση GPS'); }));
  await page.evaluate(() => [...document.querySelectorAll('[data-checkin-review] button')].find((b) => b.textContent.trim() === 'Ελέγχθηκε')?.click());
  await sleep(1200);
  check('Ops: «Ελέγχθηκε» goes through review_field_checkin and clears the list', (await (await fetch('http://127.0.0.1:54399/__log')).json()).some((l) => l.table === 'review_field_checkin')
    && (await page.evaluate(() => !document.querySelector('[data-checkin-review]'))));
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
