import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 4191;
const BASE = `http://localhost:${PORT}`;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'scripts/.browser-out';
mkdirSync(OUT, { recursive: true });

const secrets = JSON.parse(readFileSync('C:/Users/kalaf/.qa-secrets/hlektrismos-qacc.json', 'utf8'));
const fsAcct = secrets.find(s => s.email === 'qa.fieldsales@hlektrismos.gr');
if (!fsAcct) throw new Error('qa.fieldsales@hlektrismos.gr missing from secrets');

const TILE_RE = /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/rastertiles\/voyager\/\d+\/\d+\/\d+\.png\?key=[A-Za-z0-9_]+$/;
const BAD_STATUS = [400, 401, 402, 403, 429];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const pass = (k, ok, detail = '') => results.push({ k, ok: Boolean(ok), detail });

function startServer() {
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => process.stdout.write(`[preview] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[preview-err] ${d}`));
  child.on('error', e => process.stdout.write(`[preview-spawn-err] ${e.message}\n`));
  child.on('exit', c => process.stdout.write(`[preview-exit] ${c}\n`));
  return child;
}

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(BASE + '/')).ok) return; } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error('preview server did not start');
}

function makeTracker(page) {
  const t = { consoleMsgs: [], pageErrors: [], tileRes: [], bad: [] };
  page.on('console', m => t.consoleMsgs.push(`${m.type()}:${m.text()}`));
  page.on('pageerror', e => t.pageErrors.push(String(e)));
  page.on('response', r => {
    if (/basemaps\.cartocdn\.com\/rastertiles/.test(r.url())) {
      const st = r.status();
      const rt = r.request().resourceType();
      t.tileRes.push({ st, url: r.url(), rt });
      if (BAD_STATUS.includes(st)) t.bad.push(`${st} ${r.url()}`);
    }
  });
  return t;
}

async function loginMap(page, t) {
  await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  const fill = async (sel, text) => {
    await page.click(sel);
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type(sel, text, { delay: 12 });
  };
  await fill('input[type="email"]', fsAcct.email);
  await fill('input[type="password"]', fsAcct.password);
  await page.evaluate(() => { const f = document.querySelector('form'); f && f.requestSubmit(); });
  await page.waitForFunction(() => location.hash.includes('dashboard') && document.body.textContent?.includes('Command Center'), { timeout: 45000 });
  await sleep(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Χάρτης'));
    if (b) b.click();
  });
  await page.waitForFunction(
    () => document.body.textContent?.includes('Χάρτης · Πωλήσεις πεδίου') && !!document.querySelector('canvas.maplibregl-canvas'),
    { timeout: 15000 });
  await sleep(12000);
}

async function assertMap(t, label) {
  const state = await page.evaluate(() => {
    const att = document.querySelector('.maplibregl-ctrl-attrib');
    return {
      attrib: att ? att.textContent || '' : '',
      bodyWater: (document.body.textContent || '').includes('API KEY REQUIRED') || (document.body.textContent || '').includes('API key required'),
      canvas: !!document.querySelector('canvas.maplibregl-canvas'),
      webgl2: (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })(),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  const keyed200 = t.tileRes.length > 0 && t.tileRes.every(r => TILE_RE.test(r.url) && r.st === 200);
  const authErrText = (str) => /api key|unauthor|401|403|watermark|incorrect key/i.test(str);
  const consoleAuthOk = !t.consoleMsgs.some(authErrText) && !t.pageErrors.some(authErrText);

  pass(label + '-map-canvas', state.canvas);
  pass(label + '-watermark-text-absent', !state.bodyWater);
  pass(label + '-attribution-osm', state.attrib.includes('OpenStreetMap'), `attrib="${state.attrib.slice(0, 80)}"`);
  pass(label + '-attribution-carto', state.attrib.includes('CARTO'));
  pass(label + '-tiles-keyed-200', keyed200, `tiles=${t.tileRes.length} statuses=${[...new Set(t.tileRes.map(r => r.st))]}`);
  pass(label + '-no-tile-auth-errors', t.bad.length === 0, `bad=${JSON.stringify(t.bad.slice(0, 3))}`);
  pass(label + '-console-no-auth-errors', consoleAuthOk);
  if (state.scrollWidth > state.innerWidth) pass(label + '-no-horizontal-scroll', true, `w=${state.scrollWidth} iw=${state.innerWidth}`);
  return state;
}

let page;
async function run() {
  const MOBILE = process.env.MAP_MOBILE === '1';
  const server = startServer();
  let browser;
  try {
    await waitForServer();
    browser = await puppeteer.launch({
      executablePath: CHROME, headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
      defaultViewport: MOBILE ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 },
    });

    // Session 1: fresh desktop/mobile, normal cache
    {
      const ctx = await browser.createBrowserContext();
      page = await ctx.newPage();
      const t = makeTracker(page);
      await loginMap(page, t);
      await assertMap(t, MOBILE ? 'mobile' : 'desktop');
      await page.screenshot({ path: `${OUT}/carto-${MOBILE ? 'mobile' : 'desktop'}.png`, fullPage: false });

      // Hard refresh (bypass cache) then re-verify map path
      await page.setCacheEnabled(false);
      await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForFunction(() => location.hash.includes('dashboard'), { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      const onDash = await page.evaluate(() => document.body.textContent?.includes('Command Center') ?? false);
      if (onDash) {
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Χάρτης'));
          if (b) b.click();
        });
        await page.waitForFunction(() => document.body.textContent?.includes('Χάρτης · Πωλήσεις πεδίου') && !!document.querySelector('canvas.maplibregl-canvas'), { timeout: 15000 });
        await sleep(8000);
        await assertMap(t, MOBILE ? 'mobile-hardrefresh' : 'desktop-hardrefresh');
      }
      await ctx.close();
    }

    if (!MOBILE) {
      // Fresh incognito browser session (isolated storage + cache)
      const ctx2 = await browser.createBrowserContext();
      page = await ctx2.newPage();
      const t2 = makeTracker(page);
      await loginMap(page, t2);
      await assertMap(t2, 'incognito');
      await ctx2.close();
    }

    console.log('\n===== SUMMARY =====');
    for (const r of results) console.log(`${r.ok === true ? 'PASS' : 'FAIL'} ${r.k}${r.detail ? ' :: ' + r.detail : ''}`);
  } catch (e) {
    console.error('HARNESS ERROR', e);
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run();