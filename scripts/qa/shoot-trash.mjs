// Screenshot of Διαχείριση → Κάδος with one trashed lead (mock Supabase, synthetic data).
import { launch, signInAs, sleep } from './ui-session.mjs';
const MOCK = 'http://127.0.0.1:54399';
const LEAD = '50000000-0000-4000-8000-000000000003';
await fetch(`${MOCK}/rest/v1/rpc/trash_record`, { method: 'POST', headers: { Authorization: 'Bearer mock-admin', 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_type: 'lead', p_id: LEAD, p_reason: 'Διπλότυπο με άλλο lead' }) });
const { browser, page } = await launch(1440, 900);
await signInAs(page, 'admin');
await page.evaluate(() => [...document.querySelectorAll('#shell-rail nav button')].find((b) => b.textContent.trim().startsWith('Διαχείριση'))?.click());
await sleep(1200);
await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === 'Κάδος')?.click());
await sleep(1200);
await page.screenshot({ path: 'docs/product/screenshots/after/admin-trash-1440.jpg', type: 'jpeg', quality: 75 });
await browser.close();
await fetch(`${MOCK}/rest/v1/rpc/restore_record`, { method: 'POST', headers: { Authorization: 'Bearer mock-admin', 'Content-Type': 'application/json' }, body: JSON.stringify({ p_type: 'lead', p_id: LEAD }) });
console.log('done');
