// Handler-level tests (real Edge Function code through helpers/edge-harness.mjs; LOCAL, no network, no Supabase project) for:
//   * expiring signed links, input limits and the best-effort throttle (_shared/signed-link.ts, _shared/limits.ts)
//   * vapi-webhook: secret required, documented payload shape, replay-safe end-of-call handling
//   * outbound functions: batch cap, input validation, throttle, duplicate-send protection
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { loadFunction, createDb } from './helpers/edge-harness.mjs';

const SECRET = 'link-signing-secret-not-real-000000000';
const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const LEAD = 'bbbbbbbb-0000-4000-8000-0000000000a1';
const CAMPAIGN = 'dddddddd-0000-4000-8000-0000000000a1';
const TARIFF = 'cccccccc-0000-4000-8000-0000000000a1';
const INSIDE = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const FIELD = 'aaaaaaaa-0000-4000-8000-0000000000c2';
const MANAGER = 'aaaaaaaa-0000-4000-8000-0000000000e1'; // legacy
const BACKOFFICE = 'aaaaaaaa-0000-4000-8000-0000000000e2'; // legacy
const INACTIVE = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const users = { 'tok-admin': ADMIN, 'tok-inside': INSIDE, 'tok-field': FIELD, 'tok-manager': MANAGER, 'tok-bo': BACKOFFICE, 'tok-inactive': INACTIVE };
const fnDir = fileURLToPath(new URL('../functions/', import.meta.url));
const src = (rel) => readFileSync(fnDir + rel, 'utf8').replace(/\r\n/g, '\n');

const bundle = (entry) => {
  const out = buildSync({ stdin: { contents: entry, resolveDir: fnDir + '_shared', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const L = await bundle(`export * from './signed-link.ts'; export * from './limits.ts'; export * from './webhook-auth.ts';`);
// Runs fn with ONLY the link secret in Deno.env, then restores whatever Deno was there (the harness installs the function's own).
const withSecret = async (fn) => {
  const prev = globalThis.Deno;
  globalThis.Deno = { env: { get: (k) => (k === 'LINK_SIGNING_SECRET' ? SECRET : undefined) } };
  try { return await fn(); } finally { globalThis.Deno = prev; }
};
const sign = (...a) => withSecret(() => L.signExpiringLink(...a));
const signRaw = (...a) => withSecret(() => L.signLink(...a));

// ───────────────────────────── shared helpers ─────────────────────────────
test('expiring link: valid until the expiry, then "expired"; any edit to the expiry, parts or purpose is "invalid"', async () => {
  await withSecret(async () => {
    const t = await L.signExpiringLink('accept-offer', 3600, LEAD, TARIFF);
    assert.equal(await L.verifyExpiringLink(t, 'accept-offer', LEAD, TARIFF), 'ok');
    assert.equal(await L.verifyExpiringLink(t, 'accept-offer', LEAD, 'other-tariff'), 'invalid');
    assert.equal(await L.verifyExpiringLink(t, 'other-purpose', LEAD, TARIFF), 'invalid');
    const [exp, sig] = t.split('.');
    assert.equal(await L.verifyExpiringLink(`${Number(exp) + 86400}.${sig}`, 'accept-offer', LEAD, TARIFF), 'invalid', 'a longer expiry cannot be forged');
    assert.equal(await L.verifyExpiringLink(`${exp}.${sig.slice(0, -2)}xx`, 'accept-offer', LEAD, TARIFF), 'invalid');
    for (const bad of [null, '', 'abc', '.', `x.${sig}`, `${exp}`]) assert.equal(await L.verifyExpiringLink(bad, 'accept-offer', LEAD, TARIFF), 'invalid', String(bad));
    // a token signed for an expiry in the past is reported expired (only when the signature itself is valid)
    const past = Math.floor(Date.now() / 1000) - 10;
    const old = `${past}.${await L.signLink('accept-offer', String(past), LEAD, TARIFF)}`;
    assert.equal(await L.verifyExpiringLink(old, 'accept-offer', LEAD, TARIFF), 'expired');
    assert.equal(await L.verifyExpiringLink(`${past}.forged`, 'accept-offer', LEAD, TARIFF), 'invalid');
    // a signed but absurdly distant expiry is refused
    const far = Math.floor(Date.now() / 1000) + L.MAX_LINK_TTL_SECONDS + 1000;
    assert.equal(await L.verifyExpiringLink(`${far}.${await L.signLink('accept-offer', String(far), LEAD, TARIFF)}`, 'accept-offer', LEAD, TARIFF), 'invalid');
  });
});

test('expiring link: without LINK_SIGNING_SECRET nothing validates (fails closed)', async () => {
  globalThis.Deno = { env: { get: () => undefined } };
  assert.equal(await L.verifyExpiringLink('123.abc', 'accept-offer', LEAD, TARIFF), 'invalid');
  await assert.rejects(() => L.signExpiringLink('accept-offer', 60, LEAD, TARIFF));
});

test('limits: batch cap, text bounds, throttle window', () => {
  assert.equal(L.badBatch([{ id: 1 }]), null);
  assert.equal(L.badBatch('x').status, 400);
  assert.equal(L.badBatch([]).status, 400);
  assert.equal(L.badBatch(Array.from({ length: L.MAX_BATCH + 1 }, () => ({}))).status, 413);
  assert.equal(L.badBatch(Array.from({ length: L.MAX_BATCH }, () => ({}))), null);
  assert.equal(L.cleanText('  hi  ', 1, 5), 'hi');
  for (const v of [undefined, null, 5, '', '   ', 'x'.repeat(6)]) assert.equal(L.cleanText(v, 1, 5), null);
  L.resetRateLimits();
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(L.rateLimited('k', 3, 1000, t0 + i), false);
  assert.equal(L.rateLimited('k', 3, 1000, t0 + 5), true, 'fourth attempt inside the window');
  assert.equal(L.rateLimited('other', 3, 1000, t0 + 5), false, 'keys are independent');
  assert.equal(L.rateLimited('k', 3, 1000, t0 + 2000), false, 'window expired');
  assert.equal(L.callerKey({ kind: 'user', id: 'u1' }), 'u1');
  assert.equal(L.callerKey({ kind: 'service' }), 'service');
});

const writes = (f) => f.db.log.updates.length + f.db.log.inserts.length;

// ───────────────────────────── vapi-webhook ─────────────────────────────
const VAPI = 'vapi-secret-not-real-000000000000';
const callDb = () => createDb({
  voice_calls: [{ id: 'vc1', vapi_call_id: 'call-1', lead_id: LEAD, status: 'initiated' }],
  hlektrismos_leads: [{ id: LEAD, pipeline_status: 'new' }],
  lead_notes: [],
});
// The documented shape (docs.vapi.ai/server-url/events): everything is nested under `message`.
const report = (transcript) => ({ message: { type: 'end-of-call-report', endedReason: 'hangup', call: { id: 'call-1', startedAt: '2026-10-30T10:00:00Z', endedAt: '2026-10-30T10:00:42Z' }, artifact: { transcript, recording: { url: 'https://storage.vapi.test/r.mp3' } } } });
const ended = report('με ενδιαφέρον');

test('vapi-webhook: the shared secret is required (missing, wrong, short) and the payload must be an object', async () => {
  const f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: VAPI } });
  assert.equal((await f.call({ body: ended })).status, 401);
  assert.equal((await f.call({ body: ended, headers: { 'x-vapi-secret': 'wrong-secret-wrong-secret' } })).status, 401);
  assert.equal((await f.call({ body: ended, token: 'tok-admin' })).status, 401, 'a user JWT is not a provider credential');
  assert.equal(writes(f), 0);
  assert.equal((await f.call({ body: [], headers: { 'x-vapi-secret': VAPI } })).status, 400);
  f.restore();
  const short = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: 'short' } });
  assert.equal((await short.call({ body: ended, headers: { 'x-vapi-secret': 'short' } })).status, 401, 'a weak configured secret fails closed');
  short.restore();
  const none = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: undefined } });
  assert.equal((await none.call({ body: ended, headers: { 'x-vapi-secret': '' } })).status, 401);
  none.restore();
});

