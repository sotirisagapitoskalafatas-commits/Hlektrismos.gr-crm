import { defineConfig } from '@playwright/test';

/* Public landing page only (no sign-in, no Supabase calls beyond what the page makes itself).
   QA_BASE_URL defaults to a local `vite preview` / dev server:  QA_BASE_URL=http://localhost:5210 npx playwright test -c qa/landing.playwright.config.ts */
const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: '.',
  testMatch: /landing-.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: BASE_URL, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-1280x800', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'tablet-820x1180', use: { viewport: { width: 820, height: 1180 } } },
    { name: 'mobile-390x844', use: { viewport: { width: 390, height: 844 } } },
  ],
});
