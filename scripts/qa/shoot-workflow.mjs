// Screenshots: server document blockers in the stage dialog, and a case returned for correction (mock, synthetic).
import { launch, signInAs, sleep } from './ui-session.mjs';
const M = 'http://127.0.0.1:54399';
const OUT = 'docs/product/screenshots/after';
await fetch(`${M}/__gates?state=on`);
const open = async (page, no) => {
  await page.evaluate(() => [...document.querySelectorAll('#shell-rail nav button')].find((b) => b.textContent.trim().startsWith('Cases'))?.click());
  await sleep(1200);
  await page.evaluate((n) => { const el = [...document.querySelectorAll('main *')].filter((e) => e.textContent.trim() === n && e.offsetParent)[0]; el && el.click(); }, no);
  await sleep(1600);
};
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'manager');
  await open(page, 'CS-2026-004'); // «Αίτηση»
  await page.evaluate(() => [...document.querySelectorAll('main button.atx-btn')].find((b) => b.textContent.trim() === 'Έλεγχος εγγράφων')?.click());
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/case-stage-blocked-1440.jpg`, type: 'jpeg', quality: 75 });
  await browser.close();
}
{
  await fetch(`${M}/rest/v1/rpc/return_case_for_correction`, { method: 'POST', headers: { Authorization: 'Bearer mock-back_office', 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_case: '30000000-0000-4000-8000-000000000008', p_reason: 'Ο λογαριασμός είναι παλαιότερος των 3 μηνών — χρειάζεται νεότερος.', p_items: ['Λογαριασμός ρεύματος', 'Αποδεικτικό χρήσης ακινήτου'], p_to_team: 'inside_sales' }) });
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await open(page, 'CS-2026-008');
  await page.screenshot({ path: `${OUT}/case-returned-1440.jpg`, type: 'jpeg', quality: 75 });
  await browser.close();
}
await fetch(`${M}/__gates?state=off`);
console.log('done');
