// usage: node scripts/qa/shoot.mjs <outDir> <role> <hash|nav label> [widths...]
import { launch, signInAs, sleep } from './ui-session.mjs';
const [, , outDir, role, hash, ...w] = process.argv;
const widths = (w.length ? w : ['1440', '390']).map(Number);
for (const width of widths) {
  const { browser, page, errors } = await launch(width, width < 500 ? 844 : 900);
  await signInAs(page, role);
  if (hash && hash !== '-') {
    await page.evaluate((label) => {
      const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(label) && b.offsetParent);
      el && el.click();
    }, hash);
    await sleep(900);
  }
  await page.screenshot({ path: `${outDir}/${role}-${process.env.SHOT_NAME || 'home'}-${width}.jpg`, type: 'jpeg', quality: 78, fullPage: false });
  console.log(role, hash, width, 'console errors:', errors.filter((e) => !/fetchPriority/.test(e)).length);
  await browser.close();
}
