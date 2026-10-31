import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../case-return.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const R = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('who may return / resubmit', () => {
  const c = { current_stage: 'document_check', returned_at: null };
  assert.deepEqual(['back_office', 'admin', 'manager', 'sales_agent'].map((r) => R.canReturn(r, c)), [false, true, false, false], 'only the shared Admin / Back Office login; legacy roles cannot');
  assert.equal(R.canReturn('admin', { current_stage: 'offer' }), false, 'only Back Office stages');
  assert.equal(R.canReturn('admin', { ...c, returned_at: '2026-10-14' }), false, 'not twice');
  const ret = { current_stage: 'document_check', returned_at: '2026-10-14', return_to_team: 'field_sales', next_action_owner_id: 'u1' };
  assert.equal(R.canResubmit('sales_agent', 'x', ret), true);
  assert.equal(R.canResubmit('sales_agent', 'u1', ret), true, 'the person it was assigned to');
  assert.equal(R.canResubmit('back_office', 'x', ret), false);
  assert.equal(R.canResubmit('admin', 'x', ret), true);
  assert.equal(R.canResubmit('manager', 'x', ret), false, 'legacy manager has no access');
  assert.equal(R.canResubmit('manager', 'u1', ret), false, 'not even as the assigned person');
  assert.equal(R.canResubmit('back_office', 'u1', { ...ret, return_to_team: 'back_office' }), false, 'nor as the team a case was returned to');
  assert.equal(R.defaultReturnTeam(['Υπογεγραμμένη σύμβαση / αίτηση']), 'field_sales');
  assert.equal(R.defaultReturnTeam(['Λογαριασμός ρεύματος']), 'inside_sales');
});

test('database refusals become clear messages', () => {
  assert.equal(R.parseStageError({ message: 'stage_transition_not_allowed: signed -> completed', hint: 'transition' }).kind, 'transition');
  assert.equal(R.stageErrorText(R.parseStageError({ message: 'stage_transition_not_allowed: signed -> completed', hint: 'transition' })), 'Η μετάβαση σε αυτό το στάδιο δεν επιτρέπεται από το τρέχον στάδιο.');
  assert.equal(R.parseStageError(null), null);
  assert.match(R.stageErrorText({ kind: 'other', message: 'return: a reason of at least 10 characters is required' }), /10 χαρακτήρων/);
  assert.match(R.stageErrorText({ kind: 'other', message: 'Could not find the function public.return_case_for_correction' }), /^Η λειτουργία δεν είναι ακόμη διαθέσιμη\.$/, 'neutral wording, no migration text');
});

test('documents never block: an old "stage_blocked" message is just another failure, not a document list', () => {
  const e = R.parseStageError({ message: 'stage_blocked: required documents', hint: 'document_blockers', details: '[{"label":"Ταυτότητα","status":"missing"}]' });
  assert.equal(e.kind, 'other');
  assert.equal(R.stageErrorText(e), 'Η ενέργεια απέτυχε. Δοκιμάστε ξανά.');
  assert.deepEqual(Object.keys(R.BLOCKER_TEXT).sort(), ['missing', 'rejected', 'unverified']);
});