test('vapi-webhook: a call ends once; a replayed or duplicated end event, and a late partial transcript, change nothing', async () => {
  const f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: VAPI } });
  const h = { 'x-vapi-secret': VAPI };
  assert.equal((await f.call({ body: ended, headers: h })).status, 200);
  assert.equal(f.db.rows('voice_calls')[0].status, 'completed');
  assert.equal(f.db.rows('hlektrismos_leads')[0].pipeline_status, 'qualified');
  assert.equal(f.db.rows('lead_notes').length, 1);
  const replay = await f.call({ body: report('δεν με ενδιαφέρει'), headers: h });
  assert.equal(replay.status, 200);
  assert.equal(f.db.rows('lead_notes').length, 1, 'no duplicate transcript note');
  assert.equal(f.db.rows('hlektrismos_leads')[0].pipeline_status, 'qualified', 'a replay cannot flip the lead to lost');
  f.restore();
});

// ───────────────────────────── outbound functions ─────────────────────────────
const outboundDb = () => createDb({
  profiles: [
    { id: ADMIN, role: 'admin', is_active: true }, { id: INSIDE, role: 'inside_sales', is_active: true }, { id: FIELD, role: 'field_sales', is_active: true },
    { id: MANAGER, role: 'manager', is_active: true }, { id: BACKOFFICE, role: 'back_office', is_active: true }, { id: INACTIVE, role: 'inside_sales', is_active: false },
  ],
  hlektrismos_leads: [{ id: LEAD, assigned_to: ADMIN, first_name: 'L', last_name: 'A', email: 'lead.a@example.gr', phone: '6900000001' }],
  crm_settings: [{ setting_key: 'INFOBIP_API_KEY', setting_value: 'infobip-key-not-real' }, { setting_key: 'RESEND_API_KEY', setting_value: 'resend-key-not-real' }],
  energy_tariffs: [{ id: TARIFF, provider_name: 'P', program_name: 'Q' }],
  crm_tasks: [], lead_notes: [], campaign_sends: [],
});
const ids = (n) => Array.from({ length: n }, (_, i) => ({ id: `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}` }));
const sent = (f) => f.outbound.filter((o) => /infobip|resend|vapi/i.test(o.url)).length;

test('send-sms: oversized batch, missing / oversized message and malformed JSON are refused before any lookup or send', async () => {
  const f = await loadFunction('send-sms', { db: outboundDb(), users });
  const call = (body) => f.call({ token: 'tok-admin', body });
  assert.equal((await call({ leads: ids(101), message: 'hi' })).status, 413);
  assert.equal((await call({ leads: [], message: 'hi' })).status, 400);
  assert.equal((await call({ leads: ids(1) })).status, 400);
  assert.equal((await call({ leads: ids(1), message: 'x'.repeat(1001) })).status, 400);
  assert.equal((await call({ leads: 'nope', message: 'hi' })).status, 400);
  assert.equal((await f.call({ token: 'tok-admin', raw: '{not json' })).status, 400);
  assert.equal(sent(f), 0);
  f.restore();
});

test('send-sms: anonymous / no-session / unknown-token callers are refused; the throttle answers 429', async () => {
  const f = await loadFunction('send-sms', { db: outboundDb(), users });
  assert.equal((await f.call({ body: { leads: ids(1), message: 'hi' } })).status, 401);
  assert.equal((await f.call({ token: 'tok-unknown', body: { leads: ids(1), message: 'hi' } })).status, 401);
  let last;
  for (let i = 0; i < 11; i++) last = await f.call({ token: 'tok-admin', body: { leads: [], message: 'hi' } });
  assert.equal(last.status, 429, 'the eleventh request within a minute');
  assert.equal(sent(f), 0);
  f.restore();
});

