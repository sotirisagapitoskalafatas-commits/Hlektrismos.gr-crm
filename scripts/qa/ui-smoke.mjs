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

// The role preview has a built-in hard stop (ROLE_PREVIEW_HARD_STOP in src/lib/role-preview.ts); after it the selector is gone by design.
const PREVIEW_LIVE = Date.now() < Date.parse('2026-10-16T00:00:00+03:00');
const ADMIN_ONLY = ['Αυτοματισμοί', 'AI Εργατικό Δυναμικό', 'Διαχείριση'];
// Hidden behind the admin-only «Πειραματικές λειτουργίες» switch (src/lib/labs.ts), off by default.
const LABS = ['Αυτοματισμοί', 'AI Εργατικό Δυναμικό', 'B2B Prospecting'];
const EXPECT = {
  admin: { must: ['Αρχική', 'Η εργασία μου', 'Leads', 'Cases', 'Ρυθμίσεις'.length && 'Προτιμήσεις', 'Διαχείριση'], mustNot: LABS },
  manager: { must: ['Αρχική', 'Η εργασία μου', 'Leads', 'Cases', 'Διαχείριση'], mustNot: LABS },
  inside_sales: { must: ['Αρχική', 'Η εργασία μου', 'Leads', 'Cases', 'Πελάτες'], mustNot: [...ADMIN_ONLY, 'B2B Prospecting', 'Διεκπεραίωση', 'Χάρτης'] },
  field_sales: { must: ['Αρχική', 'Η εργασία μου', 'Ημέρα μου', 'Χάρτης', 'Cases'], mustNot: [...ADMIN_ONLY, 'Leads', 'Διεκπεραίωση', 'B2B Prospecting'] },
  // B2B Prospecting is a labs module until phase3/08 and the legal review are done: hidden for Back Office too.
  back_office: { must: ['Αρχική', 'Η εργασία μου', 'Διεκπεραίωση', 'Cases', 'Διαχείριση'], mustNot: [...LABS, 'Leads', 'Χάρτης'] },
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
  check(`${role}: demo role selector ${role === 'admin' && PREVIEW_LIVE ? 'shown (allowed)' : 'absent'}`, (role === 'admin' && PREVIEW_LIVE) === menu.includes('Επίδειξη ρόλου'));
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
if (!PREVIEW_LIVE) {
  // past the hard stop: the selector is absent for the admin too (checked in section 1); nothing else to exercise
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'admin');
  await sleep(1200);
  await page.evaluate(() => sessionStorage.setItem('atlas.preview.role', 'field_sales'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const t = await page.evaluate(() => document.body.innerText);
  check('Preview past its hard stop: no banner, a stored preview is ignored', !t.includes('ΠΡΟΕΠΙΣΚΟΠΗΣΗ ΡΟΛΟΥ'));
  await browser.close();
} else {
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
  check('Preview: navigation shows the Back Office view', nav.some((t) => t.startsWith('Διεκπεραίωση')) && !nav.some((t) => t.startsWith('Leads')));
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

/* ---- 2b2. «Πειραματικές λειτουργίες»: admin-only switch in Προτιμήσεις, off by default ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'manager');
  await click(page, 'Προτιμήσεις', '#shell-rail nav button'); await sleep(1000);
  check('Labs: the switch is not offered to a manager', !(await page.evaluate(() => !!document.querySelector('[data-labs-toggle]'))));
  await signInAs(page, 'admin');
  await click(page, 'Προτιμήσεις', '#shell-rail nav button'); await sleep(1000);
  const off = await page.evaluate(() => document.querySelector('[data-labs-toggle] input')?.checked);
  await page.evaluate(() => document.querySelector('[data-labs-toggle] input')?.click());
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await sleep(2000);
  const nav = await text(page, '#shell-rail nav button');
  check('Labs: off by default; once the admin turns it on, the three modules appear', off === false && LABS.every((l) => nav.some((t) => t.startsWith(l))), JSON.stringify(nav.filter((t) => LABS.some((l) => t.startsWith(l)))));
  await click(page, 'AI Εργατικό Δυναμικό', '#shell-rail nav button'); await sleep(1500);
  check('Labs: the module opens for the admin', (await page.evaluate(() => document.querySelector('main')?.innerText ?? '')).length > 50);
  await click(page, 'Προτιμήσεις', '#shell-rail nav button'); await sleep(1000);
  await page.evaluate(() => document.querySelector('[data-labs-toggle] input')?.click());
  await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  await sleep(2000);
  check('Labs: turning it off hides them again', !(await text(page, '#shell-rail nav button')).some((t) => LABS.some((l) => t.startsWith(l))));
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
  await page.waitForSelector('button[aria-label="Διαγραφή Δοκιμαστικό Lead 2"]', { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('button[aria-label="Διαγραφή Δοκιμαστικό Lead 2"]')?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Μεταφορά στον κάδο')), { timeout: 10000 }).catch(() => {});
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

/* ---- 2e. Case workflow: documents only warn (never block), Back Office return & resubmit ---- */
{
  const M = 'http://127.0.0.1:54399';
  await fetch(`${M}/__gates?state=on`);
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
  // 0b) Αdmin Center → Έγγραφα: read-only. No «Μπλοκάρισμα», nothing to switch; documents never block
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'admin');
    await click(page, 'Διαχείριση', '#shell-rail nav button');
    await sleep(1200);
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === 'Έγγραφα')?.click());
    await sleep(1200);
    const g = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-gate-modes] [data-gate]').length, radios: document.querySelectorAll('[data-gate-modes] [role="radio"], [data-gate-modes] [role="radiogroup"]').length,
      text: document.querySelector('[data-gate-modes]')?.innerText ?? '', never: !!document.querySelector('[data-docs-never-block]') }));
    check('Gates: Admin Center shows what each stage expects, read-only — no «Μπλοκάρισμα», nothing to switch', g.rows === 4 && g.radios === 0 && g.never && !g.text.includes('Μπλοκάρισμα') && g.text.includes('δεν εμποδίζουν ποτέ'), JSON.stringify({ rows: g.rows, radios: g.radios }));
    await browser.close();
  }
  // 1) Back Office confirms a move with documents missing: it goes through, as ONE history entry that lists what was missing
  {
    const C5 = '30000000-0000-4000-8000-000000000005';
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await openCaseNo(page, 'CS-2026-005'); // «Υπογραφή», no documents
    const opened = await pickStep(page, 'Έλεγχος εγγράφων');
    await sleep(900);
    const t = await body(page);
    check('Gates: the stage action exists for Back Office', opened);
    check('Gates: missing documents are listed as a warning and the move is allowed', t.includes('Λείπουν έγγραφα — η μετάβαση επιτρέπεται') && t.includes('Ταυτότητα — εμπρός όψη') && !t.includes('Δεν μπορεί να προχωρήσει ακόμη'));
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Συνέχεια με ελλείψεις')?.click());
    await sleep(1600);
    const now = (await (await fetch(`${M}/rest/v1/cases?id=eq.${C5}&select=current_stage`, { headers: { Authorization: 'Bearer mock-admin' } })).json())[0]?.current_stage;
    const log = await (await fetch(`${M}/__log`)).json();
    const entries = log.filter((l) => l.method === 'POST' && l.table === 'timeline_events' && l.body?.case_id === C5 && l.body.activity_type === 'status_change');
    check('Gates: the case moved to «Έλεγχος εγγράφων» with no documents, recorded once with the missing items', now === 'document_check' && entries.length === 1 && /Με ελλείψεις εγγράφων: Ταυτότητα/.test(entries[0].body.description), JSON.stringify({ now, n: entries.length }));
    check('Gates: no override exists any more', !log.some((l) => l.table === 'change_case_stage_override' || l.table === 'set_stage_gate_mode'));
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
    await click(page, 'Διεκπεραίωση', '#shell-rail nav button');
    await sleep(1500);
    check('Return: Διεκπεραίωση shows the case waits on Field Sales', (await body(page)).includes('Επιστράφηκε για διόρθωση σε Field Sales'));
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
  await fetch(`${M}/__gates?state=off`);
}

