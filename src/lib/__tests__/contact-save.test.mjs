import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const C = await bundle('../contact-save.ts');

const cust = { full_name: 'Μαρία Παπαδοπούλου Δήμου', phone: '690', email: null, address: 'Οδός 1', city: 'Αθήνα', postal_code: null, lat: 37.9, lng: 23.7 };

test('form: first/last from the columns, else split from the display name; the case address wins', () => {
  const f = C.contactFormFrom(cust, { address: 'Οδός Case 2', lat: null, lng: null });
  assert.equal(f.first_name, 'Μαρία');
  assert.equal(f.last_name, 'Παπαδοπούλου Δήμου');
  assert.equal(f.address, 'Οδός Case 2');
  assert.equal(f.lat, '37.9');
  const g = C.contactFormFrom({ ...cust, first_name: 'Μ.', last_name: 'Π.' }, {});
  assert.equal(g.first_name, 'Μ.'); assert.equal(g.last_name, 'Π.');
  assert.equal(C.contactFormFrom(null, {}).full_name, '');
});

test('patch: first/last only when the columns exist (phase4/11); full_name always in step', () => {
  const f = { ...C.contactFormFrom(cust, {}), first_name: ' Μαρία ', last_name: 'Νέα' };
  const withNames = C.customerPatch(f, true, 'x');
  assert.equal(withNames.full_name, 'Μαρία Νέα');
  assert.equal(withNames.last_name, 'Νέα');
  const without = C.customerPatch({ ...f, full_name: ' Μαρία Π. ' }, false, 'x');
  assert.equal(without.full_name, 'Μαρία Π.');
  assert.ok(!('first_name' in without) && !('last_name' in without));
  assert.equal(C.customerPatch({ ...f, first_name: '', last_name: '' }, true, 'Παλιό όνομα').full_name, 'Παλιό όνομα');
  assert.equal(C.customerPatch({ ...f, lat: '' }, true, 'x').lat, null);
  assert.equal(C.contactNameOk({ ...f, first_name: '', last_name: ' ' }, true), false);
  assert.equal(C.contactNameOk({ ...f, full_name: '' }, false), false);
});

test('a failed save is reported in Greek (D4), never closes as if it worked', () => {
  assert.equal(C.contactSaveError(true, null), null);
  assert.match(C.contactSaveError(false, null), /του πελάτη δεν αποθηκεύτηκαν/);
  assert.match(C.contactSaveError(true, { message: 'x' }), /διεύθυνση του case/);
  assert.match(C.contactSaveError(false, { message: 'x' }), /δεν αποθηκεύτηκαν/);
  const page = readFileSync(fileURLToPath(new URL('../../components/app/CaseDetailPage.tsx', import.meta.url)), 'utf8');
  const save = page.slice(page.indexOf('const saveContact = async'), page.indexOf('const saveContact = async') + 900);
  assert.ok(/contactSaveError\(customerSaved, caseError\)/.test(save) && /if \(err\) \{ setContactErr\(err\);.*return; \}/.test(save), 'the form only closes after a successful save');
});
