// Screenshots for the Lead details / Atlas AI / documents increment (synthetic mock data).
import { launch, signInAs, sleep } from './ui-session.mjs';
const OUT = 'docs/product/screenshots/after';
const clickText = (page, t, sel = 'button') => page.evaluate((t, sel) => { const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().startsWith(t) && b.offsetParent); el && el.click(); }, t, sel);
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await page.screenshot({ path: `${OUT}/navy-home-1440.jpg`, type: 'jpeg', quality: 78 });
  await clickText(page, 'Η εργασία μου', '#shell-rail nav button'); await sleep(900);
  await clickText(page, 'Άνοιγμα lead'); await sleep(1500);
  await page.screenshot({ path: `${OUT}/lead-detail-1440.jpg`, type: 'jpeg', quality: 78 });
  await page.evaluate(() => document.querySelector('[aria-label="Atlas AI βοηθός"]').click()); await sleep(700);
  await page.type('[aria-label="Ερώτηση προς τον βοηθό"]', 'Τι έχω σήμερα;'); await page.keyboard.press('Enter'); await sleep(900);
  await page.screenshot({ path: `${OUT}/atlas-ai-1440.jpg`, type: 'jpeg', quality: 78 });
  await browser.close();
}
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'inside_sales');
  await clickText(page, 'Cases', '#shell-rail nav button'); await sleep(1200);
  await page.evaluate(() => { const el = [...document.querySelectorAll('main *')].find((e) => e.textContent.trim() === 'CS-2026-001' && e.offsetParent); el && el.click(); });
  await sleep(1500); await clickText(page, 'Έγγραφα'); await sleep(1200);
  await page.screenshot({ path: `${OUT}/case-documents-1440.jpg`, type: 'jpeg', quality: 78 });
  await clickText(page, 'Προσθήκη εγγράφου'); await sleep(600);
  await clickText(page, 'Μισθωτήριο', '[role="radio"]'); await sleep(300);
  await page.screenshot({ path: `${OUT}/document-type-picker-1440.jpg`, type: 'jpeg', quality: 78 });
  await browser.close();
}
{
  const { browser, page } = await launch(390, 844);
  await signInAs(page, 'inside_sales');
  await clickText(page, 'Leads', 'nav button'); await sleep(1200);
  await page.evaluate(() => { const el = [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Δοκιμαστικό Lead 1')); el && el.click(); });
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/lead-detail-390.jpg`, type: 'jpeg', quality: 78 });
  await browser.close();
}
console.log('done');