/* ---- 2e2. Back Office tab: «Ενεργοποίηση» / «Ολοκλήρωση» follow the allowed moves (staged phase2/07b guard on) ---- */
{
  const M = 'http://127.0.0.1:54399';
  const C6 = '30000000-0000-4000-8000-000000000006';
  const C7 = '30000000-0000-4000-8000-000000000007';
  const H = { Authorization: 'Bearer mock-admin', 'Content-Type': 'application/json' };
  const stageOf = async (id) => (await (await fetch(`${M}/rest/v1/cases?id=eq.${id}&select=current_stage`, { headers: H })).json())[0]?.current_stage;
  const stageWrites = async (id) => (await (await fetch(`${M}/__log`)).json()).filter((l) => l.method === 'PATCH' && l.table === 'cases' && String(l.query).includes(id) && l.body?.current_stage);
  const openBO = async (page, no) => {
    await click(page, 'Cases', '#shell-rail nav button'); await sleep(1200);
    await page.evaluate((n) => { const el = [...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === n && e.offsetParent)[0]; el && el.click(); }, no);
    await sleep(1600);
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === 'Back Office')?.click());
    await sleep(900);
  };
  const press = (page, label) => page.evaluate((l) => { const b = [...document.querySelectorAll('[data-bo-actions] button')].find((x) => x.textContent.trim() === l && !x.disabled); b?.click(); return !!b; }, label);
  const jumpMsg = (page) => page.evaluate(() => document.querySelector('[data-jump-msg]')?.textContent ?? '');
  await fetch(`${M}/__gates?state=on`);
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'back_office');
  // impossible jump: CS-2026-006 is in «Έλεγχος εγγράφων»
  const before6 = (await stageWrites(C6)).length;
  await openBO(page, 'CS-2026-006');
  const shown = await press(page, 'Ενεργοποίηση');
  await sleep(700);
  const m6 = await jumpMsg(page);
  check('BO buttons: an impossible jump shows a clear Greek message and writes nothing', shown
    && m6.includes('«Ενεργοποίηση» γίνεται μόνο από «Καταχώρηση παρόχου»') && m6.includes('επόμενο βήμα')
    && (await stageWrites(C6)).length === before6 && (await stageOf(C6)) === 'document_check', m6);
  // allowed move: CS-2026-007 in «Καταχώρηση παρόχου» → «Ενεργοποίηση»
  await openBO(page, 'CS-2026-007');
  const tl7 = async () => (await (await fetch(`${M}/__log`)).json()).filter((l) => l.method === 'POST' && l.table === 'timeline_events' && JSON.stringify(l.body).includes(C7));
  const tlBefore7 = (await tl7()).length;
  await press(page, 'Ενεργοποίηση');
  await sleep(1600);
  const tlNew7 = (await tl7()).slice(tlBefore7).map((l) => (Array.isArray(l.body) ? l.body[0] : l.body));
  check('History: one stage move writes ONE entry, titled in Greek', tlNew7.length === 1 && tlNew7[0].title === 'Στάδιο: Καταχώρηση παρόχου → Ενεργοποίηση', JSON.stringify(tlNew7.map((b) => b.title)));
  check('BO buttons: an allowed move passes the guard and the case moves to «Ενεργοποίηση»', (await stageOf(C7)) === 'activation'
    && (await stageWrites(C7)).some((l) => l.body.current_stage === 'activation') && !(await jumpMsg(page)));
  // a database refusal is shown: the server's list refuses a move the app believed allowed (07b guard), «Ολοκλήρωση» stays unchanged
  await fetch(`${M}/__patchfail?table=cases&hint=transition`);
  await press(page, 'Ολοκλήρωση');
  await sleep(1400);
  const m7 = await jumpMsg(page);
  check('BO buttons: a database refusal is shown on screen, never silent', m7 === 'Η μετάβαση σε αυτό το στάδιο δεν επιτρέπεται από το τρέχον στάδιο.' && (await stageOf(C7)) === 'activation', m7);
  await browser.close();
  // leave the shared mock as we found it
  await fetch(`${M}/__gates?state=off`);
  await fetch(`${M}/rest/v1/cases?id=eq.${C7}`, { method: 'PATCH', headers: H, body: JSON.stringify({ current_stage: 'submitted' }) });
}

