// Handler-level: a record in the Trash is not processed by any sensitive Edge Function. There is no recovery path in the functions; restoring is the
// database's admin function (phase2/06). LOCAL only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunction, createDb } from './helpers/edge-harness.mjs';

const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const AGENT = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const users = { 'tok-admin': ADMIN, 'tok-agent': AGENT };
const LEGACY = 'bbbbbbbb-0000-4000-8000-0000000000a1', LEAD = 'bbbbbbbb-0000-4000-8000-0000000000a2', CUSTOMER = 'bbbbbbbb-0000-4000-8000-0000000000a3', CASE = 'bbbbbbbb-0000-4000-8000-0000000000a4';
const TARIFF = 'cccccccc-0000-4000-8000-0000000000a1';
const GONE = '2026-10-29T00:00:00Z';
const env = { UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000', LINK_SIGNING_SECRET: 'link-signing-secret-Q7w2Lm9Zp4VdR1tY8hNc', OUTREACH_ENABLED: 'on', LEGAL_APPROVAL_RECORDED: 'yes', AUTO_VOICE_CALLS: 'on' };

const db = (deleted = true) => {
  const d = deleted ? { deleted_at: GONE } : { deleted_at: null };
  return createDb({
    profiles: [{ id: ADMIN, role: 'admin', is_active: true }, { id: AGENT, role: 'inside_sales', is_active: true }],
    hlektrismos_leads: [{ id: LEGACY, assigned_to: AGENT, email: 'legacy@example.gr', phone: '6900000001', status: 'new', bill_files: [{ path: 'contact-forms/a.pdf' }], ...d }],
    leads: [{ id: LEAD, assigned_to_user_id: AGENT, email: 'lead@example.gr', ...d }],
    customers: [{ id: CUSTOMER, created_by: AGENT, email: 'customer@example.gr', ...d }],
    cases: [{ id: CASE, owner_id: AGENT, customer_id: CUSTOMER }],
    energy_tariffs: [{ id: TARIFF, provider_name: 'P', program_name: 'Q' }],
    crm_settings: [
      { setting_key: 'email_config', setting_value: { smtp_host: 'smtp.example.test', smtp_port: 465, from_email: 'info@hlektrismos.gr' } },
      { setting_key: 'INFOBIP_API_KEY', setting_value: 'k' }, { setting_key: 'RESEND_API_KEY', setting_value: 'k' }, { setting_key: 'VAPI_API_KEY', setting_value: 'k' }, { setting_key: 'VAPI_PHONE_NUMBER_ID', setting_value: 'p' },
    ],
    crm_tasks: [], lead_notes: [], campaign_sends: [], voice_calls: [],
  });
};
const out = (f) => f.outbound.length + f.smtp.length;
const cases = [
  ['send-email, legacy lead', 'send-email', { legacy_lead_id: LEGACY, subject: 's', text: 't' }],
  ['send-email, lead', 'send-email', { lead_id: LEAD, subject: 's', text: 't' }],
  ['send-email, customer', 'send-email', { customer_id: CUSTOMER, subject: 's', text: 't' }],
  ['send-email, case of a deleted customer', 'send-email', { case_id: CASE, subject: 's', text: 't' }],
  ['send-offer', 'send-offer', { lead_id: LEGACY, tariff_id: TARIFF }],
  ['make-voice-call', 'make-voice-call', { lead_id: LEGACY }],
  ['enrich-lead', 'enrich-lead', { lead_id: LEGACY, website: 'https://example.gr' }],
  ['billing-ocr', 'billing-ocr', { lead_id: LEGACY }],
];

for (const [name, fn, body] of cases) {
  test(`${name}: refused as not found, for Admin and for the record's owner, and nothing leaves`, async () => {
    for (const token of ['tok-admin', 'tok-agent']) {
      const f = await loadFunction(fn, { db: db(), users, env });
      const r = await f.call({ token, body });
      assert.ok([403, 404].includes(r.status), `${fn} ${token}: ${r.status}`);
      if (token === 'tok-admin') assert.equal(r.status, 404, `${fn}: Admin sees "not found", not a permission error`);
      assert.equal(out(f), 0, `${fn} ${token}: nothing sent`);
      f.restore();
    }
  });
}

test('send-sms and the campaign email: a deleted lead never reaches a provider', async () => {
  for (const [fn, body] of [['send-sms', { leads: [{ id: LEGACY }], message: 'x' }], ['send-campaign-email', { leads: [{ id: LEGACY }], subject: 's', html_body: '<p>x</p>' }]]) {
    const f = await loadFunction(fn, { db: db(), users, env });
    const r = await f.call({ token: 'tok-admin', body });
    assert.equal(r.json.sent, 0, fn);
    assert.match(r.json.errors.join(), /LEAD_NOT_FOUND/, fn);
    assert.equal(f.outbound.length, 0, fn);
    f.restore();
  }
});

test('the same records, not deleted, still work: this refusal is about the Trash only', async () => {
  const f = await loadFunction('send-email', { db: db(false), users, env });
  assert.equal((await f.call({ token: 'tok-admin', body: { legacy_lead_id: LEGACY, subject: 's', text: 't' } })).status, 200);
  assert.equal((await f.call({ token: 'tok-agent', body: { case_id: CASE, subject: 's2', text: 't' } })).status, 200);
  f.restore();
});

// Source check, not a handler run: these tools sit behind a model call, so the query text is what can be asserted locally.
test('the AI tools do not list or read deleted leads', async () => {
  const source = (await import('node:fs')).readFileSync(new URL('../functions/orchestrator/index.ts', import.meta.url), 'utf8');
  for (const q of [`select('*').is('deleted_at', null)`, `.eq('id', args.lead_id).is('deleted_at', null).single()`]) assert.ok(source.includes(q), q);
});
