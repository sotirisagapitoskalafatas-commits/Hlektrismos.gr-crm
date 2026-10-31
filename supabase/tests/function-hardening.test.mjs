// Handler-level tests (real Edge Function code through helpers/edge-harness.mjs; LOCAL, no network, no Supabase project) for:
//   * expiring signed links, input limits and the best-effort throttle (_shared/signed-link.ts, _shared/limits.ts)
//   * accept-offer: expiring token, explicit POST, current-state validation, replay-safe single transition
//   * vapi-webhook: secret required, payload shape, replay-safe call-ended handling
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
const L = await bundle(`export * from './signed-link.ts'; export * from './limits.ts';`);
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

// ───────────────────────────── accept-offer ─────────────────────────────
const offerDb = (leadExtra = {}, withOffer = true) => createDb({
  hlektrismos_leads: [{ id: LEAD, status: 'follow_up', ...leadExtra }],
  crm_tasks: withOffer ? [{ id: 't-offer', lead_id: LEAD, tariff_id: TARIFF, title: 'Προσφορά στάλθηκε: P — Q', status: 'pending' }] : [],
  energy_tariffs: [{ id: TARIFF, provider_name: 'P', program_name: 'Q' }],
  lead_notes: [],
});
const q = (tok, lead = LEAD, tariff = TARIFF) => `?lead_id=${lead}&tariff_id=${tariff}&t=${encodeURIComponent(tok)}`;
const writes = (f) => f.db.log.updates.length + f.db.log.inserts.length;

test('accept-offer: a valid link only SHOWS a confirmation on GET; the lead is converted by an explicit POST, once', async () => {
  const f = await loadFunction('accept-offer', { db: offerDb(), env: { LINK_SIGNING_SECRET: SECRET } });
  const tok = await sign('accept-offer', 3600, LEAD, TARIFF);
  const get = await f.call({ method: 'GET', query: q(tok) });
  assert.equal(get.status, 200);
  assert.match(get.json, /<form method="POST"/);
  assert.equal(writes(f), 0, 'a GET (mail scanner, link preview) changes nothing');
  const post = await f.call({ method: 'POST', query: q(tok) });
  assert.equal(post.status, 200);
  assert.equal(f.db.rows('hlektrismos_leads')[0].status, 'customer');
  assert.equal(f.db.rows('lead_notes').length, 1);
  const tasksAfter = f.db.rows('crm_tasks').length;
  // replay: the same link again changes nothing and creates no second task or note
  const again = await f.call({ method: 'POST', query: q(tok) });
  assert.equal(again.status, 200);
  assert.match(again.json, /ήδη γίνει αποδεκτή/);
  assert.equal(f.db.rows('lead_notes').length, 1);
  assert.equal(f.db.rows('crm_tasks').length, tasksAfter);
  f.restore();
});

test('accept-offer: forged, tampered, wrong-pair, unsigned and expired links change nothing', async () => {
  const f = await loadFunction('accept-offer', { db: offerDb(), env: { LINK_SIGNING_SECRET: SECRET } });
  const good = await sign('accept-offer', 3600, LEAD, TARIFF);
  const other = 'bbbbbbbb-0000-4000-8000-0000000000ff';
  const past = Math.floor(Date.now() / 1000) - 10;
  const expired = `${past}.${await signRaw('accept-offer', String(past), LEAD, TARIFF)}`;
  for (const [name, query, status] of [
    ['no token', `?lead_id=${LEAD}&tariff_id=${TARIFF}`, 403],
    ['plain two ids with a guessed token', q('AAAA'), 403],
    ['a token for another lead', q(good, other, TARIFF), 403],
    ['a token for another tariff', q(good, LEAD, other), 403],
    ['the old non-expiring token format', q(await signRaw('accept-offer', LEAD, TARIFF)), 403],
    ['expired', q(expired), 410],
  ]) {
    for (const method of ['GET', 'POST']) {
      const r = await f.call({ method, query });
      assert.equal(r.status, status, `${name} (${method})`);
    }
  }
  assert.equal(writes(f), 0, 'nothing was written by any refused request');
  assert.equal(f.db.rows('hlektrismos_leads')[0].status, 'follow_up');
  f.restore();
});