/* ---- 2e4. Back Office: «Αλλαγή σταδίου» to any stage with an audited reason; the stepper does not pretend (staged phase2/07b) ---- */
{
  const M = 'http://127.0.0.1:54399';
  const H = { Authorization: 'Bearer mock-admin', 'Content-Type': 'application/json' };
  const C3 = '30000000-0000-4000-8000-000000000003';
  // known starting point: CS-2026-003 in «Αίτηση» (set with the guard off; restored at the end)
  await fetch(`${M}/__gates?state=off`);
  const before = (await (await fetch(`${M}/rest/v1/cases?id=eq.${C3}&select=current_stage,status`, { headers: H })).json())[0];
  await fetch(`${M}/rest/v1/cases?id=eq.${C3}`, { method: 'PATCH', headers: H, body: JSON.stringify({ current_stage: 'application', status: 'open' }) });
  await fetch(`${M}/__gates?state=on`);
  await fetch(`${M}/__setstage?state=on`);
  const openC3 = async (page) => {
    await click(page, 'Cases', '#shell-rail nav button'); await sleep(1200);
    await page.evaluate(() => { const el = [...document.querySelectorAll('main *')].find((e) => e.textContent.trim() === 'CS-2026-003' && e.offsetParent); el && el.click(); });
    await sleep(1800);
  };
  const setVal = (page, sel, v) => page.evaluate((q, val) => { const el = document.querySelector(q); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, sel, v);
  const body = (page) => page.evaluate(() => document.body.innerText);
  const rpcs = async () => (await (await fetch(`${M}/__log`)).json()).filter((l) => l.table === 'set_case_stage');
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await openC3(page);
    await click(page, 'Back Office', '[role="tab"]'); await sleep(600);
    const opts = await page.evaluate(() => [...document.querySelectorAll('#stage-set-target option')].map((o) => o.textContent.trim()));
    check('Stage set: the control offers every other stage except «Ολοκληρώθηκε» (only from «Ενεργοποίηση»), in journey order',
      opts[0] === 'Επιλέξτε στάδιο…' && opts.includes('Νέο') && opts.includes('Καταχώρηση παρόχου') && opts.includes('Χάθηκε') && !opts.includes('Αίτηση') && !opts.includes('Ολοκληρώθηκε'), JSON.stringify(opts));
    await setVal(page, '#stage-set-target', 'submitted');
    await setVal(page, '#stage-set-reason', 'λίγο');
    await sleep(200);
    const disabled = await page.evaluate(() => [...document.querySelectorAll('[data-stage-set] button')].find((b) => b.textContent.trim() === 'Αλλαγή σταδίου')?.disabled);
    check('Stage set: a reason under 10 characters keeps the button disabled', disabled === true);
    await setVal(page, '#stage-set-reason', 'Ήρθε από το Field με πλήρη φάκελο');
    await sleep(200);
    await page.evaluate(() => [...document.querySelectorAll('[data-stage-set] button')].find((b) => b.textContent.trim() === 'Αλλαγή σταδίου')?.click());
    await sleep(1800);
    const call = (await rpcs()).pop();
    check('Stage set: goes through set_case_stage with the stage and the written reason', call?.body?.p_case === C3 && call.body.p_stage === 'submitted' && call.body.p_reason === 'Ήρθε από το Field με πλήρη φάκελο', JSON.stringify(call?.body));
    const steps = await page.evaluate(() => ({
      skipped: [...document.querySelectorAll('.atx-step.is-skipped .atx-step-label')].map((l) => l.textContent.replace(/Βήμα \d+: /, '').replace(' (παραλείφθηκε)', '').trim()),
      current: document.querySelector('.atx-step.is-current .atx-step-label')?.textContent.replace(/Βήμα \d+: /, '').trim(),
      done: [...document.querySelectorAll('.atx-step.is-done .atx-step-label')].map((l) => l.textContent.replace(/Βήμα \d+: /, '').trim()),
      legend: !!document.querySelector('[data-steps-skipped]'),
    }));
    check('Stepper: the stages the case jumped over are «skipped», not done; the earlier unknown ones stay done',
      steps.current === 'Καταχώρηση παρόχου' && JSON.stringify(steps.skipped) === JSON.stringify(['Υπογραφή', 'Έλεγχος εγγράφων']) && steps.done.includes('Αίτηση') && !steps.done.includes('Υπογραφή') && steps.legend, JSON.stringify(steps));
    await click(page, 'Ιστορικό', '[role="tab"]'); await sleep(800);
    const t = await body(page);
    check('History: one entry «Αλλαγή σταδίου από Back Office: Αίτηση → Καταχώρηση παρόχου» with the reason', t.includes('Αλλαγή σταδίου από Back Office: Αίτηση → Καταχώρηση παρόχου') && t.includes('Ήρθε από το Field με πλήρη φάκελο'));
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'inside_sales');
    await openC3(page);
    check('Stage set: Inside Sales has no Back Office tab and no such control', await page.evaluate(() => ![...document.querySelectorAll('[role="tab"]')].some((b) => b.textContent.trim().startsWith('Back Office')) && !document.querySelector('[data-stage-set]')));
    await browser.close();
  }
  // the SQL is not applied yet (normal state for weeks): the control is a neutral note instead of a form that cannot work
  await fetch(`${M}/__setstage?state=off`);
  for (const role of ['back_office', 'admin']) {
    const seen = (await rpcs()).length; // calls made by the earlier checks do not count here
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, role);
    await openC3(page);
    await click(page, 'Back Office', '[role="tab"]'); await sleep(1200);
    const st = await page.evaluate(() => ({
      note: document.querySelector('[data-stage-set-unavailable]')?.textContent?.trim() ?? '',
      form: !!document.querySelector('#stage-set-target, #stage-set-reason'),
      button: [...document.querySelectorAll('[data-stage-set] button')].some((b) => b.textContent.trim() === 'Αλλαγή σταδίου'),
      box: document.querySelector('[data-stage-set]')?.innerText ?? '',
    }));
    const now = (await (await fetch(`${M}/rest/v1/cases?id=eq.${C3}&select=current_stage`, { headers: H })).json())[0]?.current_stage;
    const writes = (await rpcs()).slice(seen).filter((l) => String(l.body?.p_reason ?? '').trim() !== '');
    check(`Stage set (${role}): while the SQL is not applied there is one neutral Greek sentence and no form, no button`,
      st.note === 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.' && !st.form && !st.button && !/migration|phase|SQL|schema|PGRST|07[ab]/i.test(st.box), JSON.stringify(st));
    check(`Stage set (${role}): the availability check writes nothing (empty reason only) and the case is unchanged`, writes.length === 0 && now === 'submitted', `${writes.length} writes, stage ${now}`);
    await browser.close();
  }
  // the SQL disappears while the page is open: the failed save is a neutral sentence and the form gives way to the note
  await fetch(`${M}/__setstage?state=on`);
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await openC3(page);
    await click(page, 'Back Office', '[role="tab"]'); await sleep(1200);
    await setVal(page, '#stage-set-target', 'activation');
    await setVal(page, '#stage-set-reason', 'Συνεχίζει από την ενεργοποίηση');
    await fetch(`${M}/__setstage?state=off`);
    await sleep(200);
    await page.evaluate(() => [...document.querySelectorAll('[data-stage-set] button')].find((b) => b.textContent.trim() === 'Αλλαγή σταδίου')?.click());
    await sleep(1800);
    const after = await page.evaluate(() => ({ err: document.querySelector('[data-stage-set-error]')?.textContent ?? '', note: !!document.querySelector('[data-stage-set-unavailable]'), form: !!document.querySelector('#stage-set-reason'), toasts: document.body.innerText }));
    const now = (await (await fetch(`${M}/rest/v1/cases?id=eq.${C3}&select=current_stage`, { headers: H })).json())[0]?.current_stage;
    check('Stage set: if the SQL is removed while the page is open the save says so in one neutral Greek sentence, changes nothing and the form gives way to the note',
      after.toasts.includes('Η λειτουργία δεν είναι ακόμη διαθέσιμη.') && !/migration|phase|SQL|schema|PGRST/i.test(after.err) && after.note && !after.form && now === 'submitted', JSON.stringify({ ...after, toasts: undefined, now }));
    await browser.close();
  }
  // leave the shared mock as we found it
  await fetch(`${M}/__setstage?state=on`);
  await fetch(`${M}/__gates?state=off`);
  await fetch(`${M}/rest/v1/cases?id=eq.${C3}`, { method: 'PATCH', headers: H, body: JSON.stringify({ current_stage: before.current_stage, status: before.status }) });
}

