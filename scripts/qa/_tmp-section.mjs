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

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
