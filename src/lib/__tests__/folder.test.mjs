import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const F = await bundle('../folder.ts');
const k = (id, current_stage, o = {}) => ({ id, current_stage, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...o });

test('badge: computed, one of four, never typed in', () => {
  assert.equal(F.folderBadge({ isLead: true, cases: [] }).label, 'Lead');
  assert.equal(F.folderBadge({ isLead: false, cases: [k('a', 'offer'), k('b', 'completed')] }).label, 'Case σε εξέλιξη');
  assert.equal(F.folderBadge({ isLead: false, cases: [k('a', 'completed'), k('b', 'lost')] }).label, 'Πελάτης');
  assert.equal(F.folderBadge({ isLead: false, cases: [k('a', 'lost'), k('b', 'cancelled')] }).id, 'none');
  assert.equal(F.folderBadge({ isLead: false, cases: [] }).id, 'none');
});

test('tabs: the same order everywhere; Back Office only for roles that have it', () => {
  const order = ['Σύνοψη', 'Έγγραφα', 'Υποθέσεις', 'Ιστορικό', 'Follow-ups', 'Επισκέψεις', 'Προσφορές', 'Υπογραφές', 'Back Office'];
  assert.deepEqual(F.folderTabs({ backOffice: true }).map((t) => t.label), order);
  assert.deepEqual(F.folderTabs({ backOffice: false }).map((t) => t.label), order.slice(0, -1));
  // the five case tabs plus documents are scoped to the selected case
  assert.deepEqual(F.FOLDER_TABS.filter((t) => t.scoped).map((t) => t.id), ['docs', 'followups', 'visits', 'offers', 'signatures', 'backoffice']);
  assert.deepEqual(F.FOLDER_TABS.filter((t) => t.needsCase).map((t) => t.id), ['cases', 'followups', 'visits', 'offers', 'signatures', 'backoffice']);
});

test('«Παροχές» is a customer tab right after Σύνοψη; an unconverted lead has no such tab; it needs no case', () => {
  const withSupply = ['Σύνοψη', 'Παροχές', 'Έγγραφα', 'Υποθέσεις', 'Ιστορικό', 'Follow-ups', 'Επισκέψεις', 'Προσφορές', 'Υπογραφές', 'Back Office'];
  assert.deepEqual(F.folderTabs({ backOffice: true, supply: true }).map((t) => t.label), withSupply);
  assert.deepEqual(F.folderTabs({ backOffice: false, supply: true }).map((t) => t.label), withSupply.slice(0, -1));
  assert.ok(!F.folderTabs({ backOffice: true }).some((t) => t.id === 'supply'), 'the lead folder never gets it');
  const t = F.FOLDER_TABS.find((x) => x.id === 'supply');
  assert.equal(t.needsCase, false); assert.equal(t.scoped, false);
});

test('selected case: the picked one; else the only one; else the most urgent open; else the newest', () => {
  const one = [k('a', 'completed')];
  assert.equal(F.selectedCase(one, null).id, 'a');
  const many = [k('a', 'offer', { next_follow_up_at: '2026-10-20T10:00:00Z' }), k('b', 'application', { next_follow_up_at: '2026-10-18T10:00:00Z' }), k('c', 'completed')];
  assert.equal(F.selectedCase(many, null).id, 'b');
  assert.equal(F.selectedCase(many, 'c').id, 'c');
  assert.equal(F.selectedCase(many, 'gone').id, 'b');
  const closed = [k('a', 'lost', { created_at: '2026-09-01T00:00:00Z' }), k('b', 'completed', { created_at: '2026-10-05T00:00:00Z' })];
  assert.equal(F.selectedCase(closed, null).id, 'b');
  assert.equal(F.selectedCase([], null), null);
});

test('subtitle: πόλη · υπεύθυνος (next-action owner of the open case) · από', () => {
  const staffName = (id) => ({ u1: 'Εύα' })[id] ?? null;
  const fmtDate = () => '12/10';
  assert.equal(F.folderSubtitle({ city: 'Αθήνα', since: 'x', cases: [k('a', 'offer', { next_action_owner_id: 'u1' })], staffName, fmtDate }), 'Αθήνα · Υπεύθυνος: Εύα · από 12/10');
  assert.equal(F.folderSubtitle({ city: null, since: 'x', cases: [k('a', 'completed', { next_action_owner_id: 'u1' })], staffName, fmtDate }), 'από 12/10');
});

