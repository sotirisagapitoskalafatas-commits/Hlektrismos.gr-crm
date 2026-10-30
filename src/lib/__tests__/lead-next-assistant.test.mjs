import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const N = await bundle('../lead-next.ts');
const W = await bundle('../work.ts');
const A = await bundle('../crm-assistant.ts');

const now = new Date('2026-10-14T12:00:00Z').getTime();
const L = (o = {}) => ({ status: 'new', first_contact_user_id: null, converted_case_id: null, phone: '+30 1', created_at: new Date(now - 5 * 3_600_000).toISOString(), ...o });

/* ---------------- lead next action ---------------- */
test('new lead with no recorded contact: first contact, with a reason grounded in the record', () => {
  const r = N.leadNextAction(L(), now);
  assert.equal(r.primary.action, 'mark-contacted'); assert.match(r.reason, /5 ώρες/); assert.equal(r.secondary.action, 'call');
});
test('no call shortcut without phone; contacted -> qualify; qualified/meeting/offer -> convert', () => {
  assert.equal(N.leadNextAction(L({ phone: null }), now).secondary, undefined);
  assert.equal(N.leadNextAction(L({ status: 'contacted' }), now).primary.action, 'mark-qualified');
  for (const s of ['qualified', 'meeting', 'offer']) assert.equal(N.leadNextAction(L({ status: s }), now).primary.action, 'convert');
});
test('converted opens the case only when linked; lost/duplicate need nothing; unknown status is flagged, not guessed', () => {
  assert.equal(N.leadNextAction(L({ status: 'converted', converted_case_id: 'c1' }), now).primary.action, 'open-case');
  assert.equal(N.leadNextAction(L({ status: 'converted' }), now).primary, undefined);
  for (const s of ['lost', 'unqualified', 'duplicate']) assert.equal(N.leadNextAction(L({ status: s }), now).primary, undefined);
  const u = N.leadNextAction(L({ status: 'legacy_x' }), now);
  assert.equal(u.tone, 'unknown'); assert.match(u.reason, /legacy_x/); assert.equal(u.primary, undefined);
});

/* ---------------- pipeline ---------------- */
const kase = (id, o = {}) => ({ id, case_no: id, title: 't', current_stage: 'new', next_action: '', updated_at: new Date(now).toISOString(), value: 0,
  owner_id: null, inside_sales_owner: null, field_sales_owner: null, back_office_owner: null, next_action_owner_id: 'me', customer: null, ...o });
test('pipeline counts active cases per journey stage; outcomes and unknown stages are not counted', () => {
  const cs = [kase('a'), kase('b', { current_stage: 'offer' }), kase('c', { current_stage: 'offer', next_action_owner_id: 'x' }),
    kase('d', { current_stage: 'completed' }), kase('e', { current_stage: 'weird' }), kase('f', { current_stage: 'lost' })];
  const mine = Object.fromEntries(W.pipelineByStage(cs, { uid: 'me', isTeamView: false }).map((x) => [x.stage, x.count]));
  assert.deepEqual([mine.new, mine.offer], [1, 1]);
  const team = W.pipelineByStage(cs, { uid: 'me', isTeamView: true });
  assert.equal(team.length, 8);
  assert.equal(team.reduce((a, b) => a + b.count, 0), 3);
});

/* ---------------- CRM assistant ---------------- */
const ctx = (o = {}) => ({
  role: 'inside_sales', uid: 'me', now, allowedPages: ['home', 'mywork', 'leads', 'customers', 'cases', 'followups'],
  items: [
    { key: 'fu:1', kind: 'followup', bucket: 'overdue', title: 'Δημήτρης Βλάχος', subtitle: 'x', due: now - 1, since: null, statusLabel: '', statusTone: 'danger', primary: { label: '', action: 'complete-followup' }, phone: null, caseId: 'c1' },
    { key: 'lead:1', kind: 'lead', bucket: 'now', title: 'Νέο Lead', subtitle: 'x', due: null, since: now, statusLabel: '', statusTone: 'info', primary: { label: '', action: 'open-lead' }, phone: null, leadId: 'l1' },
  ],
  summary: { overdue: 1, today: 0, awaitingFirstContact: 1, casesNeedingMyAction: 0, team: { unassignedNewLeads: 2, staleCases: 1, overdueFollowUps: 3, pipelineKnownValue: 0, activeCasesWithoutValue: 0 } },
  cases: [{ id: 'c1', case_no: 'CS-2026-002', title: 'Ρεύμα', current_stage: 'offer', customer: { full_name: 'Δημήτρης Βλάχος' } }],
  leads: [{ id: 'l1', full_name: 'Σοφία Ιωάννου', client_name: null, first_name: null, last_name: null, phone: '+30 6900', email: 's@x.gr', status: 'new' }],
  customers: [{ id: 'k1', full_name: 'Αθηνά Κωνσταντίνου', phone: null, email: null, city: 'Αθήνα' }],
  ...o,
});

test('assistant: accent-insensitive search across cases, leads and customers', () => {
  const r = A.answer('βρες σοφια', ctx());
  assert.deepEqual(r.results.map((x) => x.action), [{ type: 'lead', id: 'l1' }]);
  assert.equal(A.answer('Βρες CS-2026-002', ctx()).results[0].action.type, 'case');
  assert.equal(A.answer('κωνσταντινου', ctx()).results[0].action.type, 'customer');
});
test('assistant: answers today/overdue/leads from the same work items', () => {
  assert.equal(A.answer('Τι έχω σήμερα;', ctx()).results.length, 2);
  assert.match(A.answer('Εκπρόθεσμα', ctx()).text, /1 εκπρόθεσμο/);
  assert.equal(A.answer('leads για επικοινωνία', ctx()).results[0].action.id, 'l1');
});
test('assistant: navigation is limited to the role\'s pages; team summary only for managers/admins', () => {
  assert.equal(A.answer('Άνοιξε Leads', ctx()).results[0].action.page, 'leads');
  assert.match(A.answer('Άνοιξε Έσοδα', ctx()).text, /δεν είναι διαθέσιμη/);
  assert.match(A.answer('Σύνοψη ομάδας', ctx()).text, /διαχειριστή/);
  assert.match(A.answer('Σύνοψη ομάδας', ctx({ role: 'admin' })).text, /2 νέα leads/);
  for (const role of ['manager', 'back_office']) assert.match(A.answer('Σύνοψη ομάδας', ctx({ role })).text, /διαχειριστή/, `legacy ${role} gets no team summary`);
});
test('assistant: unknown requests get an honest answer, never fabricated data', () => {
  const r = A.answer('ποιος είναι ο καιρός', ctx());
  assert.equal(r.results, undefined); assert.match(r.text, /Δεν κατάλαβα/);
});
