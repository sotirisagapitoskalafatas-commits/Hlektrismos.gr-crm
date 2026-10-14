import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const { leadStatusDisplay } = await bundle('../lead-status.ts');
const W = await bundle('../work.ts');

const NOW = new Date('2026-10-14T10:00:00').getTime(); // local time on purpose (same-day logic is local)
const h = (hours) => new Date(NOW + hours * 3_600_000).toISOString();
const ME = 'me', OTHER = 'other';
const cust = { full_name: 'Πελάτης Δοκιμής', phone: '+30 690' };
const fu = (id, hours, o = {}) => ({ id, case_id: `c-${id}`, due_at: h(hours), channel: 'phone', reason: 'Υπενθύμιση', assignee_id: ME,
  status: 'pending', snoozed_until: null, case: { id: `c-${id}`, case_no: `CS-${id}`, title: 't', customer: cust }, ...o });
const kase = (id, o = {}) => ({ id, case_no: `CS-${id}`, title: 'Case', current_stage: 'offer', next_action: 'Αποστολή προσφοράς', updated_at: h(-24),
  value: 500, owner_id: null, inside_sales_owner: null, field_sales_owner: null, back_office_owner: null, next_action_owner_id: ME, customer: cust, ...o });
const lead = (id, o = {}) => ({ id, status: 'new', assigned_to_user_id: ME, created_at: h(-5), full_name: 'Lead', client_name: null, first_name: null,
  last_name: null, phone: '+30 691', service_category: 'electricity', company: null, ...o });

test('every stored lead status has a plain-Greek label; stored value is preserved', () => {
  const expected = { new: 'Νέο', contacted: 'Σε επικοινωνία', qualified: 'Ειδικευμένο', meeting: 'Ειδικευμένο', offer: 'Ειδικευμένο',
    converted: 'Μετατράπηκε', lost: 'Χάθηκε', unqualified: 'Χάθηκε', duplicate: 'Διπλότυπο' };
  for (const [raw, label] of Object.entries(expected)) {
    const d = leadStatusDisplay(raw);
    assert.equal(d.label, label); assert.equal(d.known, true); assert.equal(d.raw, raw);
  }
  assert.equal(leadStatusDisplay('duplicate').isQualityFlag, true);
});

test('unknown / missing historical statuses are shown verbatim, never hidden or guessed', () => {
  const u = leadStatusDisplay('legacy_import_status');
  assert.equal(u.known, false); assert.equal(u.label, 'legacy_import_status'); assert.equal(u.raw, 'legacy_import_status');
  assert.equal(leadStatusDisplay(null).label, 'Χωρίς κατάσταση'); assert.equal(leadStatusDisplay(undefined).known, false);
});

test('work items: only MY open work, ordered overdue → today → no-deadline → upcoming', () => {
  const items = W.buildWorkItems({ uid: ME, now: NOW,
    followUps: [fu('up', 30), fu('today', 2), fu('over2', -3), fu('over1', -26), fu('theirs', -5, { assignee_id: OTHER }), fu('done', -5, { status: 'completed' }),
      fu('cancelled', -5, { status: 'cancelled' }), fu('snoozedFuture', -1, { status: 'snoozed', snoozed_until: h(5) }), fu('snoozedEnded', -1, { status: 'snoozed', snoozed_until: h(-1) })],
    leads: [lead('L1'), lead('L2', { assigned_to_user_id: OTHER }), lead('L3', { status: 'contacted' }), lead('L4', { assigned_to_user_id: null })],
    cases: [kase('K1'), kase('K2', { next_action_owner_id: OTHER }), kase('K3', { current_stage: 'completed' }), kase('K4', { next_action_owner_id: null, inside_sales_owner: ME })],
  });
  const keys = items.map((x) => x.key);
  assert.deepEqual(keys.slice(0, 4), ['fu:over1', 'fu:over2', 'fu:snoozedEnded', 'fu:today']);
  assert.ok(keys.indexOf('lead:L1') > keys.indexOf('fu:today') && keys.indexOf('lead:L1') < keys.indexOf('fu:up'));
  assert.equal(keys.at(-1), 'fu:up');
  for (const bad of ['fu:theirs', 'fu:done', 'fu:cancelled', 'fu:snoozedFuture', 'lead:L2', 'lead:L3', 'lead:L4', 'case:K2', 'case:K3']) assert.ok(!keys.includes(bad), bad);
  assert.ok(keys.includes('case:K1') && keys.includes('case:K4'), 'legacy owner fallback works');
});