test('send-campaign-email: oversized batch, missing subject / body and the throttle', async () => {
  const f = await loadFunction('send-campaign-email', { db: outboundDb(), users });
  const call = (body) => f.call({ token: 'tok-admin', body });
  assert.equal((await call({ leads: ids(101), subject: 's', html_body: '<p>x</p>' })).status, 413);
  assert.equal((await call({ leads: ids(1), subject: 's' })).status, 400);
  assert.equal((await call({ leads: ids(1), html_body: '<p>x</p>' })).status, 400);
  assert.equal((await call({ leads: ids(1), subject: 'x'.repeat(201), html_body: '<p>x</p>' })).status, 400);
  assert.equal((await f.call({ body: { leads: ids(1), subject: 's', html_body: '<p>x</p>' } })).status, 401);
  // four authorized calls so far; the limit is five per minute, so the fifth passes and the sixth is throttled
  assert.notEqual((await call({ leads: ids(1), subject: 's', html_body: '<p>x</p>' })).status, 429);
  assert.equal((await call({ leads: ids(1), subject: 's', html_body: '<p>x</p>' })).status, 429, 'sixth request inside the minute is throttled');
  assert.equal(sent(f), 0);
  f.restore();
});

test('make-voice-call and send-email: anonymous refused; per-caller throttle', async () => {
  const v = await loadFunction('make-voice-call', { db: outboundDb(), users });
  assert.equal((await v.call({ body: { lead_id: LEAD } })).status, 401);
  let last;
  for (let i = 0; i < 11; i++) last = await v.call({ token: 'tok-admin', body: { lead_id: LEAD } });
  assert.equal(last.status, 429);
  assert.equal(sent(v), 0);
  v.restore();
  const m = await loadFunction('send-email', { db: outboundDb(), users, env: { UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000' } });
  assert.equal((await m.call({ body: {} })).status, 401);
  for (let i = 0; i < 31; i++) last = await m.call({ token: 'tok-admin', body: {} });
  assert.equal(last.status, 429);
  assert.equal(m.smtp.length, 0);
  m.restore();
});



// ───────────────────────────── receive-lead-webhook ─────────────────────────────
const HOOK = 'lead-webhook-secret-not-real-0000';
const hookBody = { first_name: 'Test', email: 'new.lead@example.gr', age_confirmed: true, consent: true };
const hookDb = () => createDb({ leads: [], activity_log: [] });

test('receive-lead-webhook: the shared secret is required; a user JWT, a short secret and a non-object body are refused', async () => {
  const f = await loadFunction('receive-lead-webhook', { db: hookDb(), users, env: { LEAD_WEBHOOK_SECRET: HOOK } });
  assert.equal((await f.call({ body: hookBody })).status, 401);
  assert.equal((await f.call({ body: hookBody, headers: { 'x-webhook-secret': 'wrong-secret-wrong-secret' } })).status, 401);
  assert.equal((await f.call({ body: hookBody, token: 'tok-admin' })).status, 401, 'a user JWT is not the sender credential');
  assert.equal(f.db.rows('leads').length, 0);
  assert.equal((await f.call({ body: [], headers: { 'x-webhook-secret': HOOK } })).status, 400);
  f.restore();
  const weak = await loadFunction('receive-lead-webhook', { db: hookDb(), env: { LEAD_WEBHOOK_SECRET: 'short' } });
  assert.equal((await weak.call({ body: hookBody, headers: { 'x-webhook-secret': 'short' } })).status, 401, 'a weak secret fails closed');
  weak.restore();
  const none = await loadFunction('receive-lead-webhook', { db: hookDb(), env: { LEAD_WEBHOOK_SECRET: undefined } });
  assert.equal((await none.call({ body: hookBody, headers: { 'x-webhook-secret': '' } })).status, 401);
  none.restore();
});

test('receive-lead-webhook: age gate, contact required, and a retried delivery is the same lead (no duplicate)', async () => {
  const f = await loadFunction('receive-lead-webhook', { db: hookDb(), env: { LEAD_WEBHOOK_SECRET: HOOK } });
  const h = { 'x-webhook-secret': HOOK };
  assert.equal((await f.call({ body: { ...hookBody, age_confirmed: false }, headers: h })).status, 422);
  assert.equal((await f.call({ body: { first_name: 'No Contact', age_confirmed: true }, headers: h })).status, 400);
  assert.equal(f.db.rows('leads').length, 0);
  const a = await f.call({ body: hookBody, headers: h });
  assert.equal(a.status, 200);
  const b = await f.call({ body: hookBody, headers: h });
  assert.equal(b.status, 200);
  assert.equal(b.json.duplicate, true);
  assert.equal(b.json.lead_id, a.json.lead_id);
  assert.equal(f.db.rows('leads').length, 1, 'one lead for two deliveries');
  const other = await f.call({ body: { ...hookBody, email: 'other.lead@example.gr' }, headers: h });
  assert.equal(f.db.rows('leads').length, 2, 'a different contact is a different lead');
  assert.notEqual(other.json.lead_id, a.json.lead_id);
  f.restore();
});

// ───────────────────────────── duplicate-send protection, end to end ─────────────────────────────
// These run the real handler all the way to the provider call: consent is granted, outreach is switched on, the clock is pinned
// to 12:00 in Athens (contact hours), so the central gate ALLOWS the send. Then the same campaign request is replayed.
const CK = await bundle(`export { phoneKey, emailKey } from './contact-keys.ts';`);
const NOON_ATHENS = Date.parse('2026-10-30T10:00:00Z');
const withClock = async (fn) => {
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [NOON_ATHENS])); }
    static now() { return NOON_ATHENS; }
  };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
};
const GATE_ENV = { OUTREACH_ENABLED: 'on', LEGAL_APPROVAL_RECORDED: 'yes', UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000', COMPANY_POSTAL_ADDRESS: 'Test 1, Athens' };
const consentDb = (channel) => {
  const db = outboundDb();
  const lead = db.rows('hlektrismos_leads')[0];
  db.rows('contact_consents').push({
    address_kind: channel === 'email' ? 'email' : 'phone', channel, status: 'granted', basis: 'consent', evidence_ref: 'form-123', evidence_at: '2026-10-01T09:00:00Z',
    address_key: channel === 'email' ? CK.emailKey(lead.email) : CK.phoneKey(lead.phone),
  });
  return db;
};
const providerCalls = (f, re) => f.outbound.filter((o) => re.test(o.url)).length;

test('send-sms (end to end): an eligible lead is messaged once; the SAME campaign request replayed sends nothing more', async () => {
  await withClock(async () => {
    const f = await loadFunction('send-sms', { db: consentDb('sms'), users, env: GATE_ENV });
    const body = { campaign_id: CAMPAIGN, leads: [{ id: LEAD }], message: 'Γεια σας {{first_name}}', channel: 'sms' };
    const first = await f.call({ token: 'tok-admin', body });
    assert.equal(first.status, 200, JSON.stringify(first.json));
    assert.equal(first.json.sent, 1, JSON.stringify(first.json));
    assert.equal(providerCalls(f, /infobip/), 1);
    assert.equal(f.db.rows('campaign_sends').filter((r) => r.status === 'sent').length, 1);
    const replay = await f.call({ token: 'tok-admin', body });
    assert.equal(replay.status, 200);
    assert.equal(replay.json.sent, 0, 'nothing is sent a second time');
    assert.equal(replay.json.skipped, 1, 'the lead is reported as skipped');
    assert.equal(providerCalls(f, /infobip/), 1, 'still exactly one provider call');
    f.restore();
  });
});

test('send-sms (end to end): without consent nothing is sent (the gate is enforced server-side, whatever the request says)', async () => {
  await withClock(async () => {
    const f = await loadFunction('send-sms', { db: outboundDb(), users, env: GATE_ENV });
    const r = await f.call({ token: 'tok-admin', body: { campaign_id: CAMPAIGN, leads: [{ id: LEAD, consent: true, phone: '6911111111' }], message: 'hi', channel: 'sms' } });
    assert.equal(r.status, 200);
    assert.equal(r.json.sent, 0);
    assert.match(JSON.stringify(r.json.errors), /NO_CHANNEL_PERMISSION/, 'a client-supplied consent flag is ignored');
    assert.equal(providerCalls(f, /infobip/), 0);
    f.restore();
  });
});

test('send-campaign-email (end to end): an eligible lead is e-mailed once; the SAME campaign request replayed sends nothing more', async () => {
  await withClock(async () => {
    const f = await loadFunction('send-campaign-email', { db: consentDb('email'), users, env: GATE_ENV });
    const body = { campaign_id: CAMPAIGN, leads: [{ id: LEAD }], subject: 'Προσφορά', html_body: '<p>Γεια σας {{first_name}}</p>' };
    const first = await f.call({ token: 'tok-admin', body });
    assert.equal(first.status, 200, JSON.stringify(first.json));
    assert.equal(first.json.sent, 1, JSON.stringify(first.json));
    assert.equal(providerCalls(f, /resend/), 1);
    const replay = await f.call({ token: 'tok-admin', body });
    assert.equal(replay.json.sent, 0);
    assert.equal(replay.json.skipped, 1);
    assert.equal(providerCalls(f, /resend/), 1, 'still exactly one provider call');
    f.restore();
  });
});

// ───────────────────────────── capability is enforced BEFORE any input is processed ─────────────────────────────
// Who may reach the function's own logic is decided first: a role without the capability (Sales Agents by default, the legacy
// roles always, an inactive account) gets 403 even with a malformed body, so it learns nothing about validation and costs nothing.
test('capability-gated senders: Sales Agents without the capability, legacy manager / back_office and inactive accounts get 403 before any validation', async () => {
  const cases = [['send-sms', 'tok-inside'], ['send-sms', 'tok-field'], ['send-campaign-email', 'tok-inside'], ['send-campaign-email', 'tok-field'], ['make-voice-call', 'tok-inside'], ['make-voice-call', 'tok-field']];
  for (const [fn, token] of cases) {
    const f = await loadFunction(fn, { db: outboundDb(), users });
    const r = await f.call({ token, body: {} });
    assert.equal(r.status, 403, `${fn} / ${token}: must be 403 (not a 400 from validation); got ${r.status}`);
    assert.equal(sent(f), 0);
    f.restore();
  }
  for (const fn of ['send-sms', 'send-campaign-email', 'make-voice-call', 'send-email', 'send-offer']) {
    for (const token of ['tok-manager', 'tok-bo', 'tok-inactive']) {
      const f = await loadFunction(fn, { db: outboundDb(), users, env: { UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000' } });
      const r = await f.call({ token, body: {} });
      assert.equal(r.status, 403, `${fn} / ${token}: legacy or inactive accounts are refused with 403; got ${r.status}`);
      f.restore();
    }
  }
});

// ───────────────────────────── webhook secrets: strength, rotation, Vapi HMAC ─────────────────────────────
test('isStrongSecret: short, single-character and low-variety values are refused; a normal random-looking value passes', () => {
  for (const bad of [undefined, null, '', 'short', 'x'.repeat(40), 'ab'.repeat(30), '0123456789'.repeat(4), 'a'.repeat(31) + 'b']) assert.equal(L.isStrongSecret(bad), false, String(bad).slice(0, 12));
  assert.equal(L.isStrongSecret('k3Jx9Qw2LmZp7VdR4tYh8NcB5sGa1UfE'), true);
  assert.equal(L.isStrongSecret('k3Jx9Qw2LmZp7VdR4tYh8NcB5sGa1Uf'), false, '31 characters');
});

test('vapi-webhook: weak or repetitive configured secrets are treated as not configured, even when the caller sends the same value', async () => {
  for (const weak of ['x'.repeat(40), 'ab'.repeat(30), 'vapi-secret-not-real-0000000000' /* 31 chars */]) {
    const f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: weak } });
    assert.equal((await f.call({ body: ended, headers: { 'x-vapi-secret': weak } })).status, 401, weak.slice(0, 14));
    assert.equal(writes(f), 0);
    f.restore();
  }
});

test('secret rotation: the previous secret keeps working while it is configured, and stops the moment it is removed (vapi-webhook and receive-lead-webhook)', async () => {
  const NEW = 'nEw-vapi-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa';
  const OLD = 'old-vapi-secret-K3j9x2Qw7LmZp4VdR1tYh8Nc';
  let f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: NEW, VAPI_WEBHOOK_SECRET_PREVIOUS: OLD } });
  assert.equal((await f.call({ body: ended, headers: { 'x-vapi-secret': OLD } })).status, 200, 'previous secret accepted during rotation');
  f.restore();
  f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: NEW, VAPI_WEBHOOK_SECRET_PREVIOUS: OLD } });
  assert.equal((await f.call({ body: ended, headers: { 'x-vapi-secret': NEW } })).status, 200, 'new secret accepted');
  assert.equal((await f.call({ body: ended, headers: { 'x-vapi-secret': 'a-third-value-a-third-value-a-third-value' } })).status, 401);
  f.restore();
  f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: NEW } });
  assert.equal((await f.call({ body: ended, headers: { 'x-vapi-secret': OLD } })).status, 401, 'old secret refused once the rotation is finished');
  f.restore();
  const HNEW = 'nEw-lead-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa';
  const HOLD = 'old-lead-secret-K3j9x2Qw7LmZp4VdR1tYh8Nc';
  let g = await loadFunction('receive-lead-webhook', { db: hookDb(), env: { LEAD_WEBHOOK_SECRET: HNEW, LEAD_WEBHOOK_SECRET_PREVIOUS: HOLD } });
  assert.equal((await g.call({ body: hookBody, headers: { 'x-webhook-secret': HOLD } })).status, 200);
  assert.equal((await g.call({ body: hookBody, headers: { 'x-webhook-secret': 'unrelated-secret-unrelated-secret-0123' } })).status, 401);
  g.restore();
  g = await loadFunction('receive-lead-webhook', { db: hookDb(), env: { LEAD_WEBHOOK_SECRET: HNEW } });
  assert.equal((await g.call({ body: hookBody, headers: { 'x-webhook-secret': HOLD } })).status, 401);
  g.restore();
  // a weak lead-webhook secret is not accepted either
  g = await loadFunction('receive-lead-webhook', { db: hookDb(), env: { LEAD_WEBHOOK_SECRET: 'z'.repeat(40) } });
  assert.equal((await g.call({ body: hookBody, headers: { 'x-webhook-secret': 'z'.repeat(40) } })).status, 401);
  g.restore();
});

