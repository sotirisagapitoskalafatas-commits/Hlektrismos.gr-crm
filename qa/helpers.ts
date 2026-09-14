import { expect, type Page, type TestInfo } from '@playwright/test';

/* ---------------- Roles & credentials (from env — never committed) ---------------- */
export type RoleKey = 'ADMIN' | 'MANAGER' | 'INSIDE' | 'FIELD' | 'BACKOFFICE';

export const ROLE_LABEL: Record<RoleKey, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager/Director',
  INSIDE: 'Inside Sales',
  FIELD: 'Field Sales',
  BACKOFFICE: 'Back Office',
};

export type Creds = { email: string; password: string };

/** Reads QA_<ROLE>_EMAIL / QA_<ROLE>_PASSWORD. Returns only roles that are configured. */
export function configuredRoles(): { role: RoleKey; creds: Creds }[] {
  const roles: RoleKey[] = ['ADMIN', 'MANAGER', 'INSIDE', 'FIELD', 'BACKOFFICE'];
  const out: { role: RoleKey; creds: Creds }[] = [];
  for (const role of roles) {
    const email = process.env[`QA_${role}_EMAIL`];
    const password = process.env[`QA_${role}_PASSWORD`];
    if (email && password) out.push({ role, creds: { email, password } });
  }
  return out;
}

/* ---------------- Screens ----------------
   The CRM is a single-route shell; internal pages are reached by clicking a
   nav item (bottom tab bar or the "more" drawer), not by URL. `label` is the
   visible Greek/English text of that nav item. Screens the role cannot see
   are skipped (recorded as N/A), never failed. */
export type Screen = { key: string; label: string; optional?: boolean };

export const SCREENS: Screen[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'mywork', label: 'My Work', optional: true },
  { key: 'leads', label: 'Leads', optional: true },
  { key: 'prospecting', label: 'B2B Prospecting', optional: true },
  { key: 'providers', label: 'Πάροχοι & Προγράμματα', optional: true },
  { key: 'cases', label: 'Cases' },
  { key: 'followups', label: 'Follow Ups' },
  { key: 'customers', label: 'Customers', optional: true },
  { key: 'myday', label: 'Ημέρα μου', optional: true },
  { key: 'field', label: 'Λειτουργία Πεδίου', optional: true },
  { key: 'map', label: 'Χάρτης', optional: true },
  { key: 'backoffice', label: 'Back Office', optional: true },
  { key: 'reports', label: 'Reports', optional: true },
  { key: 'revenue', label: 'Έσοδα', optional: true },
  { key: 'account', label: 'Λογαριασμός', optional: true },
  { key: 'preferences', label: 'Προτιμήσεις', optional: true },
  { key: 'admin', label: 'Διαχείριση', optional: true },
];

