// Home dashboard at 1440×900, 1280×800, 1024×768, 820 and 390 (admin + inside_sales), mock Supabase only.
// Writes docs/product/screenshots/after/home-<role>-<w>.jpg and reports horizontal overflow.
import { launch, signInAs, sleep } from './ui-session.mjs';

const SIZES = [[1440, 900], [1280, 800], [1024, 768], [820, 1180], [390, 844]];
const roles = (process.env.ROLES || 'admin,inside_sales').split(',');
let bad = 0;
for (const role of roles) {
  for (const [w, h] of SIZES) {
    const { browser, page } = await launch(w, h, 1);
    await signInAs(page, role);
    await sleep(2500);
    const info = await page.evaluate(() => {
      const main = document.querySelector('main');
      const pageEl = document.querySelector('.atx-page.atx-wide');
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1 || (main && main.scrollWidth > main.clientWidth + 1),
        mainW: main?.clientWidth, pageW: pageEl?.getBoundingClientRect().width,
        mainScrollH: main?.scrollHeight,
        detailTop: [...document.querySelectorAll('h2')].find((x) => x.textContent.trim() === 'Αναλυτικός πίνακας')?.getBoundingClientRect().top,
      };
    });
    if (info.overflow) bad++;
    console.log(role, `${w}x${h}`, JSON.stringify(info));
    await page.screenshot({ path: `docs/product/screenshots/after/home-${role}-${w}.jpg`, type: 'jpeg', quality: 72, fullPage: false });
    if (process.env.FULL) await page.evaluate(() => { const m = document.querySelector('main'); m.style.overflow = 'visible'; }), await page.screenshot({ path: `docs/product/screenshots/after/home-${role}-${w}-full.jpg`, type: 'jpeg', quality: 60, fullPage: true });
    await browser.close();
  }
}
console.log(bad ? `${bad} sizes overflow` : 'no horizontal overflow');
process.exit(bad ? 1 : 0);
