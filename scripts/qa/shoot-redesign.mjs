#!/usr/bin/env node
// Screenshots + layout checks of the in-scope screens at the seven viewports of master prompt §17.7 (LOCAL, mock data).
// Usage: node scripts/qa/shoot-redesign.mjs <outDir> [role=admin]   (mock on :54399, dev server on :5199)
// Writes <outDir>/<screen>-<w>x<h>.png and prints, per screen and viewport, whether the page scrolls sideways.
import { mkdirSync } from 'node:fs';
import { launch, signInAs, sleep } from './ui-session.mjs';

const out = process.argv[2] || 'shots';
const role = process.argv[3] || 'admin';
mkdirSync(out, { recursive: true });
const VIEWPORTS = [[1920, 1080], [1680, 1050], [1440, 900], [1280, 720], [1024, 768], [820, 1180], [390, 844]];

const clickText = (page, text, sel = 'button, a') => page.evaluate((t, s) => {
  const el = [...document.querySelectorAll(s)].find((e) => e.offsetParent && e.textContent.trim().startsWith(t));
  if (el) { el.click(); return true; } return false;
}, text, sel);

const SCREENS = {
  home: async () => {},
  leads: async (p) => { await clickText(p, 'Leads'); await sleep(1200); },
  lead: async (p) => { await clickText(p, 'Leads'); await sleep(1200); await clickText(p, 'Όλα'); await sleep(600); await p.evaluate(() => [...document.querySelectorAll('button, li, a, div')].filter((e) => e.offsetParent && e.textContent.includes('Δοκιμαστικό Lead 1') && e.children.length < 8).pop()?.click()); await sleep(1500); },
  newlead: async (p) => { await clickText(p, 'Leads'); await sleep(1200); await clickText(p, 'Νέο Lead'); await sleep(1200); },
  customers: async (p) => { await clickText(p, 'Πελάτες'); await sleep(1200); },
  customer: async (p) => { await clickText(p, 'Πελάτες'); await sleep(1200); await p.evaluate(() => [...document.querySelectorAll('button, li, a, tr')].filter((e) => e.offsetParent && e.textContent.includes('Αθηνά Κωνσταντίνου') && e.children.length < 8).pop()?.click()); await sleep(1500); },
  case: async (p) => { await clickText(p, 'Cases'); await sleep(1200); await p.evaluate(() => [...document.querySelectorAll('button, li, a, div')].filter((e) => e.offsetParent && e.textContent.includes('CS-2026-007') && e.children.length < 8).pop()?.click()); await sleep(1500); },
};

const only = process.argv[4] ? process.argv[4].split(',') : Object.keys(SCREENS);
for (const [w, h] of VIEWPORTS.filter(([w]) => !process.env.ONLY_W || String(w) === process.env.ONLY_W)) {
  const { browser, page } = await launch(w, h);
  await signInAs(page, role);
  await page.waitForFunction(() => document.querySelector('nav button, nav a') && document.body.innerText.length > 200, { timeout: 25000 }).catch(() => {});
  await sleep(1500);
  for (const name of only) {
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      await SCREENS[name](page);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      await page.screenshot({ path: `${out}/${name}-${w}x${h}.png` });
      console.log(`${name.padEnd(10)} ${w}x${h}  ${m.sw > m.cw + 1 ? `OVERFLOW sideways ${m.sw}>${m.cw}` : 'ok'}`);
      // back to the shell's home for the next screen
      await clickText(page, 'Αρχική'); await sleep(500);
    } catch (e) { console.log(`${name.padEnd(10)} ${w}x${h}  ERROR ${e.message.slice(0, 80)}`); }
  }
  await browser.close();
}
