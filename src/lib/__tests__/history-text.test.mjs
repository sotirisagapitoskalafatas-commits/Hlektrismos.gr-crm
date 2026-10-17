import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const bundle = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const H = await bundle('../history-text.ts');
const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('W1: stage codes are shown in Greek, in new and in stored entries', () => {
  assert.equal(H.stageChangeTitle('new', 'contacted'), 'Στάδιο: Νέο → Επικοινωνία');
  assert.equal(H.historyText('Στάδιο: document_check → submitted'), 'Στάδιο: Έλεγχος εγγράφων → Καταχώρηση παρόχου');
  // 07 override title is written by SQL with raw codes
  assert.equal(H.historyText('Παράκαμψη ελέγχου εγγράφων: signed → document_check'), 'Παράκαμψη ελέγχου εγγράφων: Υπογραφή → Έλεγχος εγγράφων');
  // 13 exception title
  assert.equal(H.historyText('Εξαίρεση: no_response'), 'Εξαίρεση: Χωρίς απάντηση από τον πελάτη');
  // ordinary text and unknown words are left alone
  assert.equal(H.historyText('Κλήση: newsletter → offer pending'), 'Κλήση: newsletter → offer pending');
  assert.equal(H.historyText(null), '');
});

test('W2: the legacy «Ενημέρωση Case» duplicate is hidden; a description equal to the title is dropped', () => {
  const at = '2026-10-10T10:00:00Z';
  const rows = [
    { id: 1, activity_type: 'status_change', title: 'Ενημέρωση Case', description: 'Στάδιο: new → contacted', occurred_at: at },
    { id: 2, activity_type: 'status_change', title: 'Στάδιο: new → contacted', description: 'Στάδιο: new → contacted', occurred_at: at },
    { id: 3, activity_type: 'note', title: 'Ενημέρωση Case', description: 'κάτι άλλο', occurred_at: at },
  ];
  assert.deepEqual(H.visibleHistory(rows).map((r) => r.id), [2, 3]);
  assert.equal(H.historyDescription(rows[1]), '');
  assert.equal(H.historyDescription(rows[2]), 'κάτι άλλο');
});

test('W2: one entry carries the note and the missing documents', () => {
  assert.equal(H.stageChangeDescription('  Συμφώνησε τηλεφωνικά ', ['Λογαριασμός — Λείπει']), 'Συμφώνησε τηλεφωνικά\nΜε ελλείψεις εγγράφων: Λογαριασμός — Λείπει');
  assert.equal(H.stageChangeDescription('', []), '');
  const api = src('../api.ts');
  assert.ok(!/title: 'Ενημέρωση Case'/.test(api), 'updateCase no longer writes the duplicate entry');
  assert.ok(!/Σημείωση αλλαγής σταδίου|Σχόλιο ολοκλήρωσης/.test(api), 'the note is not a separate entry');
  assert.ok(!/Μετάβαση με ελλείψεις εγγράφων/.test(src('../../components/cases/CaseOverview.tsx')), 'missing documents are not a separate entry');
});

test('D6: the grey label and the team filter use the same value (who recorded it)', () => {
  const ev = (role) => ({ activity_type: 'note', title: 'Σημείωση', role });
  assert.equal(H.entryTeam(ev('back_office')), 'back_office');
  assert.equal(H.entryTeamLabel(ev('back_office')), 'Back Office');
  assert.equal(H.entryTeam(ev('system')), 'system');
  assert.equal(H.entryTeamLabel(ev('system')), 'Σύστημα');
  assert.equal(H.entryTeamLabel(ev(null)), 'Σύστημα');
  // admin/manager entries are labelled with the role and have no team button (shown under «Όλα» only)
  assert.equal(H.entryTeam(ev('admin')), 'admin');
  assert.equal(H.entryTeamLabel(ev('manager')), 'Διευθυντής');
});

