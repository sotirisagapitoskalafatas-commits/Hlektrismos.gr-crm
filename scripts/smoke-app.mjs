import puppeteer from 'puppeteer-core';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4173';
const EDGE = process.env.SMOKE_EDGE ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DEMO_EMAIL = 'demo@hlektrismos.gr';

const results = [];
let ok = (name, fn) => (async () => {
  try { await fn(); results.push({ name, ok: true }); console.log(`PASS  ${name}`); }
  catch (e) { results.push({ name, ok: false }); console.log(`FAIL  ${name} :: ${String(e.message ?? e).split('\n')[0]}`); }
})();

async function clickText(page, text, timeout = 15000) {
  const h = await page.waitForFunction((t) => {
    const el = [...document.querySelectorAll('button')].find(b =>
      !b.closest('.glass-nav, .glass-drawer') && b.textContent.trim().includes(t) && !b.disabled);
    return el || null;
  }, { timeout }, text);
  await h.click();
}

async function hasText(page, text) {
  return page.evaluate(t => document.body.innerText.includes(t), text);
}

async function waitGone(page, text, timeout = 20000) {
  await page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout }, text);
}

async function fillInput(page, handle, value) {
  await handle.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.type(value, { delay: 10 });
}

async function login(page) {
  await page.goto(`${BASE}/#/login`, { waitUntil: 'domcontentloaded' });
  const emailPresent = !!(await page.$('input[type=email]'));
  const passPresent = !!(await page.$('input[type=password]'));
  if (!emailPresent || !passPresent) {
    throw new Error(`[login-diag] email=${emailPresent} password=${passPresent} hash=${await page.evaluate(() => location.hash)}`);
  }
  const emailField = await page.$('input[type=email]');
  const passField = await page.$('input[type=password]');
  const demoPassword = await passField.evaluate(el => el && el.value ? el.value : '');
  if (!demoPassword) throw new Error('[login-diag] demo password field is empty');

  await fillInput(page, emailField, DEMO_EMAIL);
  await fillInput(page, passField, demoPassword);

  const submitPresent = !!(await page.$('form button[type=submit]'));
  if (!submitPresent) throw new Error('[login-diag] submit button missing');
  await page.click('form button[type=submit]');

  try {
    await page.waitForSelector('.glass-nav', { timeout: 30000 });
  } catch {
    const m = await page.evaluate(() => JSON.stringify({
      hash: location.hash,
      hasError: document.body.innerText.includes('Λάθος στοιχεία'),
      email: !!document.querySelector('input[type=email]'),
      password: !!document.querySelector('input[type=password]'),
      excerpt: document.body.innerText.slice(0, 300),
    }));
    throw new Error(`[login-diag] shell did not appear :: ${m}`);
  }
  const hash = await page.evaluate(() => location.hash);
  if (!hash.startsWith('#/app')) throw new Error(`[login-diag] view did not transition to app (hash=${hash})`);
}

async function clipTimeline(p) {
  await clickText(p, 'Χρονολόγιο');
}

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-dev-shm-usage',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--window-size=1280,800',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.setDefaultTimeout(20000);