// Vapi HMAC credential (docs.vapi.ai/server-url/server-authentication): signature over "{timestamp}.{body}", SHA-256, hex, with a timestamp header.
const HMAC_SECRET = 'hm4c-Secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa-0001';
const sendSigned = async (f, { secret = HMAC_SECRET, timestamp = String(Math.floor(Date.now() / 1000)), body = ended, tamper = false, sigHeader = 'x-signature', tsHeader = 'x-timestamp', omit = [] } = {}) => {
  const raw = JSON.stringify(body);
  const sig = await withSecret(() => L.hmacHex(secret, timestamp, raw));
  const headers = { [sigHeader]: tamper ? sig.replace(/.$/, (c) => (c === '0' ? '1' : '0')) : sig, [tsHeader]: timestamp };
  for (const h of omit) delete headers[h];
  return f.call({ body, headers });
};

test('vapi-webhook HMAC mode: a correct timestamped signature is accepted; wrong, tampered, stale, future, missing-header and static-secret-only requests are refused', async () => {
  const f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_HMAC_SECRET: HMAC_SECRET, VAPI_WEBHOOK_SECRET: VAPI } });
  const refused = [
    ['signature from another secret', { secret: 'an0ther-Secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa-9999' }],
    ['tampered signature', { tamper: true }],
    ['stale timestamp (10 minutes old)', { timestamp: String(Math.floor(Date.now() / 1000) - 600) }],
    ['future timestamp (10 minutes ahead)', { timestamp: String(Math.floor(Date.now() / 1000) + 600) }],
    ['no signature header', { omit: ['x-signature'] }],
    ['no timestamp header', { omit: ['x-timestamp'] }],
    ['non-numeric timestamp', { timestamp: 'yesterday' }],
  ];
  for (const [name, opt] of refused) assert.equal((await sendSigned(f, opt)).status, 401, name);
  assert.equal((await f.call({ body: ended, headers: { 'x-vapi-secret': VAPI } })).status, 401, 'when HMAC is configured the static header alone is not enough');
  assert.equal(writes(f), 0, 'nothing was written by any refused request');
  // body tampering after signing
  const raw = JSON.stringify(ended); const ts = String(Math.floor(Date.now() / 1000));
  const sig = await withSecret(() => L.hmacHex(HMAC_SECRET, ts, raw));
  assert.equal((await f.call({ body: report('δεν με ενδιαφέρει'), headers: { 'x-signature': sig, 'x-timestamp': ts } })).status, 401, 'a changed body invalidates the signature');
  const ok = await sendSigned(f);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(f.db.rows('voice_calls')[0].status, 'completed');
  f.restore();
});

