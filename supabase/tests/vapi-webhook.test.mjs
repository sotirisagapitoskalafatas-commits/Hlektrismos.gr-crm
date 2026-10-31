// Handler-level tests of vapi-webhook against fixtures that follow the documented event format (docs.vapi.ai/server-url/events). The fixtures are synthetic.
// They are NOT proof of what Vapi really sends: artifact.recording's exact shape and durationSeconds are confirmed only by the staging delivery in
// docs/ops/VAPI_STAGING_TEST.md, and this function stays a production deployment blocker until that has passed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadFunction, createDb } from './helpers/edge-harness.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/vapi/${name}.json`, import.meta.url), 'utf8'));
const SECRET = 'vapi-webhook-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa';
const h = { 'x-vapi-secret': SECRET };
const LEAD = 'bbbbbbbb-0000-4000-8000-0000000000a1';
const CALL = 'eeeeeeee-0000-4000-8000-0000000000a1';
const db = (lead = {}, call = {}) => createDb({
  voice_calls: [{ id: CALL, vapi_call_id: 'call-synthetic-0001', lead_id: LEAD, status: 'ringing', ...call }],
  hlektrismos_leads: [{ id: LEAD, phone: '6900000001', pipeline_status: 'new', ...lead }], lead_notes: [],
});
const load = (database = db(), env = {}) => loadFunction('vapi-webhook', { db: database, env: { VAPI_WEBHOOK_SECRET: SECRET, ...env } });
const report = (over = {}) => { const f = fixture('end-of-call-report'); Object.assign(f.message, over); return f; };

test('authentication: a missing, wrong, or almost-right header is refused and changes nothing; the secret never appears in a reply', async () => {
  const f = await load();
  for (const headers of [{}, { 'x-vapi-secret': '' }, { 'x-vapi-secret': 'wrong' }, { 'x-vapi-secret': `${SECRET}x` }, { 'x-vapi-secret': SECRET.slice(0, -1) }, { authorization: `Bearer ${SECRET}` }]) {
    const r = await f.call({ body: fixture('end-of-call-report'), headers });
    assert.equal(r.status, 401, JSON.stringify(Object.keys(headers)));
    assert.ok(!JSON.stringify(r.json).includes(SECRET));
  }
  assert.equal(f.db.rows('voice_calls')[0].status, 'ringing');
  assert.equal(f.db.rows('lead_notes').length, 0);
  f.restore();
  const none = await load(db(), { VAPI_WEBHOOK_SECRET: undefined });
  assert.equal((await none.call({ body: fixture('end-of-call-report'), headers: h })).status, 401, 'no configured secret refuses everything');
  none.restore();
});

test('the report maps duration (rounded: the column is an integer), transcript and recording onto the call', async () => {
  const f = await load();
  const r = await f.call({ body: fixture('end-of-call-report'), headers: h });
  assert.equal(r.status, 200);
  const call = f.db.rows('voice_calls')[0];
  assert.equal(call.status, 'completed');
  assert.equal(call.duration_seconds, 92);
  assert.equal(call.recording_url, 'https://storage.example.test/call-synthetic-0001-stereo.wav');
  assert.match(call.transcript, /έχω ενδιαφέρον/);
  assert.equal(call.outcome, 'interested');
  assert.equal(f.db.rows('hlektrismos_leads')[0].pipeline_status, 'qualified');
  assert.equal(f.db.rows('lead_notes').length, 1);
  f.restore();
});

test('duration falls back to the timestamps, and an unreadable duration stays unknown instead of being invented', async () => {
  const f = await load();
  await f.call({ body: report({ durationSeconds: undefined }), headers: h });
  assert.equal(f.db.rows('voice_calls')[0].duration_seconds, 92);
  f.restore();
  const g = await load();
  const body = report({ durationSeconds: 'lots', startedAt: undefined, endedAt: undefined });
  body.message.call = { id: 'call-synthetic-0001' };
  await g.call({ body, headers: h });
  assert.equal(g.db.rows('voice_calls')[0].duration_seconds, null);
  g.restore();
});

