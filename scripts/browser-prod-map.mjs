import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const APP = 'https://powerfor-energy-crm.vercel.app';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'scripts/.browser-out';
mkdirSync(OUT, { recursive: true });

const secrets = JSON.parse(readFileSync('C:/Users/kalaf/.qa-secrets/hlektrismos-qacc.json', 'utf8'));
const fsAcct = secrets.find(s => s.email === 'qa.fieldsales@hlektrismos.gr');
if (!fsAcct) throw new Error('qa.fieldsales@hlektrismos.gr missing from secrets file');
const EMAIL = fsAcct.email;
const PASSWORD = fsAcct.password;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const REDACT = u => u.replace(/(cb1_[0-9A-Za-z_]+)/g, '[KEY]').replace(/(\?key=)[^&\s"']+/, '$1[KEY]');

const results = [];
const pass = (k, ok, detail = '') => results.push({ k, ok: Boolean(ok), detail });

async function run() {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
      defaultViewport: { width: 1280, height: 900 },
    });
    const page = await browser.newPage();
    const consoleLog = [];
    const pageErrors = [];
    const tileResponses = [];
    const failed = [];

    await page.evaluateOnNewDocument(() => {
      window.__diag = { errors: [], rejections: [] };
      window.addEventListener('error', e => window.__diag.errors.push(String(e.message) + ' @ ' + (e.filename || '')));
      window.addEventListener('unhandledrejection', e => {
        window.__diag.rejections.push((e.reason && e.reason.stack ? e.reason.stack : String(e.reason)).slice(0, 400));
        e.preventDefault();
      });
    });
    page.on('console', m => { const t = m.text(); consoleLog.push(t); if (m.type() === 'error') process.stdout.write(`[console.error] ${t.slice(0, 300)}\n`); });
    page.on('pageerror', e => { pageErrors.push(String(e)); process.stdout.write(`[pageerror] ${String(e).slice(0, 300)}\n`); });
    page.on('requestfailed', r => failed.push(`${r.failure()?.errorText ?? '?'} :: ${REDACT(r.url())}`));
    page.on('response', async r => {
      const u = r.url();
      if (/basemaps\.cartocdn\.com/i.test(u)) {
        let ct = r.headers()['content-type'] || '';
        tileResponses.push(`${r.status()} ${ct} :: ${REDACT(u)}`);
      }
    });

    await page.goto(`${APP}/#/login`, { waitUntil: 'networkidle2', timeout: 60000 });
    pass('prod-login-form', (await page.$('input[type="email"]')) && (await page.$('input[type="password"]')), APP);

    const clearAndType = async (sel, text) => {
      await page.click(sel);
      await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type(sel, text, { delay: 12 });
    };
    const clickText = async label => page.evaluate(l => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes(l));
      if (b) { b.click(); return true; }
      return false;
    }, label);

    await clearAndType('input[type="email"]', EMAIL);
    await clearAndType('input[type="password"]', PASSWORD);
    await page.evaluate(() => { const f = document.querySelector('form'); f && f.requestSubmit(); });
    try {
      await page.waitForFunction(() => location.hash.includes('dashboard') && document.body.textContent?.includes('Command Center'), { timeout: 30000 });
      pass('prod-field-sales-login', true);
    } catch {
      const body = await page.evaluate(() => document.body.textContent.slice(0, 300));
      pass('prod-field-sales-login', false, body.replace(/\n+/g, ' '));
      throw new Error('login failed on production');
    }
    await sleep(2500);

    await clickText('Χάρτης');
    await page.waitForFunction(() => document.body.textContent?.includes('Χάρτης · Πωλήσεις πεδίου'), { timeout: 20000 }).catch(() => {});
    await sleep(12000);

    const state = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.maplibregl-canvas');
      const failureUi = document.body.textContent?.includes('Χάρτης μη διαθέσιμος') ?? false;
      const keyMissing = document.body.textContent?.includes('CARTO basemap key missing') ?? false;
      const watermark = document.body.textContent?.toUpperCase().includes('API KEY') ?? false;
      const attribution = document.querySelector('.maplibregl-ctrl-attrib');
      const errs = window.__diag.errors.slice(0, 10);
      const boxText = document.body.textContent.includes('Χάρτης μη διαθέσιμος')
        ? document.body.textContent.slice(document.body.textContent.indexOf('Χάρτης μη διαθέσιμος'), document.body.textContent.indexOf('Χάρτης μη διαθέσιμος') + 220)
        : '';
      return { canvas: !!canvas, failureUi, keyMissing, watermark, attribution: !!attribution, errs, boxText: boxText.replace(/\s+/g, ' ') };
    });

    pass('prod-map-failure-box-absent', !state.failureUi);
    pass('prod-key-missing-error-absent', !state.keyMissing, state.boxText.slice(0, 180));
    pass('prod-carto-tiles-requested', tileResponses.length > 0, `responses=${tileResponses.length}`);
    pass('prod-carto-tiles-200', tileResponses.length > 0 && tileResponses.every(t => t.startsWith('200')), tileResponses.slice(0, 3).join(' | '));
    pass('prod-map-canvas', state.canvas, `errs=${state.errs.length}`);
    pass('prod-no-console-errors', state.errs.length === 0, state.errs.join(' | '));

    console.log('\n===== PRODUCTION MAP PROBE SUMMARY =====');
    for (const r of results) console.log(`${r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'INFO'} ${r.k}${r.detail ? ' :: ' + r.detail : ''}`);
    console.log('\n===== PAGE ERRORS =====');
    pageErrors.slice(0, 10).forEach(e => console.log(' -', e.slice(0, 400)));
    console.log('\n===== FAILED REQUESTS =====');
    failed.slice(0, 20).forEach(f => console.log(' -', f));
    console.log(`\n===== CARTO BASEMAP RESPONSES (${tileResponses.length}) =====`);
    tileResponses.slice(0, 5).forEach(t => console.log(' -', t));
  } catch (e) {
    console.error('HARNESS ERROR:', String(e).slice(0, 500));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
  }
}

run();