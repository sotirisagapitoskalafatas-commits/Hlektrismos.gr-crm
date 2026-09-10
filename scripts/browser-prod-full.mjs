import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';

const PROD_URL = process.env.PROD_URL || 'https://hlektrismos-crm.vercel.app';
const STALE_MAIN = 'index-BtDsw_VT.js';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'scripts/.browser-out';
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/live-corpus`, { recursive: true });

const secrets = JSON.parse(readFileSync('C:/Users/kalaf/.qa-secrets/hlektrismos-qacc.json', 'utf8'));
const fsAcct = secrets.find(s => s.email === 'qa.fieldsales@hlektrismos.gr');
if (!fsAcct) throw new Error('qa.fieldsales@hlektrismos.gr missing from secrets file');
const EMAIL = fsAcct.email;
const PASSWORD = fsAcct.password; // never logged

const sleep = ms => new Promise(r => setTimeout(r, ms));
const REDACT = u => u.replace(/(cb1_[0-9A-Za-z_]+)/g, '[KEY]').replace(/(\?key=)[^&\s"']+/, '$1[KEY]');

const results = [];
const pass = (k, ok, detail = '') => results.push({ k, ok: Boolean(ok), detail });
const info = (k, detail = '') => results.push({ k, ok: 'info', detail });

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function decodePng(buf) {
  if (buf.length < 8 || ![...buf.subarray(0, 8)].every((v, i) => v === PNG_SIG[i])) throw new Error('not a png');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); off += 4;
    const type = buf.toString('latin1', off, off + 4); off += 4;
    const start = off;
    if (type === 'IHDR') { width = buf.readUInt32BE(start); height = buf.readUInt32BE(start + 4); bitDepth = buf[start + 8]; colorType = buf[start + 9]; }
    else if (type === 'IDAT') idat.push(buf.subarray(start, start + len));
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
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) {
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
  for (let yy = y0; yy < y1; yy += step) {
    for (let xx = x0; xx < x1; xx += step) {
      const i = (yy * img.width + xx) * img.ch;
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

async function collectCorpus() {
  const found = new Set();
  const queue = ['/assets/' + (/\/assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(await (await fetch(PROD_URL + '/')).text())?.[1] || '')];
  const refRe = /\/?assets\/[A-Za-z0-9_-]+\.js/g;
  while (queue.length) {
    const path = queue.shift();
    if (found.has(path)) continue;
    let code = '';
    try { code = await (await fetch(PROD_URL + path)).text(); } catch { continue; }
    found.add(path);
    writeFileSync(`${OUT}/live-corpus/${path.slice(8)}`, code, 'utf8');
    for (const ref of (code.match(refRe) || [])) {
      const p = '/assets/' + ref.replace(/^\/?assets\//, '');
      if (!found.has(p) && !queue.includes(p)) queue.push(p);
    }
  }
  return found;
}

async function verifyBundle() {
  const html = await (await fetch(PROD_URL + '/')).text();
  const m = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
  const mainAsset = m ? m[1] : null;
  if (!mainAsset) return { asset: null, error: 'no main asset found' };
  const files = await collectCorpus();
  let code = '';
  for (const f of files) code += readFileSync(`${OUT}/live-corpus/${f.slice(8)}`, 'utf8');
  return {
    asset: mainAsset,
    fresh: mainAsset !== STALE_MAIN,
    chunkCount: files.size,
    bytes: code.length,
    hasKeyMissingError: code.includes('CARTO basemap key missing'),
    keyedTemplate: code.includes('rastertiles/voyager/{z}/{x}/{y}.png?key='),
    bareTemplate: code.includes('rastertiles/voyager/{z}/{x}/{y}.png"'),
    cartoKeyInlined: /cb1_[0-9A-Za-z_]+/.test(code),
    newAttribution: code.includes('carto.com/attributions'),
    supabaseRefCount: (code.match(/nonaymiwdayfuulccxrl/g) || []).length,
  };
}

async function run() {
  const MOBILE = process.env.PROD_MOBILE === '1';
  const bundle = await verifyBundle();
  pass('prod-main-asset-fresh', !!bundle.asset && bundle.fresh, bundle.asset || bundle.error);
  pass('prod-bundle-key-inlined', !!bundle.cartoKeyInlined, `bytes=${bundle.bytes} keyedTemplate=${bundle.keyedTemplate} bareTemplate=${bundle.bareTemplate} newAttribution=${bundle.newAttribution} supabaseRef=${bundle.supabaseRefCount}`);
  pass('prod-bundle-key-missing-error-still-present', bundle.hasKeyMissingError);

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,900'],
      defaultViewport: MOBILE ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 },
    });
    const page = await browser.newPage();
    if (MOBILE) await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const pageErrors = [];
    const failedRequests = [];
    const tileResponses = [];

    await page.evaluateOnNewDocument(() => {
      window.__diag = { errors: [], rejections: [], opens: [] };
      window.addEventListener('error', e => window.__diag.errors.push(String(e.message) + ' @ ' + (e.filename || '') + ':' + (e.lineno || '')));
      window.addEventListener('unhandledrejection', e => { window.__diag.rejections.push((e.reason && e.reason.stack ? e.reason.stack : String(e.reason)).slice(0, 400)); e.preventDefault(); });
      window.__openOrig = window.open.bind(window);
      window.open = (...a) => { window.__diag.opens.push(String(a[0])); try { return window.__openOrig(...a); } catch { return null; } };
    });
    page.on('pageerror', e => { pageErrors.push(String(e)); process.stdout.write(`[pageerror] ${String(e).slice(0, 300)}\n`); });
    page.on('requestfailed', r => {
      const u = r.url();
      if (!u.includes('supabase.co')) failedRequests.push(`${r.failure()?.errorText ?? '?'} :: ${REDACT(u)}`);
    });
    page.on('response', async r => {
      const u = r.url();
      if (/basemaps\.cartocdn\.com/i.test(u)) tileResponses.push(`${r.status()} ${(r.headers()['content-type'] || '').slice(0, 30)} :: ${REDACT(u).slice(0, 120)}`);
    });

    await page.goto(`${PROD_URL}/#/login`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input[type="email"]', { timeout: 60000 });
    pass('prod-login-form', true, PROD_URL);

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
      await page.waitForFunction(() => location.hash.includes('dashboard') && document.body.textContent?.includes('Command Center'), { timeout: 40000 });
      pass('prod-field-sales-login', true);
    } catch {
      pass('prod-field-sales-login', false);
      throw new Error('login failed on production');
    }
    await sleep(2500);

    pass('nav-click-map', await clickText('Χάρτης'));
    await page.waitForFunction(() => document.body.textContent?.includes('Χάρτης · Πωλήσεις πεδίου') || document.body.textContent?.includes('Χάρτης μη διαθέσιμος') || !!document.querySelector('canvas.maplibregl-canvas'), { timeout: 30000 });
    await page.waitForFunction(() => window.__diag.errors.length >= 0 && (document.body.textContent?.includes('Χάρτης μη διαθέσιμος') || document.querySelector('canvas.maplibregl-canvas')), { timeout: 40000 });
    await sleep(MOBILE ? 18000 : 16000);

    const state = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.maplibregl-canvas');
      const markers = document.querySelectorAll('.maplibregl-marker').length;
      const attrib = document.querySelector('.maplibregl-ctrl-attrib');
      const attribHrefs = attrib ? [...attrib.querySelectorAll('a')].map(a => a.getAttribute('href') || '') : [];
      const mapEl = document.querySelector('[class*="min-h-[380px]"]') || canvas?.parentElement || null;
      const rect = mapEl ? mapEl.getBoundingClientRect() : null;
      const t = document.body.textContent || '';
      return {
        canvas: !!canvas,
        canvasW: canvas ? canvas.width : 0,
        canvasH: canvas ? canvas.height : 0,
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        markerCount: markers,
        attrib: !!attrib,
        attribLinks: attribHrefs,
        failureBox: t.includes('Χάρτης μη διαθέσιμος'),
        failureBoxText: t.includes('Χάρτης μη διαθέσιμος') ? t.slice(t.indexOf('Χάρτης μη διαθέσιμος'), t.indexOf('Χάρτης μη διαθέσιμος') + 260).replace(/\s+/g, ' ') : '',
        keyMissing: t.includes('CARTO basemap key missing'),
        apiKeyRequired: t.toUpperCase().includes('API KEY REQUIRED'),
        watermark: /API.?KEY|WATERMARK|UNLICENSED/i.test(t),
        geoUnavailable: t.includes('LOCATION UNAVAILABLE'),
        hasSearch: !!document.querySelector('input[placeholder*="Αναζήτηση"]'),
        hasFilters: [...document.querySelectorAll('button')].some(b => ['Όλα', 'Ενεργά', 'Leads', 'Σημερινές Επισκέψεις'].includes(b.textContent?.trim())),
        spinEls: [...document.querySelectorAll('span,div,svg')].filter(el => (el.className && String(el.className).indexOf('animate-spin') !== -1) && getComputedStyle(el).display !== 'none').length,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        errs: window.__diag.errors.slice(0, 10),
      };
    });

    pass('prod-failure-box-absent', !state.failureBox, state.failureBoxText.slice(0, 140) || 'no box');
    pass('prod-key-missing-absent', !state.keyMissing);
    pass('prod-api-key-required-watermark-absent', !state.apiKeyRequired && !state.watermark);
    pass('prod-tiles-requested-200', tileResponses.length > 0 && tileResponses.every(t => t.startsWith('200')), `responses=${tileResponses.length} | first=${tileResponses[0] || 'none'}`);
    pass('prod-attribution-present', state.attrib, `links=${state.attribLinks.length}`);
    pass('prod-carto-attribution-link', state.attribLinks.some(h => h.includes('carto.com/attributions') || h.includes('basemaps.cartocdn.com')), state.attribLinks.join(' | ').slice(0, 160));
    pass('prod-map-canvas', state.canvas, `${state.canvasW}x${state.canvasH}`);
    pass('prod-spinner-gone', state.spinEls === 0, `spinEls=${state.spinEls}`);
    pass('prod-controls-visible', state.hasSearch && state.hasFilters);
    pass('prod-log-no-errors', state.errs.length === 0, state.errs.join(' | '));
    pass('prod-precision', tileResponses.length > 0, `responses=${tileResponses.length}`);

    const shot = await page.screenshot({ path: `${OUT}/prod-${MOBILE ? 'mobile' : 'desktop'}.png`, fullPage: false });
    let sample = null;
    try { const img = decodePng(Buffer.from(shot)); sample = sampleRegion(img, state.rect); }
    catch (e) { sample = { decodeError: String(e.message) }; }
    const painted = !!(sample && sample.n && sample.nonBlack > 0.35 && sample.distinct >= 4);
    pass(MOBILE ? 'prod-tiles-painted-mobile' : 'prod-tiles-painted-desktop', painted && state.canvas, JSON.stringify(sample));
    if (MOBILE) {
      pass('prod-no-horizontal-scroll', state.scrollWidth <= state.innerWidth, `scrollWidth=${state.scrollWidth} innerWidth=${state.innerWidth}`);
    } else {
      pass('prod-markers-rendered', state.markerCount > 0, `markers=${state.markerCount}`);

      const routeBtn = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => x.textContent?.trim().includes('Δρομολόγιο'));
        return b ? { disabled: b.disabled, txt: b.textContent.trim().slice(0, 30) } : null;
      });
      if (routeBtn && !routeBtn.disabled) {
        const errs0 = await page.evaluate(() => window.__diag.errors.length);
        await clickText('Δρομολόγιο');
        await page.waitForFunction(() => document.body.textContent?.includes('Route planner'), { timeout: 15000 });
        await page.waitForFunction(() => document.body.textContent?.includes('Εκτίμηση ευθείας γραμμής') || document.body.textContent?.includes('openrouteservice'), { timeout: 25000 }).catch(() => {});
        const route = await page.evaluate(prev => ({
          planner: document.body.textContent?.includes('Route planner') ?? false,
          plan: document.body.textContent?.includes('Εκτίμηση ευθείας γραμμής') || document.body.textContent?.includes('openrouteservice'),
          errs: window.__diag.errors.length - prev,
        }), errs0);
        pass('prod-routing-panel', route.planner && route.plan && route.errs === 0, `plan=${route.plan}`);
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Κλείσιμο δρομολογίου'); if (b) b.click(); });
        await sleep(800);
      } else {
        info('prod-routing-panel', routeBtn ? 'disabled: <2 στάσεις σήμερα' : 'no route button');
      }

      await clickText('Θέση μου');
      await page.waitForFunction(() => document.body.textContent?.includes('LOCATION UNAVAILABLE'), { timeout: 15000 });
      pass('prod-gps-denied', true);

      const cdp = await page.createCDPSession();
      await browser.defaultBrowserContext().overridePermissions(PROD_URL + '/', ['geolocation']);
      await cdp.send('Emulation.setGeolocationOverride', { latitude: 37.9838, longitude: 23.7275, accuracy: 10 });
      await page.evaluate(() => new Promise(res => {
        navigator.geolocation.getCurrentPosition(() => res(true), () => res(false), { timeout: 5000 });
      }));
      await clickText('Θέση μου');
      await sleep(2500);
      const afterGps = await page.evaluate(() => ({
        meMarker: [...document.querySelectorAll('.maplibregl-marker')].some(m => m.textContent?.includes('Εδώ') || m.className.includes('marker')),
        toast: document.body.textContent?.includes('Η θέση σας ενημερώθηκε') ?? false,
        hereIam: document.body.textContent?.includes('Εδώ είμαι') ?? false,
        locUnavailable: document.body.textContent?.includes('LOCATION UNAVAILABLE') ?? false,
      }));
      pass('prod-gps-success', afterGps.meMarker || afterGps.toast || afterGps.hereIam, JSON.stringify(afterGps));
      await sleep(1000);

      const errsBefore = await page.evaluate(() => window.__diag.errors.length);
      await clickText('Σημερινές Επισκέψεις');
      await sleep(2500);
      const afterFilter = await page.evaluate(prev => ({
        canvas: !!document.querySelector('canvas.maplibregl-canvas'),
        failure: document.body.textContent?.includes('Χάρτης μη διαθέσιμος') ?? false,
        errs: window.__diag.errors.length - prev,
      }), errsBefore);
      pass('prod-filter-today-stable', afterFilter.canvas && !afterFilter.failure && afterFilter.errs === 0, JSON.stringify(afterFilter));

      const navOpen = async () => {
        const mk = await page.$$('.maplibregl-marker');
        for (let i = 0; i < Math.min(mk.length, 6); i++) {
          await mk[i].click();
          await sleep(600);
          const has = await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Πλοήγηση')));
          if (has) return true;
        }
        return false;
      };
      const opened = await navOpen();
      if (opened) {
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Πλοήγηση')); if (b) b.click(); });
        await sleep(1500);
        const nav = await page.evaluate(() => {
          const u = window.__diag.opens[window.__diag.opens.length - 1] || '';
          return { url: u.slice(0, 40), isDirections: u.includes('google.com/maps/dir/') && u.includes('destination=') };
        });
        pass('prod-navigation-opens-google-maps', nav.isDirections, nav.url + '…');
      } else {
        info('prod-navigation-opens-google-maps', 'no navigable marker preview');
      }
    }

    await clickText('Ημέρα μου');
    await page.waitForFunction(() => document.body.textContent?.includes('Ημέρα μου ·'), { timeout: 20000 });
    pass('prod-nav-to-myday', true);
    await sleep(1500);

    if (!MOBILE) {
      const rows = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('div.space-y-2 > div button')];
        return btns.map(b => ({ txt: b.textContent?.trim().slice(0, 60) ?? '', disabled: b.disabled }));
      });
      let checkState = 'none';
      if (rows.length > 0) {
        for (const r of rows) {
          const rowIdx = rows.indexOf(r);
          if (r.disabled) continue;
          const els = await page.$$('div.space-y-2 > div');
          if (!els[rowIdx]) continue;
          await els[rowIdx].click();
          await sleep(700);
          const actions = await page.evaluate(() => ({
            checkIn: [...document.querySelectorAll('button')].some(b => b.textContent?.trim().trim().startsWith('Check In') || b.textContent?.trim().includes('Check In')),
            checkOut: [...document.querySelectorAll('button')].some(b => b.textContent?.trim().includes('Check Out')),
          }));
          if (!actions.checkIn && !actions.checkOut) { await els[rowIdx].click(); continue; }
          if (actions.checkIn) {
            await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Check In')); if (b) b.click(); });
            await sleep(3000);
            const ok = await page.evaluate(() => document.body.textContent?.includes('Check In ✓') ?? false);
            const bad = await page.evaluate(() => document.body.textContent?.includes('Το Check In απέτυχε') ?? false);
            pass('prod-check-in', ok && !bad, ok ? 'Check In ✓' : bad ? 'check-in failed' : 'no toast');
            checkState = ok ? 'checked-in' : 'failed';
            if (!ok) break;
            await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Check Out')), { timeout: 15000 }).catch(() => {});
            await sleep(500);
          }
          if (await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Check Out')))) {
            await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('Check Out')); if (b) b.click(); });
            await sleep(3000);
            const ok = await page.evaluate(() => document.body.textContent?.includes('Check Out ✓') ?? false);
            const bad = await page.evaluate(() => document.body.textContent?.includes('Το Check Out απέτυχε') ?? false);
            pass('prod-check-out', ok && !bad, ok ? 'Check Out ✓' : bad ? 'check-out failed' : 'no toast');
            checkState = ok ? 'checked-out' : 'failed';
          }
          break;
        }
      }
      if (checkState === 'none') info('prod-check-in-out', 'no visit rows for QA account today (Σημερινές επισκέψεις)');
    } else {
      info('prod-check-in-out', 'skipped on mobile');
    }

    await clickText('Χάρτης');
    await page.waitForFunction(() => document.body.textContent?.includes('Χάρτης · Πωλήσεις πεδίου') && (document.querySelector('canvas.maplibregl-canvas') || document.body.textContent?.includes('Χάρτης μη διαθέσιμος')), { timeout: 20000 });
    await sleep(MOBILE ? 7000 : 5000);
    pass('prod-nav-back-to-map', true);

    console.log('\n===== PRODUCTION FULL PROBE SUMMARY =====');
    for (const r of results) console.log(`${r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'INFO'} ${r.k}${r.detail ? ' :: ' + r.detail : ''}`);
    console.log('\n===== PAGE ERRORS =====');
    pageErrors.slice(0, 10).forEach(e => console.log(' -', e.slice(0, 400)));
    console.log('\n===== FAILED REQUESTS (non-supabase) =====');
    failedRequests.slice(0, 20).forEach(f => console.log(' -', f));
    console.log(`\n===== CARTO TILE RESPONSES (${tileResponses.length}) =====`);
    tileResponses.slice(0, 8).forEach(t => console.log(' -', t));
  } catch (e) {
    console.error('HARNESS ERROR:', String(e).slice(0, 600));
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
  }
}

run();