test('vapi-webhook HMAC mode: millisecond timestamps, custom header names and the previous HMAC secret during rotation', async () => {
  const f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_HMAC_SECRET: HMAC_SECRET, VAPI_HMAC_SECRET_PREVIOUS: 'previ0us-Secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa-7', VAPI_HMAC_SIGNATURE_HEADER: 'x-vapi-signature', VAPI_HMAC_TIMESTAMP_HEADER: 'x-vapi-timestamp' } });
  assert.equal((await sendSigned(f, { sigHeader: 'x-signature', tsHeader: 'x-timestamp' })).status, 401, 'default header names are not read when others are configured');
  assert.equal((await sendSigned(f, { sigHeader: 'x-vapi-signature', tsHeader: 'x-vapi-timestamp', timestamp: String(Date.now()) })).status, 200, 'milliseconds accepted');
  f.restore();
  const g = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_HMAC_SECRET: HMAC_SECRET, VAPI_HMAC_SECRET_PREVIOUS: 'previ0us-Secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa-7' } });
  assert.equal((await sendSigned(g, { secret: 'previ0us-Secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa-7' })).status, 200, 'previous HMAC secret accepted while rotating');
  g.restore();
  const weak = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_HMAC_SECRET: 'q'.repeat(40), VAPI_WEBHOOK_SECRET: VAPI } });
  assert.equal((await sendSigned(weak, { secret: 'q'.repeat(40) })).status, 401, 'a weak HMAC secret is not configured');
  assert.equal((await weak.call({ body: ended, headers: { 'x-vapi-secret': VAPI } })).status, 401, 'a weak HMAC secret refuses everything: it never falls back to the static header');
  weak.restore();
});

