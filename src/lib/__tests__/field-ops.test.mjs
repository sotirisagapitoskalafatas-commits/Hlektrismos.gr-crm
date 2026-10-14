import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const F = await bundle('../field-day.ts');
const O = await bundle('../ops-queue.ts');

const NOW = new Date('2026-10-14T11:00:00').getTime(); // local time on purpose
const at = (h) => new Date(NOW + h * 3_600_000).toISOString();
const v = (id, o = {}) => ({ id, status: 'planned', scheduled_at: null, started_at: null, ended_at: null, created_at: at(-48), ...o });

test('visits: today/overdue/upcoming/done split correctly and sorted by time (was NaN-sorted before)', () => {
  const g = F.groupVisits([
    v('late', { scheduled_at: at(5) }), v('early', { scheduled_at: at(-2) }), v('prog', { status: 'in_progress', started_at: at(-1) }),
    v('nodate'), v('yday', { scheduled_at: at(-26) }), v('tmrw', { scheduled_at: at(24) }),
    v('done', { status: 'completed', ended_at: at(-0.5) }), v('doneOld', { status: 'completed', ended_at: at(-30) }), v('x', { status: 'cancelled', scheduled_at: at(1) }),
  ], NOW);
  assert.deepEqual(g.today.map((x) => x.id), ['prog', 'early', 'late', 'nodate']);
  assert.deepEqual(g.overdue.map((x) => x.id), ['yday']);
  assert.deepEqual(g.upcoming.map((x) => x.id), ['tmrw']);
  assert.deepEqual(g.doneToday.map((x) => x.id), ['done']);
  assert.equal(g.next.id, 'prog');
});
test('visits: next is the upcoming planned visit when none is in progress; empty day -> null', () => {
  const g = F.groupVisits([v('a', { scheduled_at: at(-3) }), v('b', { scheduled_at: at(2) })], NOW);
  assert.equal(g.next.id, 'b');
  assert.equal(F.groupVisits([], NOW).next, null);
  assert.equal(F.groupVisits([v('old', { scheduled_at: at(-30) })], NOW).next.id, 'old');
});
test('nearest cases: sorted by real distance only when position is known; never invents coordinates', () => {
  const cs = [{ id: 'far', lat: 40.64, lng: 22.94 }, { id: 'near', lat: 37.98, lng: 23.73 }, { id: 'none', lat: null, lng: null }];
  const r = F.nearestCases(cs, { lat: 37.97, lng: 23.72 });
  assert.equal(r.sorted, true); assert.deepEqual(r.items.map((x) => x.c.id), ['near', 'far']);
  assert.ok(r.items[0].km < 2 && r.items[1].km > 290);
  const u = F.nearestCases(cs, null);
  assert.equal(u.sorted, false); assert.equal(u.items.length, 2); assert.equal(u.items[0].km, null);
});
test('check-out note keeps the outcome even offline', () => {
  assert.equal(F.checkoutNote('Δεν ενδιαφέρεται', '  '), 'Αποτέλεσμα: Δεν ενδιαφέρεται');
  assert.equal(F.checkoutNote('Υπογραφή / συλλογή εγγράφων', 'ΑΤ και λογαριασμός'), 'Αποτέλεσμα: Υπογραφή / συλλογή εγγράφων\nΑΤ και λογαριασμός');
});

const kase = (id, o = {}) => ({ id, case_no: id, title: 't', current_stage: 'document_check', priority: 'normal', service_type: 'energy', property_type: 'Διαμέρισμα',
  case_type: null, stage_entered_at: at(-24 * 2), updated_at: at(-24), next_follow_up_at: null, next_action: '', next_action_owner_id: null, back_office_owner: null, customer: { full_name: id }, ...o });
const FULL = [{ category: 'id_card', status: 'verified' }, { category: 'bill_electricity', status: 'verified' }, { category: 'lease', status: 'verified' }, { category: 'signed', status: 'verified' }];

test('ops queue: only back-office stages; urgent first, then blocked, then oldest in stage', () => {
  const q = O.buildOpsQueue([
    kase('ok-old', { stage_entered_at: at(-24 * 9) }), kase('blocked'), kase('urgent', { priority: 'high', stage_entered_at: at(-1) }),
    kase('sales', { current_stage: 'offer' }), kase('done', { current_stage: 'completed' }), kase('act', { current_stage: 'activation', stage_entered_at: at(-24 * 3) }),
  ], { 'ok-old': FULL, urgent: FULL }, 'me', NOW);
  assert.deepEqual(q.map((x) => x.id), ['urgent', 'blocked', 'ok-old', 'act']);
  assert.equal(q.find((x) => x.id === 'ok-old').daysInStage, 9);
  assert.ok(q.find((x) => x.id === 'blocked').blockers.includes('Λείπει: Ταυτότητα ή διαβατήριο'));
  assert.equal(q.find((x) => x.id === 'act').blockers.length, 0, 'activation is not blocked by documents');
});
test('ops queue: a returned case shows who it waits on, first', () => {
  const q = O.buildOpsQueue([kase('r', { returned_at: at(-1), return_to_team: 'field_sales' })], { r: FULL }, 'me', NOW);
  assert.equal(q[0].blockers[0], 'Επιστράφηκε για διόρθωση σε Field Sales');
});
test('ops queue: received-but-unverified documents are "to check" during document check; owner and overdue follow-up', () => {
  const q = O.buildOpsQueue([kase('k', { back_office_owner: 'me', next_follow_up_at: at(-2) })], { k: [{ category: 'id_card', status: 'received' }] }, 'me', NOW);
  assert.ok(q[0].blockers.includes('Προς έλεγχο: Ταυτότητα ή διαβατήριο'));
  assert.ok(q[0].blockers.includes('Εκπρόθεσμο follow-up'));
  assert.equal(q[0].mine, true); assert.equal(q[0].stageLabel, 'Έλεγχος εγγράφων');
});