test('accept-offer: a valid link cannot convert a lost / deleted / unknown lead or an offer that was never sent', async () => {
  const tok = await sign('accept-offer', 3600, LEAD, TARIFF);
  for (const [name, db, status] of [
    ['lost lead', offerDb({ status: 'lost' }), 409],
    ['unsubscribed lead', offerDb({ status: 'unsubscribed' }), 409],
    ['deleted lead', offerDb({ deleted_at: '2026-10-01T00:00:00Z' }), 404],
    ['offer never sent for this lead and tariff', offerDb({}, false), 404],
  ]) {
    const f = await loadFunction('accept-offer', { db, env: { LINK_SIGNING_SECRET: SECRET } });
    const r = await f.call({ method: 'POST', query: q(tok) });
    assert.equal(r.status, status, name);
    assert.equal(writes(f), 0, `${name}: nothing written`);
    f.restore();
  }
  const f = await loadFunction('accept-offer', { db: createDb({ hlektrismos_leads: [], crm_tasks: [] }), env: { LINK_SIGNING_SECRET: SECRET } });
  assert.equal((await f.call({ method: 'POST', query: q(tok) })).status, 404, 'unknown lead');
  f.restore();
});

test('accept-offer: without LINK_SIGNING_SECRET every link is refused', async () => {
  const tok = await sign('accept-offer', 3600, LEAD, TARIFF);
  const f = await loadFunction('accept-offer', { db: offerDb(), env: { LINK_SIGNING_SECRET: undefined } });
  assert.equal((await f.call({ method: 'POST', query: q(tok) })).status, 403);
  assert.equal(writes(f), 0);
  f.restore();
});

// ───────────────────────────── vapi-webhook ─────────────────────────────
const VAPI = 'vapi-secret-not-real-0000000000';
const callDb = () => createDb({
  voice_calls: [{ id: 'vc1', vapi_call_id: 'call-1', lead_id: LEAD, status: 'initiated' }],
  hlektrismos_leads: [{ id: LEAD, pipeline_status: 'new' }],
  lead_notes: [],
});
const ended = { message: { type: 'call-ended' }, call: { id: 'call-1', duration: 42 }, transcript: 'με ενδιαφέρον' };

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
  const finalTranscript = f.db.rows('voice_calls')[0].transcript;
  const replay = await f.call({ body: { ...ended, transcript: 'δεν με ενδιαφέρει' }, headers: h });
  assert.equal(replay.status, 200);
  assert.equal(f.db.rows('lead_notes').length, 1, 'no duplicate transcript note');
  assert.equal(f.db.rows('hlektrismos_leads')[0].pipeline_status, 'qualified', 'a replay cannot flip the lead to lost');
  await f.call({ body: { message: { type: 'transcript-update' }, call: { id: 'call-1' }, transcript: 'late partial' }, headers: h });
  assert.equal(f.db.rows('voice_calls')[0].transcript, finalTranscript, 'a late partial cannot overwrite the final transcript');
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
  const raw = await f.call({ token: 'tok-admin', body: undefined, headers: {} });
  assert.ok([400, 413].includes(raw.status));
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

test('send-offer: the same offer is not sent twice inside ten minutes, and the acceptance link it issues expires', async () => {
  const f = await loadFunction('send-offer', { db: outboundDb(), users, env: { LINK_SIGNING_SECRET: SECRET, UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000', COMPANY_POSTAL_ADDRESS: 'Test 1, Athens' } });
  const body = { lead_id: LEAD, tariff_id: TARIFF };
  const first = await f.call({ token: 'tok-admin', body });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  const url = new URL(first.json.accept_url);
  assert.match(url.searchParams.get('t'), /^\d+\.[A-Za-z0-9_-]+$/, 'expiring token');
  const exp = Number(url.searchParams.get('t').split('.')[0]);
  const days = (exp - Date.now() / 1000) / 86400;
  assert.ok(days > 13 && days <= 14.01, `link lifetime is about 14 days (${days.toFixed(2)})`);
  assert.equal(await withSecret(() => L.verifyExpiringLink(url.searchParams.get('t'), 'accept-offer', LEAD, TARIFF)), 'ok');
  const second = await f.call({ token: 'tok-admin', body });
  assert.equal(second.status, 409);
  assert.equal(f.db.rows('crm_tasks').filter((t) => String(t.title).startsWith('Προσφορά στάλθηκε')).length, 1, 'no second task');
  assert.equal((await f.call({ body })).status, 401, 'anonymous refused');
  f.restore();
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
    const body = { campaign_id: 'camp-1', leads: [{ id: LEAD }], message: 'Γεια σας {{first_name}}', channel: 'sms' };
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
    const r = await f.call({ token: 'tok-admin', body: { campaign_id: 'camp-1', leads: [{ id: LEAD, consent: true, phone: '6911111111' }], message: 'hi', channel: 'sms' } });
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
    const body = { campaign_id: 'camp-9', leads: [{ id: LEAD }], subject: 'Προσφορά', html_body: '<p>Γεια σας {{first_name}}</p>' };
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