test('verifyHmac unit: the window bounds replay, and every configured secret is tried', async () => {
  const secrets = [HMAC_SECRET];
  const now = Date.UTC(2026, 9, 31, 12, 0, 0);
  const ts = String(Math.floor(now / 1000));
  const sig = await withSecret(() => L.hmacHex(HMAC_SECRET, ts, 'BODY'));
  assert.equal(await L.verifyHmac(secrets, sig, ts, 'BODY', now), true);
  assert.equal(await L.verifyHmac(secrets, sig.toUpperCase(), ts, 'BODY', now), true, 'hex case does not matter');
  assert.equal(await L.verifyHmac(secrets, sig, ts, 'BODY', now + L.HMAC_TOLERANCE_MS + 1000), false, 'replayed outside the window');
  assert.equal(await L.verifyHmac(secrets, sig, ts, 'BODY!', now), false);
  assert.equal(await L.verifyHmac([], sig, ts, 'BODY', now), false, 'no configured secret');
  assert.equal(await L.verifyHmac(secrets, null, ts, 'BODY', now), false);
  assert.equal(await L.verifyHmac(secrets, sig, null, 'BODY', now), false);
  assert.equal(L.matchesAnySecret('x', []), false);
});

// ───────────────────────────── durable, shared limit (phase1/21b) ─────────────────────────────
test('durable limit: over the shared quota answers 429, an unreachable counter answers 503, and in both cases nothing is sent', async () => {
  for (const [fn, body] of [['send-sms', { leads: ids(1), message: 'hi' }], ['send-campaign-email', { leads: ids(1), subject: 's', html_body: '<p>x</p>' }], ['make-voice-call', { lead_id: LEAD }], ['send-offer', { lead_id: LEAD, tariff_id: TARIFF }], ['send-email', {}]]) {
    for (const [name, rpc, status] of [
      ['over quota', async () => ({ data: { ok: false, bucket: `request:${ADMIN}:sms` }, error: null }), 429],
      ['migration missing / database error', async () => ({ data: null, error: { message: 'function does not exist' } }), 503],
      ['client throws', async () => { throw new Error('network'); }, 503],
      ['unexpected null result', async () => ({ data: null, error: null }), 503],
    ]) {
      const db = outboundDb(); db.rpc = { consume_rate_limits: rpc };
      const f = await loadFunction(fn, { db, users, env: { LINK_SIGNING_SECRET: SECRET, UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000' } });
      const r = await f.call({ token: 'tok-admin', body });
      assert.equal(r.status, status, `${fn}: ${name}`);
      assert.equal(sent(f) + f.smtp.length, 0, `${fn}: ${name}: nothing sent`);
      f.restore();
    }
  }
});

test('durable limit: the bucket is per function and per caller, taken from the session, never from the request', async () => {
  const f = await loadFunction('send-sms', { db: outboundDb(), users });
  await f.call({ token: 'tok-admin', body: { leads: ids(1), message: 'hi', caller: 'someone-else', bucket: 'x' } });
  const call = f.db.log.rpc.find((c) => c.name === 'consume_rate_limits');
  assert.equal(call.args.p_items[0].bucket, `request:${ADMIN}:sms`);
  assert.equal(call.args.p_items[0].window_seconds, 3600);
  f.restore();
});

test('durable limit runs AFTER the capability check: a refused role consumes no quota', async () => {
  const f = await loadFunction('send-sms', { db: outboundDb(), users });
  assert.equal((await f.call({ token: 'tok-inside', body: {} })).status, 403);
  assert.equal(f.db.log.rpc.filter((c) => c.name.startsWith('consume_rate_limit')).length, 0);
  f.restore();
  const revokedDb = outboundDb();
  revokedDb.rows('crm_settings').push({ setting_key: 'role_permissions', setting_value: { sales_agent: ['crm.read.assigned'] } });
  const o = await loadFunction('send-offer', { db: revokedDb, users });
  assert.equal((await o.call({ token: 'tok-field', body: { lead_id: LEAD, tariff_id: TARIFF } })).status, 403);
  assert.equal(o.db.log.rpc.filter((c) => c.name.startsWith('consume_rate_limit')).length, 0, 'send-offer too');
  o.restore();
});

// ───────────────────────────── scrape-b2b: the two-role model at its own gate ─────────────────────────────
test('scrape-b2b: one authorization path. Admin, granted and revoked Sales Agents, legacy roles (even with an override), unknown, inactive, missing and anonymous', async () => {
  const UNKNOWN = 'aaaaaaaa-0000-4000-8000-0000000000f1', MISSING = 'aaaaaaaa-0000-4000-8000-0000000000f2';
  const all = { ...users, 'tok-unknown-role': UNKNOWN, 'tok-no-profile': MISSING };
  const grants = { sales_agent: [], manager: ['prospecting.search'], back_office: ['prospecting.search'] };
  const run = async (token, overrides) => {
    const db = outboundDb();
    db.rows('profiles').push({ id: UNKNOWN, role: 'partner', is_active: true });
    if (overrides) db.rows('crm_settings').push({ setting_key: 'role_permissions', setting_value: overrides });
    const f = await loadFunction('scrape-b2b', { db, users: all, fetchHandler: async () => { throw new Error('no search may run'); } });
    const r = await f.call({ token, body: { category: 'x' } });
    const touched = f.outbound.length;
    f.restore();
    return { status: r.status, touched };
  };
  const passes = (x) => assert.ok(![401, 403].includes(x.status), JSON.stringify(x));
  const refused = (x, status) => { assert.equal(x.status, status); assert.equal(x.touched, 0); };
  passes(await run('tok-admin'));                         // Admin
  passes(await run('tok-admin', { admin: [] }));          // Admin cannot be locked out
  passes(await run('tok-inside'));                        // Sales Agent, default permission
  passes(await run('tok-field'));                         // the other old spelling is the same Sales Agent
  passes(await run('tok-field', { sales_agent: ['prospecting.search'] })); // Sales Agent, explicitly granted
  refused(await run('tok-inside', grants), 403);          // Sales Agent, revoked
  refused(await run('tok-field', grants), 403);
  refused(await run('tok-manager'), 403);                 // legacy manager
  refused(await run('tok-bo'), 403);                      // legacy back_office
  refused(await run('tok-manager', grants), 403);         // legacy, with a manually inserted override
  refused(await run('tok-bo', grants), 403);
  refused(await run('tok-unknown-role', { partner: ['prospecting.search'] }), 403); // unknown role
  refused(await run('tok-inactive', grants), 403);        // inactive profile
  refused(await run('tok-no-profile', grants), 403);      // missing profile
  refused(await run(undefined), 401);                     // anonymous
  refused(await run('tok-not-a-session'), 401);
});

// ───────────────────────────── Vapi: the documented event and the credential path ─────────────────────────────
test('vapi-webhook: the documented end-of-call-report records outcome, duration, recording and transcript; informational messages change nothing', async () => {
  const f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: VAPI } });
  const h = { 'x-vapi-secret': VAPI };
  for (const body of [{ message: { type: 'status-update', status: 'ended', call: { id: 'call-1' } } }, { message: { type: 'speech-update', call: { id: 'call-1' } } }, { message: { type: 'call-ended', call: { id: 'call-1' } } }]) {
    assert.equal((await f.call({ body, headers: h })).status, 200);
  }
  assert.equal(f.db.rows('voice_calls')[0].status, 'initiated', 'only the end-of-call report completes a call');
  await f.call({ body: ended, headers: h });
  const c = f.db.rows('voice_calls')[0];
  assert.equal(c.status, 'completed');
  assert.equal(c.outcome, 'interested');
  assert.equal(c.duration_seconds, 42);
  assert.equal(c.recording_url, 'https://storage.vapi.test/r.mp3');
  assert.equal(c.transcript, 'με ενδιαφέρον');
  f.restore();
});

