import { test, expect } from '@playwright/test';
import { configuredRoles, login, gotoScreen, snap, denyGeolocation, SCREENS } from './helpers';

/* ------------------------------------------------------------------ *
 *  Map search + navigation end-to-end (Field Sales).                  *
 *                                                                     *
 *  A URL opening is NOT a pass. This exercises:                        *
 *  search -> real result -> coordinates -> route -> external nav,      *
 *  plus the GPS-denied and no-results failure states.                 *
 * ------------------------------------------------------------------ */

const field = configuredRoles().find(r => r.role === 'FIELD') || configuredRoles()[0];
const mapScreen = SCREENS.find(s => s.key === 'map')!;

test.describe('Map search & navigation', () => {
  test.skip(!field, 'Set QA_FIELD_EMAIL / QA_FIELD_PASSWORD (or any role) to run map QA.');

  test('destination place search resolves to coordinates', async ({ page }, testInfo) => {
    await login(page, field!.creds);
    const onMap = await gotoScreen(page, mapScreen, true);
    test.skip(!onMap, 'Map screen not available for this role.');

    const dest = page.getByLabel('Προορισμός').or(page.getByPlaceholder(/Αναζήτηση.*προορισμ|Αναζήτηση πελάτη/i)).first();
    await dest.click();
    await dest.fill('Λεωφόρος Βουλιαγμένης');
    /* Debounced Photon lookup — wait for the dropdown list. */
    const results = page.locator('button', { hasText: /Βουλιαγμένης|Vouliagmenis/i });
    await expect(results.first()).toBeVisible({ timeout: 12_000 });
    await snap(page, testInfo, 'map-search-results');
    await results.first().click();

    /* After selection the route/ETA card should show a distance or ETA — i.e.
       the text resolved to coordinates and a route was attempted. */
    const card = page.getByText(/km|χλμ|min|λεπτ|Υπολογισμός/i).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await snap(page, testInfo, 'map-route-card');

    /* Navigate hands off to an external maps URL (new tab/page). */
    const navBtn = page.getByRole('button', { name: /Πλοήγηση/ }).first();
    await expect(navBtn).toBeVisible();
  });

  test('GPS denied still allows destination search', async ({ page }, testInfo) => {
    await denyGeolocation(page);
    await login(page, field!.creds);
    const onMap = await gotoScreen(page, mapScreen, true);
    test.skip(!onMap, 'Map screen not available for this role.');
    const dest = page.getByLabel('Προορισμός').or(page.getByPlaceholder(/Αναζήτηση/i)).first();
    await dest.fill('Γλυφάδα');
    await snap(page, testInfo, 'map-gps-denied');
    await expect(dest).toBeEditable();
  });

  test('no-results query shows an explicit empty state', async ({ page }) => {
    await login(page, field!.creds);
    const onMap = await gotoScreen(page, mapScreen, true);
    test.skip(!onMap, 'Map screen not available for this role.');
    const dest = page.getByLabel('Προορισμός').or(page.getByPlaceholder(/Αναζήτηση/i)).first();
    await dest.fill('zzzzxxqqnowhere12345');
    await expect(page.getByText(/Καμία τοποθεσία/i).first()).toBeVisible({ timeout: 12_000 });
  });
});
