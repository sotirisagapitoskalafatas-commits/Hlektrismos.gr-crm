import { expect, test, type Page } from '@playwright/test';

/* Regression: opening «Σχόλια ή λογαριασμός ενέργειας (προαιρετικό)» in the public contact form made the lower page (the consent box, the submit
   button, the footer) unreachable by scrolling. Cause: Lenis kept its old scroll limit because <html> was pinned to the viewport height, so the
   box it observes never grew. Real mouse-wheel input is used on purpose: scrollTo() does not go through Lenis and would hide the bug.
   Files are tiny synthetic PNGs; nothing is submitted. */

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

async function reachBottom(page: Page) {
  // Wheel until the page stops moving, then require that it stopped at the true bottom.
  let last = -1;
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(250);
    const y = await page.evaluate(() => Math.round(scrollY));
    if (y === last) break;
    last = y;
  }
  await page.waitForTimeout(1200); // Lenis easing
}

const metrics = (page: Page) => page.evaluate(() => {
  const de = document.documentElement;
  const foot = document.querySelector('.lp-footer')!.getBoundingClientRect();
  return { y: Math.round(scrollY), max: de.scrollHeight - innerHeight, footerBelow: Math.round(foot.bottom - innerHeight), overflowX: de.scrollWidth > innerWidth };
});

test('the optional section grows the page naturally and the whole page, footer included, stays reachable', async ({ page }) => {
  await page.goto('/');
  const decline = page.getByRole('button', { name: 'Απόρριψη' });
  if (await decline.isVisible().catch(() => false)) await decline.click();

  const summary = page.locator('details.lp-optional > summary');
  await summary.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => document.documentElement.scrollHeight);
  await summary.click();
  await expect(page.locator('details.lp-optional textarea')).toBeVisible();
  await expect(page.locator('label[for="lead-file-input"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(before); // the page grew

  // several files: the list adds height too
  await page.setInputFiles('#lead-file-input', [1, 2, 3].map((n) => ({ name: `bill-${n}.png`, mimeType: 'image/png', buffer: PNG })));
  await expect(page.locator('.lp-file')).toHaveCount(3);

  // the document element follows the content (the root cause), and the form's last controls can be scrolled to with the wheel
  const heights = await page.evaluate(() => ({ html: Math.round(document.documentElement.getBoundingClientRect().height), doc: document.documentElement.scrollHeight }));
  expect(heights.html).toBe(heights.doc);

  await reachBottom(page);
  const m = await metrics(page);
  expect(m.y, 'stopped at the true bottom').toBeGreaterThanOrEqual(m.max - 2);
  expect(m.footerBelow, 'the footer ends at the viewport edge').toBeLessThanOrEqual(2);
  expect(m.overflowX, 'no horizontal overflow').toBe(false);
  await expect(page.locator('.lp-footer')).toBeInViewport();
  await expect(page.locator('.lp-footer .lp-footer__bottom')).toBeInViewport();

  // the consent box and the submit button are not covered by the footer wave
  const clear = await page.evaluate(() => {
    const btn = document.querySelector('.lp-contact button[type=submit]')!.getBoundingClientRect();
    const foot = document.querySelector('.lp-footer')!.getBoundingClientRect();
    return btn.bottom <= foot.top;
  });
  expect(clear).toBe(true);
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(1500);
  await expect(page.locator('.lp-contact button[type=submit]')).toBeInViewport();
});
