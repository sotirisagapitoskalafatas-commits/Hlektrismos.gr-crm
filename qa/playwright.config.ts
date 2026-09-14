import { defineConfig, devices } from '@playwright/test';

/* ------------------------------------------------------------------ *
 *  Authenticated CRM mobile/tablet QA — viewport matrix.              *
 *                                                                     *
 *  Run against a LIVE environment where Supabase auth is reachable    *
 *  (local dev or staging). Credentials come from env vars — never     *
 *  commit them. See qa/README.md.                                     *
 * ------------------------------------------------------------------ */

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';

/* Each viewport is a project so a run covers the whole matrix. */
const VIEWPORTS: { name: string; width: number; height: number; kind: 'phone' | 'tablet' | 'tablet-landscape' }[] = [
  { name: '360x800', width: 360, height: 800, kind: 'phone' },
  { name: '375x812', width: 375, height: 812, kind: 'phone' },
  { name: '390x844', width: 390, height: 844, kind: 'phone' },
  { name: '430x932', width: 430, height: 932, kind: 'phone' },
  { name: '768x1024', width: 768, height: 1024, kind: 'tablet' },
  { name: '820x1180', width: 820, height: 1180, kind: 'tablet' },
  { name: '1024x768', width: 1024, height: 768, kind: 'tablet-landscape' },
];

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }], ['json', { outputFile: 'report/results.json' }]],
  use: {
    baseURL: BASE_URL,
    /* Real devices report touch + mobile UA; we still pin exact sizes. */
    ...devices['iPhone 13'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: VIEWPORTS.map(v => ({
    name: v.name,
    use: {
      viewport: { width: v.width, height: v.height },
      isMobile: v.kind === 'phone',
      hasTouch: true,
      // @ts-expect-error custom metadata read by the spec
      qaKind: v.kind,
    },
  })),
});
