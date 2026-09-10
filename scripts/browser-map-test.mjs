import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';

const PORT = 4188;
const BASE = `http://localhost:${PORT}`;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'scripts/.browser-out';
mkdirSync(OUT, { recursive: true });

const secrets = JSON.parse(readFileSync('C:/Users/kalaf/.qa-secrets/hlektrismos-qacc.json', 'utf8'));
const fsAcct = secrets.find(s => s.email === 'qa.fieldsales@hlektrismos.gr');
if (!fsAcct) throw new Error('qa.fieldsales@hlektrismos.gr missing from secrets file');
const EMAIL = fsAcct.email;
const PASSWORD = fsAcct.password; // never logged

const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  const viteBin = 'node_modules/vite/bin/vite.js';
  const child = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => process.stdout.write(`[preview] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[preview-err] ${d}`));
  return child;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/');
      if (r.ok || r.status === 200) return true;
    } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error('preview server did not start');
}

const results = [];
const pass = (k, ok, detail = '') => results.push({ k, ok: Boolean(ok), detail });

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function decodePng(buf) {
  if (buf.length < 8 || ![...buf.subarray(0, 8)].every((v, i) => v === PNG_SIG[i])) throw new Error('not a png');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); off += 4;
    const type = buf.toString('latin1', off, off + 4); off += 4;
    const start = off;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(start);
      height = buf.readUInt32BE(start + 4);
      bitDepth = buf[start + 8];
      colorType = buf[start + 9];
    } else if (type === 'IDAT') idat.push(buf.subarray(start, start + len));
    else if (type === 'IEND') break;
    off = start + len + 4;
  }
  if (!width || !height) throw new Error('no IHDR');
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth);
  if (colorType === 3) throw new Error('palette not supported');
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * ch;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride), src = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[src++];
    if (f > 4) throw new Error('filter ' + f);
    const line = raw.subarray(src, src + stride); src += stride;
    const recon = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? recon[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c;
      }
      recon[i] = v & 255;
    }
    recon.copy(out, y * stride);
    prev = recon;
  }
  return { width, height, ch, data: out };
}

function sampleRegion(img, rect, step = 8) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.height));
  let n = 0, r = 0, g = 0, b = 0, nonBlack = 0, nonWhite = 0;
  const seen = new Set();
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * img.width + x) * img.ch;
      const pr = img.data[i], pg = img.data[i + 1], pb = img.data[i + 2];
      r += pr; g += pg; b += pb; n++;
      if (pr > 25 || pg > 25 || pb > 25) nonBlack++;
      if (pr < 230 || pg < 230 || pb < 230) nonWhite++;
      seen.add((pr >> 4) * 256 + (pg >> 4) * 16 + (pb >> 4));
    }
  }
  if (n === 0) return null;
  return { n, mean: [r, g, b].map(v => Math.round(v / n)), nonBlack: +(nonBlack / n).toFixed(3), nonWhite: +(nonWhite / n).toFixed(3), distinct: seen.size };
}

