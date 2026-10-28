// Stage 2B: handler-level tests of the REAL Edge Function code (supabase/functions/<name>/index.ts), run through
// helpers/edge-harness.mjs with an in-memory database, a fake SMTP server, fake DNS and a recording fetch.
// They prove, per function: Back Office allowed, an agent's own record allowed, another agent's record refused,
// missing capability / inactive / no session refused, malicious and redirect-based SSRF refused before any
// connection, and email header injection refused. LOCAL only; no network, no Supabase project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunction, createDb, SERVICE_KEY, SUPABASE_URL } from './helpers/edge-harness.mjs';

const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const OFFICE = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const A = 'aaaaaaaa-0000-4000-8000-0000000000c1'; // inside_sales
const B = 'aaaaaaaa-0000-4000-8000-0000000000c2'; // field_sales
const INACTIVE = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const LA = 'bbbbbbbb-0000-4000-8000-0000000000a1'; // legacy lead assigned to A
const LB = 'bbbbbbbb-0000-4000-8000-0000000000b1'; // legacy lead assigned to B
const users = { 'tok-admin': ADMIN, 'tok-office': OFFICE, 'tok-a': A, 'tok-b': B, 'tok-inactive': INACTIVE };

const seed = (extra = {}) => createDb({
  profiles: [
    { id: ADMIN, role: 'admin', is_active: true }, { id: OFFICE, role: 'back_office', is_active: true },
    { id: A, role: 'inside_sales', is_active: true }, { id: B, role: 'field_sales', is_active: true },
    { id: INACTIVE, role: 'inside_sales', is_active: false },
  ],
  hlektrismos_leads: [
    { id: LA, assigned_to: A, first_name: 'Lead', last_name: 'A', email: 'lead.a@example.gr', phone: '6900000001', bill_files: [{ path: 'contact-forms/a.pdf' }] },
    { id: LB, assigned_to: B, first_name: 'Lead', last_name: 'B', email: 'lead.b@example.gr', phone: '6900000002', bill_files: [{ path: 'contact-forms/b.pdf' }] },
  ],
  crm_settings: [
    { setting_key: 'email_config', setting_value: { smtp_host: 'smtp.example.test', smtp_port: 587, smtp_user: '', from_email: 'info@hlektrismos.gr', from_name: 'Hlektrismos.gr' } },
    ...(extra.crm_settings ?? []),
  ],
  email_suppressions: [],
});

