// Public contact form on a phone viewport: HEIC photo with an empty type + PDF upload and reach the lead RPC;
// a failed upload stops the submit with a clear message instead of a false «Ευχαριστούμε».
// Needs the dev server (:5199) and the mock Supabase (:54399). Usage: node scripts/qa/lead-upload-mobile.mjs
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, BASE, sleep } from './ui-session.mjs';

const dir = mkdtempSync(join(tmpdir(), 'lead-upload-'));
const heic = join(dir, 'IMG_4021.HEIC'); writeFileSync(heic, Buffer.alloc(4096, 1));
const pdf = join(dir, 'Λογαριασμός ΔΕΗ.pdf'); writeFileSync(pdf, '%PDF-1.4\n%mock\n');
const exe = join(dir, 'setup.exe'); writeFileSync(exe, 'MZ');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m); } };

async function run(failStorage) {
  const { browser, page, errors } = await launch(390, 844, 2);
  const uploads = []; let rpc = null;
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.includes('/storage/v1/object/') && r.method() === 'POST') {
      uploads.push({ path: decodeURIComponent(u.split('/storage/v1/object/')[1]) });
      if (failStorage) return r.respond({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ statusCode: '500', error: 'Internal', message: 'network lost' }) });
    }
    if (u.includes('/rest/v1/rpc/insert_website_lead') && r.method() === 'POST') rpc = JSON.parse(r.postData() || '{}');
    r.continue();
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#lead-file-input', { timeout: 20000 });
  await sleep(800);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Απόρριψη')?.click()); // decline optional cookies
  const accept = await page.$eval('#lead-file-input', (e) => e.accept);
  ok(accept.includes('image/*') && accept.includes('.heic'), `accept lets phones use camera/gallery and HEIC (${accept})`);

  ok(await page.$eval('#lead-file-input', (e) => e.multiple), 'picker allows several files and photos at once');
  ok((await page.$('#lead-camera-input[capture]')) !== null && (await page.evaluate(() => document.body.innerText)).includes('Φωτογράφισε τον λογαριασμό'), 'phone shows a separate camera button');
  const input = await page.$('#lead-file-input');
  await input.uploadFile(exe);
  await sleep(300);
  ok((await page.content()).includes('δεν υποστηρίζεται'), 'unsupported file is named with a reason');
  await input.uploadFile(heic, pdf); // HEIC: Chrome gives it an empty type, like many Android pickers
  await sleep(300);
  const listed = await page.evaluate(() => document.body.innerText);
  ok(listed.includes('IMG_4021.HEIC') && listed.includes('Λογαριασμός ΔΕΗ.pdf'), 'HEIC photo and Greek-named PDF are added');

  // Fill required text inputs by typing (React-controlled).
  const fields = await page.$$('form input:not([type=file]):not([type=checkbox])');
  for (const fld of fields) {
    const type = await fld.evaluate((e) => e.type);
    await fld.type(type === 'email' ? 'test@example.com' : type === 'tel' ? '6900000000' : 'Δοκιμή');
  }
  for (const sel of await page.$$('form select')) {
    const v = await sel.evaluate((e) => [...e.options].find((o) => o.value)?.value ?? '');
    if (v && !(await sel.evaluate((e) => e.value))) await sel.select(v);
  }
  for (const cb of await page.$$('form input[type=checkbox]')) { if (!(await cb.evaluate((e) => e.checked))) await cb.evaluate((e) => e.click()); }
  await page.$eval('form', (f) => f.requestSubmit());
  if (process.env.DEBUG) console.log(await page.$eval('#lead-file-input', (i) => [...i.form.elements].filter((e) => !e.checkValidity()).map((e) => e.outerHTML.slice(0, 160))));
  await sleep(2500);
  const text = await page.evaluate(() => document.body.innerText);
  if (process.env.DEBUG) console.log({ rpc: JSON.stringify(rpc)?.slice(0, 300), errors, uploads, thanks: text.includes('Ευχαριστούμε'), err: text.split('Δεν ανέβηκ')[1]?.slice(0, 120) });
  if (!failStorage) {
    ok(uploads.length === 2, `both files uploaded (${uploads.length})`);
    ok(uploads.every((u) => u.path.startsWith('hlektrismos_docs/contact-forms/') && /^[\x20-\x7e]+$/.test(u.path)), 'ASCII paths under contact-forms/');
    const files = rpc?.p_payload?.attached_files ?? [];
    ok(files.some((x) => (x.path.endsWith('.heic') && x.type === 'image/heic') || (x.path.endsWith('.jpg') && x.type === 'image/jpeg')), 'HEIC photo stored with a real content type (or converted to JPEG)');
    ok(files.some((x) => x.path.endsWith('.pdf') && x.type === 'application/pdf' && x.name === 'Λογαριασμός ΔΕΗ.pdf'), 'PDF stored as application/pdf, original name kept for staff');
    ok(rpc?.p_payload?.attached_files?.length === 2, 'lead RPC receives both attached files');
    ok(text.includes('Ευχαριστούμε') && text.includes('2 αρχεία'), 'success screen confirms the 2 files');
  } else {
    ok(rpc === null, 'lead is NOT sent when an upload fails');
    ok(!text.includes('Ευχαριστούμε') && text.includes('Δεν ανέβηκαν τα αρχεία'), 'clear error names the files; form stays');
  }
  const real = errors.filter((e) => !/500|Failed to load resource|React does not recognize/.test(e)); // known, unrelated fetchPriority warning
  ok(real.length === 0, 'no console errors' + (real.length ? ': ' + real.join(' | ').slice(0, 200) : ''));
  if (process.env.SHOOT) {
    await page.evaluate(() => {
      const btn = document.getElementById('lead-file-input')?.closest('form')?.querySelector('button[type=submit]');
      const thanks = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('Ευχαριστούμε'));
      (btn ?? thanks)?.scrollIntoView({ block: btn ? 'end' : 'center' });
    });
    await sleep(600);
    await page.screenshot({ path: `docs/product/screenshots/after/lead-upload-${failStorage ? 'error' : 'done'}-390.jpg`, type: 'jpeg', quality: 80 });
  }
  await browser.close();
}

console.log('Upload succeeds'); await run(false);
console.log('Upload fails'); await run(true);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
