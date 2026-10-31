// Handler-level tests (real Edge Function code, fake database and provider; LOCAL only) of the configurable outbound limits and the communication log:
// fail closed without configuration, per-caller / per-organisation / per-person limits, SMS and voice sharing one counter, duplicates, provider failures.
// Consent is granted and outreach is switched on here only so the gate lets a message through to the limits under test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { loadFunction, createDb, TEST_OUTREACH_LIMITS } from './helpers/edge-harness.mjs';

const fnDir = fileURLToPath(new URL('../functions/', import.meta.url));
const bundle = (entry) => {
  const out = buildSync({ stdin: { contents: entry, resolveDir: fnDir + '_shared', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const K = await bundle(`export { phoneKey, emailKey, contactHash } from './contact-keys.ts'; export { parseOutreachLimits } from './outreach-limits.ts';`);

const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const LEAD = 'bbbbbbbb-0000-4000-8000-0000000000a1';
const LEAD2 = 'bbbbbbbb-0000-4000-8000-0000000000a2'; // the same person as LEAD: same phone written differently
const LEAD3 = 'bbbbbbbb-0000-4000-8000-0000000000a3';
const CAMPAIGN = 'dddddddd-0000-4000-8000-0000000000a1';
const users = { 'tok-admin': ADMIN };
const VAPI = 'vapi-webhook-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa';
const GATE_ENV = { OUTREACH_ENABLED: 'on', LEGAL_APPROVAL_RECORDED: 'yes', AUTO_VOICE_CALLS: 'on', VAPI_WEBHOOK_SECRET: VAPI };

const NOON_ATHENS = Date.parse('2026-10-30T10:00:00Z');
const withClock = async (fn) => {
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [NOON_ATHENS])); }
    static now() { return NOON_ATHENS; }
  };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
};

const limits = (over = {}) => {
  const base = JSON.parse(TEST_OUTREACH_LIMITS);
  for (const [k, v] of Object.entries(over.actions ?? {})) base.actions[k] = { ...base.actions[k], ...v };
  for (const [k, v] of Object.entries(over.contact ?? {})) base.contact[k] = { ...base.contact[k], ...v };
  return JSON.stringify(base);
};