// ───────────────────────────── send-email ─────────────────────────────
async function sendEmail(db) {
  return loadFunction('send-email', { db, users, env: { UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000' } });
}
const mail = { subject: 'Η προσφορά σας', text: 'Καλησπέρα σας' };

test('send-email: no session 401, inactive 403, role without communications.email.send 403', async () => {
  const f = await sendEmail(seed());
  assert.equal((await f.call({ body: { ...mail, legacy_lead_id: LA } })).status, 401);
  assert.equal((await f.call({ token: 'tok-bogus', body: { ...mail, legacy_lead_id: LA } })).status, 401);
  assert.equal((await f.call({ token: 'tok-inactive', body: { ...mail, legacy_lead_id: LA } })).status, 403);
  const field = await f.call({ token: 'tok-b', body: { ...mail, legacy_lead_id: LB } });
  assert.equal(field.status, 403, 'field_sales has no email capability by default');
  assert.equal(f.smtp.length, 0, 'nothing was sent');
  f.restore();
});

test('send-email: a Sales Agent emails their OWN lead, and only at the address stored on it', async () => {
  const f = await sendEmail(seed());
  const own = await f.call({ token: 'tok-a', body: { ...mail, legacy_lead_id: LA } });
  assert.equal(own.status, 200, JSON.stringify(own.json));
  assert.equal(f.smtp.length, 1);
  assert.deepEqual(f.smtp[0].rcptTo, ['<lead.a@example.gr>'], 'recipient from the database');
  assert.equal(f.smtp[0].mailFrom, '<info@hlektrismos.gr>', 'sender from configuration');
  const mismatch = await f.call({ token: 'tok-a', body: { ...mail, legacy_lead_id: LA, to: 'attacker@evil.gr' } });
  assert.equal(mismatch.status, 400, 'a different `to` is refused');
  assert.equal(f.smtp.length, 1, 'no second send');
  f.restore();
});

test('send-email: a Sales Agent cannot email ANOTHER agent\'s lead, an unreferenced address, or bypass suppression', async () => {
  const f = await sendEmail(seed());
  const other = await f.call({ token: 'tok-a', body: { ...mail, legacy_lead_id: LB } });
  assert.equal(other.status, 403);
  assert.equal(other.json.error, 'Not your record');
  assert.equal((await f.call({ token: 'tok-a', body: { ...mail, to: 'anyone@example.gr' } })).status, 403, 'free address needs office');
  assert.equal((await f.call({ token: 'tok-a', body: { ...mail, legacy_lead_id: LA, transactional: true } })).status, 403, 'suppression bypass is office-only');
  assert.equal((await f.call({ token: 'tok-a', body: { ...mail, legacy_lead_id: 'not-a-uuid' } })).status, 400);
  assert.equal((await f.call({ token: 'tok-a', body: { ...mail, legacy_lead_id: 'bbbbbbbb-0000-4000-8000-000000000999' } })).status, 404);
  assert.equal(f.smtp.length, 0);
  f.restore();
});

test('send-email: Back Office (admin) sends a transactional email to any lead and to one validated free address', async () => {
  const f = await sendEmail(seed());
  assert.equal((await f.call({ token: 'tok-admin', body: { ...mail, legacy_lead_id: LB, transactional: true } })).status, 200);
  assert.deepEqual(f.smtp[0].rcptTo, ['<lead.b@example.gr>']);
  assert.equal((await f.call({ token: 'tok-admin', body: { ...mail, to: 'Customer@Example.GR', transactional: true } })).status, 200);
  assert.deepEqual(f.smtp[1].rcptTo, ['<customer@example.gr>']);
  assert.equal((await f.call({ token: 'tok-admin', body: { ...mail, to: ['a@example.gr', 'b@example.gr'], transactional: true } })).status, 400, 'no lists');
  f.restore();
});

test('send-email: header injection in subject, recipient or display name never reaches the SMTP server', async () => {
  const f = await sendEmail(seed());
  for (const body of [
    { ...mail, subject: 'Hi\r\nBcc: victim@example.gr', to: 'c@example.gr', transactional: true },
    { ...mail, subject: 'Hi\nBcc: victim@example.gr', to: 'c@example.gr', transactional: true },
    { ...mail, to: 'c@example.gr\r\nBcc: victim@example.gr', transactional: true },
    { ...mail, to: 'c@example.gr, victim@example.gr', transactional: true },
  ]) {
    const r = await f.call({ token: 'tok-admin', body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal(f.smtp.length, 0, 'refused before connecting');
  const named = await f.call({ token: 'tok-admin', body: { ...mail, to: 'c@example.gr', transactional: true, from_name: 'Evil\r\nBcc: victim@example.gr' } });
  assert.equal(named.status, 200);
  const headerBlock = f.smtp[0].data.split('\r\n\r\n')[0];
  assert.doesNotMatch(headerBlock, /^Bcc:/mi, 'no injected header line');
  assert.match(headerBlock, /^From: Evil Bcc: victim@example\.gr <info@hlektrismos\.gr>$/m, 'name flattened, address from config');
  assert.deepEqual(f.smtp[0].rcptTo, ['<c@example.gr>']);
  f.restore();
});

test('send-email: a "." line in the body is dot-stuffed and cannot end the message early', async () => {
  const f = await sendEmail(seed());
  const r = await f.call({ token: 'tok-admin', body: { subject: 'x', text: 'line\r\n.\r\nRCPT TO:<victim@example.gr>', to: 'c@example.gr', transactional: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(f.smtp[0].rcptTo, ['<c@example.gr>'], 'only one RCPT');
  assert.match(f.smtp[0].data, /\r\n\.\.\r\nRCPT TO:<victim@example\.gr>/);
  f.restore();
});

// ───────────────────────────── send-sms ─────────────────────────────
const smsSettings = [{ setting_key: 'INFOBIP_API_KEY', setting_value: 'infobip-key-not-real' }];
test('send-sms: capability first (inside_sales has none by default), then the lead must be the caller\'s', async () => {
  let f = await loadFunction('send-sms', { db: seed({ crm_settings: smsSettings }), users });
  const noCap = await f.call({ token: 'tok-a', body: { leads: [{ id: LA }], message: 'Γεια' } });
  assert.equal(noCap.status, 403);
  assert.equal(noCap.json.error, 'Not permitted for your role');
  f.restore();

  // An admin override grants SMS to inside_sales: records are still limited to the agent's own leads.
  const override = { setting_key: 'role_permissions', setting_value: { inside_sales: ['crm.read.assigned', 'communications.sms.send'] } };
  f = await loadFunction('send-sms', { db: seed({ crm_settings: [...smsSettings, override] }), users });
  const other = await f.call({ token: 'tok-a', body: { leads: [{ id: LA }, { id: LB }], message: 'Γεια' } });
  assert.equal(other.status, 403);
  assert.equal(other.json.error, 'Not your record');
  assert.equal(f.outbound.filter((o) => o.url.includes('infobip')).length, 0, 'nothing sent when one lead is not theirs');
  const own = await f.call({ token: 'tok-a', body: { leads: [{ id: LA }], message: 'Γεια' } });
  assert.notEqual(own.status, 401);
  assert.notEqual(own.status, 403, 'own lead passes authorization (then the eligibility gate decides)');
  const office = await f.call({ token: 'tok-admin', body: { leads: [{ id: LB }], message: 'Γεια' } });
  assert.notEqual(office.status, 403, 'Back Office may message any lead');
  f.restore();
});

// ───────────────────────────── billing-ocr ─────────────────────────────
async function ocr(db, fetchHandler) {
  db.files = { 'hlektrismos_docs/contact-forms/a.pdf': '%PDF-1.4 a', 'hlektrismos_docs/contact-forms/b.pdf': '%PDF-1.4 b' };
  return loadFunction('billing-ocr', {
    db, users, env: { GEMINI_API_KEY: 'gemini-key-not-real' },
    fetchHandler: fetchHandler ?? (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"provider":"X"}' }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } })),
  });
}

test('billing-ocr: another agent\'s lead is refused before any file is read', async () => {
  const f = await ocr(seed());
  const r = await f.call({ token: 'tok-a', body: { lead_id: LB, bucket: 'hlektrismos_docs', path: 'contact-forms/b.pdf' } });
  assert.equal(r.status, 403);
  assert.equal(f.db.log.storage.length, 0);
  assert.equal(f.outbound.length, 0);
  f.restore();
});

test('billing-ocr: files only from this project\'s storage; SSRF targets and foreign paths are refused without fetching', async () => {
  const f = await ocr(seed());
  for (const file_url of ['http://169.254.169.254/latest/meta-data/', 'https://127.0.0.1/x.pdf', 'https://evil.example/bill.pdf',
    'file:///etc/passwd', `${SUPABASE_URL}/rest/v1/profiles`, `https://project.supabase.test.evil.example/storage/v1/object/x`]) {
    const r = await f.call({ token: 'tok-a', body: { lead_id: LA, file_url } });
    assert.equal(r.status, 400, file_url);
  }
  for (const [bucket, path, status] of [['hlektrismos_docs', '../secrets', 400], ['private-bucket', 'x.pdf', 400],
    ['hlektrismos_docs', 'contact-forms/b.pdf', 403], ['hlektrismos_docs', `leads/${LB}/id.jpg`, 403]]) {
    const r = await f.call({ token: 'tok-a', body: { lead_id: LA, bucket, path } });
    assert.equal(r.status, status, `${bucket}/${path}`);
  }
  assert.equal(f.outbound.length, 0, 'no outbound request at all');
  assert.equal(f.db.log.storage.length, 0, 'no foreign file read');
  f.restore();
});

test('billing-ocr: the agent\'s own bill and Back Office reads are processed', async () => {
  const f = await ocr(seed());
  const own = await f.call({ token: 'tok-a', body: { lead_id: LA, bucket: 'hlektrismos_docs', path: 'contact-forms/a.pdf' } });
  assert.notEqual(own.status, 403);
  assert.notEqual(own.status, 400);
  assert.deepEqual(f.db.log.storage.map((s) => s.path), ['contact-forms/a.pdf']);
  const office = await f.call({ token: 'tok-office', body: { lead_id: LB, bucket: 'hlektrismos_docs', path: 'contact-forms/b.pdf' } });
  assert.notEqual(office.status, 403);
  f.restore();
});

// ───────────────────────────── enrich-lead ─────────────────────────────
test('enrich-lead: another agent\'s lead is refused; private, metadata and redirect-to-internal websites are never fetched', async () => {
  const dns = { 'shop.example': ['93.184.216.34'], 'inner.example': ['10.0.0.8'], 'rebind.example': ['93.184.216.34', '127.0.0.1'] };
  const pages = {
    'https://shop.example/': new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }),
  };
  const f = await loadFunction('enrich-lead', { db: seed(), users, dns, fetchHandler: async (u) => pages[u] ?? new Response('<html></html>', { status: 200 }) });
  assert.equal((await f.call({ token: 'tok-a', body: { lead_id: LB, website: 'https://shop.example/' } })).status, 403);
  for (const website of ['http://127.0.0.1/', 'https://169.254.169.254/', 'https://inner.example/', 'https://rebind.example/', 'https://localhost/', 'https://[::1]/']) {
    const r = await f.call({ token: 'tok-a', body: { lead_id: LA, website } });
    assert.notEqual(r.status, 500, website);
  }
  const redirected = await f.call({ token: 'tok-a', body: { lead_id: LA, website: 'https://shop.example/' } });
  assert.notEqual(redirected.status, 500);
  const hosts = f.outbound.map((o) => new URL(o.url).hostname);
  assert.deepEqual([...new Set(hosts)], ['shop.example'], 'only the public host was contacted; the redirect target was not');
  f.restore();
});

test('service role: trusted internal callers keep working (cron / function-to-function)', async () => {
  const f = await sendEmail(seed());
  const r = await f.call({ token: SERVICE_KEY, body: { ...mail, legacy_lead_id: LB, transactional: true } });
  assert.equal(r.status, 200);
  assert.deepEqual(f.smtp[0].rcptTo, ['<lead.b@example.gr>']);
  f.restore();
});

// ───────────────────────────── orchestrator ─────────────────────────────
// Regression (found by deno check): supabase-js query builders are thenables WITHOUT .catch, so the
// streaming reply's "save memory" step must not call .catch on them; the reply must still arrive and the
// memory must carry the caller as owner (that is what scopes it to them later).
test('orchestrator (stream): the reply arrives and memory is saved under the caller as owner', async () => {
  const gemini = { candidates: [{ content: { parts: [{ text: 'Καλησπέρα, πώς μπορώ να βοηθήσω;' }] } }] };
  const f = await loadFunction('orchestrator', {
    db: createDb({ profiles: [{ id: A, role: 'inside_sales', is_active: true }], ai_agents: [], agent_memory: [], crm_settings: [] }),
    users, env: { GEMINI_API_KEY: 'test-key-not-real' },
    fetchHandler: (url) => {
      assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\//, `unexpected outbound call ${url}`);
      return new Response(JSON.stringify(gemini), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const r = await f.call({ token: 'tok-a', headers: { accept: 'text/event-stream' }, body: { message: 'Γεια' } });
  assert.equal(r.status, 200, typeof r.json === 'string' ? r.json.slice(0, 300) : JSON.stringify(r.json));
  assert.match(String(r.json), /"done":true/);
  await new Promise((done) => setTimeout(done, 10)); // the memory insert is fire-and-forget
  const mem = f.db.tables.agent_memory;
  assert.equal(mem.length, 2, 'user + assistant turns saved');
  assert.ok(mem.every((m) => m.metadata?.owner_user_id === A), 'memory is owned by the caller');
  f.restore();
});
