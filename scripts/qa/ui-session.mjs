// Helpers for UI tests against scripts/qa/mock-supabase.mjs (LOCAL, synthetic).
import puppeteer from 'puppeteer-core';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const BASE = process.env.UI_BASE || 'http://localhost:5199/';
export const IDS = {
  admin: '10000000-0000-4000-8000-000000000001', manager: '10000000-0000-4000-8000-000000000002',
  inside_sales: '10000000-0000-4000-8000-000000000003', field_sales: '10000000-0000-4000-8000-000000000004',
  back_office: '10000000-0000-4000-8000-000000000005',
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Windows keeps Chrome profile files locked for a moment after close, so the rmSync on disconnect often fails and
// profiles pile up in %TEMP% (hundreds of MB each). Sweep our own leftovers older than 10 minutes on every launch.
// Profiles of browsers that already closed in THIS run: retried on every launch (never a profile still in use).
const closedProfiles = new Set();
function sweepClosedProfiles() {
  for (const dir of closedProfiles) {
    try { rmSync(dir, { recursive: true, force: true }); closedProfiles.delete(dir); } catch { /* still locked: next launch */ }
  }
}
function sweepOldProfiles() {
  sweepClosedProfiles();
  const cutoff = Date.now() - 10 * 60_000;
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith('atlas-qa-') && !name.startsWith('lead-upload-')) continue;
    const dir = join(tmpdir(), name);
    try { if (statSync(dir).mtimeMs < cutoff) rmSync(dir, { recursive: true, force: true }); } catch { /* still locked: next run */ }
  }
}

export async function launch(width = 1440, height = 900, dpr = 1) {
  sweepOldProfiles();
  // Isolated throwaway profile: never touches (or kills) the user's own Chrome.
  const userDataDir = mkdtempSync(join(tmpdir(), 'atlas-qa-'));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir, args: ['--no-sandbox', '--no-first-run'] });
  browser.on('disconnected', () => { closedProfiles.add(userDataDir); sweepClosedProfiles(); });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: width < 500, hasTouch: width < 500 });
  const errors = [];
  page.on('console', async (m) => {
    if (m.type() !== 'error') return;
    let args = '';
    try { args = (await Promise.all(m.args().map((a) => a.jsonValue().catch(() => '')))).join(' '); } catch { /* ignore */ }
    errors.push((m.text() + ' ' + args).slice(0, 400));
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  return { browser, page, errors };
}

/** Seed a signed-in session for a role, then open the CRM shell. */
export async function signInAs(page, role, hash = '#/app') {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const session = {
    access_token: `mock-${role}`, refresh_token: 'mock-refresh', token_type: 'bearer', expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: { id: IDS[role], aud: 'authenticated', role: 'authenticated', email: `${role}@example.invalid`, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
  await page.evaluate((s) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify(s));
    localStorage.setItem('atlas.consent.v1', JSON.stringify({ decided: true }));
  }, session);
  await page.goto('about:blank'); // hash-only navigation would not reload the app
  await page.goto(BASE + hash, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3500);
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Απόρριψη'); b && b.click(); });
  await sleep(700);
}
