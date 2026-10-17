import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const js = buildSync({
  stdin: { contents: "export { canSetStage, canUseStageSet, stageSetTargets, stageSetErrorText, STAGE_SET_MIN_REASON } from './stage-jump'; export { journeySteps, visitedStages } from './case-flow'; export { STAGES, ROLES, ACTIVITY_META } from './roles';",
    resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const A = await import('data:text/javascript;base64,' + Buffer.from(js.outputFiles[0].text).toString('base64'));
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('who and where: only Back Office / admin / manager; never to the same stage; a completed case is final; completed only from activation', () => {
  for (const r of ['admin', 'manager', 'back_office']) assert.equal(A.canUseStageSet(r), true, r);
  for (const r of ['inside_sales', 'field_sales', null, undefined]) assert.equal(A.canUseStageSet(r), false, String(r));
  assert.equal(A.canSetStage('back_office', 'new', 'submitted'), true, 'jump over stages');
  assert.equal(A.canSetStage('back_office', 'submitted', 'application'), true, 'back');
  assert.equal(A.canSetStage('back_office', 'lost', 'application'), true, 'resume a lost case where the work really is');
  assert.equal(A.canSetStage('back_office', 'submitted', 'submitted'), false);
  assert.equal(A.canSetStage('back_office', 'completed', 'activation'), false, 'final');
  assert.equal(A.canSetStage('back_office', 'submitted', 'completed'), false, 'completed only from activation');
  assert.equal(A.canSetStage('back_office', 'activation', 'completed'), true);
  assert.equal(A.canSetStage('inside_sales', 'new', 'offer'), false);
  assert.equal(A.canSetStage('admin', 'new', 'nonsense'), false);
});

test('the control offers exactly what the rule allows, in journey order', () => {
  assert.deepEqual(A.stageSetTargets('back_office', 'application'), ['new', 'contacted', 'offer', 'signed', 'document_check', 'submitted', 'activation', 'lost', 'cancelled']);
  assert.equal(A.stageSetTargets('back_office', 'activation').includes('completed'), true);
  assert.deepEqual(A.stageSetTargets('back_office', 'completed'), []);
  assert.deepEqual(A.stageSetTargets('inside_sales', 'application'), []);
  assert.ok(A.stageSetTargets('admin', 'lost').includes('application') && !A.stageSetTargets('admin', 'lost').includes('lost'));
});

test('errors are neutral Greek, never migration or developer wording', () => {
  assert.equal(A.stageSetErrorText('Could not find the function public.set_case_stage(p_case, p_reason, p_stage) in the schema cache'), 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.');
  assert.equal(A.stageSetErrorText('set_stage: not allowed'), 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.');
  assert.match(A.stageSetErrorText('set_stage: a reason of at least 10 characters is required'), /τουλάχιστον 10 χαρακτήρων/);
  assert.equal(A.stageSetErrorText('set_stage: a case is completed only from the activation stage'), '«Ολοκληρώθηκε» γίνεται μόνο από «Ενεργοποίηση».');
  assert.equal(A.stageSetErrorText('set_stage: a completed case does not change stage'), 'Το case έχει ολοκληρωθεί· δεν αλλάζει στάδιο.');
  assert.equal(A.stageSetErrorText('boom'), 'Η αλλαγή σταδίου δεν αποθηκεύτηκε. Δοκιμάστε ξανά.');
  for (const m of ['Could not find the function', 'not allowed', 'boom', 'reason of at least']) assert.ok(!/migration|phase\d|SQL|schema/i.test(A.stageSetErrorText(m)), m);
  assert.ok(A.ACTIVITY_META.stage_set.label.startsWith('Αλλαγή σταδίου'));
});

test('stepper from history: stages the case never occupied are skipped, not done', () => {
  const ev = (activity_type, from, to) => ({ activity_type, title: `Στάδιο: ${from} → ${to}`, metadata: { from, to } });
  // normal path: everything before the current stage was visited
  const walked = A.visitedStages([ev('status_change', 'new', 'contacted'), ev('status_change', 'contacted', 'offer'), ev('status_change', 'offer', 'application')], 'application');
  assert.deepEqual([...walked].sort(), ['application', 'contacted', 'new', 'offer']);
  assert.deepEqual(A.journeySteps('application', [], walked).steps.map((s) => s.state), ['done', 'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  // a Back Office jump from the first stage to the provider registration
  const jumped = A.visitedStages([ev('stage_set', 'new', 'submitted')], 'submitted');
  assert.deepEqual(A.journeySteps('submitted', [], jumped).steps.map((s) => s.state), ['done', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped', 'current', 'upcoming', 'upcoming']);
  // partial history: only the jump is recorded (application → submitted). Below «Αίτηση» is unknown, not skipped.
  const partial = A.visitedStages([ev('stage_set', 'application', 'submitted')], 'submitted');
  assert.deepEqual(A.journeySteps('submitted', [], partial).steps.map((s) => s.state), ['done', 'done', 'done', 'done', 'skipped', 'skipped', 'current', 'upcoming', 'upcoming']);
  // no history at all (older data): exactly as before
  assert.equal(A.visitedStages([], 'application'), null);
  assert.deepEqual(A.journeySteps('application', [], null).steps.map((s) => s.state), ['done', 'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.deepEqual(A.journeySteps('application', []).steps.map((s) => s.state), A.journeySteps('application', [], null).steps.map((s) => s.state));
});

test('stepper from history reads old and new entries: Greek names, raw codes, metadata, and ignores everything else', () => {
  const seen = A.visitedStages([
    { activity_type: 'status_change', title: 'Στάδιο: new → contacted' },                    // before #56: raw codes
    { activity_type: 'status_change', title: 'Στάδιο: Επικοινωνία → Προσφορά' },               // Greek names
    { activity_type: 'status_change', title: 'Ενημέρωση Case', metadata: {} },                 // legacy duplicate: no arrow
    { activity_type: 'status_change', title: 'Εξαίρεση: no_response' },                         // exception state, not a stage
    { activity_type: 'note', title: 'Στάδιο: x → y' },                                        // not a stage entry
    { activity_type: 'stage_set', title: 'Αλλαγή σταδίου από Back Office: offer → signed' },   // jump, no metadata
    { activity_type: 'completed', title: 'Case ολοκληρώθηκε', metadata: { from: 'activation', to: 'completed' } },
  ], 'completed');
  assert.deepEqual([...seen].sort(), ['activation', 'completed', 'contacted', 'new', 'offer', 'signed']);
});

test('the stage control is wired into the Back Office tab and the stepper reads history', () => {
  const page = read('../../components/app/CaseDetailPage.tsx');
  assert.ok(/<StageSetControl c=\{c\} reload=\{reload\} \/>/.test(page) && /canUseStageSet\(role\)\) return null/.test(page));
  assert.ok(/visited=\{stageHistory \? visitedStages\(stageHistory, c\.current_stage\) : null\}/.test(page));
  assert.ok(/visited=\{visitedStages\(events\.filter/.test(read('../../components/customers/CustomerDetail.tsx')));
});