test('a duplicate delivery is harmless, in sequence and at the same moment', async () => {
  const f = await load();
  await f.call({ body: fixture('end-of-call-report'), headers: h });
  const replay = await f.call({ body: fixture('end-of-call-report'), headers: h });
  assert.equal(replay.json.note, 'already completed');
  assert.equal(f.db.rows('lead_notes').length, 1);
  f.restore();
  const g = await load();
  await Promise.all([g.call({ body: fixture('end-of-call-report'), headers: h }), g.call({ body: fixture('end-of-call-report'), headers: h })]);
  assert.equal(g.db.rows('lead_notes').length, 1);
  g.restore();
});

test('a replayed opt-out on a completed call stops at once: no second objection attempt, no note', async () => {
  const database = db({}, { status: 'completed' });
  database.rpc = { record_spoken_objection: async () => ({ data: true, error: null }) };
  const f = await load(database);
  assert.equal((await f.call({ body: fixture('spoken-opt-out'), headers: h })).json.note, 'already completed');
  assert.equal(f.db.log.rpc.length, 0);
  assert.equal(f.db.rows('lead_notes').length, 0);
  f.restore();
});

test('a late or different report cannot overwrite a completed call', async () => {
  const f = await load();
  await f.call({ body: fixture('end-of-call-report'), headers: h });
  const late = fixture('spoken-opt-out');
  await f.call({ body: late, headers: h });
  const call = f.db.rows('voice_calls')[0];
  assert.equal(call.outcome, 'interested');
  assert.equal(call.duration_seconds, 92);
  assert.equal(f.db.rows('hlektrismos_leads')[0].pipeline_status, 'qualified');
  f.restore();
});

test('informational messages are acknowledged and touch nothing, not even a read', async () => {
  const f = await load();
  assert.equal((await f.call({ body: fixture('status-update'), headers: h })).status, 200);
  assert.equal(f.db.rows('voice_calls')[0].status, 'ringing');
  f.restore();
});

test('invalid payloads cannot modify CRM records', async () => {
  const bad = [
    ['not JSON', { raw: '{nope' }], ['an array', { body: [] }],
    ['no call id', { body: { message: { type: 'end-of-call-report', artifact: { transcript: 'x' } } } }],
    ['call id is not a string', { body: { message: { type: 'end-of-call-report', call: { id: { $ne: 1 } } } } }],
    ['transcript is not a string', { body: report({ artifact: { transcript: { bad: true } } }) }],
  ];
  for (const [name, req] of bad) {
    const f = await load();
    const r = await f.call({ ...req, headers: h });
    assert.equal(r.status, 400, name);
    assert.equal(r.json.error, 'Invalid payload', name);
    assert.equal(f.db.rows('voice_calls')[0].status, 'ringing', name);
    assert.equal(f.db.rows('lead_notes').length, 0, name);
    f.restore();
  }
});

test('an unusable recording URL is dropped, never stored; a huge transcript is cut; a negative or absurd duration is ignored', async () => {
  const stored = async (over) => { const f = await load(); await f.call({ body: report(over), headers: h }); const c = f.db.rows('voice_calls')[0]; f.restore(); return c; };
  for (const url of ['javascript:alert(1)', 'http://plain.example.test/a.wav', 'https://user:pw@example.test/a.wav', 'not a url']) {
    assert.equal((await stored({ artifact: { recording: { stereoUrl: url } } })).recording_url, '', url);
  }
  assert.equal((await stored({ artifact: { recordingUrl: 'https://storage.example.test/deprecated.wav' } })).recording_url, 'https://storage.example.test/deprecated.wav');
  assert.equal((await stored({ artifact: { transcript: 'x'.repeat(200_000) } })).transcript.length, 100_000);
  assert.equal((await stored({ durationSeconds: -5 })).duration_seconds, 92, 'falls back to the timestamps');
  assert.equal((await stored({ durationSeconds: 999_999 })).duration_seconds, 92);
});

