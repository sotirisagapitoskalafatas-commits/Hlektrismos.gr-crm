import { test } from '@playwright/test';
import {
  SCREENS, configuredRoles, login, gotoScreen, logout,
  assertNoHorizontalOverflow, assertTouchTargets, assertBottomNav, snap,
  type Finding, ROLE_LABEL,
} from './helpers';

/* ------------------------------------------------------------------ *
 *  Authenticated CRM responsive QA.                                   *
 *  One test per (role) — the viewport is the Playwright project, so   *
 *  the full matrix = roles x 7 viewports. Screens a role cannot see   *
 *  are skipped, not failed. All findings are attached to the report.  *
 * ------------------------------------------------------------------ */

const roles = configuredRoles();

test.describe('CRM responsive matrix', () => {
  if (roles.length === 0) {
    test('no QA credentials configured', () => {
      test.skip(true, 'Set QA_<ROLE>_EMAIL / QA_<ROLE>_PASSWORD env vars (see qa/README.md).');
    });
  }

  for (const { role, creds } of roles) {
    test(`${ROLE_LABEL[role]} — every reachable screen`, async ({ page }, testInfo) => {
      const isMobile = (testInfo.project.use as { isMobile?: boolean }).isMobile ?? false;
      const findings: Finding[] = [];
      const visited: string[] = [];
      const skipped: string[] = [];

      await login(page, creds);
      await snap(page, testInfo, `${role}-00-dashboard`);

      for (const screen of SCREENS) {
        const ok = await gotoScreen(page, screen, isMobile);
        if (!ok) { skipped.push(screen.key); continue; }
        visited.push(screen.key);

        await assertNoHorizontalOverflow(page, screen.key, findings);
        await assertTouchTargets(page, screen.key, findings);
        if (isMobile) await assertBottomNav(page, screen.key, findings);
        await snap(page, testInfo, `${role}-${screen.key}`);
      }

      await testInfo.attach(`${role}-summary.json`, {
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify({ role, viewport: testInfo.project.name, visited, skipped, findings }, null, 2)),
      });

      /* Report findings without hard-failing the whole matrix run — the
         attached summary is the source of truth for triage. Flip to a hard
         expect() once the baseline is clean. */
      if (findings.length) {
        console.warn(`[${role} @ ${testInfo.project.name}] ${findings.length} finding(s):`);
        for (const f of findings) console.warn(`  - ${f.screen}/${f.check}: ${f.detail}`);
      }

      await logout(page);
    });
  }
});