test('make-voice-call: no usable webhook secret means no call; when configured the secret travels in assistant.server.headers, not as an unknown field', async () => {
  await withClock(async () => {
    const voiceDb = () => {
      const db = consentDb('voice');
      db.rows('crm_settings').push({ setting_key: 'VAPI_API_KEY', setting_value: 'vapi-key-not-real' }, { setting_key: 'VAPI_PHONE_NUMBER_ID', setting_value: 'pn-1' });
      db.rows('article11_screenings').push({ phone_key: CK.phoneKey('6900000001'), result: 'not_listed', screened_at: '2026-10-25T09:00:00Z' });
      db.tables.voice_calls = [];
      return db;
    };
    const env = { ...GATE_ENV, AUTO_VOICE_CALLS: 'on' };
    for (const [name, extra] of [['no secret', {}], ['weak secret', { VAPI_WEBHOOK_SECRET: 'x'.repeat(40) }], ['HMAC mode', { VAPI_WEBHOOK_SECRET: VAPI, VAPI_HMAC_SECRET: HMAC_SECRET }]]) {
      const f = await loadFunction('make-voice-call', { db: voiceDb(), users, env: { ...env, ...extra } });
      const r = await f.call({ token: 'tok-admin', body: { lead_id: LEAD } });
      assert.equal(r.status, 503, name);
      assert.equal(f.outbound.filter((o) => /vapi/.test(o.url)).length, 0, `${name}: no billable call`);
      f.restore();
    }
    const f = await loadFunction('make-voice-call', { db: voiceDb(), users, env: { ...env, VAPI_WEBHOOK_SECRET: VAPI }, fetchHandler: async () => new Response(JSON.stringify({ id: 'call-9' }), { status: 200, headers: { 'content-type': 'application/json' } }) });
    const r = await f.call({ token: 'tok-admin', body: { lead_id: LEAD } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const sentBody = JSON.parse(f.outbound.find((o) => /api\.vapi\.ai/.test(o.url)).body);
    assert.match(sentBody.assistant.server.url, /\/functions\/v1\/vapi-webhook$/);
    assert.equal(sentBody.assistant.server.headers['x-vapi-secret'], VAPI);
    assert.equal(sentBody.webhookUrl, undefined);
    assert.ok(!JSON.stringify(r.json).includes(VAPI), 'the secret is never returned to the caller');
    f.restore();
  });
});

// ───────────────────────────── review findings: offers, claims, voice, legacy roles ─────────────────────────────
const OFFER_ENV = { ...GATE_ENV, LINK_SIGNING_SECRET: SECRET, SITE_URL: 'https://crm.example.test' };
const offerBody = { lead_id: LEAD, tariff_id: TARIFF };

test('bulk senders: simultaneous identical requests send once; a failed claim sends nothing; a provider failure can be retried', async () => {
  await withClock(async () => {
    const body = { campaign_id: CAMPAIGN, leads: [{ id: LEAD }], message: 'Γεια', channel: 'sms' };
    const f = await loadFunction('send-sms', { db: consentDb('sms'), users, env: GATE_ENV });
    const r = await Promise.all([f.call({ token: 'tok-admin', body }), f.call({ token: 'tok-admin', body })]);
    assert.equal(r[0].json.sent + r[1].json.sent, 1);
    assert.equal(providerCalls(f, /infobip/), 1);
    f.restore();
    let down = true;
    const g = await loadFunction('send-sms', { db: consentDb('sms'), users, env: GATE_ENV, fetchHandler: async () => (down ? new Response('x', { status: 500 }) : new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })) });
    assert.equal((await g.call({ token: 'tok-admin', body })).json.failed, 1);
    down = false;
    assert.equal((await g.call({ token: 'tok-admin', body })).json.sent, 1, 'the failed attempt released its claim');
    g.restore();
    const bad = await loadFunction('send-sms', { db: consentDb('sms'), users, env: GATE_ENV });
    assert.equal((await bad.call({ token: 'tok-admin', body: { ...body, campaign_id: 'camp-1' } })).status, 400);
    assert.equal((await bad.call({ token: 'tok-admin', body: { leads: ids(2), message: 'x' } })).status, 400, 'a batch without a campaign cannot be de-duplicated');
    bad.restore();
  });
});

