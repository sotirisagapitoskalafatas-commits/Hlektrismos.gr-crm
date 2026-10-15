// Screenshots of «Επικοινωνία & συγκαταθέσεις» on a lead (mock Supabase, synthetic data; nothing is sent).
import { launch, signInAs, sleep } from './ui-session.mjs';
const OUT = 'docs/product/screenshots/after';
const openLead = async (page, name) => {
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Leads') && b.offsetParent)?.click());
  await sleep(1200);
  await page.evaluate((n) => [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === n)?.click(), name);
  await sleep(1800);
};
{
  const { browser, page } = await launch(1440, 900);
  await signInAs(page, 'manager');
  await openLead(page, 'Δοκιμαστικό Lead 3');
  await page.evaluate(() => document.querySelector('[data-contact-eligibility]')?.scrollIntoView({ block: 'center' }));
  await sleep(300);
  await page.screenshot({ path: `${OUT}/contact-eligibility-1440.jpg`, type: 'jpeg', quality: 75 });
  await page.evaluate(() => [...document.querySelectorAll('[data-contact-eligibility] button')].find((b) => b.textContent.trim() === 'Δεν θέλει επικοινωνία')?.click());
  await sleep(500);
  await page.screenshot({ path: `${OUT}/contact-objection-dialog-1440.jpg`, type: 'jpeg', quality: 75 });
  await browser.close();
}
{
  const { browser, page } = await launch(390, 844);
  await signInAs(page, 'inside_sales');
  await openLead(page, 'Δοκιμαστικό Lead 2');
  await page.evaluate(() => document.querySelector('[data-contact-eligibility]')?.scrollIntoView({ block: 'start' }));
  await sleep(300);
  await page.screenshot({ path: `${OUT}/contact-eligibility-390.jpg`, type: 'jpeg', quality: 75 });
  await browser.close();
}
console.log('done');
