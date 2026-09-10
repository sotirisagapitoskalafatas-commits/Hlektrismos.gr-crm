import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const PORT = 4189;
const BASE = `http://localhost:${PORT}`;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'scripts/.browser-out';
mkdirSync(OUT, { recursive: true });

const secrets = JSON.parse(readFileSync('C:/Users/kalaf/.qa-secrets/hlektrismos-qacc.json', 'utf8'));
const byEmail = Object.fromEntries(secrets.map(s => [s.email.toLowerCase(), s]));

const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  const viteBin = 'node_modules/vite/bin/vite.js';
  const child = spawn(process.execPath, [viteBin, 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', d => process.stderr.write(`[preview-err] ${d}`));
  return child;
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE + '/')).ok) return true; } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error('preview server did not start');
}

const ACCOUNTS = [
  {
    role: 'admin',
    email: 'qa.admin@hlektrismos.gr',
    click: 'Διαχείριση',
    expect: 'Workspace · Διαχείριση',
    present: ['Dashboard', 'Leads', 'Cases', 'Follow Ups', 'Ημέρα μου', 'Χάρτης', 'Back Office', 'Customers', 'Reports', 'Διαχείριση'],
    absent: [],
  },
  {
    role: 'manager',
    email: 'qa.manager@hlektrismos.gr',
    click: 'Reports',
    expect: 'Reports · Πωλήσεις & Pipeline',
    present: ['Dashboard', 'Leads', 'Cases', 'Follow Ups', 'Ημέρα μου', 'Χάρτης', 'Back Office', 'Customers', 'Reports', 'Διαχείριση'],
    absent: [],
  },
  {
    role: 'inside_sales',
    email: 'qa.insidesales@hlektrismos.gr',
    click: 'Leads',
    expect: 'Leads',
    present: ['Dashboard', 'Leads', 'Cases', 'Follow Ups', 'Customers'],
    absent: ['Ημέρα μου', 'Χάρτης', 'Back Office', 'Reports', 'Διαχείριση'],
  },
  {
    role: 'back_office',
    email: 'qa.backoffice@hlektrismos.gr',
    click: 'Back Office',
    expect: 'Operations',
    present: ['Dashboard', 'Cases', 'Follow Ups', 'Back Office'],
    absent: ['Leads', 'Ημέρα μου', 'Χάρτης', 'Reports', 'Διαχείριση'],
  },
  {
    role: 'field_sales',
    email: 'qa.fieldsales@hlektrismos.gr',
    click: 'Ημέρα μου',
    expect: 'Ημέρα μου ·',
    present: ['Dashboard', 'Cases', 'Follow Ups', 'Ημέρα μου', 'Χάρτης', 'Customers'],
    absent: ['Leads', 'Back Office', 'Reports', 'Διαχείριση'],
  },
];

const results = [];
const pass = (k, ok, detail = '') => results.push({ k, ok: Boolean(ok), detail });

async function loginAndVerify(browser, acct) {
  const rec = byEmail[acct.email];
  if (!rec) return { ok: false, reason: 'not in secrets file' };
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  const navText = sel => page.evaluate(s => [...document.querySelectorAll(s)].map(e => (e.textContent ?? '').replace(/\s+/g, ' ')).join(' | '), sel);
  try {
    await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('input[type="email"]', { timeout: 30000 });

    const fill = async (sel, text) => {
      await page.click(sel);
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type(sel, text, { delay: 12 });
    };
    await fill('input[type="email"]', rec.email);
    await fill('input[type="password"]', rec.password);
    await page.evaluate(() => { const f = document.querySelector('form'); f && f.requestSubmit(); });

    let landed = false;
    for (let i = 0; i < 4 && !landed; i++) {
      try {
        await page.waitForFunction(() => location.hash.includes('dashboard') && document.body.textContent?.includes('Command Center'), { timeout: 45000 });
        landed = true;
      } catch {
        const badCred = await page.evaluate(() => document.body.textContent?.includes('Λάθος στοιχεία') ?? false);
        if (badCred) return { ok: false, reason: 'wrong-password-rejected-in-browser' };
        await sleep(3000);
      }
    }
    if (!landed) return { ok: false, reason: 'no-dashboard-after-login' };

    await sleep(2000);
    let rail = await navText('#shell-rail');
    let presentOk = acct.present.every(l => rail.includes(l));
    let absentOk = acct.absent.every(l => !rail.includes(l));
    for (let i = 0; i < 30 && !(presentOk && absentOk); i++) {
      await sleep(500);
      rail = await navText('#shell-rail');
      presentOk = acct.present.every(l => rail.includes(l));
      absentOk = acct.absent.every(l => !rail.includes(l));
    }

    await page.evaluate(label => {
      const b = [...document.querySelectorAll('#shell-rail button')].find(x => (x.textContent ?? '').includes(label));
      if (b) { b.click(); return true; } return false;
    }, acct.click);
    let headerSeen = false;
    for (let i = 0; i < 20 && !headerSeen; i++) {
      const t = await page.evaluate(() => document.body.textContent ?? '');
      if (t.includes(acct.expect)) { headerSeen = true; break; }
      await sleep(500);
    }

    await page.screenshot({ path: `${OUT}/qa-${acct.role}.png`, fullPage: false });

    return {
      ok: presentOk && absentOk && headerSeen,
      presentOk,
      absentOk,
      headerSeen,
      rail: rail.slice(0, 200),
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

async function run() {
  const server = startServer();
  let browser;
  try {
    await waitForServer();
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
      defaultViewport: { width: 1280, height: 900 },
    });

    for (const acct of ACCOUNTS) {
      const res = await loginAndVerify(browser, acct);
      const label = acct.role === 'manager' ? 'manager' : acct.role === 'inside_sales' ? 'inside_sales' : acct.role === 'back_office' ? 'back_office' : acct.role;
      pass(`${label}-login`, res.ok, res.ok ? `navOK present=${res.presentOk} absent=${res.absentOk} header=${acct.expect}` : JSON.stringify(res));
      process.stdout.write(`[${acct.role}] => ${res.ok ? 'PASS' : 'FAIL'} ${res.ok ? '' : JSON.stringify(res).slice(0, 300)}\n`);
      if (!res.ok) break;
    }

    console.log('\n===== SUMMARY =====');
    for (const r of results) console.log(`${r.ok === true ? 'PASS' : 'FAIL'} ${r.k}${r.detail ? ' :: ' + r.detail : ''}`);
  } catch (e) {
    console.error('HARNESS ERROR:', e);
    process.exitCode = 2;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

run();