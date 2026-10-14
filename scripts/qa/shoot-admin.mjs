// Screenshots of the Admin Center, account menu and role-preview banner (mock Supabase, synthetic data).
import { launch, signInAs, sleep } from './ui-session.mjs';

const OUT = 'docs/product/screenshots/after';
const click = (page, label, scope = 'button') => page.evaluate((l, sc) => {
  const el = [...document.querySelectorAll(sc)].find((b) => b.textContent.trim().startsWith(l) && b.offsetParent);
  if (el) { el.click(); return true; } return false;
}, label, scope);

const { browser, page } = await launch(1440, 900);
await signInAs(page, 'admin');
await sleep(1500);
await click(page, 'Διαχείριση', '#shell-rail nav button');
await sleep(1500);
await page.screenshot({ path: `${OUT}/admin-overview-1440.jpg`, type: 'jpeg', quality: 75 });
await click(page, 'Χρήστες & Ρόλοι', '[role="tab"]');
await sleep(1200);
await page.screenshot({ path: `${OUT}/admin-users-1440.jpg`, type: 'jpeg', quality: 75 });
await click(page, 'Νέος χρήστης');
await sleep(600);
await page.screenshot({ path: `${OUT}/admin-create-user-1440.jpg`, type: 'jpeg', quality: 75 });
await page.keyboard.press('Escape');
await page.evaluate(() => document.querySelector('.fixed.inset-0')?.click());
await sleep(400);
await click(page, 'Δικαιώματα', '[role="tab"]');
await sleep(600);
await page.screenshot({ path: `${OUT}/admin-permissions-1440.jpg`, type: 'jpeg', quality: 75 });
await click(page, 'Ασφάλεια & Έλεγχοι', '[role="tab"]');
await sleep(400);
await click(page, 'Εκτέλεση ελέγχων');
await sleep(2500);
await page.screenshot({ path: `${OUT}/admin-security-1440.jpg`, type: 'jpeg', quality: 75 });
await page.evaluate(() => document.querySelector('[aria-label="Λογαριασμός"]')?.click());
await sleep(500);
await page.screenshot({ path: `${OUT}/account-menu-1440.jpg`, type: 'jpeg', quality: 75 });
await page.evaluate(() => [...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.includes('Back Office'))?.click());
await sleep(1500);
await click(page, 'Αρχική', '#shell-rail nav button');
await sleep(1800);
await page.screenshot({ path: `${OUT}/role-preview-bo-1440.jpg`, type: 'jpeg', quality: 75 });
await browser.close();

const m = await launch(390, 844, 2);
await signInAs(m.page, 'manager', '#/app');
await sleep(1200);
await m.page.evaluate(() => { location.hash = '#/app'; });
await m.browser.close();
console.log('done');
