import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const S = await bundle('../lead-sync.ts');
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const lead = { full_name: 'Γιάννης Παπαδόπουλος', phone: '6900000000', email: 'old@example.gr' };

test('only what changed is sent to the lead', () => {
  assert.deepEqual(S.leadSyncPatch({ full_name: 'Γιάννης Παπαδόπουλος', phone: '6900000000', email: 'old@example.gr' }, lead), {});
  assert.deepEqual(S.leadSyncPatch({ full_name: 'Γιάννης  Παπαδόπουλος ', phone: '+30 690 000 0000', email: 'OLD@example.gr' }, lead), {}, 'spacing, case and +30 are not changes');
  assert.deepEqual(S.leadSyncPatch({ full_name: 'Γιάννης Δημητρίου', phone: '6911111111', email: 'new@example.gr' }, lead), { full_name: 'Γιάννης Δημητρίου', phone: '6911111111', email: 'new@example.gr' });
  assert.deepEqual(S.leadSyncPatch({ full_name: 'Γιάννης Παπαδόπουλος', phone: '6900000000', email: 'new@example.gr' }, lead), { email: 'new@example.gr' });
});

test('a lead value is never cleared, and the website placeholder address is never written', () => {
  assert.deepEqual(S.leadSyncPatch({ full_name: '', phone: '', email: null }, lead), {}, 'empty customer fields do not blank the lead');
  assert.deepEqual(S.leadSyncPatch({ full_name: 'Γιάννης Παπαδόπουλος', email: 'not-provided@hlektrismos.local' }, { ...lead, email: null }), {});
  // a lead without a phone gets the customer's
  assert.deepEqual(S.leadSyncPatch({ phone: '6900000001' }, { ...lead, phone: null }), { phone: '6900000001' });
  // the lead name may live only in client_name
  assert.deepEqual(S.leadSyncPatch({ full_name: 'Μαρία Νέα' }, { client_name: 'Μαρία Νέα' }), {});
});

test('phones compare on the last 10 digits', () => {
  assert.equal(S.samePhone('6900000000', '+30 690 000 0000'), true);
  assert.equal(S.samePhone('6900000000', '6900000001'), false);
  assert.equal(S.samePhone('123', '123'), true);
  assert.equal(S.samePhone('123', '456'), false);
});

test('"customer saved, lead not updated" is reported as its own outcome, in Greek', () => {
  assert.equal(S.syncWarningText({ linked: 1, updated: 0, failed: [] }), null);
  const w = S.syncWarningText({ linked: 1, updated: 0, failed: ['Δεν έχετε δικαίωμα να αποθηκεύσετε αυτό το lead.'] });
  assert.match(w, /^Τα στοιχεία του πελάτη αποθηκεύτηκαν, αλλά δεν ενημερώθηκε το lead/);
  assert.match(w, /δικαίωμα/);
  assert.deepEqual(S.syncToast({ linked: 1, updated: 0, failed: ['x'] }), { text: 'Τα στοιχεία αποθηκεύτηκαν· το lead δεν ενημερώθηκε', tone: 'bad' });
  assert.deepEqual(S.syncToast({ linked: 1, updated: 1, failed: [] }), { text: 'Τα στοιχεία αποθηκεύτηκαν και στο lead', tone: 'ok' });
  assert.deepEqual(S.syncToast({ linked: 0, updated: 0, failed: [] }), { text: 'Τα στοιχεία αποθηκεύτηκαν', tone: 'ok' });
});

test('both customer save paths run the sync after a successful customer write; a converted lead has no edit controls', () => {
  const folder = read('../../components/customers/CustomerDetail.tsx');
  const save = folder.slice(folder.indexOf('const save = async'), folder.indexOf('const save = async') + 1500);
  assert.ok(save.indexOf('updateCustomer(') < save.indexOf('syncLeadsFromCustomer(') && /if \(!ok\) \{[^}]*return;/.test(save), 'folder: sync only after the customer is saved');
  const kase = read('../../components/app/CaseDetailPage.tsx');
  const sc = kase.slice(kase.indexOf('const saveContact = async'), kase.indexOf('const saveContact = async') + 1800);
  assert.ok(sc.indexOf('updateCustomer(') < sc.indexOf('syncLeadsFromCustomer(') && /if \(err\) \{[^}]*return;/.test(sc) && sc.indexOf('if (err)') < sc.indexOf('syncLeadsFromCustomer('), 'case: sync only after both writes succeeded');
  // after conversion only the customer is edited
  assert.ok(/isStaff && !converted && !lead\.deleted_at/.test(read('../../components/leads/LeadDetail.tsx')), 'lead screen: no edit/status controls once converted');
  assert.ok(/isStaff && !converted && \(/.test(read('../../components/app/LeadsPage.tsx')), 'leads list: no edit/status/convert for converted rows');
  const api = read('../api.ts');
  assert.ok(/if \(!lead \|\| lead\.deleted_at\) continue;/.test(api) && /updateLeadChecked\(id, patch\)/.test(api), 'sync uses the guarded lead write and skips trashed leads');
});