function db() {
  const phones = ['+30 690 000 0001', '6900000001', '6900000003'];
  const leads = [LEAD, LEAD2, LEAD3].map((id, i) => ({ id, assigned_to: ADMIN, first_name: 'L', email: `lead${i}@example.gr`, phone: phones[i] }));
  const channels = ['sms', 'viber', 'whatsapp', 'voice'];
  const consent = (channel, kind, key) => ({ address_kind: kind, address_key: key, status: 'granted', channel, basis: 'consent', evidence_ref: 'form-1', evidence_at: '2026-01-01T00:00:00Z' });
  const phoneKeys = [...new Set(phones.map((p) => K.phoneKey(p)))];
  return createDb({
    profiles: [{ id: ADMIN, role: 'admin', is_active: true }],
    hlektrismos_leads: leads,
    contact_consents: [...phoneKeys.flatMap((k) => channels.map((c) => consent(c, 'phone', k))), ...leads.map((l) => consent('email', 'email', K.emailKey(l.email)))],
    contact_objections: [], email_suppressions: [], outreach_decisions: [], campaign_sends: [], lead_notes: [], voice_calls: [],
    article11_screenings: phoneKeys.map((k) => ({ phone_key: k, result: 'not_listed', screened_at: '2026-10-25T09:00:00Z' })),
    crm_settings: [
      { setting_key: 'INFOBIP_API_KEY', setting_value: 'infobip-key-not-real' }, { setting_key: 'RESEND_API_KEY', setting_value: 'resend-key-not-real' },
      { setting_key: 'VAPI_API_KEY', setting_value: 'vapi-key-not-real' }, { setting_key: 'VAPI_PHONE_NUMBER_ID', setting_value: 'pn-1' },
    ],
  });
}
const ok = async () => new Response(JSON.stringify({ id: 'provider-1', bulkId: 'provider-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
const load = (name, database, env = {}, fetchHandler = ok) => loadFunction(name, { db: database, users, env: { ...GATE_ENV, UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000', ...env }, fetchHandler });
const sms = (leads, extra = {}) => ({ token: 'tok-admin', body: { leads: leads.map((id) => ({ id })), message: 'γεια', ...extra } });
const providerCalls = (f) => f.outbound.filter((o) => /infobip|resend|vapi/i.test(o.url)).length;
const log = (f, result) => f.db.rows('communication_log').filter((r) => !result || r.result === result);

test('configuration: anything other than a complete, valid value counts as not configured', () => {
  assert.ok(K.parseOutreachLimits(TEST_OUTREACH_LIMITS));
  for (const bad of [undefined, null, '', 'not json', '{}', '[]', 'null']) assert.equal(K.parseOutreachLimits(bad), null, String(bad));
  const complete = JSON.parse(TEST_OUTREACH_LIMITS);
  const without = (fn) => { const c = structuredClone(complete); fn(c); return JSON.stringify(c); };
  assert.equal(K.parseOutreachLimits(without((c) => delete c.actions.voice)), null, 'a missing channel');
  assert.equal(K.parseOutreachLimits(without((c) => delete c.contact.phone)), null, 'missing person limits');
  assert.equal(K.parseOutreachLimits(without((c) => { c.actions.sms.messagesPerDay = 0; })), null, 'zero is not a limit');
  assert.equal(K.parseOutreachLimits(without((c) => { c.actions.sms.messagesPerDay = 1.5; })), null, 'a fraction');
  assert.equal(K.parseOutreachLimits(without((c) => { c.actions.sms.messagesPerDay = '10'; })), null, 'a string');
  assert.equal(K.parseOutreachLimits(without((c) => { delete c.actions.email_direct.orgMessagesPerDay; })), null, 'a missing field');
});

test('without OUTREACH_LIMITS every sender answers 503, sends nothing and touches no counter', async () => {
  for (const [fn, body] of [
    ['send-sms', { leads: [{ id: LEAD }], message: 'x' }], ['send-campaign-email', { leads: [{ id: LEAD }], subject: 's', html_body: '<p>x</p>' }],
    ['make-voice-call', { lead_id: LEAD }], ['send-offer', { lead_id: LEAD, tariff_id: 'cccccccc-0000-4000-8000-0000000000a1' }], ['send-email', { to: 'a@example.gr', subject: 's', text: 't' }],
  ]) {
    const f = await load(fn, db(), { OUTREACH_LIMITS: undefined });
    assert.equal((await f.call({ token: 'tok-admin', body })).status, 503, fn);
    assert.equal(providerCalls(f) + f.smtp.length, 0, fn);
    assert.equal(f.db.log.rpc.length, 0, fn);
    f.restore();
  }
});

test('per channel: the configured recipients-per-request limit applies and can only lower the hard ceiling', async () => {
  const f = await load('send-sms', db(), { OUTREACH_LIMITS: limits({ actions: { sms: { maxRecipients: 2 } } }) });
  assert.equal((await f.call(sms([LEAD, LEAD2, LEAD3], { campaign_id: CAMPAIGN }))).status, 413);
  assert.equal(providerCalls(f), 0);
  f.restore();
  const v = await load('send-sms', db(), { OUTREACH_LIMITS: limits({ actions: { viber: { maxRecipients: 1 } } }) });
  assert.equal((await v.call(sms([LEAD, LEAD3], { campaign_id: CAMPAIGN, channel: 'viber' }))).status, 413, 'each channel has its own figure');
  v.restore();
});

test('requests per hour are counted per caller and per channel', async () => {
  await withClock(async () => {
    const f = await load('send-sms', db(), { OUTREACH_LIMITS: limits({ actions: { sms: { requestsPerHour: 1 } } }) });
    assert.equal((await f.call(sms([LEAD]))).status, 200);
    assert.equal((await f.call(sms([LEAD3]))).status, 429);
    assert.equal((await f.call(sms([LEAD3], { channel: 'viber' }))).status, 200, 'another channel has its own count');
    f.restore();
  });
});

test('messages per hour, per day and per organisation each stop the batch with the rest unsent', async () => {
  for (const cap of ['messagesPerHour', 'messagesPerDay', 'orgMessagesPerDay']) {
    await withClock(async () => {
      const f = await load('send-sms', db(), { OUTREACH_LIMITS: limits({ actions: { sms: { [cap]: 1 } } }) });
      const r = await f.call(sms([LEAD, LEAD3], { campaign_id: CAMPAIGN }));
      assert.equal(r.status, 200, cap);
      assert.equal(r.json.sent, 1, cap);
      assert.equal(providerCalls(f), 1, cap);
      assert.equal(f.db.rows('campaign_sends').filter((x) => x.status === 'queued').length, 0, `${cap}: the refused recipient keeps no claim`);
      f.restore();
    });
  }
});

test('combined: a voice call and an SMS to one person use one counter, even from different lead records', async () => {
  await withClock(async () => {
    const database = db();
    const env = { OUTREACH_LIMITS: limits({ contact: { phone: { perHour: 1, perDay: 5 } } }) };
    const v = await load('make-voice-call', database, env);
    assert.equal((await v.call({ token: 'tok-admin', body: { lead_id: LEAD } })).status, 200);
    v.restore();
    const s = await load('send-sms', database, env);
    const r = await s.call(sms([LEAD2]));
    assert.equal(r.json.sent, 0, 'the same number under another lead record');
    assert.equal(r.json.skipped, 1);
    assert.equal(s.outbound.length, 0);
    const other = await s.call(sms([LEAD3]));
    assert.equal(other.json.sent, 1, 'someone else is unaffected');
    s.restore();
  });
});

test('combined, the other way round, and across phone channels; the daily count also applies', async () => {
  await withClock(async () => {
    const database = db();
    const env = { OUTREACH_LIMITS: limits({ contact: { phone: { perHour: 100, perDay: 1 } } }) };
    const s = await load('send-sms', database, env);
    assert.equal((await s.call(sms([LEAD]))).json.sent, 1);
    assert.equal((await s.call(sms([LEAD], { channel: 'viber' }))).json.sent, 0, 'another phone channel shares the count');
    s.restore();
    const v = await load('make-voice-call', database, env);
    const r = await v.call({ token: 'tok-admin', body: { lead_id: LEAD } });
    assert.equal(r.status, 429);
    assert.equal(providerCalls(v), 0, 'no second contact in the day, on any channel');
    v.restore();
  });
});

test('a refusal for one person uses none of the caller\'s quota: the counters move together or not at all', async () => {
  await withClock(async () => {
    const f = await load('send-sms', db(), { OUTREACH_LIMITS: limits({ actions: { sms: { messagesPerHour: 2 } }, contact: { phone: { perHour: 1 } } }) });
    assert.equal((await f.call(sms([LEAD]))).json.sent, 1);
    const twice = await f.call(sms([LEAD2], { message: 'άλλο' }));
    assert.equal(twice.json.sent, 0);
    assert.equal(twice.json.skipped, 1);
    assert.equal((await f.call(sms([LEAD3]))).json.sent, 1, 'the second message of the caller\'s two is still available');
    f.restore();
  });
});

test('duplicate request without a campaign: the same text to the same person inside the window is sent once, a different text is not blocked', async () => {
  await withClock(async () => {
    const f = await load('send-sms', db());
    const [a, b] = await Promise.all([f.call(sms([LEAD])), f.call(sms([LEAD]))]);
    assert.equal(a.json.sent + b.json.sent, 1);
    assert.equal(providerCalls(f), 1);
    assert.equal((await f.call(sms([LEAD], { message: 'άλλο κείμενο' }))).json.sent, 1);
    f.restore();
    const m = await load('send-campaign-email', db());
    const body = { token: 'tok-admin', body: { leads: [{ id: LEAD }], subject: 's', html_body: '<p>x</p>' } };
    await m.call(body); await m.call(body);
    assert.equal(providerCalls(m), 1);
    m.restore();
  });
});

test('a duplicate lock that cannot be checked sends nothing: database error, thrown error, or an answer that is not true', async () => {
  await withClock(async () => {
    for (const [name, rpc] of [
      ['database error', async () => ({ data: null, error: { message: 'down' } })], ['client throws', async () => { throw new Error('network'); }],
      ['null answer', async () => ({ data: null, error: null })], ['a truthy answer that is not true', async () => ({ data: 'yes', error: null })],
    ]) {
      for (const [fn, body] of [['send-sms', { leads: [{ id: LEAD }], message: 'x' }], ['send-campaign-email', { leads: [{ id: LEAD }], subject: 's', html_body: '<p>x</p>' }], ['make-voice-call', { lead_id: LEAD }]]) {
        const database = db(); database.rpc = { consume_rate_limit: rpc };
        const f = await load(fn, database);
        await f.call({ token: 'tok-admin', body });
        assert.equal(providerCalls(f), 0, `${fn}: ${name}`);
        f.restore();
      }
    }
  });
});

test('duplicate request with a campaign: concurrent batches send each person once', async () => {
  await withClock(async () => {
    const f = await load('send-sms', db());
    const [a, b] = await Promise.all([f.call(sms([LEAD, LEAD3], { campaign_id: CAMPAIGN })), f.call(sms([LEAD, LEAD3], { campaign_id: CAMPAIGN }))]);
    assert.equal(a.json.sent + b.json.sent, 2);
    assert.equal(providerCalls(f), 2);
    f.restore();
  });
});

test('provider failure: the claim is released so a retry can send, the attempt stays counted, and the log shows the failure', async () => {
  await withClock(async () => {
    let fail = true;
    const f = await load('send-sms', db(), { OUTREACH_LIMITS: limits({ actions: { sms: { messagesPerDay: 2 } } }) }, async () => (fail ? new Response('{"to":"secret-detail"}', { status: 500 }) : ok()));
    const first = await f.call(sms([LEAD], { campaign_id: CAMPAIGN }));
    assert.equal(first.json.failed, 1);
    assert.equal(f.db.rows('campaign_sends').length, 0);
    assert.equal(log(f, 'failed').length, 1);
    assert.equal(log(f, 'failed')[0].provider_status, 500);
    fail = false;
    assert.equal((await f.call(sms([LEAD], { campaign_id: CAMPAIGN }))).json.sent, 1, 'the retry goes out');
    assert.equal((await f.call(sms([LEAD3], { campaign_id: CAMPAIGN }))).json.sent, 0, 'the failed attempt used one of the two');
    f.restore();
  });
});

test('network failure: the outcome is unknown, so the claim stays and a retry cannot send a duplicate', async () => {
  await withClock(async () => {
    let fail = true;
    const f = await load('send-sms', db(), {}, async () => { if (fail) throw new Error('timeout'); return ok(); });
    assert.equal((await f.call(sms([LEAD], { campaign_id: CAMPAIGN }))).json.failed, 1);
    fail = false;
    const retry = await f.call(sms([LEAD], { campaign_id: CAMPAIGN }));
    assert.equal(retry.json.sent, 0);
    assert.equal(retry.json.skipped, 1);
    f.restore();
  });
});

test('communication log: every send is attributed to the caller, the record and a hash of the address; it holds no message text or address', async () => {
  await withClock(async () => {
    const f = await load('send-sms', db());
    await f.call(sms([LEAD], { message: 'προσωπικό μήνυμα' }));
    const rows = log(f);
    assert.deepEqual(rows.map((r) => r.result), ['attempt', 'sent']);
    for (const r of rows) {
      assert.equal(r.action, 'sms'); assert.equal(r.actor_id, ADMIN); assert.equal(r.actor_kind, 'user'); assert.equal(r.lead_id, LEAD);
      assert.equal(r.recipient_hash, await K.contactHash(K.phoneKey('6900000001')));
    }
    assert.equal(rows[1].provider_ref, 'provider-1');
    assert.equal(rows[1].provider_status, 200);
    const text = JSON.stringify(rows);
    for (const leak of ['προσωπικό', '6900000001', 'lead0@example.gr', 'infobip-key']) assert.ok(!text.includes(leak), leak);
    f.restore();
  });
});

test('an attempt that cannot be recorded is not sent, on every sender', async () => {
  await withClock(async () => {
    for (const [fn, body] of [
      ['send-sms', { leads: [{ id: LEAD }], message: 'x' }], ['send-campaign-email', { leads: [{ id: LEAD }], subject: 's', html_body: '<p>x</p>' }],
      ['make-voice-call', { lead_id: LEAD }], ['send-email', { to: 'a@example.gr', subject: 's', text: 't' }],
    ]) {
      const database = db();
      database.rows('crm_settings').push({ setting_key: 'email_config', setting_value: { smtp_host: 'smtp.example.test', smtp_port: 465, from_email: 'info@hlektrismos.gr' } });
      const f = await load(fn, database);
      const realFrom = f.db.tables;
      Object.defineProperty(realFrom, 'communication_log', { get() { throw new Error('table missing'); } });
      await f.call({ token: 'tok-admin', body }).catch(() => null);
      assert.equal(providerCalls(f) + f.smtp.filter((x) => x.data).length, 0, fn);
      f.restore();
    }
  });
});

test('frequency cap: a call and a message both count, because the gate reads the communication log', async () => {
  await withClock(async () => {
    const database = db();
    const recent = new Date(NOON_ATHENS - 3600_000).toISOString();
    database.rows('communication_log').push({ action: 'voice', result: 'sent', lead_id: LEAD, created_at: recent }, { action: 'sms', result: 'sent', lead_id: LEAD, created_at: recent });
    const f = await load('send-sms', database);
    const r = await f.call(sms([LEAD]));
    assert.equal(r.json.sent, 0);
    assert.match(r.json.errors[0], /FREQUENCY_CAP/);
    f.restore();
  });
});
