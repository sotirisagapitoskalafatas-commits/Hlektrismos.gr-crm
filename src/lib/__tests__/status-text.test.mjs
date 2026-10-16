import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const S = await bundle('../status-text.ts');
const F = await bundle('../case-flow.ts');
const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('L6/L7/T3: offer, signature and application statuses are shown in Greek; unknown codes never raw', () => {
  assert.equal(S.statusText(S.OFFER_STATUS_TEXT, 'draft'), 'Πρόχειρη');
  assert.equal(S.statusText(S.OFFER_STATUS_TEXT, 'accepted'), 'Έγινε αποδεκτή');
  assert.equal(S.statusText(S.SIGNATURE_STATUS_TEXT, 'captured'), 'Καταγράφηκε');
  assert.equal(S.statusText(S.APPLICATION_STATUS_TEXT, 'active'), 'Ενεργή');
  assert.equal(S.statusText(S.APPLICATION_STATUS_TEXT, 'on_hold'), 'Άγνωστη κατάσταση');
  // free text typed by a person stays as typed
  assert.equal(S.statusText(S.APPLICATION_STATUS_TEXT, 'Αναμονή ΔΕΔΔΗΕ'), 'Αναμονή ΔΕΔΔΗΕ');
  assert.equal(S.statusText(S.OFFER_STATUS_TEXT, null), '');
});

test('the case page shows no raw status code', () => {
  const page = src('../../components/app/CaseDetailPage.tsx');
  assert.ok(!/>\{o\.status\}</.test(page) && !/>\{s\.status\}</.test(page));
  assert.ok(!/Κατάσταση αίτησης: \{c\.application_status\}/.test(page));
  assert.ok(!/Έλεγχος εγγράφου: \$\{status\}/.test(src('../api.ts')), 'document history is written in Greek');
});

test('L4/L5: case counts read «Cases: 1 σε εξέλιξη · 2 ολοκληρωμένα»', () => {
  assert.equal(S.caseCountText({ total: 1, active: 1, completed: 0 }), 'Cases: 1 σε εξέλιξη');
  assert.equal(S.caseCountText({ total: 3, active: 1, completed: 2 }), 'Cases: 1 σε εξέλιξη · 2 ολοκληρωμένα');
  assert.equal(S.caseCountText({ total: 2, active: 0, completed: 1 }), 'Cases: 1 ολοκληρωμένο · 1 έκλεισε χωρίς ενεργοποίηση');
  assert.equal(S.caseCountText({ total: 0, active: 0, completed: 0 }), 'Χωρίς case');
  // the customer summary feeds it directly
  const sum = F.customerSummary([{ current_stage: 'offer', value: 0, next_follow_up_at: null }, { current_stage: 'completed', value: 0, next_follow_up_at: null }], Date.now());
  assert.equal(S.caseCountText(sum), 'Cases: 1 σε εξέλιξη · 1 ολοκληρωμένο');
  assert.ok(!/ενεργά από|ενεργά \//.test(src('../../components/customers/CustomerDetail.tsx') + src('../../components/app/CustomersPage.tsx')));
});

test('L1: one set of stage names (lists and filters = stepper)', () => {
  const roles = src('../roles.ts');
  for (const [id, label] of Object.entries(F.STAGE_LABEL)) {
    assert.ok(roles.includes(`{ id: '${id}', label: '${label}'`), `roles.ts STAGES uses «${label}» for ${id}`);
  }
});

test('L2/L8/L10: stepper number outside the text; Greek panel names; plain document chips', () => {
  const ov = src('../../components/cases/CaseOverview.tsx');
  assert.ok(/<span className="sr-only">Βήμα \{i \+ 1\}: <\/span>\{s\.label\}/.test(ov));
  assert.ok(!/: i \+ 1\}<\/span>/.test(ov), 'the bare number is not rendered as text');
  const page = src('../../components/app/CaseDetailPage.tsx');
  assert.ok(!/micro="(Follow ups|Follow up|Field sales|Offers|Signatures|Back office|Timeline)"/.test(page));
  assert.ok(!/Follow Ups/.test(page));
  assert.ok(!/font-mono uppercase/.test(page));
});
