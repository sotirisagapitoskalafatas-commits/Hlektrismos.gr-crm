import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const F = await bundle('../case-flow.ts');
const D = await bundle('../documents.ts');
const now = new Date('2026-10-14T12:00:00Z').getTime();
const kase = (o = {}) => ({ current_stage: 'offer', next_action: '', next_action_owner_id: null, next_follow_up_at: null, ...o });
const RES = { service_type: 'energy', property_type: 'Διαμέρισμα', case_type: null };

test('stepper: 9 Greek-labelled steps, done/current/upcoming, outcomes reported separately', () => {
  const { steps, outcome } = F.journeySteps('application', ['signed', 'document_check', 'lost', 'cancelled']);
  assert.equal(steps.length, 9);
  assert.deepEqual(steps.map((s) => s.state), ['done', 'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(steps[3].label, 'Αίτηση');
  assert.ok(steps.find((s) => s.stage === 'signed').reachable);
  assert.equal(outcome, null);
  assert.ok(steps.every((s) => !/[A-ZΑ-Ω]{3}$/.test(s.label) || s.label.length > 3), 'no 3-letter codes');
  const lost = F.journeySteps('lost', ['new']);
  assert.equal(lost.outcome, 'lost'); assert.ok(lost.steps.every((s) => s.state === 'upcoming'));
  assert.ok(F.journeySteps('completed', []).steps.every((s) => s.state === 'done'));
});

test('next step: explicit next action and owner win; otherwise the stage implies the team', () => {
  const a = F.caseNextStep(kase({ next_action: 'Αποστολή προσφοράς', next_action_owner_id: 'u1' }), ['application', 'signed', 'lost'], [], now);
  assert.equal(a.title, 'Αποστολή προσφοράς'); assert.deepEqual(a.owner, { kind: 'person', id: 'u1' }); assert.equal(a.suggestedStage, 'application');
  const b = F.caseNextStep(kase({ current_stage: 'document_check' }), ['submitted', 'application', 'lost'], [], now);
  assert.deepEqual(b.owner, { kind: 'team', team: 'back_office' }); assert.equal(b.suggestedStage, 'submitted');
});

test('next step: missing/rejected required documents block document stages, not early sales stages', () => {
  const cl = D.buildChecklist(RES, [{ category: 'id_card', status: 'rejected' }]);
  const blocked = F.caseNextStep(kase({ current_stage: 'document_check' }), ['submitted'], cl, now);
  assert.ok(blocked.blockers.some((b) => b.startsWith('Απορρίφθηκε: Ταυτότητα')));
  assert.ok(blocked.blockers.some((b) => b.startsWith('Λείπει: Λογαριασμός ρεύματος')));
  assert.equal(blocked.title, 'Συμπληρώστε τα δικαιολογητικά');
  assert.equal(F.caseNextStep(kase({ current_stage: 'contacted' }), ['offer'], cl, now).blockers.length, 0);
});

test('next step: overdue follow-up is a blocker; never suggests an outcome or a backward step', () => {
  const r = F.caseNextStep(kase({ next_follow_up_at: '2026-10-13T09:00:00Z' }), ['lost', 'cancelled'], [], now);
  assert.ok(r.blockers.includes('Το follow-up του case είναι εκπρόθεσμο'));
  assert.equal(r.suggestedStage, null);
  assert.equal(F.caseNextStep(kase({ current_stage: 'submitted' }), ['document_check', 'activation'], [], now).suggestedStage, 'activation');
});

test('closed cases need no action', () => {
  assert.equal(F.caseNextStep(kase({ current_stage: 'completed' }), [], [], now).done, true);
  assert.match(F.caseNextStep(kase({ current_stage: 'cancelled' }), ['new'], [], now).title, /Ακυρώθηκε/);
});

test('customer summary: unknown value counted separately, next/overdue follow-up from active cases only', () => {
  const s = F.customerSummary([
    { current_stage: 'offer', value: 500, next_follow_up_at: '2026-10-20T09:00:00Z' },
    { current_stage: 'signed', value: 0, next_follow_up_at: '2026-10-13T09:00:00Z' },
    { current_stage: 'completed', value: 900, next_follow_up_at: '2026-01-01T09:00:00Z' },
  ], now);
  assert.deepEqual([s.total, s.active, s.completed, s.knownValue, s.withoutValue], [3, 2, 1, 1400, 1]);
  assert.equal(s.nextFollowUp, '2026-10-13T09:00:00Z'); assert.equal(s.overdueFollowUp, true);
});
