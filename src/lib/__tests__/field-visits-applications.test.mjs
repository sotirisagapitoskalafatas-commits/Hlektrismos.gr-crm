// Field Visits (standalone) and Energy Applications: the pure models and the network layer. The network layer is run against a RECORDING fake client:
// nothing leaves the machine. «Not installed» (the staged SQL is not applied) must change nothing: no write, no error toast, the old loaders keep working.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const SRC = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '');
const dir = mkdtempSync(path.join(tmpdir(), 'fva-'));
const stub = path.join(dir, 'supabase-stub.mjs');
writeFileSync(stub, 'export const supabase = globalThis.__fakeSupabase;\nexport const anonymousClient = () => globalThis.__fakeSupabase;\n');
const entry = `export * as V from '@/lib/field-visits'; export * as App from '@/lib/applications'; export * as Api from '@/lib/field-api'; export * as Field from '@/lib/field-day'; export * as Roles from '@/lib/roles';`;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } });
const out = await build({ stdin: { contents: entry, resolveDir: SRC, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error', alias: { '@': SRC },
  plugins: [{ name: 'supabase-stub', setup(b) { b.onResolve({ filter: /^(\.\/|@\/lib\/)supabase$/ }, () => ({ path: stub })); } }] });
const calls = []; let responder = () => ({ data: null, error: null });
const builder = (table) => {
  const rec = { table, ops: [] };
  const b = new Proxy({}, { get: (_, op) => {
    if (op === 'then') return (res) => { calls.push(rec); res(responder(rec)); };
    return (...args) => { rec.ops.push([op, args]); return b; };
  } });
  return b;
};
globalThis.__fakeSupabase = {
  from: (t) => builder(t),
  rpc: (name, args) => ({ then: (res) => { calls.push({ rpc: name, args }); res(responder({ rpc: name, args })); } }),
  storage: { from: (bucket) => ({
    upload: (p, f, o) => { calls.push({ upload: { bucket, p, o } }); return Promise.resolve(responder({ upload: p })); },
    createSignedUrl: (p, s) => { calls.push({ signed: { bucket, p, s } }); return Promise.resolve({ data: { signedUrl: 'https://signed.example.invalid/x' } }); },
    getPublicUrl: () => { throw new Error('a private document must never use a public URL'); },
  }) },
};
const M = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { V, App, Api, Field } = M;
const reset = () => { calls.length = 0; Api.resetProbes(); };
const installed = (yes) => { responder = (r) => (r.ops && r.ops.some(([o]) => o === 'limit') && !yes ? { data: null, error: { code: '42703', message: 'column does not exist' } } : { data: [], error: null }); };

/* ───────── visits ───────── */
test('visit states: a rescheduled visit says so; the only new stored status is no_show; closed states are closed', () => {
  assert.equal(V.visitStateText({ status: 'cancelled', status_reason: 'rescheduled: ζήτησε Παρασκευή' }), 'Επαναπρογραμματίστηκε');
  assert.equal(V.visitStateText({ status: 'cancelled', status_reason: 'ο πελάτης έλειπε' }), 'Ακυρώθηκε');
  assert.equal(V.visitStateText({ status: 'no_show' }), 'Δεν εμφανίστηκε');
  assert.equal(V.reasonOf({ status_reason: 'rescheduled: ζήτησε Παρασκευή' }), 'ζήτησε Παρασκευή');
  assert.deepEqual(Object.keys(V.VISIT_STATUS_TEXT), ['planned', 'in_progress', 'completed', 'cancelled', 'no_show']);
  for (const s of ['completed', 'cancelled', 'no_show']) assert.equal(V.isClosed(s), true);
  for (const s of ['planned', 'in_progress']) assert.equal(V.isClosed(s), false);
});

test('a visit with no Case has a subject and no Case chip; a prospect is labelled as such', () => {
  const p = V.visitSubject({ prospect: { name: 'Καφέ Άστρο' } });
  assert.deepEqual([p.kind, p.label, p.chips], ['prospect', 'Καφέ Άστρο', ['prospect']]);
  const l = V.visitSubject({ lead_id: 'x' }, { leadName: 'Μαρία' }); assert.deepEqual([l.kind, l.label, l.chips], ['lead', 'Μαρία', ['lead']]);
  const c = V.visitSubject({ case_id: 'c', customer_id: 'u' }, { customerName: 'Νίκος', caseTitle: 'Case 1' }); assert.deepEqual(c.chips, ['case', 'customer']); assert.equal(c.label, 'Νίκος');
  assert.equal(V.visitSubject({}).kind, 'none');
});

test('«ready to visit» is derived from the time (and the distance when known), never stored', () => {
  const now = Date.parse('2026-11-10T10:00:00Z'); const at = (m) => new Date(now + m * 60_000).toISOString();
  assert.equal(V.isReadyToVisit({ status: 'planned', scheduled_at: at(10) }, now), true);
  assert.equal(V.isReadyToVisit({ status: 'planned', scheduled_at: at(-20) }, now), true);
  assert.equal(V.isReadyToVisit({ status: 'planned', scheduled_at: at(-45) }, now), false, 'too late');
  assert.equal(V.isReadyToVisit({ status: 'planned', scheduled_at: at(120) }, now), false, 'too early');
  assert.equal(V.isReadyToVisit({ status: 'planned', scheduled_at: at(10) }, now, 400), false, 'far away');
  assert.equal(V.isReadyToVisit({ status: 'planned', scheduled_at: at(10) }, now, 50), true);
  assert.equal(V.isReadyToVisit({ status: 'completed', scheduled_at: at(10) }, now), false);
  assert.equal(V.isReadyToVisit({ status: 'planned', scheduled_at: null }, now), false);
});

test('scheduling needs a subject and a date; a new prospect needs a name; the row never carries an owner', () => {
  const now = Date.parse('2026-11-10T10:00:00Z');
  assert.deepEqual(Object.keys(V.validateSchedule({ who: 'existing', scheduledAt: '2026-11-11T09:00' }, now)), ['who']);
  assert.deepEqual(Object.keys(V.validateSchedule({ who: 'prospect', prospect: { name: ' ' }, scheduledAt: '2026-11-11T09:00' }, now)), ['name']);
  assert.deepEqual(Object.keys(V.validateSchedule({ who: 'prospect', prospect: { name: 'A' }, scheduledAt: '' }, now)), ['scheduledAt']);
  assert.deepEqual(V.validateSchedule({ who: 'prospect', prospect: { name: 'A' }, scheduledAt: '2020-01-01T09:00' }, now), { scheduledAt: 'Η ημερομηνία είναι στο παρελθόν.' });
  assert.deepEqual(V.validateSchedule({ who: 'existing', leadId: 'l', scheduledAt: '2026-11-11T09:00' }, now), {});
  const row = V.visitInsertRow({ who: 'prospect', prospect: { name: ' Καφέ ', phone: ' 210 ', address: '' }, scheduledAt: '2026-11-11T09:00', purpose: ' Γνωριμία ' });
  assert.deepEqual(row.prospect, { name: 'Καφέ', phone: '210' }); assert.equal(row.purpose, 'Γνωριμία'); assert.equal(row.status, 'planned');
  for (const k of ['user_id', 'case_id', 'lead_id', 'customer_id', 'created_by']) assert.ok(!(k in row), `${k} is not sent for a prospect`);
  const ex = V.visitInsertRow({ who: 'existing', leadId: 'L1', customerId: null, scheduledAt: '2026-11-11T09:00' });
  assert.equal(ex.lead_id, 'L1'); assert.ok(!('customer_id' in ex)); assert.ok(!('prospect' in ex)); assert.ok(!('user_id' in ex), 'the database forces the owner');
  assert.equal(V.reasonError(''), 'Γράψτε τον λόγο.'); assert.equal(V.reasonError('ok λόγος'), null);
});

test('every recorded outcome leads to the correct next step, not just a label', () => {
  const o = (k) => V.outcomeByKey(k);
  assert.equal(V.nextStepFor(o('new_sale'), { hasCase: false }).kind, 'application', 'a visit with no Case continues in the Application');
  assert.equal(V.nextStepFor(o('new_sale'), { hasCase: true }).kind, 'handover', 'a visit with a Case keeps the existing handover');
  assert.deepEqual(V.nextStepFor(o('interested'), { hasCase: false }), { kind: 'followup', needs: ['reason', 'assignee', 'due'], text: 'Απαιτείται follow-up: λόγος, υπεύθυνος και ημερομηνία.' });
  assert.equal(V.nextStepFor(o('manager'), { hasCase: false }).kind, 'manager');
  for (const k of ['revisit', 'not_found']) assert.equal(V.nextStepFor(o(k), { hasCase: false }).kind, 'reschedule', k);
  for (const k of ['no_sale', 'not_interested']) assert.deepEqual([V.nextStepFor(o(k), { hasCase: false }).kind, V.nextStepFor(o(k), { hasCase: false }).needs], ['none', ['reason']], k);
  assert.equal(V.nextStepFor(null, { hasCase: false }).kind, 'none');
  for (const x of Field.OUTCOMES) assert.ok(V.nextStepFor(x, { hasCase: false }).kind, `every outcome (${x.key}) is covered`);
});

test('a follow-up needs a reason, a responsible agent and a date; without a Case it hangs on the lead / customer / visit', () => {
  assert.deepEqual(Object.keys(V.validateFollowUp({ reason: ' ', assigneeId: null, dueAt: '' })), ['reason', 'assignee', 'due']);
  assert.deepEqual(V.validateFollowUp({ reason: 'x', assigneeId: 'u', dueAt: '2026-11-12T10:00' }), {});
  const a = V.followUpRow({ id: 'v1', lead_id: 'L', customer_id: null, case_id: null }, { reason: ' Να καλέσω ', assigneeId: 'u', dueAt: '2026-11-12T10:00' });
  assert.deepEqual([a.lead_id, a.visit_id, a.case_id, a.reason, a.kind], ['L', 'v1', undefined, 'Να καλέσω', undefined]);
  const b = V.followUpRow({ id: 'v2', case_id: 'C', lead_id: 'L' }, { reason: 'x', assigneeId: 'u', dueAt: '2026-11-12T10:00' }, 'manager');
  assert.deepEqual([b.case_id, b.lead_id, b.kind, b.priority], ['C', undefined, 'manager', 'high']);
});

test('offline queue: only the visit id, the position and the outcome text; never a prospect name, phone, address or file', () => {
  const p = V.queuePayload({ visitId: 'v', lat: 1, lng: 2, accuracy: 5, notes: 'x'.repeat(900), prospect: { name: 'Μυστικό' }, phone: '210', file: 'a.pdf', address: 'Οδός' });
  assert.deepEqual(Object.keys(p).sort(), ['accuracy', 'lat', 'lng', 'notes', 'visitId']);
  assert.equal(p.notes.length, 500);
  for (const k of V.QUEUE_FORBIDDEN_KEYS) assert.ok(!(k in p), k);
  assert.deepEqual(V.queuePayload({ visitId: 'v' }), { visitId: 'v' });
});

test('the existing day grouping still understands every status it is given (no_show is simply closed)', () => {
  const g = Field.groupVisits([{ id: 'a', status: 'no_show', scheduled_at: '2026-11-10T08:00:00Z', started_at: null, ended_at: null, created_at: '2026-11-01T00:00:00Z' },
    { id: 'b', status: 'planned', scheduled_at: '2026-11-10T09:00:00Z', started_at: null, ended_at: null, created_at: '2026-11-01T00:00:00Z' }], Date.parse('2026-11-10T07:00:00Z'));
  assert.deepEqual(g.today.map((v) => v.id), ['b']); assert.deepEqual(g.overdue.concat(g.upcoming, g.doneToday).map((v) => v.id), []);
});

/* ───────── applications ───────── */
test('status text and rules: the nine statuses, Back Office only moves them, an agent edits only a draft or while documents are awaited', () => {
  assert.equal(App.APPLICATION_STATUSES.length, 9);
  for (const s of App.APPLICATION_STATUSES) assert.ok(App.APPLICATION_STATUS_TEXT[s] && App.STATUS_TONE[s], s);
  assert.deepEqual(App.nextStatuses('sales_agent', 'submitted'), []); assert.deepEqual(App.nextStatuses('admin', 'completed'), []); assert.deepEqual(App.nextStatuses('admin', 'draft'), ['withdrawn']);
  assert.ok(App.nextStatuses('admin', 'submitted').includes('in_review'));
  assert.equal(App.canEditContent('sales_agent', 'draft'), true); assert.equal(App.canEditContent('sales_agent', 'needs_documents'), true);
  assert.equal(App.canEditContent('sales_agent', 'submitted'), false); assert.equal(App.canEditContent('admin', 'submitted'), true); assert.equal(App.canEditContent('admin', 'completed'), false);
  assert.deepEqual(App.REASON_REQUIRED, ['needs_documents', 'rejected', 'withdrawn']);
});

test('the wizard keeps everything while moving between steps; a different customer clears the supply; a non-energy service clears provider fields', () => {
  let s = App.emptyWizard();
  s = App.wizardReducer(s, { t: 'origin', customer: { id: 'c1', name: 'Μαρία' } });
  s = App.wizardReducer(s, { t: 'supply', id: 'sp1', label: 'Σόλωνος 5', usage: 'residential' });
  s = App.wizardReducer(s, { t: 'service', code: 'energy' });
  s = App.wizardReducer(s, { t: 'field', field: 'provider', value: 'Άγνωστο' });
  for (const n of [2, 3, 4, 5, 3, 1, 5]) s = App.wizardReducer(s, { t: 'go', step: n });
  assert.deepEqual([s.customerName, s.supplyPointId, s.serviceType, s.provider], ['Μαρία', 'sp1', 'energy', 'Άγνωστο'], 'nothing lost');
  assert.equal(App.wizardReducer(s, { t: 'go', step: 99 }).step, 5); assert.equal(App.wizardReducer(s, { t: 'go', step: -3 }).step, 1);
  const same = App.wizardReducer(s, { t: 'origin', customer: { id: 'c1', name: 'Μαρία' } }); assert.equal(same.supplyPointId, 'sp1', 'the same customer keeps the supply');
  const other = App.wizardReducer(s, { t: 'origin', customer: { id: 'c2', name: 'Νίκος' } }); assert.equal(other.supplyPointId, null, 'another customer: the supply of the first is dropped');
  const solar = App.wizardReducer(s, { t: 'service', code: 'solar' }); assert.deepEqual([solar.provider, solar.program, solar.tariff], ['', '', '']);
  assert.equal(App.wizardReducer(s, { t: 'saved', id: 'app1' }).dirty, false);
});

test('validation: a draft needs only an origin; submit needs supply + service; documents NEVER block', () => {
  const e = App.emptyWizard();
  assert.equal(App.canSaveDraft(e), false);
  const o = App.wizardReducer(e, { t: 'origin', lead: { id: 'l1', name: 'Λέων' } });
  assert.equal(App.canSaveDraft(o), true);
  assert.deepEqual(Object.keys(App.stepErrors(1, e)), ['origin']); assert.deepEqual(Object.keys(App.stepErrors(2, o)), ['supply']); assert.deepEqual(Object.keys(App.stepErrors(3, o)), ['supply', 'service']);
  assert.deepEqual(App.stepErrors(4, App.wizardReducer(App.wizardReducer(App.wizardReducer(o, { t: 'supply', id: 's', label: 'x', usage: 'residential' }), { t: 'service', code: 'energy' }), { t: 'go', step: 4 })), {});
  let full = App.wizardReducer(App.wizardReducer(o, { t: 'supply', id: 's', label: 'x', usage: 'residential' }), { t: 'service', code: 'energy' });
  assert.equal(App.canSubmit(full), false, 'not before the draft has been saved'); full = App.wizardReducer(full, { t: 'saved', id: 'a' });
  assert.equal(App.canSubmit(full), true, 'with NO document at all');
  assert.deepEqual(App.submitBlockers(full), []);
});

test('the saved row: provider / program / tariff only for services that show them and only when filled; nothing is invented', () => {
  let s = App.wizardReducer(App.emptyWizard(), { t: 'service', code: 'energy' });
  s = App.wizardReducer(App.wizardReducer(s, { t: 'field', field: 'provider', value: '  ΔΕΗ ' }), { t: 'field', field: 'tariff', value: '' });
  const r = App.draftRow(s); assert.deepEqual([r.provider_name, r.program_name, r.tariff_name, r.service_type_code], ['ΔΕΗ', null, null, 'energy']);
  const w = App.draftRow(App.wizardReducer(App.wizardReducer(App.emptyWizard(), { t: 'service', code: 'web' }), { t: 'field', field: 'provider', value: 'x' }));
  assert.deepEqual([w.provider_name, w.program_name, w.tariff_name], [null, null, null], 'a service without those fields never stores them');
  assert.ok(!JSON.stringify(App.DEFAULT_SERVICES).match(/\d+\s?€|€\s?\d+|kWh/i), 'no price or tariff is hard-coded in the service list');
  const back = App.draftFromRow({ id: 'a', application_no: 'AP-1', status: 'draft', status_reason: null, customer_id: 'c', lead_id: null, supply_point_id: 's', service_type_code: 'energy', provider_name: 'X', program_name: null, tariff_name: null, notes: '', wizard_step: 4, assigned_to_user_id: null, primary_case_id: null, submitted_at: null, created_at: '', updated_at: '' }, { customerName: 'N' });
  assert.deepEqual([back.id, back.step, back.provider, back.customerName], ['a', 4, 'X', 'N'], 'a draft is resumed where it was left');
});

test('the checklist is the existing indicative one: it counts only current versions and only ever warns', () => {
  const docs = [{ doc_type: 'bill_electricity', status: 'received', is_current: false }, { doc_type: 'id_card', status: 'verified', is_current: true }];
  const items = App.checklistFor('energy', 'residential', docs);
  const bill = items.find((i) => i.anyOf.includes('bill_electricity')); assert.equal(bill.status, 'missing', 'a superseded version does not count');
  assert.equal(items.find((i) => i.anyOf.includes('id_card')).status, 'verified');
  const sum = App.checklistSummary(items); assert.ok(sum.total > sum.done && sum.missing.length > 0);
  assert.ok(App.checklistFor('energy', 'commercial', []).some((i) => i.anyOf.includes('tax_start')), 'a commercial supply asks for the business documents');
  assert.ok(!App.checklistFor('energy', 'residential', []).some((i) => i.anyOf.includes('tax_start')));
});

test('documents are grouped per supply point and type with the full history; the version label says current or superseded', () => {
  const d = (id, sp, t, v, cur) => ({ id, application_id: 'a', supply_point_id: sp, doc_type: t, version: v, is_current: cur, supersedes_id: null, superseded_at: cur ? null : 'x', storage_path: `applications/a/${id}`, file_name: id, mime_type: '', size: 1, status: 'received', created_at: '' });
  const g = App.groupDocuments([d('a1', 'S1', 'bill_electricity', 1, false), d('a2', 'S1', 'bill_electricity', 2, true), d('b1', 'S2', 'bill_electricity', 1, true), d('c1', 'S1', 'id_card', 1, true)]);
  assert.equal(g.length, 3, 'the bill of supply 1 and the bill of supply 2 are different entries');
  const s1 = g.find((x) => x.supplyPointId === 'S1' && x.docType === 'bill_electricity');
  assert.deepEqual([s1.current.id, s1.history.map((h) => h.id)], ['a2', ['a1']]);
  assert.equal(g.find((x) => x.supplyPointId === 'S2').current.id, 'b1');
  assert.equal(App.versionLabel({ version: 2, is_current: true }), 'v2 · τρέχουσα'); assert.equal(App.versionLabel({ version: 1, is_current: false }), 'v1 · αντικαταστάθηκε');
});

test('storage paths fit the database CHECK and the storage policy; a version never reuses a path; files are checked before upload', () => {
  const app = '11111111-2222-4333-8444-555555555555';
  const p1 = App.storagePathFor(app, 1, 'Λογαριασμός ρεύματος.pdf', 'n1'); const p2 = App.storagePathFor(app, 2, 'Λογαριασμός ρεύματος.pdf', 'n2');
  assert.match(p1, new RegExp(`^applications/${app}/[A-Za-z0-9-]+-v1-[A-Za-z0-9._-]+$`)); assert.notEqual(p1, p2);
  assert.ok(!/[ /\\]{2}|\.\./.test(p1.slice(`applications/${app}/`.length)), 'no path tricks');
  assert.ok(App.storagePathFor(app, 1, '../../etc/passwd', 'n').startsWith(`applications/${app}/n-v1-`));
  assert.equal(App.checkUpload({ name: 'a.pdf', type: 'application/pdf', size: 1000 }).ok, true);
  assert.equal(App.checkUpload({ name: 'a.exe', type: 'application/x-msdownload', size: 1000 }).ok, false);
  assert.equal(App.checkUpload({ name: 'big.pdf', type: 'application/pdf', size: 26 * 1024 * 1024 }).ok, false, 'the 25 MB limit');
  assert.equal(App.checkUpload({ name: 'IMG_1.HEIC', type: '', size: 2000 }).ok, true, 'phone photos with no MIME type');
});

test('the submit error texts are plain Greek and never leak the database wording', () => {
  assert.match(App.submitErrorText('Επιλέξτε την παροχή της αίτησης πριν την υποβολή.'), /^Επιλέξτε την παροχή/);
  assert.equal(App.submitErrorText('application: only a draft is submitted (it is submitted)'), 'Η αίτηση έχει ήδη υποβληθεί.');
  assert.doesNotMatch(App.submitErrorText('boom: relation x does not exist'), /relation|boom/);
});

/* ───────── the network layer ───────── */
test('NOT INSTALLED: nothing is written, nothing throws, the old loaders are told to carry on', async () => {
  reset(); installed(false);
  assert.equal(await Api.visitsExtendedAvailable(), false); assert.equal(await Api.applicationsAvailable(), false);
  assert.equal(await Api.fetchFieldVisits({ userId: 'u' }), null, 'null = use the existing loader');
  assert.equal(await Api.listApplications(), null);
  assert.deepEqual((await Api.createFieldVisit({ who: 'prospect', prospect: { name: 'x' }, scheduledAt: '2026-11-11T09:00' })), { ok: false, error: 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.' });
  assert.equal((await Api.saveApplicationDraft({ ...App.emptyWizard(), customerId: 'c' })).ok, false);
  assert.deepEqual(await Api.fetchServiceTypes(), App.DEFAULT_SERVICES);
  assert.equal(await Api.prospectMatches('x'), null);
  assert.deepEqual(await Api.fetchOwnershipRequests(), []);
  assert.equal(calls.filter((c) => c.ops?.some(([o]) => ['insert', 'update', 'delete', 'upsert'].includes(o)) || c.rpc || c.upload).length, 0, 'no write, no RPC, no upload was attempted');
  assert.equal(Api.fieldErrorText({ code: '42703', message: 'column x does not exist' }), 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.');
});

test('INSTALLED: a visit is inserted without any owner field; reschedule / cancel / no-show use the dedicated operations with the reason', async () => {
  reset(); installed(true);
  responder = (r) => (r.rpc ? { data: r.rpc === 'reschedule_field_visit' ? 'new-id' : true, error: null } : r.ops?.some(([o]) => o === 'single') ? { data: { id: 'v9' }, error: null } : { data: [], error: null });
  const r = await Api.createFieldVisit({ who: 'prospect', prospect: { name: 'Καφέ' }, scheduledAt: '2026-11-11T09:00' });
  assert.deepEqual(r, { ok: true, id: 'v9' });
  const ins = calls.find((c) => c.ops?.some(([o]) => o === 'insert')); const row = ins.ops.find(([o]) => o === 'insert')[1][0];
  assert.equal(ins.table, 'case_visits'); for (const k of ['user_id', 'created_by', 'case_id']) assert.ok(!(k in row), k);
  assert.deepEqual(await Api.rescheduleFieldVisit('v1', '2026-11-14T10:00', ' ζήτησε '), { ok: true, id: 'new-id' });
  assert.deepEqual(calls.find((c) => c.rpc === 'reschedule_field_visit').args, { p_visit: 'v1', p_new_at: new Date('2026-11-14T10:00').toISOString(), p_reason: 'ζήτησε' });
  assert.equal((await Api.cancelFieldVisit('v1', ' λόγος ')).ok, true); assert.equal(calls.find((c) => c.rpc === 'cancel_field_visit').args.p_reason, 'λόγος');
  assert.equal((await Api.markVisitNoShow('v1', 'δεν άνοιξε')).ok, true);
  responder = () => ({ data: null, error: { code: '42501', message: 'visit: the lead is not yours' } });
  assert.equal((await Api.cancelFieldVisit('v1', 'x')).error, 'Δεν έχετε δικαίωμα σε αυτή την εγγραφή.', 'the guard\'s English never reaches the screen');
});

test('INSTALLED: a draft is created with only an origin, then updated; submit goes through the dedicated operation and reports the Case', async () => {
  reset(); installed(true);
  responder = (r) => (r.rpc ? { data: { case_id: 'C1', application_no: 'AP-2026-00001' }, error: null } : r.ops?.some(([o]) => o === 'single') ? { data: { id: 'A1' }, error: null } : { data: [], error: null });
  const d = { ...App.emptyWizard(), customerId: 'c1', step: 2 };
  assert.deepEqual(await Api.saveApplicationDraft(d), { ok: true, id: 'A1' });
  const ins = calls.find((c) => c.ops?.some(([o]) => o === 'insert')).ops.find(([o]) => o === 'insert')[1][0];
  assert.equal(ins.customer_id, 'c1'); assert.equal(ins.lead_id, null); for (const k of ['status', 'created_by', 'application_no', 'primary_case_id']) assert.ok(!(k in ins), `${k} is the system's`);
  reset(); installed(true); responder = () => ({ data: [], error: null });
  assert.deepEqual(await Api.saveApplicationDraft({ ...d, id: 'A1' }), { ok: true, id: 'A1' });
  assert.ok(calls.some((c) => c.table === 'energy_applications' && c.ops.some(([o]) => o === 'update')) && !calls.some((c) => c.ops?.some(([o]) => o === 'insert')), 'a saved draft is updated, never duplicated');
  responder = () => ({ data: { case_id: 'C1', application_no: 'AP-2026-00001' }, error: null });
  assert.deepEqual(await Api.submitApplication('A1'), { ok: true, caseId: 'C1', applicationNo: 'AP-2026-00001' });
  assert.equal(calls.filter((c) => c.rpc === 'submit_energy_application').length, 1);
  responder = () => ({ data: null, error: { code: '23514', message: 'Επιλέξτε την παροχή της αίτησης πριν την υποβολή.' } });
  assert.deepEqual(await Api.submitApplication('A1'), { ok: false, error: 'Επιλέξτε την παροχή της αίτησης πριν την υποβολή.' });
});

test('documents: the file goes to the PRIVATE bucket under applications/<id>/, then the version is registered; reads use short signed links, never public ones', async () => {
  reset(); responder = () => ({ data: 'doc-1', error: null });
  const file = { name: 'Λογαριασμός.pdf', type: 'application/pdf', size: 1234 };
  const r = await Api.uploadApplicationDocument('11111111-2222-4333-8444-555555555555', file, 'bill_electricity', 2, 'SP1');
  assert.deepEqual(r, { ok: true, id: 'doc-1' });
  const up = calls.find((c) => c.upload).upload;
  assert.equal(up.bucket, 'client_documents'); assert.match(up.p, /^applications\/11111111-2222-4333-8444-555555555555\/.+-v2-/); assert.equal(up.o.upsert, false, 'never overwrites');
  const rpc = calls.find((c) => c.rpc === 'add_application_document').args;
  assert.deepEqual([rpc.p_doc_type, rpc.p_supply, rpc.p_storage_path === up.p, rpc.p_size], ['bill_electricity', 'SP1', true, 1234]);
  assert.equal(await Api.applicationDocumentUrl(up.p), 'https://signed.example.invalid/x');
  assert.equal(calls.find((c) => c.signed).signed.s, 600, 'a ten-minute link');
  reset(); responder = (r2) => (r2.upload ? { error: { message: 'x' } } : { data: 'x', error: null });
  assert.equal((await Api.uploadApplicationDocument('11111111-2222-4333-8444-555555555555', file, 'bill_electricity', 1)).ok, false);
  assert.ok(!calls.some((c) => c.rpc), 'a failed upload registers nothing');
});

test('the application code never reaches for a secret, a service key, a public URL or local storage of documents', () => {
  for (const f of ['lib/field-api.ts', 'lib/applications.ts', 'lib/field-visits.ts']) {
    const src = readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/service_role|SERVICE_ROLE|getPublicUrl|localStorage|sessionStorage|indexedDB/.test(src), f);
  }
});
