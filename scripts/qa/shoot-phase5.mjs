// Screenshots for Field Work / Operations (synthetic mock data).
import { launch, signInAs, sleep } from './ui-session.mjs';
const OUT = 'docs/product/screenshots/after';
{
  const { browser, page } = await launch(390, 844);
  await browser.defaultBrowserContext().overridePermissions('http://localhost:5199', ['geolocation']);
  await page.setGeolocation({ latitude: 37.99, longitude: 23.73, accuracy: 15 });
  await signInAs(page, 'field_sales');
  await page.evaluate(() => { const el = [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Ημέρα μου')); el && el.click(); });
  await sleep(2200);
  await page.screenshot({ path: `${OUT}/myday-390.jpg`, type: 'jpeg', quality: 78 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().endsWith('Check In')).click());
  await sleep(2000);
  await page.evaluate(() => document.querySelector('[aria-label="Αποτέλεσμα επίσκεψης"]')?.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${OUT}/myday-checkout-390.jpg`, type: 'jpeg', quality: 78 });
  await browser.close();
}
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'back_office');
  await page.evaluate(() => { const el = [...document.querySelectorAll('#shell-rail nav button')].find((b) => b.textContent.trim().startsWith('Λειτουργίες')); el && el.click(); });
  await sleep(2000);
  await page.screenshot({ path: `${OUT}/operations-1440.jpg`, type: 'jpeg', quality: 78 });
  await browser.close();
}
console.log('done');