test('make-voice-call: a double click places one call; a failed tracking row places none', async () => {
  await withClock(async () => {
    const voiceDb = () => {
      const db = consentDb('voice');
      db.rows('crm_settings').push({ setting_key: 'VAPI_API_KEY', setting_value: 'vapi-key-not-real' }, { setting_key: 'VAPI_PHONE_NUMBER_ID', setting_value: 'pn-1' }, { setting_key: 'SUPABASE_URL', setting_value: 'https://attacker.example.test' });
      db.rows('article11_screenings').push({ phone_key: CK.phoneKey('6900000001'), result: 'not_listed', screened_at: '2026-10-25T09:00:00Z' });
      db.tables.voice_calls = [];
      return db;
    };
    const f = await loadFunction('make-voice-call', { db: voiceDb(), users, env: { ...GATE_ENV, AUTO_VOICE_CALLS: 'on', VAPI_WEBHOOK_SECRET: VAPI }, fetchHandler: async () => new Response(JSON.stringify({ id: 'c' }), { status: 200, headers: { 'content-type': 'application/json' } }) });
    const r = await Promise.all([f.call({ token: 'tok-admin', body: { lead_id: LEAD } }), f.call({ token: 'tok-admin', body: { lead_id: LEAD } })]);
    assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
    const calls = f.outbound.filter((o) => /api\.vapi\.ai/.test(o.url));
    assert.equal(calls.length, 1);
    assert.ok(!calls[0].body.includes('attacker.example.test'), 'the webhook address and secret never follow a settings row');
    f.restore();
  });
});

test('vapi-webhook: simultaneous reports act once; the customer\'s words decide and a refusal wins; a database failure answers 500', async () => {
  const h = { 'x-vapi-secret': VAPI };
  let f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: VAPI } });
  await Promise.all([f.call({ body: ended, headers: h }), f.call({ body: ended, headers: h })]);
  assert.equal(f.db.rows('lead_notes').length, 1, 'one note');
  f.restore();
  for (const [text, outcome] of [
    ['AI: Θα σας στείλω προσφορά στο email. User: μη με ξαναπαρείτε', 'not_interested'],
    ['AI: Έχετε ενδιαφέρον για προσφορά; User: Καλησπέρα', 'unknown'],
    ['AI: Γεια. User: έχω ενδιαφέρον', 'interested'],
  ]) {
    f = await loadFunction('vapi-webhook', { db: callDb(), env: { VAPI_WEBHOOK_SECRET: VAPI } });
    await f.call({ body: report(text), headers: h });
    assert.equal(f.db.rows('voice_calls')[0].outcome, outcome, text);
    f.restore();
  }
});

test('legacy roles: requireStaff refuses manager, back_office and unknown roles (aade-lookup); Sales Agents and Admin pass', async () => {
  for (const [token, ok] of [['tok-manager', false], ['tok-bo', false], ['tok-inactive', false], ['tok-field', true], ['tok-admin', true]]) {
    const f = await loadFunction('aade-lookup', { db: outboundDb(), users });
    const r = await f.call({ token, body: { afm: 'x' } });
    assert.equal(r.status, ok ? 400 : 403, String(token));
    f.restore();
  }
});

test('the confirmation page is a public route that only POSTs, on a button press', () => {
  const page = readFileSync(fnDir + '../../src/pages/OfferAccept.tsx', 'utf8');
  assert.match(page, /onClick=\{\(\) => void accept\(\)\}/);
  assert.match(page, /method: 'POST'/);
  assert.ok(!/useEffect/.test(page), 'opening the page does nothing by itself');
  assert.match(readFileSync(fnDir + '../../src/lib/router.ts', 'utf8'), /'\/offer': 'offer'/);
});

test('requirePermission: one rule with getCaller. Legacy and unknown roles stop before any override is read, and an override cannot admit them', async () => {
  const UNKNOWN = 'aaaaaaaa-0000-4000-8000-0000000000f1';
  const entry = fileURLToPath(new URL('./fixtures/functions/require-permission.ts', import.meta.url));
  const run = async (token, overrides) => {
    const db = outboundDb();
    db.rows('profiles').push({ id: UNKNOWN, role: 'partner', is_active: true });
    if (overrides) db.rows('crm_settings').push({ setting_key: 'role_permissions', setting_value: overrides });
    const f = await loadFunction('require-permission', { db, users: { ...users, 'tok-unknown-role': UNKNOWN }, entry });
    const r = await f.call({ token, body: {} });
    f.restore();
    return [r.status, r.json?.error];
  };
  const grant = { manager: ['prospecting.search'], back_office: ['prospecting.search'], partner: ['prospecting.search'], sales_agent: [] };
  assert.equal((await run('tok-admin'))[0], 200);
  assert.equal((await run('tok-inside'))[0], 200);
  assert.equal((await run('tok-field'))[0], 200, 'the same Sales Agent');
  assert.equal((await run('tok-field', { sales_agent: ['prospecting.search'] }))[0], 200, 'granted');
  assert.deepEqual(await run('tok-field', grant), [403, 'Not permitted for your role'], 'revoked');
  assert.deepEqual(await run('tok-inside', grant), [403, 'Not permitted for your role'], 'revoked');
  for (const token of ['tok-manager', 'tok-bo', 'tok-unknown-role', 'tok-inactive']) assert.deepEqual(await run(token, grant), [403, 'Staff access only'], token);
  assert.equal((await run(undefined))[0], 401);
});
