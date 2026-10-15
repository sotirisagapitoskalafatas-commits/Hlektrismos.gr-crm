import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../home-insights.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const H = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const NOW = Date.parse('2026-10-14T10:00:00Z');
const ago = (d) => new Date(NOW - d * 86_400_000).toISOString();
const c = (id, stage, o = {}) => ({ id, current_stage: stage, value: null, probability: null, updated_at: ago(1), customer: { full_name: id }, ...o });

test('pipeline: missing values are unknown, not €0; only active cases count', () => {
  const none = H.pipelineStats([c('a', 'new'), c('b', 'offer'), c('done', 'completed', { value: 900, probability: 100 })]);
  assert.equal(none.known, null); assert.equal(none.weighted, null); assert.equal(none.withoutValue, 2); assert.equal(none.active, 2);
  const some = H.pipelineStats([c('a', 'new', { value: 1000, probability: 50 }), c('b', 'offer'), c('x', 'lost', { value: 5000, probability: 10 })]);
  assert.equal(some.known, 1000); assert.equal(some.weighted, 500); assert.equal(some.withoutValue, 1);
  assert.deepEqual(some.byStage, { new: 1, offer: 1 });
});

test('insights: stale case, unassigned leads and overdue follow-ups from real records, with actions', () => {
  const r = H.homeInsights({
    cases: [c('Αγάπη', 'offer', { updated_at: ago(34) }), c('Νίκος', 'document_check'), c('Old', 'completed', { updated_at: ago(90) })],
    leads: [{ status: 'new', assigned_to_user_id: null }, { status: 'new', assigned_to_user_id: 'u' }, { status: 'converted', assigned_to_user_id: null }],
    followUps: [{ status: 'pending', due_at: ago(1) }, { status: 'done', due_at: ago(3) }],
    now: NOW, teamView: true,
  });
  assert.equal(r[0].text, 'Το case «Αγάπη» δεν έχει ενημέρωση εδώ και 34 ημέρες.');
  assert.deepEqual(r[0].action, { kind: 'case', id: 'Αγάπη' });
  assert.ok(r.some((x) => x.text === '1 νέο lead περιμένει ανάθεση.'));
  assert.ok(r.some((x) => x.text === 'Η ομάδα έχει 1 εκπρόθεσμο follow-up.'));
  assert.ok(r.length <= 4);
});

test('insights: team items hidden for individual roles; nothing invented on an empty CRM', () => {
  const r = H.homeInsights({ cases: [c('a', 'new', { value: 10, probability: 10 })], leads: [{ status: 'new', assigned_to_user_id: null }], followUps: [{ status: 'pending', due_at: ago(2) }], now: NOW, teamView: false });
  assert.deepEqual(r, []);
  assert.deepEqual(H.homeInsights({ cases: [], leads: [], followUps: [], now: NOW, teamView: true }), []);
  assert.equal(H.isOpenLead({ status: 'converted' }), false); assert.equal(H.isOpenLead({ status: 'contacted' }), true);
});

test('dashboard tiles: urgent = high/critical active cases + overdue follow-ups; stage counts ignore closed cases', () => {
  const cs = [
    { current_stage: 'new' }, { current_stage: 'new', priority: 'high' }, { current_stage: 'offer' }, { current_stage: 'offer', priority: 'critical' },
    { current_stage: 'signed' }, { current_stage: 'lost', priority: 'high' }, { current_stage: 'completed' },
  ];
  const t = H.dashboardTiles(cs, 3, 2);
  assert.deepEqual(t, { urgent: 5, urgentCases: 2, followUps: 2, offers: 2, signatures: 1, newCases: 2 });
});