test('W3: every lead action code the app or the staged SQL writes has Greek text; unknown codes never show raw', () => {
  const st = (s) => ({ new: 'Νέο', contacted: 'Επικοινωνία' })[s] ?? s;
  assert.equal(H.leadActionText({ action: 'status_change', details: { from: 'new', to: 'contacted' } }, st), 'Κατάσταση: Νέο → Επικοινωνία');
  assert.equal(H.leadActionText({ action: 'trashed', details: { reason: 'Διπλή εγγραφή' } }, st), 'Μεταφορά στον Κάδο · Διπλή εγγραφή');
  assert.equal(H.leadActionText({ action: 'some_future_code' }, st), 'Ενέργεια στο lead');
  // codes written to activity_log by the staged SQL and the app
  const staged = ['phase2/06_trash_leads_customers', 'phase3/09_contact_eligibility', 'phase4/12_default_backoffice_assignee']
    .map((f) => src(`../../../supabase/staged-migrations/${f}.sql`)).join('\n');
  const codes = new Set([
    ...[...staged.matchAll(/values \(p_type, p_id, '([a-z_]+)'/g)].map((m) => m[1]),
    ...[...staged.matchAll(/contact_log\('([a-z_]+)'/g)].map((m) => m[1]),
    ...[...staged.matchAll(/values \('lead', p_lead, '([a-z_]+)'/g)].map((m) => m[1]),
    ...[...src('../../components/leads/LeadDetail.tsx').matchAll(/logAudit\('lead', [^,]+, '([a-z_]+)'/g)].map((m) => m[1]),
  ]);
  assert.ok(codes.size >= 8, `found ${codes.size} codes`);
  for (const c of codes) if (c !== 'status_change') assert.ok(H.knownLeadActions.includes(c), `no Greek text for «${c}»`);
});

test('W4: the case history panel has one name, «Ιστορικό»', () => {
  const page = src('../../components/app/CaseDetailPage.tsx');
  assert.ok(!/Χρονολόγιο|micro="Timeline"/.test(page));
  assert.ok(/<CardHeader title="Ιστορικό" \/>/.test(page));
});

test('folder history (B2): lead and case entries in one timeline, newest first, each labelled', () => {
  const ev = (id, type, at, o = {}) => ({ id, case_id: 'c1', case_no: 'CS-1', activity_type: type, title: `t-${id}`, description: '', role: 'inside_sales', occurred_at: at, user: { full_name: 'Εύα' }, ...o });
  const out = H.mergeHistory({
    caseEvents: [ev('a', 'call', '2026-10-05T10:00:00Z'), ev('b', 'note', '2026-10-07T10:00:00Z')],
    leads: [{ lead: { id: 'L1', created_at: '2026-10-01T09:00:00Z', converted_at: '2026-10-04T09:00:00Z', source_label: 'Φόρμα' }, activity: [{ id: 'x', action: 'status_change', details: { from: 'new', to: 'contacted' }, created_at: '2026-10-02T09:00:00Z' }] }],
    statusText: (s) => ({ new: 'Νέο', contacted: 'Επικοινωνία' })[s] ?? s,
    typeLabel: (t) => t,
  });
  assert.deepEqual(out.map((e) => e.key), ['c-b', 'c-a', 'lc-L1', 'l-x', 'ln-L1']);
  assert.equal(out[0].label, 'CS-1'); assert.equal(out[0].source, 'case'); assert.equal(out[0].userName, 'Εύα');
  const lead = out.filter((e) => e.source === 'lead');
  assert.deepEqual(lead.map((e) => e.title), ['Μετατράπηκε σε Case', 'Κατάσταση: Νέο → Επικοινωνία', 'Νέο lead · Φόρμα']);
  assert.ok(lead.every((e) => e.label === 'Lead' && e.caseId === null));
});

test('folder history: Back Office entries are NOT dropped (no type allowlist)', () => {
  const types = ['document_check', 'application', 'provider_submission', 'activation', 'stage_override', 'returned', 'resubmitted', 'created', 'status_change'];
  const caseEvents = types.map((t, i) => ({ id: `e${i}`, case_id: 'c1', case_no: 'CS-1', activity_type: t, title: `T ${t}`, description: '', role: 'back_office', occurred_at: `2026-10-0${i + 1}T10:00:00Z` }));
  const out = H.mergeHistory({ caseEvents, leads: [], statusText: (s) => s, typeLabel: (t) => t });
  assert.equal(out.length, types.length);
  assert.ok(out.every((e) => e.team === 'back_office' && e.teamLabel === 'Back Office'));
});

test('folder history: a failed lead read (null) leaves the case entries and the lead\'s own dates', () => {
  const caseEvents = [{ id: 'a', case_id: 'c1', case_no: 'CS-1', activity_type: 'note', title: 'Σημείωση', description: 'x', role: 'inside_sales', occurred_at: '2026-10-05T10:00:00Z' }];
  const out = H.mergeHistory({ caseEvents, leads: [{ lead: { id: 'L1', created_at: '2026-10-01T09:00:00Z', converted_at: null, source_label: 'Φόρμα' }, activity: null }], statusText: (s) => s, typeLabel: (t) => t });
  assert.deepEqual(out.map((e) => e.key), ['c-a', 'ln-L1']);
  assert.equal(H.mergeHistory({ caseEvents: [], leads: [], statusText: (s) => s, typeLabel: (t) => t }).length, 0);
});

test('folder history: no duplicates for the legacy «Ενημέρωση Case» row or for dates the log already has', () => {
  const caseEvents = [
    { id: 'a', case_id: 'c1', case_no: 'CS-1', activity_type: 'status_change', title: 'Ενημέρωση Case', description: 'Στάδιο: new → contacted', role: 'inside_sales', occurred_at: '2026-10-05T10:00:00Z' },
    { id: 'b', case_id: 'c1', case_no: 'CS-1', activity_type: 'status_change', title: 'Στάδιο: new → contacted', description: 'Στάδιο: new → contacted', role: 'inside_sales', occurred_at: '2026-10-05T10:00:00Z' },
  ];
  const activity = [{ id: 'c', action: 'converted', details: null, created_at: '2026-10-04T09:00:00Z' }, { id: 'd', action: 'created', details: null, created_at: '2026-10-01T09:00:00Z' }];
  const out = H.mergeHistory({ caseEvents, leads: [{ lead: { id: 'L1', created_at: '2026-10-01T09:00:00Z', converted_at: '2026-10-04T09:00:00Z', source_label: 'Φόρμα' }, activity }], statusText: (s) => s, typeLabel: (t) => t });
  assert.deepEqual(out.map((e) => e.key), ['c-b', 'l-c', 'l-d']);
  assert.equal(out[0].title, 'Στάδιο: Νέο → Επικοινωνία');
  assert.equal(out[0].description, '');
});

test('folder history: the folder reuses the case composer and no longer filters by type', () => {
  const cust = src('../../components/customers/CustomerDetail.tsx');
  assert.ok(/<TimelineComposer key=\{sel\.id\} caseId=\{sel\.id\}/.test(cust));
  assert.ok(!/COMMS/.test(cust), 'the activity-type allowlist is gone');
});