test('origin: a lead that cannot be read is «μη διαθέσιμο», not «χωρίς lead»', () => {
  const cases = [{ lead_id: null, created_at: '2026-10-05T00:00:00Z' }, { lead_id: 'L1', created_at: '2026-10-01T00:00:00Z' }];
  assert.deepEqual(F.folderOrigin(cases, () => true), { kind: 'lead', leadId: 'L1' });
  assert.deepEqual(F.folderOrigin(cases, () => false), { kind: 'unavailable', leadId: 'L1' });
  assert.deepEqual(F.folderOrigin([{ lead_id: null, created_at: 'x' }], () => true), { kind: 'none', leadId: null });
  assert.deepEqual(F.folderOrigin([], () => true), { kind: 'none', leadId: null });
  assert.notEqual(F.ORIGIN_TEXT.none, F.ORIGIN_TEXT.unavailable);
});

test('lead → folder: a converted lead redirects; the notice reads «Το lead μετατράπηκε στις 14/10 — …»', () => {
  assert.equal(F.shouldRedirectLead({ status: 'converted', converted_case_id: 'c1' }), true);
  assert.equal(F.shouldRedirectLead({ status: 'converted', converted_case_id: null }), false);
  assert.equal(F.shouldRedirectLead({ status: 'qualified', converted_case_id: 'c1' }), false);
  assert.equal(F.convertedNotice('2026-10-14T09:00:00Z'), 'Το lead μετατράπηκε στις 14/10 — εδώ συνεχίζεται η εργασία');
  assert.equal(F.convertedNotice(''), 'Το lead μετατράπηκε — εδώ συνεχίζεται η εργασία');
  assert.equal(F.convertedNotice(null), 'Το lead μετατράπηκε — εδώ συνεχίζεται η εργασία');
});

test('folder link: only the roles that have the Πελάτες page; the old lead buttons are gone', async () => {
  for (const r of ['admin', 'inside_sales', 'field_sales']) assert.equal(F.canOpenFolder(r), true, r);
  for (const r of ['manager', 'back_office']) assert.equal(F.canOpenFolder(r), false, `legacy ${r}`);
  const { readFileSync } = await import('node:fs');
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const cust = read('../../components/customers/CustomerDetail.tsx');
  assert.ok(!/data-open-lead/.test(cust) && !/lead-links/.test(cust), 'no button from the folder back to a lead that redirects');
  const kase = read('../../components/app/CaseDetailPage.tsx');
  assert.ok(/data-open-folder/.test(kase) && !/data-open-lead/.test(kase));
  const lead = read('../../components/leads/LeadDetail.tsx');
  assert.ok(/shouldRedirectLead/.test(lead) && /NEEDS_CASE_TEXT/.test(lead) && !/Σχετικό Case/.test(lead), 'lead screen: redirect, case-needed tabs, no second «Σχετικό Case» card');
  assert.ok(/Μετατράπηκε → Φάκελος/.test(read('../../components/app/LeadsPage.tsx')));
});

test('consent on the case (B1): the same component as on the lead and the customer, keyed to the case\'s customer', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const kase = read('../../components/app/CaseDetailPage.tsx');
  assert.ok(/\{c\.customer_id && <ContactEligibility subject=\{\{ phone: c\.customer\?\.phone \?\? null, email: c\.customer\?\.email \?\? null, customerId: c\.customer_id \}\} \/>\}/.test(kase));
  // the component keeps the rule: hidden for non-admins while the check is unavailable
  assert.ok(/error === CONTACT_CHECK_UNAVAILABLE && role !== 'admin'\) return null/.test(read('../../components/contact/ContactEligibility.tsx')));
});

test('the case screen uses the same folder tabs as the lead and the customer (one list, one order)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  for (const f of ['../../components/app/CaseDetailPage.tsx', '../../components/customers/CustomerDetail.tsx', '../../components/leads/LeadDetail.tsx']) {
    assert.match(read(f), /folderTabs\(/, `${f} builds its tabs from lib/folder.ts`);
  }
  assert.doesNotMatch(read('../../components/app/CaseDetailPage.tsx'), /id: 'timeline'/, 'no private tab list left on the case screen');
});