test('a database failure answers 500 so the report is not silently lost: a thrown error, and a read that returns an error', async () => {
  const database = db();
  Object.defineProperty(database.tables, 'voice_calls', { get() { throw new Error('down'); } });
  const f = await load(database);
  assert.equal((await f.call({ body: fixture('end-of-call-report'), headers: h })).status, 500);
  f.restore();
  const returned = db();
  returned.failSelect = ['voice_calls'];
  const g = await load(returned);
  assert.equal((await g.call({ body: fixture('end-of-call-report'), headers: h })).status, 500);
  g.restore();
});

test('an unknown call id changes nothing', async () => {
  const f = await load();
  const body = fixture('end-of-call-report');
  body.message.call.id = 'someone-elses-call';
  assert.equal((await f.call({ body, headers: h })).json.note, 'no matching voice_call');
  assert.equal(f.db.rows('voice_calls')[0].status, 'ringing');
  f.restore();
});

test('spoken opt-out: recorded through the service-role function, and the note says so', async () => {
  const database = db();
  database.rpc = { record_spoken_objection: async () => ({ data: true, error: null }) };
  const f = await load(database);
  await f.call({ body: fixture('spoken-opt-out'), headers: h });
  const call = f.db.log.rpc.find((c) => c.name === 'record_spoken_objection');
  assert.deepEqual(call.args, { p_phone: '6900000001', p_lead_id: LEAD, p_voice_call_id: CALL });
  assert.match(f.db.rows('lead_notes')[0].content, /Η άρνηση καταχωρήθηκε/);
  assert.equal(f.db.rows('hlektrismos_leads')[0].ai_paused, undefined, 'the objection itself stops outreach');
  f.restore();
});

test('spoken opt-out when the table is missing: it is NOT claimed as recorded, the lead is paused and a person is told', async () => {
  const database = db();
  database.rpc = { record_spoken_objection: async () => ({ data: null, error: { code: '42883', message: 'function does not exist' } }) };
  const f = await load(database);
  assert.equal((await f.call({ body: fixture('spoken-opt-out'), headers: h })).status, 200);
  const note = f.db.rows('lead_notes')[0].content;
  assert.match(note, /ΔΕΝ καταχωρήθηκε/);
  assert.ok(!note.includes('Η άρνηση καταχωρήθηκε'));
  assert.equal(f.db.rows('hlektrismos_leads')[0].ai_paused, true);
  f.restore();
});

test('only the customer\'s words count: the assistant saying "ξαναπάρουμε" is not an opt-out', async () => {
  const database = db();
  const f = await load(database);
  await f.call({ body: fixture('end-of-call-report'), headers: h });
  assert.equal(f.db.log.rpc.filter((c) => c.name === 'record_spoken_objection').length, 0);
  f.restore();
  for (const [said, optOut] of [['Μη με ξαναπάρετε', true], ['μην με ξανακαλέσετε παρακαλώ', true], ['δεν θέλω άλλες κλήσεις', true], ['βγάλτε με από τη λίστα', true], ['Πάρτε με αύριο', false], ['έχω ενδιαφέρον', false]]) {
    const body = report({ artifact: { transcript: `AI: Γεια. User: ${said}`, messages: [{ role: 'user', message: said }] } });
    const g = await load();
    await g.call({ body, headers: h });
    assert.equal(g.db.log.rpc.filter((c) => c.name === 'record_spoken_objection').length, optOut ? 1 : 0, said);
    g.restore();
  }
  const noTurns = report({ artifact: { transcript: 'AI: Μη με ξαναπάρετε είπε κάποιος. User: Καλησπέρα' } });
  const t = await load();
  await t.call({ body: noTurns, headers: h });
  assert.equal(t.db.log.rpc.filter((c) => c.name === 'record_spoken_objection').length, 0, 'without message turns the transcript labels decide');
  t.restore();
});

test('a soft-deleted lead is not updated and gets no note or objection, but the call still closes', async () => {
  const f = await load(db({ deleted_at: '2026-10-29T00:00:00Z' }));
  await f.call({ body: fixture('spoken-opt-out'), headers: h });
  assert.equal(f.db.rows('voice_calls')[0].status, 'completed');
  assert.equal(f.db.rows('hlektrismos_leads')[0].pipeline_status, 'new');
  assert.equal(f.db.rows('lead_notes').length, 0);
  assert.equal(f.db.log.rpc.length, 0);
  f.restore();
});