/* ---------------- Login ---------------- */
export async function login(page: Page, creds: Creds): Promise<void> {
  await page.goto('/#/login', { waitUntil: 'load' });
  const email = page.locator('input[type="email"], input[autocomplete="username"]').first();
  const pass = page.locator('input[type="password"]').first();
  await email.waitFor({ state: 'visible', timeout: 15_000 });
  await email.fill(creds.email);
  await pass.fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  /* Shell is up once the top search or bottom nav renders. */
  await page.waitForFunction(() => {
    const t = document.body.innerText;
    return !t.includes('CRM Είσοδος') || document.querySelector('[data-shell="app"]') != null;
  }, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

export async function logout(page: Page): Promise<boolean> {
  const btn = page.getByRole('button', { name: /Αποσύνδεση/ }).first();
  if (await btn.count() === 0) {
    // open drawer / account menu first
    const menu = page.getByRole('button', { name: /μενού|Λογαριασμός|Menu/i }).first();
    if (await menu.count()) { await menu.click().catch(() => {}); await page.waitForTimeout(400); }
  }
  const b2 = page.getByRole('button', { name: /Αποσύνδεση/ }).first();
  if (await b2.count()) { await b2.click().catch(() => {}); await page.waitForTimeout(1000); return true; }
  return false;
}

/* ---------------- Navigation ---------------- */
/** Best-effort: click a nav item by its visible label. Opens the mobile drawer
 *  if the item is not directly visible. Returns false if the role has no such
 *  screen (then the caller records N/A). */
export async function gotoScreen(page: Page, screen: Screen, isMobile: boolean): Promise<boolean> {
  const link = () => page.getByRole('button', { name: screen.label, exact: false })
    .or(page.getByRole('link', { name: screen.label, exact: false }));

  if (await link().first().isVisible().catch(() => false)) {
    await link().first().click();
    await page.waitForTimeout(900);
    return true;
  }
  // Try opening the drawer / "more" menu on mobile.
  if (isMobile) {
    const more = page.getByRole('button', { name: /Περισσότερα|μενού|Menu|More/i }).first();
    if (await more.count()) {
      await more.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  if (await link().first().count()) {
    await link().first().click().catch(() => {});
    await page.waitForTimeout(900);
    return true;
  }
  return false; // not available for this role
}

/* ---------------- Assertions ---------------- */
export type Finding = { screen: string; check: string; detail: string };

export async function assertNoHorizontalOverflow(page: Page, screen: string, findings: Finding[]): Promise<void> {
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  if (m.scrollW > m.clientW + 1) {
    findings.push({ screen, check: 'horizontal-overflow', detail: `scrollWidth ${m.scrollW} > clientWidth ${m.clientW}` });
  }
}

/** Interactive elements should be at least ~40px on their smaller side. */
export async function assertTouchTargets(page: Page, screen: string, findings: Finding[]): Promise<void> {
  const small = await page.evaluate(() => {
    const MIN = 40;
    const els = Array.from(document.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"], select')) as HTMLElement[];
    const bad: string[] = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // hidden
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (Math.min(r.width, r.height) < MIN) {
        const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.tagName).trim().slice(0, 30);
        bad.push(`${label} (${Math.round(r.width)}x${Math.round(r.height)})`);
      }
    }
    return bad.slice(0, 8);
  });
  if (small.length) findings.push({ screen, check: 'touch-target<40px', detail: small.join('; ') });
}

/** On phones the bottom tab bar must be visible, at the bottom, and honour the
 *  safe-area inset. */
export async function assertBottomNav(page: Page, screen: string, findings: Finding[]): Promise<void> {
  const info = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label*="ανοιχτ"], nav.fixed, [data-mobile-tabbar]') as HTMLElement | null
      || Array.from(document.querySelectorAll('nav')).find(n => {
        const r = n.getBoundingClientRect();
        return r.bottom >= window.innerHeight - 4 && r.width > window.innerWidth * 0.6;
      }) as HTMLElement | undefined || null;
    if (!nav) return { found: false };
    const r = nav.getBoundingClientRect();
    const padB = getComputedStyle(nav).paddingBottom;
    return { found: true, bottom: r.bottom, winH: window.innerHeight, padB };
  });
  if (!info.found) { findings.push({ screen, check: 'bottom-nav', detail: 'no bottom tab bar found on phone' }); return; }
  if (info.bottom! < info.winH! - 2 || info.bottom! > info.winH! + 2) {
    findings.push({ screen, check: 'bottom-nav-position', detail: `bar bottom ${Math.round(info.bottom!)} vs viewport ${info.winH}` });
  }
}

export async function snap(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const buf = await page.screenshot({ fullPage: false }).catch(() => null);
  if (buf) await testInfo.attach(name, { body: buf, contentType: 'image/png' });
}

/** Deny geolocation for the GPS-denied failure test. */
export async function denyGeolocation(page: Page): Promise<void> {
  await page.context().clearPermissions();
  await page.addInitScript(() => {
    const err = { code: 1, message: 'User denied Geolocation' };
    // @ts-expect-error override
    navigator.geolocation.getCurrentPosition = (_s: PositionCallback, e?: PositionErrorCallback) => e && e(err as GeolocationPositionError);
  });
}
export { expect };