async function run() {
  const MOBILE = process.env.MAP_MOBILE === '1';
  const server = startServer();
  let browser;
  try {
    await waitForServer();
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--enable-unsafe-swiftshader',
        '--use-angle=swiftshader',
        '--window-size=1280,900',
      ],
      defaultViewport: MOBILE ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 },
    });
    const page = await browser.newPage();
    if (MOBILE) await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const consoleLog = [];
    const pageErrors = [];
    const failedRequests = [];
    const tileRequests = [];
    const tileResponses = [];

    await page.evaluateOnNewDocument(() => {
      window.__diag = { errors: [], rejections: [], logs: [] };
      window.addEventListener('error', e => {
        window.__diag.errors.push(String(e.message) + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''));
      });
      window.addEventListener('unhandledrejection', e => {
        const r = e.reason;
        window.__diag.rejections.push(r && r.stack ? String(r.stack).slice(0, 500) : String(r));
        e.preventDefault();
      });
      const origError = console.error.bind(console);
      console.error = (...args) => { window.__diag.errors.push(args.map(a => typeof a === 'string' ? a : (a && a.message) || JSON.stringify(a)).join(' ')); origError(...args); };
    });
    page.on('console', m => {
      const t = m.text();
      consoleLog.push(t);
      if (m.type() === 'error' || m.type() === 'warning') process.stdout.write(`[console.${m.type()}] ${t}\n`);
    });
    page.on('pageerror', e => { pageErrors.push(String(e)); process.stdout.write(`[pageerror] ${e}\n`); });
    page.on('requestfailed', r => {
      const u = r.url();
      if (!u.includes('supabase.co')) failedRequests.push(`${r.failure()?.errorText ?? '?'} :: ${u}`);
    });
    page.on('response', async r => {
      const u = r.url();
      if (/basemaps\.cartocdn\.com/i.test(u)) tileResponses.push(`${r.status()} :: ${u.slice(0, 140)}`);
      if (/rest\/v1\/follow_ups/i.test(u)) {
        let body = '';
        try { body = (await r.text()).slice(0, 300); } catch { /* ignore */ }
        process.stdout.write(`[resp follow_ups] ${r.status()} :: ${body.replace(/\n/g, ' ')}\n`);
      }
    });
    page.on('request', r => {
      const u = r.url();
      if (/rest\/v1\/follow_ups/i.test(u)) process.stdout.write(`[req follow_ups] ${r.method()} ${u.slice(0, 200)}\n`);
      if (/tiles\.|tile\.|basemaps|raster|\.png|\.mvt|\.pbf|carto/i.test(u) && r.resourceType() === 'image') {
        tileRequests.push(u.slice(0, 160));
      }
    });

    await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });
    pass('login-form', (await page.$('input[type="email"]')) && (await page.$('input[type="password"]')));

    const clearAndType = async (sel, text) => {
      await page.click(sel);
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
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
    await page.waitForFunction(() => location.hash.includes('dashboard') && document.body.textContent?.includes('Command Center'), { timeout: 30000 });
    pass('field-sales-login', true);
    await sleep(2500);

    pass('nav-click-map', await clickText('Χάρτης'));
    await page.waitForFunction(() => document.body.textContent?.includes('Χάρτης · Πωλήσεις πεδίου'), { timeout: 15000 });
    pass('map-page-opened', true);
    await sleep(MOBILE ? 15000 : 12000);

    const state = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.maplibregl-canvas');
      const markers = document.querySelectorAll('.maplibregl-marker').length;
      const attribution = document.querySelector('.maplibregl-ctrl-attrib');
      const mapEl = document.querySelector('[class*="min-h-[380px]"]') || canvas?.parentElement || null;
      const mapBox = mapEl ? mapEl.getBoundingClientRect() : null;
      const mapRoot = document.querySelector('.maplibregl-map');
      const webgl2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
      const webgl1 = (() => { try { return !!document.createElement('canvas').getContext('webgl'); } catch { return false; } })();
      const spinner = [...document.querySelectorAll('span,div,svg')].filter(el => {
        return (el.className && String(el.className).indexOf('animate-spin') !== -1) && getComputedStyle(el).display !== 'none';
      }).length;
      const failureUi = document.body.textContent?.includes('Χάρτης μη διαθέσιμος') ?? false;
      const emptyHint = document.body.textContent?.includes('Δεν βρέθηκαν σημεία') ?? false;
      return {
        canvas: !!canvas,
        canvasWidth: canvas ? canvas.width : 0,
        canvasHeight: canvas ? canvas.height : 0,
        canvasRect: mapBox ? { x: mapBox.x, y: mapBox.y, width: mapBox.width, height: mapBox.height } : null,
        markerCount: markers,
        attribution: !!attribution,
        mapRootClass: mapRoot ? mapRoot.className.slice(0, 80) : null,
        mapRootChildCount: mapRoot ? mapRoot.children.length : 0,
        mapHeightPx: mapBox ? Math.round(mapBox.height) : 0,
        mapWidthPx: mapBox ? Math.round(mapBox.width) : 0,
        webgl2, webgl1,
        spinEls: spinner,
        failureUi,
        emptyHint,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        diag: window.__diag,
        hasSearch: !!document.querySelector('input[placeholder*="Αναζήτηση"]'),
        hasFilters: [...document.querySelectorAll('button')].some(b => b.textContent?.trim() && ['Όλα', 'Ενεργά', 'Leads', 'Σημερινές Επισκέψεις'].includes(b.textContent.trim())),
      };
    });

    const { mapHeightPx, canvasRect } = state;
    pass('map-canvas-created', state.canvas, `canvas ${state.canvasWidth}x${state.canvasHeight} elh=${state.mapHeightPx}`);
    pass('map-attribution', state.attribution);
    const sizeOk = MOBILE ? mapHeightPx >= 380 && mapHeightPx <= 700 : mapHeightPx >= 500;
    pass(MOBILE ? 'map-height-mobile-380' : 'map-height-desktop-500', sizeOk, `mapHeightPx=${mapHeightPx}`);
    if (MOBILE) pass('no-horizontal-scroll', state.scrollWidth <= state.innerWidth, `scrollWidth=${state.scrollWidth} innerWidth=${state.innerWidth}`);
    pass('map-spinner-gone', state.spinEls === 0, `spinEls=${state.spinEls}`);
    pass('failure-ui-absent', !state.failureUi);
    pass('map-controls-visible', state.hasSearch && state.hasFilters);
    results.push({ k: '__info__', detail: JSON.stringify(state, null, 2) });
    results.push({ k: '__markers__', ok: true, detail: `markerCount=${state.markerCount} emptyHint=${state.emptyHint}` });

    const shot = await page.screenshot({ path: `${OUT}/map-${MOBILE ? 'mobile' : 'desktop'}.png`, fullPage: false });
    let sample = null;
    try {
      const img = decodePng(Buffer.from(shot));
      sample = sampleRegion(img, canvasRect);
    } catch (e) { sample = { decodeError: String(e.message) }; }
    const painted = !!(sample && sample.n && sample.nonBlack > 0.35 && sample.distinct >= 4);
    pass(MOBILE ? 'map-tiles-painted-mobile' : 'map-tiles-painted-desktop', painted, JSON.stringify(sample));

    if (!MOBILE) {
      const errsBefore = await page.evaluate(() => window.__diag.errors.length);

      await clickText('Θέση μου');
      await page.waitForFunction(() => document.body.textContent?.includes('LOCATION UNAVAILABLE'), { timeout: 12000 });
      pass('gps-denied-location-unavailable', true);

      const cdp = await page.createCDPSession();
      await browser.defaultBrowserContext().overridePermissions(BASE + '/', ['geolocation']);
      await cdp.send('Emulation.setGeolocationOverride', { latitude: 37.9838, longitude: 23.7275, accuracy: 10 });
      const geoProbe = await page.evaluate(() => new Promise(res => {
        navigator.geolocation.getCurrentPosition(
          p => res('ok:' + p.coords.latitude + ',' + p.coords.longitude + ' acc=' + p.coords.accuracy),
          e => res('err:' + e.code + ':' + e.message),
          { timeout: 5000 });
      }));
      process.stdout.write(`[geo-probe] ${geoProbe}\n`);
      await clickText('Θέση μου');
      await sleep(2000);
      const afterGps = await page.evaluate(() => ({
        markers: document.querySelectorAll('.maplibregl-marker').length,
        meMarker: [...document.querySelectorAll('.maplibregl-marker')].some(m => m.textContent?.includes('Εδώ') || m.className.includes('marker')),
        hasToast: document.body.textContent?.includes('Η θέση σας ενημερώθηκε') ?? false,
        hereIam: document.body.textContent?.includes('Εδώ είμαι') ?? false,
        locUnavailable: document.body.textContent?.includes('LOCATION UNAVAILABLE') ?? false,
        bodyTail: document.body.textContent.slice(-600).replace(/\n+/g, ' | '),
      }));
      process.stdout.write(`[gps-after] ${JSON.stringify(afterGps)}\n`);
      const gpsOk = afterGps.meMarker || afterGps.hasToast || afterGps.hereIam;
      pass('gps-success-me-marker', gpsOk, `markers=${afterGps.markers} hasToast=${afterGps.hasToast} hereIam=${afterGps.hereIam} locUnavailable=${afterGps.locUnavailable}`);
      await sleep(1000);

      await clickText('Σημερινές Επισκέψεις');
      await sleep(2000);
      const afterFilter = await page.evaluate(() => ({
        canvas: !!document.querySelector('canvas.maplibregl-canvas'),
        failure: document.body.textContent?.includes('Χάρτης μη διαθέσιμος') ?? false,
        errs: window.__diag.errors.length,
      }));
      pass('filter-today-stable', afterFilter.canvas && !afterFilter.failure && afterFilter.errs === errsBefore, JSON.stringify(afterFilter));

      await clickText('Ημέρα μου');
      await sleep(2500);
      const mydayState = await page.evaluate(() => ({
        header: document.body.textContent?.includes('Ημέρα μου ·') ?? false,
        nearby: document.body.textContent?.includes('Κοντινά cases') ?? false,
        hasNavBtn: [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Χάρτης')),
      }));
      process.stdout.write(`[myday-state] ${JSON.stringify(mydayState)}\n`);
      await page.waitForFunction(() => document.body.textContent?.includes('Ημέρα μου ·'), { timeout: 15000 });
      pass('nav-to-myday', true, `header=${mydayState.header} nearby=${mydayState.nearby}`);
      await sleep(800);
      await clickText('Χάρτης');
      await page.waitForFunction(() => document.body.textContent?.includes('Χάρτης · Πωλήσεις πεδίου') && !!document.querySelector('canvas.maplibregl-canvas'), { timeout: 15000 });
      await sleep(4000);
      pass('nav-back-to-map-canvas', true);
    }

    console.log('\n===== SUMMARY =====');
    for (const r of results) console.log(`${r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'INFO'} ${r.k}${r.detail ? ' :: ' + r.detail : ''}`);
    console.log('\n===== CONSOLE (errors/warnings) =====');
    consoleLog.filter(l => /error|warn|fail|worker|webgl|tile/i.test(l)).slice(0, 40).forEach(l => console.log(' -', l));
    console.log('\n===== PAGE ERRORS (window hooks) =====');
    const diag = results.find(r => r.k === '__info__')?.detail ? JSON.parse(results.find(r => r.k === '__info__').detail) : null;
    if (diag?.diag?.errors) diag.diag.errors.slice(0, 10).forEach(e => console.log(' -', e.slice(0, 400)));
    if (diag?.diag?.rejections) diag.diag.rejections.slice(0, 10).forEach(e => console.log(' - REJECTION:', e.slice(0, 400)));
    console.log('\n===== PAGE ERRORS (puppeteer) =====');
    pageErrors.forEach(e => console.log(' -', e.slice(0, 400)));
    console.log('\n===== FAILED REQUESTS =====');
    failedRequests.slice(0, 25).forEach(r => console.log(' -', r));
    console.log(`\n===== TILE REQUESTS (${tileRequests.length}) =====`);
    tileRequests.slice(0, 6).forEach(t => console.log(' -', t));
    console.log(`===== BASEMAP RESPONSES (${tileResponses.length}) =====`);
    tileResponses.slice(0, 10).forEach(t => console.log(' -', t));
  } catch (e) {
    console.error('TEST HARNESS ERROR:', e);
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run();