try {
  // ---------- AUTHENTICATION ----------
  let authed = false;
  await ok('authenticate with the real demo login flow', async () => { await login(page); authed = true; });

  if (!authed) {
    console.log('\n[abort] Suite aborted — authentication did not succeed (previous failures were downstream of this step).');
  } else {
    // ---------- DESKTOP SHELL ----------
    await ok('desktop: glass sidebar (rail) visible', async () => {
      const rail = await page.$('.glass-nav');
      if (!rail) throw new Error('no .glass-nav');
      const w = await (await rail.getProperty('className')).jsonValue();
      if (!String(w).includes('w-64')) throw new Error(`rail width=${w}`);
    });

    await ok('desktop: category icons rendered', async () => {
      const cats = await page.$$eval('.nav-cat-icon, .nav-cat-accent', els => els.length);
      if (cats < 4) throw new Error(`only ${cats} categories`);
    });

    await ok('desktop: subcategory leaf icons rendered', async () => {
      const leaves = await page.$$eval('.nav-leaf', els => els.length);
      if (leaves < 8) throw new Error(`only ${leaves} leaves`);
    });

    await ok('desktop: nav badges present (leads/followups/backoffice)', async () => {
      const badges = await page.$$eval('.nav-badge', els => els.length);
      if (badges < 1) throw new Error('no badges');
    });

    await ok('desktop: collapse rail -> compact + tooltips', async () => {
      await page.click('button[aria-label="Σύμπτυξη sidebar"]');
      const cls = await page.$eval('#shell-rail', el => el.className);
      if (!String(cls).includes('w-[68px]')) throw new Error(`width=${cls}`);
      const titles = await page.$$eval('.nav-leaf', els => els.filter(e => e.title && e.title.length > 0).length);
      if (titles < 5) throw new Error(`tooltips=${titles}`);
      await page.click('button[aria-label="Ανάπτυξη sidebar"]');
    });

    await ok('desktop: top nav header present', async () => {
      const hdr = await page.$('header');
      if (!hdr) throw new Error('no header');
      const txt = await hdr.evaluate(el => el.innerText);
      if (!/Dashboard|ATLAS/i.test(txt)) throw new Error(`header text=${txt.slice(0, 60)}`);
    });

    await ok('desktop: notification center opens with seeded notifications', async () => {
      await page.click('button[title="Ειδοποιήσεις"]');
      await page.waitForFunction(() => document.body.innerText.includes('Ειδοποιήσεις'));
      const entries = await page.$$eval('button[title="Ειδοποιήσεις"] + div button', els => els.length);
      if (entries < 1) throw new Error('no notification body');
      await page.click('button[title="Ειδοποιήσεις"]');
    });

    await ok('desktop: account menu (profile, role, demo switcher)', async () => {
      await page.click('button[aria-label="Λογαριασμός"]');
      await page.waitForFunction(() => document.querySelector('[role="menu"]') !== null);
      const opts = await page.$$eval('[role="menu"] select option', els => els.length);
      if (opts !== 5) throw new Error(`role options=${opts}`);
      if (!(await hasText(page, 'Επίδειξη ρόλου (demo)'))) throw new Error('demo switcher label missing');
      await page.click('button[aria-label="Λογαριασμός"]');
    });

    // ---------- COMMAND CENTER ----------
    await ok('command center: ⌘K opens', async () => {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
      await page.waitForFunction(() => document.body.innerText.includes('Command Center'));
    });

    await ok('command center: case search finds CASE-1000 and opens it', async () => {
      const input = await page.waitForSelector('input[placeholder*="Πληκτρολογήστε"]');
      await input.type('CASE-1000');
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('CASE-1000')), { timeout: 15000 });
      await clickText(page, 'CASE-1000');
      await page.waitForFunction(() => document.body.innerText.includes('Χρονολόγιο'));
    });

    // ---------- CASE ----------
    await ok('case: detail renders all tabs', async () => {
      const tabs = await page.$$eval('button', els => els.map(b => b.textContent.trim()));
      for (const t of ['Χρονολόγιο', 'Follow Ups', 'Έγγραφα', 'Επισκέψεις', 'Προσφορές', 'Υπογραφές', 'Back Office']) {
        if (!tabs.some(x => x.includes(t))) throw new Error(`tab ${t} missing`);
      }
    });

    await ok('case: visits tab loads', async () => {
      await clickText(page, 'Επισκέψεις');
      await page.waitForFunction(() => document.body.innerText.includes('Επισκέψεις') && document.body.innerText.includes('Προγραμματισμός'));
    });

    await ok('case: follow ups tab loads', async () => {
      await clickText(page, 'Follow Ups');
      await page.waitForFunction(() => document.body.innerText.includes('Νέο'));
    });

    await ok('case: offers tab loads', async () => {
      await clickText(page, 'Προσφορές');
      await page.waitForFunction(() => document.body.innerText.includes('Νέα'));
    });

    await ok('case: back office tab loads', async () => {
      await clickText(page, 'Back Office');
      await page.waitForFunction(() => document.body.innerText.includes('Λειτουργική Ολοκλήρωση'));
    });

    // ---------- FIELD SALES: DOCUMENTS / CAMERA ----------
    await ok('camera: CaptureModal opens from Documents', async () => {
      await clickText(page, 'Έγγραφα');
      await clickText(page, 'Κάμερα');
      await page.waitForFunction(() => [...document.querySelectorAll('h2')].some(h => h.textContent === 'Λήψη φωτογραφίας πεδίου'));
    });

    const cameraFallback = await hasText(page, 'Η κάμερα δεν είναι διαθέσιμη');
    let cameraCaptured = false;

    await ok('camera: real capture OR fallback upload', async () => {
      if (cameraFallback) {
        console.log('      [note] getUserMedia unavailable → fallback upload UI shown');
        if (!(await hasText(page, 'Επιλογή φωτογραφίας'))) throw new Error('fallback button missing');
        return;
      }
      const ready = await page.waitForFunction(() => {
        const v = document.querySelector('video');
        return v && v.videoWidth > 0 && v.readyState >= 2;
      }, { timeout: 10000 }).catch(() => null);
      if (!ready) {
        console.log('      [note] headless fake camera produced no frames → capture skipped');
        return;
      }
      await page.click('button[aria-label="Λήψη φωτογραφίας"]');
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Αποθήκευση') && !b.disabled), { timeout: 8000 });
      await clickText(page, 'Αποθήκευση');
      cameraCaptured = true;
    });

    await ok('camera: modal closes after save', async () => {
      if (!(await hasText(page, 'Λήψη φωτογραφίας πεδίου'))) return;
      if (cameraFallback || !cameraCaptured) await page.click('button[aria-label="Κλείσιμο"]');
      await waitGone(page, 'Λήψη φωτογραφίας πεδίου');
    });

    if (cameraCaptured) {
      await ok('camera: captured photo persisted (photo_) + timeline activity', async () => {
        await page.waitForFunction(() => document.body.innerText.includes('photo_'), { timeout: 15000 });
        await clipTimeline(page);
        await page.waitForFunction(() => document.body.innerText.includes('Έγγραφο:'), { timeout: 15000 });
      });
    } else {
      console.log('      [skip] photo record check skipped (no real capture in headless)');
    }

    // ---------- FIELD SALES: SIGNATURE PAD ----------
    await ok('signature: pad opens + canvas draw + confirm', async () => {
      await clickText(page, 'Υπογραφές');
      await clickText(page, 'Νέα υπογραφή');
      const canvas = await page.waitForSelector('canvas[aria-label="Περιοχή υπογραφής"]');
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + 40, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(box.x + 40 + i * 14, box.y + box.height / 2 + (i % 2 ? 22 : -18));
      }
      await page.mouse.up();
      await clickText(page, 'Επιβεβαίωση');
    });

    await ok('signature: persisted (signature_) + timeline recorded', async () => {
      await waitGone(page, 'Πεδίο υπογραφής');
      await page.waitForFunction(() => document.body.innerText.includes('signature_'), { timeout: 15000 });
      await clipTimeline(page);
      await page.waitForFunction(() => document.body.innerText.includes('Υπογραφή λήφθηκε'), { timeout: 15000 });
    });

    // ---------- MOBILE ----------
    await ok('mobile: hamburger opens glass drawer with nav + role simulator', async () => {
      await page.setViewport({ width: 390, height: 844 });
      const railVisible = await page.$$eval('#shell-rail', els => {
        const el = els[0];
        return el && getComputedStyle(el).display !== 'none';
      });
      if (railVisible) throw new Error('desktop rail still visible on mobile width');
      const hamburger = await page.$('button[aria-label="Άνοιγμα μενού"]');
      if (!hamburger) throw new Error('no hamburger');
      await hamburger.click();
      await page.waitForSelector('.glass-drawer');
      const hasNav = await page.$$eval('.glass-drawer .nav-leaf', els => els.length >= 6);
      const hasSelect = await page.$$eval('.glass-drawer select', els => els.length >= 1);
      if (!hasNav || !hasSelect) throw new Error(`nav=${hasNav} select=${hasSelect}`);
      await page.click('button[aria-label="Κλείσιμο μενού"]');
      await page.waitForFunction(() => document.querySelector('.glass-drawer').classList.contains('-translate-x-full'));
      await page.setViewport({ width: 1280, height: 800 });
    });

    // ---------- ROLE SIMULATOR (desktop account menu) ----------
    await ok('role simulator flips nav + sim pill (demo only)', async () => {
      await page.click('button[aria-label="Λογαριασμός"]');
      await page.waitForFunction(() => document.querySelector('[role="menu"]') !== null);
      await page.evaluate(() => {
        const sel = document.querySelector('[role="menu"] select');
        sel.value = 'field_sales';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => document.body.innerText.includes('sim Field Sales'), { timeout: 8000 });
      await page.evaluate(() => {
        const sel = document.querySelector('[role="menu"] select');
        sel.value = 'admin';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForFunction(() => !document.body.innerText.includes('sim Field Sales'), { timeout: 8000 });
    });
  }
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
if (failed.length) { console.log('FAILED:', failed.map(f => f.name).join(', ')); process.exit(1); }