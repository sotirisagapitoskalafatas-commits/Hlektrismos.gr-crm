// Screenshots for the Customer / Case details increment (synthetic mock data).
import { launch, signInAs, sleep } from './ui-session.mjs';
const OUT = 'docs/product/screenshots/after';
const clickText = (page, t, sel = 'button') => page.evaluate((t, sel) => { const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().startsWith(t) && b.offsetParent); el && el.click(); }, t, sel);
const openCase = (page, no) => page.evaluate((no) => { const el = [...document.querySelectorAll('main *')].find((e) => e.textContent.trim() === no && e.offsetParent); el && el.click(); }, no);
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const { browser, page } = await launch(w, h);
  await signInAs(page, 'inside_sales');
  await clickText(page, 'Cases', w < 500 ? 'nav button' : '#shell-rail nav button'); await sleep(1200);
  await openCase(page, 'CS-2026-006'); await sleep(1800);
  await page.screenshot({ path: `${OUT}/case-detail-${w}.jpg`, type: 'jpeg', quality: 78, fullPage: w < 500 });
  if (w > 500) {
    await clickText(page, 'Παράδοση'); await sleep(600);
    await page.screenshot({ path: `${OUT}/case-handover-${w}.jpg`, type: 'jpeg', quality: 78 });
  }
  await browser.close();
}
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await clickText(page, 'Πελάτες', '#shell-rail nav button'); await sleep(1200);
  await page.screenshot({ path: `${OUT}/customers-list-1440.jpg`, type: 'jpeg', quality: 78 });
  await page.evaluate(() => { const el = [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Αθηνά Κωνσταντίνου')); el && el.click(); });
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/customer-detail-1440.jpg`, type: 'jpeg', quality: 78 });
  await browser.close();
}
console.log('done');