/* ---- 2e3. Small fixes: queue row separator; a planned visit uses the case's address, not the planner's GPS ---- */
{
  const M = 'http://127.0.0.1:54399';
  const H = { Authorization: 'Bearer mock-admin', 'Content-Type': 'application/json' };
  const C4 = '30000000-0000-4000-8000-000000000004'; // «Αίτηση», in the Back Office queue
  const C5 = '30000000-0000-4000-8000-000000000005';
  const patchCase = (id, body) => fetch(`${M}/rest/v1/cases?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  // queue row with an empty case number
  await patchCase(C4, { case_no: '' });
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await click(page, 'Διεκπεραίωση', '#shell-rail nav button'); await sleep(1800);
    const subs = await page.evaluate(() => [...document.querySelectorAll('main .atx-row-sub')].map((e) => e.textContent));
    check('Queue: no double separator when a case has no number', subs.length > 0 && subs.every((t) => !/·\s*·/.test(t)) && subs.some((t) => t.startsWith('Αίτηση · ')), JSON.stringify(subs.filter((t) => t.startsWith('Αίτηση'))));
    await browser.close();
  }
  await patchCase(C4, { case_no: 'CS-2026-004' });
  // planned visit: the meeting point is the case's stored point; the planner's position is never asked for
  const plan = async (purpose) => {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'field_sales');
    await page.evaluate(() => { window.__geo = 0; const g = navigator.geolocation; if (g) { const orig = g.getCurrentPosition.bind(g); g.getCurrentPosition = (...a) => { window.__geo++; return orig(...a); }; } });
    await click(page, 'Cases', '#shell-rail nav button'); await sleep(1200);
    await page.evaluate(() => { const el = [...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === 'CS-2026-005' && e.offsetParent)[0]; el && el.click(); });
    await sleep(1600);
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === 'Επισκέψεις')?.click());
    await sleep(800);
    await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Προγραμματισμός')?.click());
    await sleep(500);
    const hint = await page.evaluate(() => document.querySelector('[data-visit-point]')?.textContent ?? '');
    await page.evaluate((v) => { const i = [...document.querySelectorAll('input.field')].find((x) => (x.placeholder ?? '').startsWith('π.χ. κατάθεση')); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }, purpose);
    await sleep(200);
    await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Προγραμματισμός').pop()?.click());
    await sleep(1500);
    const geo = await page.evaluate(() => window.__geo);
    const sent = (await (await fetch(`${M}/__log`)).json()).filter((l) => l.method === 'POST' && l.table === 'case_visits' && l.body?.purpose === purpose).pop();
    await browser.close();
    return { hint, geo, sent };
  };
  const a = await plan('Υπογραφή — χωρίς συντεταγμένες');
  check('Visit: no stored point → no location is saved, the planner’s GPS is not used, the form says so', !!a.sent && a.sent.body.location == null && a.geo === 0 && a.hint.includes('Δεν υπάρχει αποθηκευμένη διεύθυνση'), JSON.stringify({ geo: a.geo, loc: a.sent?.body?.location }));
  await patchCase(C5, { lat: 37.9838, lng: 23.7275, address: 'Πανεπιστημίου 10, Αθήνα' });
  const b = await plan('Υπογραφή — με διεύθυνση case');
  check('Visit: the meeting point is the case’s stored address', b.sent?.body?.location?.lat === 37.9838 && b.sent.body.location.lng === 23.7275 && b.sent.body.location.label === 'Πανεπιστημίου 10, Αθήνα' && b.geo === 0 && b.hint.includes('Πανεπιστημίου 10'), JSON.stringify(b.sent?.body?.location));
  await patchCase(C5, { lat: null, lng: null, address: '' });
}

/* ---- 2f. B2B: discover → review → distribute (never leads directly, never outreach) ---- */
{
  const M = 'http://127.0.0.1:54399';
  const openB2B = async (page) => { await click(page, 'B2B Prospecting', '#shell-rail nav button'); await sleep(1200); };
  const labsOn = async (page) => { await page.evaluate(() => localStorage.setItem('atlas.labs', 'on')); await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(2000); };
  const tabTo = (page, t) => page.evaluate((x) => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim().startsWith(x))?.click(), t);
  const setInput = (page, idx, v) => page.evaluate((i, val) => { const el = [...document.querySelectorAll('input.field')][i]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val); el.dispatchEvent(new Event('input', { bubbles: true })); }, idx, v);
  {
    const { browser, page } = await launch(1440, 900);
    // the switch is admin-only: set by hand for Back Office / Inside Sales it changes nothing
    const hidden = [];
    for (const r of ['field_sales', 'inside_sales', 'back_office']) {
      await signInAs(page, r);
      await labsOn(page);
      hidden.push(!(await text(page, '#shell-rail nav button')).some((t) => t.startsWith('B2B Prospecting')));
    }
    check('B2B: hidden for every non-admin, even with the browser switch set by hand', hidden.every(Boolean));
    // same browser as above: clear the switch the loop set by hand, so the admin starts with it off (the default)
    await page.evaluate(() => localStorage.removeItem('atlas.labs'));
    await signInAs(page, 'admin');
    check('B2B: hidden for the admin while «Πειραματικές λειτουργίες» is off', !(await text(page, '#shell-rail nav button')).some((t) => t.startsWith('B2B Prospecting')));
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'admin');
    await labsOn(page);
    await openB2B(page);
    const leadsBefore = (await (await fetch(`${M}/__log`)).json()).filter((l) => l.method === 'POST' && l.table === 'leads').length;
    await setInput(page, 0, 'Γλυφάδα, Βούλα');
    await page.evaluate(() => [...document.querySelectorAll('[aria-label="Κατηγορίες"] button')].find((b) => b.textContent.includes('Εστιατόρια'))?.click());
    await sleep(200);
    const preview = await page.evaluate(() => document.body.innerText.match(/(\d+) αναζητήσεις/)?.[1]);
    await page.evaluate(() => [...document.querySelectorAll('button.atx-btn-primary')].find((b) => b.textContent.trim() === 'Αναζήτηση')?.click());
    await sleep(1500);
    let log = await (await fetch(`${M}/__log`)).json();
    const call = log.filter((l) => l.table === 'scrape-b2b').pop();
    check('B2B: multi-select search (2 categories × 2 cities = 4 searches) goes to scrape-b2b', preview === '4' && call?.body?.categories?.length === 2 && call.body.cities.length === 2);
    check('B2B: results go to the review queue, not to leads', (await page.evaluate(() => document.querySelector('[data-outcome="ok"]')?.innerText ?? '')).includes('νέες για έλεγχο')
      && log.filter((l) => l.method === 'POST' && l.table === 'leads').length === leadsBefore);
    await tabTo(page, 'Έλεγχος');
    await sleep(1000);
    check('B2B: the review queue lists the results', (await page.evaluate(() => document.querySelectorAll('[data-prospect]').length)) >= 8);

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
    log = await (await fetch(`${M}/__log`)).json();
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
    check('B2B: search history shows who, what and counts', (await page.evaluate(() => document.body.innerText)).includes('Μαρία Παπαδοπούλου'));
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
    await click(page, 'Διεκπεραίωση', '#shell-rail nav button');
    await sleep(1800);
    check('Leads+docs: the assignee sees it in «Νέα leads με έγγραφα» in Διεκπεραίωση', await page.evaluate(() => (document.querySelector('[data-bo-leads]')?.innerText ?? '').includes('Φούρνος Δοκιμή')));
    await page.evaluate(() => [...document.querySelectorAll('[data-bo-leads] button')].find((b) => b.textContent.trim() === 'Άνοιγμα')?.click());
    await sleep(1500);
    const t = await page.evaluate(() => document.querySelector('main').innerText);
    check('Leads+docs: Back Office opens the lead, sees the partner and can convert it', t.includes('Γιώργος Συνεργάτης') && t.includes('Φούρνος Δοκιμή'));
    await browser.close();
  }
}

/* ---- 2j. «+ Task» in Σημερινά Tasks ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await sleep(1500);
  await page.evaluate(() => document.querySelector('[data-add-task]')?.click());
  await sleep(500);
  const disabled = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Προσθήκη')?.disabled);
  await page.evaluate(() => {
    const m = [...document.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Νέο task').closest('.card');
    const inp = m.querySelector('input.field'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, 'Κλήση για τα έγγραφα'); inp.dispatchEvent(new Event('input', { bubbles: true }));
    const sel = m.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, sel.options[1].value); sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Προσθήκη')?.click());
  await sleep(1500);
  const post = (await (await fetch('http://127.0.0.1:54399/__log')).json()).filter((l) => l.method === 'POST' && l.table === 'follow_ups').pop();
  check('Home: «+ Task» needs a description and a case, then saves a follow-up for me', disabled === true && post?.body?.reason === 'Κλήση για τα έγγραφα' && !!post.body.case_id && post.body.channel === 'other');
  await browser.close();
}

/* ---- 3. Home and My Work agree; actions really work ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await page.waitForFunction(() => document.querySelectorAll('.atx-kpi-n').length === 5 && !document.querySelector('.atx-kpi-n.is-na'), { timeout: 15000 }).catch(() => {});
  const all = await text(page, '.atx-kpi-n');
  const tileVal = (k) => page.evaluate((key) => document.querySelector(`[data-tile="${key}"] .atx-kpi-n`)?.textContent.trim() ?? '', k);
  const labels = await text(page, '.atx-kpi-l');
  check('Home: the five tiles are Επείγοντα, Follow Up, Προσφορές, Υπογραφές, Νέα Cases with real numbers', all.length === 5 && all.every((x) => /^\d+$/.test(x))
    && ['Επείγοντα', 'Follow Up σήμερα', 'Προσφορές', 'Υπογραφές', 'Νέα Cases'].every((l, i) => labels[i] === l), `${labels.join('|')} = ${all.join(',')}`);
  const overdue = Number(((await page.evaluate(() => document.querySelector('[data-tile="urgent"] .atx-chip-s')?.textContent ?? '')).match(/^(\d+) εκπρόθεσμα/) ?? [])[1]);
  const today = Number(await tileVal('followups'));
  check('Home: recorded value is money or «μη διαθέσιμο», never a bare 0', /€|μη διαθέσιμο/.test(await page.evaluate(() => document.querySelector('[data-pipe-value]')?.textContent ?? '')));
  await click(page, 'Η εργασία μου', '#shell-rail nav button');
  await sleep(900);
  const chips = await text(page, '[aria-label="Τύπος εργασίας"] button');
  const n = (k) => Number((chips.find((c) => c.startsWith(k)) || '').replace(/\D+/g, ''));
  check('My Work counts equal Home tiles (follow-ups = overdue + today)', n('Follow-ups') === overdue + today, `${n('Follow-ups')} vs ${overdue}+${today}`);
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
  {
    const f = await page.evaluate(() => ({ badge: document.querySelector('[data-folder-badge]')?.textContent ?? '', tabs: [...document.querySelectorAll('main [role="tab"]')].map((b) => b.childNodes[0]?.textContent?.trim()) }));
    check('Lead folder: badge «Lead» and the same tabs as the customer folder (no Back Office for Inside Sales)', f.badge === 'Lead' && JSON.stringify(f.tabs) === JSON.stringify(['Σύνοψη', 'Cases', 'Έγγραφα', 'Ιστορικό', 'Follow-ups', 'Επισκέψεις', 'Προσφορές', 'Υπογραφές']), JSON.stringify(f));
    await click(page, 'Cases', '[role="tab"]'); await sleep(300);
    const need1 = await page.evaluate(() => document.querySelector('[data-needs-case]')?.innerText ?? '');
    await click(page, 'Υπογραφές', '[role="tab"]'); await sleep(300);
    const need2 = await page.evaluate(() => document.querySelector('[data-needs-case]')?.innerText ?? '');
    check('Lead folder: tabs that need a case say «Διαθέσιμο μετά τη μετατροπή σε Case»', need1.includes('Διαθέσιμο μετά τη μετατροπή σε Case') && need2.includes('Διαθέσιμο μετά τη μετατροπή σε Case'));
    await click(page, 'Ιστορικό', '[role="tab"]'); await sleep(300);
    check('Lead folder: Ιστορικό holds the lead history', (await body()).includes('Νέο lead ·'));
    await click(page, 'Σύνοψη', '[role="tab"]'); await sleep(300);
  }
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
  // the lead is converted, so it opens the customer folder (Part B 4); its website files are in the folder's Έγγραφα
  const redirected = await page.evaluate(() => !!document.querySelector('[data-folder-notice]'));
  await click(page, 'Έγγραφα', '[role="tab"]'); await sleep(900);
  await page.evaluate(() => [...document.querySelectorAll('[data-folder-scope] button')].find((b) => b.textContent.startsWith('CS-2026-001'))?.click()); await sleep(900);
  const t2 = await page.evaluate(() => document.body.innerText);
  check('Website files: a converted lead opens the folder, and its files are listed in Έγγραφα', redirected && t2.includes('Αρχεία που έστειλε ο πελάτης') && t2.includes('IMG_4021.HEIC'), String(redirected));
  await browser.close();
}

/* ---- 9. Customer details ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  // a document on a case other than the one the folder shows (CS-2026-009; Part B 2)
  await fetch('http://127.0.0.1:54399/rest/v1/case_documents', { method: 'POST', headers: { Authorization: 'Bearer mock-admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: crypto.randomUUID(), case_id: '30000000-0000-4000-8000-000000000009', category: 'bill', status: 'received', file_url: 'x', file_name: 'bill.pdf', created_at: new Date().toISOString() }) });
  // Part B 3: the lead's own history (activity_log) and a Back Office entry on one of the customer's cases
  {
    const MH = { Authorization: 'Bearer mock-admin', 'Content-Type': 'application/json' };
    const leadId = (await (await fetch('http://127.0.0.1:54399/rest/v1/cases?id=eq.30000000-0000-4000-8000-000000000001&select=lead_id', { headers: MH })).json())[0]?.lead_id;
    await fetch('http://127.0.0.1:54399/rest/v1/activity_log', { method: 'POST', headers: MH, body: JSON.stringify({ id: crypto.randomUUID(), entity_type: 'lead', entity_id: leadId, action: 'status_change', details: { from: 'new', to: 'contacted' }, created_at: new Date(Date.now() - 3 * 86400000).toISOString() }) });
    await fetch('http://127.0.0.1:54399/rest/v1/timeline_events', { method: 'POST', headers: MH, body: JSON.stringify({ id: crypto.randomUUID(), case_id: '30000000-0000-4000-8000-000000000009', role: 'back_office', activity_type: 'document_check', title: 'Έλεγχος εγγράφου: Ελέγχθηκε', description: '', user_id: null, occurred_at: new Date(Date.now() - 86400000).toISOString(), location: null, metadata: {}, user: null }) });
  }
  await click(page, 'Πελάτες', '#shell-rail nav button');
  await sleep(1200);
  await page.evaluate(() => { const el = [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Αθηνά Κωνσταντίνου')); el && el.click(); });
  await sleep(1800);
  const body = () => page.evaluate(() => document.querySelector('main').innerText);
  const t = await body();
  check('Customer detail: opens with next step, cases and contact', t.includes('Επόμενο βήμα') && t.includes('Επικοινωνία') && /CS-2026-00/.test(t));
  check('Customer detail: case count reads «Cases: N σε εξέλιξη…», not «ενεργά από»', /Cases: \d+ σε εξέλιξη/.test(t) && !/ενεργά από/.test(t));
  // Part B: one folder header, computed badge, fixed tabs; selecting a case scopes the case tabs
  {
    const f = await page.evaluate(() => ({
      badge: document.querySelector('[data-folder-badge]')?.textContent ?? '',
      tabs: [...document.querySelectorAll('main [role="tab"]')].map((b) => b.childNodes[0]?.textContent?.trim()),
      origin: document.querySelector('[data-folder-origin]')?.innerText ?? '',
      progress: document.querySelector('[data-folder-progress]')?.getAttribute('data-folder-progress') ?? '',
      header: document.querySelector('main h1')?.parentElement?.parentElement?.innerText ?? '',
    }));
    check('Folder: one computed badge in the header', f.badge === 'Case σε εξέλιξη', f.badge);
    check('Folder: tabs in the fixed order (no Back Office for Inside Sales)', JSON.stringify(f.tabs) === JSON.stringify(['Σύνοψη', 'Cases', 'Έγγραφα', 'Ιστορικό', 'Follow-ups', 'Επισκέψεις', 'Προσφορές', 'Υπογραφές']), JSON.stringify(f.tabs));
    check('Folder: header shows phone and «από …»; Σύνοψη shows the selected case stepper and the origin', /από \d/.test(f.header) && /CS-2026-00\d/.test(f.progress) && /Πηγή/.test(f.origin), JSON.stringify({ p: f.progress, o: f.origin.slice(0, 60) }));
    await click(page, 'Cases', '[role="tab"]'); await sleep(300);
    const nos = await page.$$eval('main [data-folder-case]', (b) => b.map((x) => x.getAttribute('data-folder-case')));
    const other = nos.find((n) => n !== f.progress);
    await page.evaluate((n) => document.querySelector(`main [data-folder-case="${n}"]`)?.click(), other); await sleep(300);
    await click(page, 'Follow-ups', '[role="tab"]'); await sleep(800);
    const scope = await page.evaluate(() => [...document.querySelectorAll('[data-folder-scope] button')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent));
    check('Folder: picking a case scopes Follow-ups to it, with the case panel itself', nos.length >= 2 && scope.length === 1 && scope[0].startsWith(other) && (await body()).includes('Follow-ups'), JSON.stringify({ nos, other, scope }));
    // Part B 2: Έγγραφα = the selected case's checklist and upload, then the documents of the other cases
    await click(page, 'Έγγραφα', '[role="tab"]'); await sleep(1200);
    const d1 = await page.evaluate(() => ({ sel: document.querySelector('[data-folder-docs]')?.getAttribute('data-folder-docs') ?? '', text: document.querySelector('main').innerText, other: [...document.querySelectorAll('main h2')].some((h) => h.textContent.trim() === 'Έγγραφα άλλων cases') }));
    check('Folder docs: the selected case checklist and upload are in the folder', /CS-2026-00\d/.test(d1.sel) && d1.text.includes('Τι χρειάζεται αυτό το case') && d1.text.includes('Προσθήκη εγγράφου'), d1.sel);
    check('Folder docs: documents of other cases are listed below, with their case number', d1.other && d1.text.includes('Case CS-2026-009'));
    await page.evaluate(() => [...document.querySelectorAll('main .atx-row-main')].find((b) => b.textContent.includes('Case CS-2026-009'))?.click()); await sleep(1200);
    check('Folder docs: choosing another case\'s document switches the folder to that case', (await page.evaluate(() => document.querySelector('[data-folder-docs]')?.getAttribute('data-folder-docs'))) === 'CS-2026-009');
    await click(page, 'Σύνοψη', '[role="tab"]'); await sleep(300);
    check('Folder: «Προέλευση» says the lead is unavailable only when it cannot be read, never «χωρίς lead» for a case with a lead',
      await page.evaluate(() => { const o = document.querySelector('[data-folder-origin]')?.innerText ?? ''; return /Πηγή/.test(o) || (/δεν είναι διαθέσιμο/.test(o) && !/χωρίς lead/.test(o)); }));
    await click(page, 'Σύνοψη', '[role="tab"]'); await sleep(300);
  }
  await click(page, 'Ιστορικό', '[role="tab"]'); await sleep(500);
  check('Customer detail: history merges case timeline events', (await body()).includes('Τηλεφωνική επικοινωνία'));
  {
    const h = await body();
    check('History: stored stage codes are shown in Greek; the «Ενημέρωση Case» duplicate is hidden', h.includes('Στάδιο: Νέο → Επικοινωνία') && !h.includes('new → contacted') && !h.includes('Ενημέρωση Case'));
  }
  // Part B 3: one timeline with the lead's entries; Back Office entries kept; add-entry; a failed lead read keeps the case entries
  {
    const M = 'http://127.0.0.1:54399';
    const listText = () => page.evaluate(() => document.querySelector('[data-folder-history]')?.innerText ?? '');
    const h1 = await listText();
    const srcs = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-history-source]')].map((x) => x.getAttribute('data-history-source')))].sort());
    check('Folder history: the lead\'s entries and the cases\' entries are in ONE timeline, in Greek', JSON.stringify(srcs) === '["case","lead"]' && /Κατάσταση: .+ → .+/.test(h1) && !/\bcontacted\b/.test(h1) && h1.includes('Νέο lead'), JSON.stringify(srcs));
    check('Folder history: Back Office entries are kept (document check shown)', h1.includes('Έλεγχος εγγράφου: Ελέγχθηκε') && h1.includes('Τηλεφωνική επικοινωνία'));
    await click(page, 'Back Office', '.atx-chip'); await sleep(300);
    const bo = await listText();
    check('Folder history: the team filter works on the merged list', bo.includes('Έλεγχος εγγράφου: Ελέγχθηκε') && !bo.includes('Τηλεφωνική επικοινωνία'));
    await click(page, 'Όλα', '.atx-chip'); await sleep(300);
    await page.evaluate(() => { const i = document.querySelector('[data-timeline-composer] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Σημείωση από τον φάκελο'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(page, 'Καταγραφή'); await sleep(1500);
    const log1 = await (await fetch(`${M}/__log`)).json();
    const wrote = log1.filter((l) => l.method === 'POST' && l.table === 'timeline_events' && l.body?.description === 'Σημείωση από τον φάκελο').pop();
    check('Folder history: the add-entry box writes to the selected case and the entry appears', !!wrote && wrote.body.case_id === '30000000-0000-4000-8000-000000000009' && (await listText()).includes('Σημείωση από τον φάκελο'), JSON.stringify(wrote?.body?.case_id));
    // a failed read of the lead's log must not blank the case entries
    await fetch(`${M}/__getfail?table=activity_log`);
    await page.evaluate(() => { const i = document.querySelector('[data-timeline-composer] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Δεύτερη σημείωση'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(page, 'Καταγραφή'); await sleep(1800);
    const h2 = await listText();
    check('Folder history: a failed read of the lead log keeps every case entry (nothing blanked)', h2.includes('Δεύτερη σημείωση') && h2.includes('Τηλεφωνική επικοινωνία') && h2.includes('Έλεγχος εγγράφου: Ελέγχθηκε') && !/Κατάσταση: .+ → .+/.test(h2) && h2.includes('Νέο lead'));
  }
  await click(page, 'Επεξεργασία'); await sleep(400);
  await page.evaluate(() => { const i = [...document.querySelectorAll('main label')].find((l) => l.textContent.startsWith('Πόλη')).querySelector('input'); i.focus(); });
  await page.keyboard.type(' Κέντρο');
  await click(page, 'Αποθήκευση'); await sleep(1500);
  const log = await (await fetch('http://127.0.0.1:54399/__log')).json();
  check('Customer detail: edit saves via PATCH customers', log.some((l) => l.method === 'PATCH' && l.table === 'customers' && /Κέντρο/.test(l.body.city || '')));
  // Part B 4: the origin is read-only inside the folder (no bounce to a lead screen that redirects back); the case links to the folder
  await click(page, 'Σύνοψη', '[role="tab"]'); await sleep(400);
  const o = await page.evaluate(() => ({ lead: !!document.querySelector('[data-origin-lead]'), btn: !!document.querySelector('main [data-open-lead]'), text: document.querySelector('[data-origin-lead]')?.innerText ?? '' }));
  check('Folder: «Προέλευση» shows the lead read-only (source, dates) with no button back to a lead screen', o.lead && !o.btn && /Πηγή/.test(o.text) && /Μετατροπή/.test(o.text), o.text.slice(0, 80));
  await click(page, 'Cases', '[role="tab"]'); await sleep(400);
  await page.evaluate(() => document.querySelector('[data-folder-case="CS-2026-001"]')?.closest('li')?.querySelector('button:last-child')?.click()); await sleep(1800);
  const toFolder = await page.evaluate(() => !!document.querySelector('[data-open-folder]'));
  await page.evaluate(() => document.querySelector('[data-open-folder]')?.click()); await sleep(1800);
  check('Links: Case → «Φάκελος πελάτη» opens the customer folder (a converted lead has no screen of its own)', toFolder && (await page.evaluate(() => !!document.querySelector('[data-folder-badge]') && !!document.querySelector('main h1'))));
  // Part B 6: every customer save also updates the linked lead; a failed second write is said on screen
  {
    const M = 'http://127.0.0.1:54399';
    const setField = (label, v) => page.evaluate((l, val) => {
      const inp = [...document.querySelectorAll('main label')].find((x) => x.textContent.trim().startsWith(l))?.querySelector('input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, val); inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, label, v);
    const leadPatches = async () => (await (await fetch(`${M}/__log`)).json()).filter((l) => l.method === 'PATCH' && l.table === 'leads');
    const before = (await leadPatches()).length;
    await click(page, 'Επεξεργασία'); await sleep(500);
    await setField('Τηλέφωνο', '6900000077');
    await click(page, 'Αποθήκευση'); await sleep(2000);
    const after = (await leadPatches()).slice(before);
    check('Sync: saving the customer also updates the linked lead (only the phone changed, only the phone is sent)', after.length >= 1 && after.every((l) => l.body.phone === '6900000077' && !('full_name' in l.body) && !('email' in l.body)), JSON.stringify(after.map((l) => l.body)));
    check('Sync: nothing to warn about when the lead was updated', !(await page.evaluate(() => !!document.querySelector('[data-sync-warning]'))));
    await fetch(`${M}/__patchfail?table=leads`);
    await click(page, 'Επεξεργασία'); await sleep(500);
    await setField('Email', 'sync.test@example.gr');
    await click(page, 'Αποθήκευση'); await sleep(2200);
    const w = await page.evaluate(() => document.querySelector('[data-sync-warning]')?.innerText ?? '');
    const logS = await (await fetch(`${M}/__log`)).json();
    const custSaved = logS.filter((l) => l.method === 'PATCH' && l.table === 'customers').pop()?.body?.email === 'sync.test@example.gr';
    check('Sync: when the lead write fails, the customer is still saved and the screen says so', custSaved && /Τα στοιχεία του πελάτη αποθηκεύτηκαν, αλλά δεν ενημερώθηκε το lead/.test(w), w.slice(0, 120));
  }
  await browser.close();
}

/* ---- 9b. A converted lead opens the customer folder: «Μετατράπηκε → Φάκελος», one-line notice (Part B 4) ---- */
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await click(page, 'Leads', '#shell-rail nav button'); await sleep(1200);
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((b) => /ΜΕΤ/.test(b.textContent))?.click()); // converted tab
  await sleep(600);
  const btns = await page.$$eval('main [data-lead-to-folder]', (b) => b.map((x) => x.textContent.trim()));
  check('Leads list: a converted row says «Μετατράπηκε → Φάκελος»', btns.length > 0 && btns.every((t) => t.includes('Μετατράπηκε → Φάκελος')), JSON.stringify(btns.slice(0, 2)));
  await page.evaluate(() => document.querySelector('main [data-lead-to-folder] button')?.click()); await sleep(2500);
  const r = await page.evaluate(() => ({ notice: document.querySelector('[data-folder-notice]')?.innerText ?? '', badge: document.querySelector('[data-folder-badge]')?.textContent ?? '', back: document.querySelector('main')?.innerText.includes('Επιστροφή στους πελάτες') }));
  check('Converted lead: opens the customer folder with the one-line notice', /Το lead μετατράπηκε( στις \d\d\/\d\d)? — εδώ συνεχίζεται η εργασία/.test(r.notice) && r.back && r.badge !== 'Lead', JSON.stringify(r));
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
  {
    const st = await page.evaluate(() => [...document.querySelectorAll('.atx-step')].map((li) => ({ dot: li.querySelector('.atx-step-dot').textContent, label: li.querySelector('.atx-step-label').textContent })));
    check('Case detail: step numbers are not part of the text; a reader hears «Βήμα N: …»', st.length === 9 && st.every((s, i) => s.dot === '' && s.label.startsWith(`Βήμα ${i + 1}: `)) && !/\d(Νέο|Επικοινωνία|Προσφορά|Αίτηση|Υπογραφή)/.test(t), JSON.stringify(st.slice(0, 2)));
    check('Case detail: tab «Follow-ups», no English panel labels', t.includes('Follow-ups') && !/Follow Ups|\bTimeline\b|\bOffers\b|\bSignatures\b|Field sales/.test(t));
  }
  check('Case detail: next action lists missing documents as blockers', /Λείπει: Ταυτότητα/.test(t) && t.includes('Επόμενη ενέργεια') && t.includes('Επόμενες ενέργειες') && t.includes('Στοιχεία επαφής'));
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

/* ---- 10b. Case → «Στοιχεία επαφής»: a failed save stays open with a message; first/last name like the Customer page (D4) ---- */
{
  const M = 'http://127.0.0.1:54399';
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await click(page, 'Cases', '#shell-rail nav button'); await sleep(1200);
  await page.evaluate(() => { const el = [...document.querySelectorAll('main *')].find((e) => e.textContent.trim() === 'CS-2026-006' && e.offsetParent); el && el.click(); });
  await sleep(2000);
  await page.evaluate(() => document.querySelector('button[title="Επεξεργασία στοιχείων"]')?.click()); await sleep(500);
  const labels = await page.evaluate(() => [...document.querySelectorAll('main label')].map((l) => l.textContent.trim()));
  const setField = (label, v) => page.evaluate((l, val) => {
    const i = [...document.querySelectorAll('main label')].find((x) => x.textContent.trim().startsWith(l))?.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true }));
  }, label, v);
  const names = labels.some((l) => l.startsWith('Επώνυμο'));
  await setField('Τηλέφωνο', '6900000099');
  await fetch(`${M}/__patchfail?table=customers`);
  await click(page, 'Αποθήκευση'); await sleep(1500);
  const failed = await page.evaluate(() => ({ msg: document.querySelector('[data-contact-error]')?.textContent ?? '', open: !!document.querySelector('button[title="Ακύρωση"]') }));
  check('Contact save (case): a failed save stays open and says so in Greek', failed.open && failed.msg.includes('δεν αποθηκεύτηκαν'), JSON.stringify(failed));
  if (names) await setField('Επώνυμο', 'Δοκιμαστική');
  await click(page, 'Αποθήκευση'); await sleep(1500);
  const log = await (await fetch(`${M}/__log`)).json();
  const w = log.filter((l) => l.method === 'PATCH' && l.table === 'customers').pop()?.body ?? {};
  const closed = await page.evaluate(() => !document.querySelector('[data-contact-error]') && !document.querySelector('button[title="Ακύρωση"]'));
  check('Contact save (case): the retry saves and closes the form', closed && w.phone === '6900000099');
  check('Contact save (case): a customer whose cases came from no lead causes no lead write', !log.some((l) => l.method === 'PATCH' && l.table === 'leads' && l.body.phone === '6900000099'));
  check('Contact save (case): first and last name are sent when the columns exist, full name kept in step',
    names ? (w.last_name === 'Δοκιμαστική' && typeof w.full_name === 'string' && w.full_name.endsWith('Δοκιμαστική')) : (typeof w.full_name === 'string' && !('last_name' in w)), JSON.stringify({ names, w }));
  await browser.close();
}

/* ---- 10b2. Case → «Στοιχεία επαφής» also updates the linked lead; a failed lead write is said on screen (Part B 6) ---- */
{
  const M = 'http://127.0.0.1:54399';
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await click(page, 'Cases', '#shell-rail nav button'); await sleep(1200);
  await page.evaluate(() => { const el = [...document.querySelectorAll('main *')].find((e) => e.textContent.trim() === 'CS-2026-001' && e.offsetParent); el && el.click(); });
  await sleep(2000);
  const setField = (label, v) => page.evaluate((l, val) => {
    const i = [...document.querySelectorAll('main label')].find((x) => x.textContent.trim().startsWith(l))?.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true }));
  }, label, v);
  const leadPatches = async () => (await (await fetch(`${M}/__log`)).json()).filter((l) => l.method === 'PATCH' && l.table === 'leads');
  const before = (await leadPatches()).length;
  await page.evaluate(() => document.querySelector('button[title="Επεξεργασία στοιχείων"]')?.click()); await sleep(500);
  await setField('Τηλέφωνο', '6900000088');
  await click(page, 'Αποθήκευση'); await sleep(2200);
  const got = (await leadPatches()).slice(before);
  check('Sync (case): saving the contact also updates the linked lead, and shows no warning', got.some((l) => l.body.phone === '6900000088') && !(await page.evaluate(() => !!document.querySelector('[data-sync-warning]'))), JSON.stringify(got.map((l) => l.body)));
  await fetch(`${M}/__patchfail?table=leads`);
  await page.evaluate(() => document.querySelector('button[title="Επεξεργασία στοιχείων"]')?.click()); await sleep(500);
  await setField('Email', 'case.sync@example.gr');
  await click(page, 'Αποθήκευση'); await sleep(2400);
  const w = await page.evaluate(() => document.querySelector('[data-sync-warning]')?.innerText ?? '');
  const saved = (await (await fetch(`${M}/__log`)).json()).filter((l) => l.method === 'PATCH' && l.table === 'customers').pop()?.body?.email === 'case.sync@example.gr';
  check('Sync (case): when the lead write fails the customer is still saved and the case says so', saved && /Τα στοιχεία του πελάτη αποθηκεύτηκαν, αλλά δεν ενημερώθηκε το lead/.test(w), w.slice(0, 100));
  await browser.close();
}

/* ---- 10c. Consent block on the case (Part B 5): «μπορώ να καλέσω;» where most calls start; hidden for non-admins until phase3/09 is applied ---- */
{
  const M = 'http://127.0.0.1:54399';
  const openCase6 = async (page) => {
    await click(page, 'Cases', '#shell-rail nav button'); await sleep(1200);
    await page.evaluate(() => { const el = [...document.querySelectorAll('main *')].find((e) => e.textContent.trim() === 'CS-2026-006' && e.offsetParent); el && el.click(); });
    await sleep(2000);
  };
  const block = (page) => page.evaluate(() => { const b = document.querySelector('[data-contact-eligibility]'); return b ? { text: b.innerText, call: b.querySelector('[data-channel="call"]')?.getAttribute('data-allowed') ?? null } : null; });
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'inside_sales');
    await openCase6(page);
    const b = await block(page);
    check('Case: «Επικοινωνία & συγκαταθέσεις» is on the case, with the same per-channel answer as on the lead and customer', !!b && b.text.includes('Επικοινωνία & συγκαταθέσεις') && b.call === 'no', JSON.stringify(b?.call));
    await browser.close();
  }
  await fetch(`${M}/__contact?state=off`);
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'inside_sales');
    await openCase6(page);
    check('Case: while phase3/09 is not applied, non-admins do not see the block at all (no developer wording)', (await block(page)) === null);
    await browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'admin');
    await openCase6(page);
    const b = await block(page);
    check('Case: while phase3/09 is not applied, an admin sees the block with the plain-Greek unavailable note', !!b && b.text.includes('Ο έλεγχος συγκαταθέσεων δεν είναι ακόμη διαθέσιμος'), b?.text.slice(0, 60));
    await browser.close();
  }
  await fetch(`${M}/__contact?state=on`);
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
  await click(page, 'Διεκπεραίωση', '#shell-rail nav button'); await sleep(2000);
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

/* ---- 13. Field outcomes: Νέο Sale → Back Office, manager follow-up, Back Office exception (phase 2) ---- */
{
  const M = 'http://127.0.0.1:54399';
  const logOf = async () => (await (await fetch(`${M}/__log`)).json());
  const myDay = async (page) => { await page.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Ημέρα μου'))?.click()); await sleep(2000); };
  const pick = (page, label) => page.evaluate((l) => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === l)?.click(), label);
  const btnState = (page, re) => page.evaluate((r) => { const b = [...document.querySelectorAll('button')].find((x) => new RegExp(r).test(x.textContent.trim()) && x.offsetParent); return b ? (b.disabled ? 'disabled' : 'enabled') : 'missing'; }, re);
  await fetch(`${M}/rest/v1/rpc/set_default_backoffice_assignee`, { method: 'POST', headers: { Authorization: 'Bearer mock-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ p_user: '10000000-0000-4000-8000-000000000005' }) });
  {
    const s = await launch(390, 844);
    await s.browser.defaultBrowserContext().overridePermissions('http://localhost:5199', ['geolocation']);
    await s.page.setGeolocation({ latitude: 37.9838, longitude: 23.7275, accuracy: 12 });
    await signInAs(s.page, 'field_sales');
    await myDay(s.page);
    // the visit in progress from section 11 → «Νέο Sale»
    await pick(s.page, 'Δεν ενδιαφέρεται');
    await sleep(200);
    const needsReason = await btnState(s.page, '^Επιλέξτε αιτία');
    await pick(s.page, 'Νέο Sale');
    await sleep(200);
    await click(s.page, 'Check Out'); await sleep(2200);
    const panel = await s.page.evaluate(() => document.querySelector('[data-new-sale]')?.innerText ?? '');
    check('Field: «Δεν ενδιαφέρεται» needs a reason; «Νέο Sale» opens customer → documents → handover', needsReason === 'disabled' && panel.includes('Στοιχεία πελάτη') && panel.includes('Έγγραφα') && panel.includes('Παράδοση στο Back Office'), needsReason);
    await s.page.evaluate(() => [...document.querySelectorAll('[data-new-sale] button')].find((b) => b.textContent.trim() === 'Παράδοση στο Back Office')?.click());
    await sleep(1800);
    const hand = (await logOf()).filter((l) => l.method === 'PATCH' && l.table === 'cases' && /Παραλαβή από Sales/.test(l.body.next_action ?? '')).pop();
    check('Field: Νέο Sale hands over to the Back Office assignee and keeps the agent as originator', hand?.body?.back_office_owner === '10000000-0000-4000-8000-000000000005' && !!hand.body.field_sales_owner, JSON.stringify(hand?.body ?? null));
    // next visit → «Follow-up από υπεύθυνο»
    await s.page.evaluate(() => [...document.querySelectorAll('[data-new-sale] button')].find((b) => b.textContent.trim() === 'Κλείσιμο')?.click());
    // a planned visit for «now» (the fixture's times are relative to the hour and may fall on tomorrow late in the day)
    const existing = (await (await fetch(`${M}/rest/v1/case_visits?select=*`, { headers: { Authorization: 'Bearer mock-field_sales' } })).json())[0];
    await fetch(`${M}/rest/v1/case_visits`, { method: 'POST', headers: { Authorization: 'Bearer mock-field_sales', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...existing, id: '80000000-0000-4000-8000-0000000000f1', status: 'planned', scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString(), started_at: null, ended_at: null, purpose: 'Επίσκεψη για υπεύθυνο' }) });
    await s.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(2500);
    await myDay(s.page);
    for (let i = 0; i < 20 && (await btnState(s.page, '^Check In')) !== 'enabled'; i++) await sleep(250);
    await click(s.page, 'Check In');
    if (!(await s.page.waitForSelector('[aria-label="Σημειώσεις επίσκεψης"]', { timeout: 10000 }).catch(() => null))) {
      await click(s.page, 'Check In');
      await s.page.waitForSelector('[aria-label="Σημειώσεις επίσκεψης"]', { timeout: 10000 }).catch(() => null);
    }
    await pick(s.page, 'Follow-up από υπεύθυνο');
    await s.page.type('[aria-label="Σημειώσεις επίσκεψης"]', 'Θέλει έκπτωση πάνω από 10%');
    await click(s.page, 'Check Out'); await sleep(2500);
    const fu = (await logOf()).filter((l) => l.method === 'POST' && l.table === 'follow_ups').pop();
    check('Field: manager follow-up is created for the Back Office queue (flag + text) with the agent note', fu?.body?.kind === 'manager' && /^Follow-up από υπεύθυνο — Θέλει έκπτωση/.test(fu.body.reason) && fu.body.assignee_id === '10000000-0000-4000-8000-000000000005', JSON.stringify(fu?.body ?? null));
    await s.browser.close();
  }
  {
    const { browser, page } = await launch(1440, 900);
    await signInAs(page, 'back_office');
    await click(page, 'Διεκπεραίωση', '#shell-rail nav button'); await sleep(1800);
    check('Ops: «Follow-ups για υπεύθυνο» lists the manager follow-up', await page.evaluate(() => (document.querySelector('[data-manager-followups]')?.innerText ?? '').includes('Θέλει έκπτωση')));
    check('Ops: «Από Sales» filter counts the Νέο Sale case', await page.evaluate(() => { const t = [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.startsWith('Από Sales')); return !!t && Number(t.textContent.replace(/\D+/g, '')) >= 1; }));
    await click(page, 'Cases', '#shell-rail nav button'); await sleep(1200);
    await page.evaluate(() => { const el = [...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === 'CS-2026-006' && e.offsetParent)[0]; el && el.click(); });
    await sleep(1600);
    await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === 'Back Office')?.click());
    await sleep(800);
    await page.evaluate(() => { const sel = document.querySelector('[data-case-exception] select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'provider_rejected'); sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(200);
    const noNote = await page.evaluate(() => [...document.querySelectorAll('[data-case-exception] button')].find((b) => b.textContent.trim() === 'Αποθήκευση')?.disabled);
    await page.evaluate(() => { const i = document.querySelector('[data-case-exception] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Λάθος αριθμός παροχής'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await sleep(150);
    await page.evaluate(() => [...document.querySelectorAll('[data-case-exception] button')].find((b) => b.textContent.trim() === 'Αποθήκευση')?.click());
    await sleep(1500);
    const ex = (await logOf()).filter((l) => l.table === 'set_case_exception').pop();
    check('Case: Back Office exception needs a note and goes through set_case_exception', noNote === true && ex?.body?.p_state === 'provider_rejected' && ex.body.p_note === 'Λάθος αριθμός παροχής'
      && (await page.evaluate(() => document.querySelector('[data-case-exception]').innerText.includes('Απόρριψη από τον πάροχο'))));
    await click(page, 'Διεκπεραίωση', '#shell-rail nav button'); await sleep(1800);
    await click(page, 'Εξαιρέσεις', '[role="tab"]'); await sleep(400);
    check('Ops: «Εξαιρέσεις» shows the case with the reason first', await page.evaluate(() => [...document.querySelectorAll('main li.atx-row')].some((r) => r.innerText.includes('Απόρριψη από τον πάροχο'))));
    await browser.close();
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
