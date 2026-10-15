import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../documents.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const D = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const RES = { service_type: 'energy', property_type: 'Διαμέρισμα', case_type: null };

test('every legacy category keeps its old label; legacy types are not offered for new uploads', () => {
  for (const [k, v] of Object.entries({ bill: 'Λογαριασμός', identity: 'Ταυτότητα / Δικαιολογητικά', offer: 'Προσφορά', application: 'Αίτηση παρόχου', signed: 'Υπογεγραμμένη σύμβαση', provider: 'Έγγραφο παρόχου', photo: 'Φωτογραφία πεδίου', other: 'Άλλο' })) {
    assert.equal(D.docLabel(k), v, k);
  }
  const up = D.uploadableDocTypes().map((d) => d.key);
  assert.ok(!up.includes('identity') && !up.includes('bill'));
  assert.equal(D.docLabel('something_unknown'), 'something_unknown');
});

test('residential electricity: ID, electricity bill, proof of use (any of E9/lease/free use), signed contract', () => {
  const r = D.requiredDocs(RES);
  assert.deepEqual(r.map((x) => x.anyOf), [['id_front', 'id_card'], ['id_back', 'id_card'], ['bill_electricity'], ['e9', 'lease', 'free_use'], ['signed']]);
  assert.ok(r.every((x) => x.required));
});
test('gas asks for the gas bill; business adds tax start / ΓΕΜΗ; solar asks for ownership proof', () => {
  assert.ok(D.requiredDocs({ ...RES, service_type: 'gas' }).some((x) => x.anyOf[0] === 'bill_gas'));
  const biz = D.requiredDocs({ ...RES, property_type: 'Κατάστημα' });
  assert.ok(biz.some((x) => x.anyOf.includes('tax_start') && x.required));
  assert.ok(D.requiredDocs({ ...RES, service_type: 'solar' }).some((x) => x.anyOf.includes('property_title')));
});

test('checklist status: a lease satisfies proof of use; rejected does not count; verified wins', () => {
  const c = D.buildChecklist(RES, [
    { category: 'lease', status: 'received' }, { category: 'id_card', status: 'rejected' },
    { category: 'bill_electricity', status: 'received' }, { category: 'bill_electricity', status: 'verified' },
  ]);
  const by = Object.fromEntries(c.map((x) => [x.anyOf[0], x.status]));
  assert.equal(by.e9, 'received'); assert.equal(by.id_front, 'rejected'); assert.equal(by.id_back, 'rejected'); assert.equal(by.bill_electricity, 'verified'); assert.equal(by.signed, 'missing');
});
test('old «identity»/«bill» uploads still count, flagged as legacy (less specific)', () => {
  const c = D.buildChecklist(RES, [{ category: 'identity', status: 'received' }, { category: 'bill', status: 'verified' }]);
  const id = c.find((x) => x.anyOf[0] === 'id_back'), bill = c.find((x) => x.anyOf[0] === 'bill_electricity');
  assert.equal(id.status, 'received'); assert.equal(id.viaLegacy, true);
  assert.equal(bill.status, 'verified'); assert.equal(bill.viaLegacy, true);
});
