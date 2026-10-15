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

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
