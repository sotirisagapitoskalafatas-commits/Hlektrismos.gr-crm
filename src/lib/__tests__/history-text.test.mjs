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