test('a case with a follow-up due now is not listed twice', () => {
  const items = W.buildWorkItems({ uid: ME, now: NOW, followUps: [fu('x', -2, { case_id: 'K9' })], leads: [], cases: [kase('K9')] });
  assert.deepEqual(items.map((x) => x.kind), ['followup']);
});

test('each item has exactly one primary action matching its kind', () => {
  const items = W.buildWorkItems({ uid: ME, now: NOW, followUps: [fu('a', -1)], leads: [lead('L')], cases: [kase('K')] });
  const by = Object.fromEntries(items.map((x) => [x.kind, x.primary.action]));
  assert.deepEqual(by, { followup: 'complete-followup', lead: 'open-lead', case: 'open-case' });
});

test('summary numbers equal the list they summarise (no conflicting counts)', () => {
  const input = { uid: ME, now: NOW,
    followUps: [fu('o1', -2), fu('o2', -30), fu('t1', 1)], leads: [lead('L1'), lead('L2')], cases: [kase('K1'), kase('K2')] };
  const items = W.buildWorkItems(input);
  const s = W.buildHomeSummary({ ...input, isTeamView: false, items });
  assert.equal(s.overdue, items.filter((x) => x.bucket === 'overdue').length);
  assert.equal(s.today, 1); assert.equal(s.awaitingFirstContact, 2); assert.equal(s.casesNeedingMyAction, 2);
  assert.equal(s.team, null);
});

test('team view: unknown value is not €0 — it is counted separately; stale/unassigned definitions hold', () => {
  const cases = [kase('A', { value: 1000 }), kase('B', { value: 0 }), kase('C', { value: 250, updated_at: h(-24 * 9) }), kase('D', { current_stage: 'lost', value: 999 })];
  const leads = [lead('1', { assigned_to_user_id: null }), lead('2'), lead('3', { assigned_to_user_id: null, status: 'contacted' })];
  const followUps = [fu('o', -2, { assignee_id: OTHER })];
  const s = W.buildHomeSummary({ uid: ME, now: NOW, isTeamView: true, items: [], cases, leads, followUps });
  assert.equal(s.team.pipelineKnownValue, 1250);
  assert.equal(s.team.activeCasesWithoutValue, 1);
  assert.equal(s.team.staleCases, 1);
  assert.equal(s.team.unassignedNewLeads, 1);
  assert.equal(s.team.overdueFollowUps, 1);
});

/* ---------------- formatting ---------------- */
const F = await bundle('../work-format.ts');
test('durations are plain Greek and never negative', () => {
  assert.equal(F.durationEl(-5000), 'λιγότερο από 1 λεπτό');
  assert.equal(F.durationEl(60_000), '1 λεπτό');
  assert.equal(F.durationEl(5 * 60_000), '5 λεπτά');
  assert.equal(F.durationEl(3 * 3_600_000), '3 ώρες');
  assert.equal(F.durationEl(2 * 86_400_000), '2 ημέρες');
});
test('timing text: overdue, today, waiting lead, stale case', () => {
  const items = W.buildWorkItems({ uid: ME, now: NOW, followUps: [fu('o', -3), fu('t', 2)], leads: [lead('L', { created_at: h(-5) })], cases: [kase('K', { updated_at: h(-72) })] });
  const when = Object.fromEntries(items.map((x) => [x.key, F.formatWhen(x, NOW)]));
  assert.match(when['fu:o'], /3 ώρες/);           // «πριν από 3 ώρες»
  assert.match(when['fu:t'], /^Σήμερα, \d{2}:\d{2}$/);
  assert.equal(when['lead:L'], 'Περιμένει 5 ώρες');
  assert.equal(when['case:K'], 'Χωρίς κίνηση 3 ημέρες');
});
