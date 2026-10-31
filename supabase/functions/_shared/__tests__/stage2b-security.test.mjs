// Stage 2B: unit tests for the shared Edge Function security modules (plain Node; no network, no Deno).
//   access.ts       record-level authorization (office vs own records), capability combinations
//   safe-fetch.ts   SSRF: protocols, private/loopback/link-local/metadata, IPv6 forms, DNS answers,
//                   redirect-based SSRF, timeouts, response-size cap, allowlists
//   email-safety.ts header injection, recipient validation, sender identity, SMTP dot-stuffing
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../', import.meta.url));
const load = async (entry) => {
  const out = buildSync({ entryPoints: [dir + entry], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const A = await load('access.ts');
const F = await load('safe-fetch.ts');
const E = await load('email-safety.ts');

const AGENT_A = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const AGENT_B = 'aaaaaaaa-0000-4000-8000-0000000000c2';
const user = (id, role) => ({ kind: 'user', id, role, category: A.categoryOf(role, true) });
const admin = user('aaaaaaaa-0000-4000-8000-0000000000a1', 'admin');
const office = user('aaaaaaaa-0000-4000-8000-0000000000b1', 'back_office');
const manager = user('aaaaaaaa-0000-4000-8000-0000000000b2', 'manager');
const inside = user(AGENT_A, 'inside_sales');
const field = user(AGENT_A, 'field_sales');
const service = { kind: 'service' };
const leadOfA = { assigned_to_user_id: AGENT_A, created_by_user_id: AGENT_A };
const leadOfB = { assigned_to_user_id: AGENT_B, created_by_user_id: AGENT_B };
const caseOfA = { owner_id: AGENT_A, back_office_owner: null };
const caseOfB = { owner_id: AGENT_B, back_office_owner: AGENT_A };

// ───────────────────────────── access.ts ─────────────────────────────
test('categories: the two application groups; inactive or unknown roles get nothing', () => {
  assert.equal(A.categoryOf('admin', true), 'office');
  for (const r of ['manager', 'back_office']) assert.equal(A.categoryOf(r, true), null, `legacy ${r} is in no category`);
  for (const r of ['inside_sales', 'field_sales']) assert.equal(A.categoryOf(r, true), 'sales');
  assert.equal(A.categoryOf('inside_sales', false), null, 'inactive');
  assert.equal(A.categoryOf('superuser', true), null, 'unknown role');
  assert.equal(A.categoryOf(null, true), null);
});

test('legacy back_office and manager have no access to any record', () => {
  for (const c of [office, manager]) {
    assert.equal(A.canAccessLead(c, leadOfB), false);
    assert.equal(A.canAccessLead(c, leadOfA), false);
    assert.equal(A.canAccessCase(c, caseOfB), false);
    assert.equal(A.canAccessCustomer(c, { created_by: AGENT_B }), false);
    assert.equal(A.canAccessLegacyLead(c, { assigned_to: AGENT_B }), false);
    assert.equal(A.isOffice(c), false);
  }
});

test('the shared Admin / Back Office login (admin) may act on every record; the service role is trusted for records', () => {
  for (const c of [admin, service]) {
    assert.equal(A.canAccessLead(c, leadOfB), true);
    assert.equal(A.canAccessCase(c, caseOfB), true);
    assert.equal(A.canAccessCustomer(c, { created_by: AGENT_B }), true);
    assert.equal(A.canAccessLegacyLead(c, { assigned_to: AGENT_B }), true);
  }
});

test('a Sales Agent may act on their own records only (assignment, creation, case ownership, customer via own case)', () => {
  for (const c of [inside, field]) {
    assert.equal(A.canAccessLead(c, leadOfA), true);
    assert.equal(A.canAccessLead(c, { assigned_to_user_id: null, created_by_user_id: AGENT_A }), true, 'created by me');
    assert.equal(A.canAccessLead(c, leadOfB), false, 'other agent');
    assert.equal(A.canAccessLead(c, { assigned_to_user_id: null, created_by_user_id: null }), false, 'unassigned');
    assert.equal(A.canAccessCase(c, caseOfA), true);
    assert.equal(A.canAccessCase(c, { field_sales_owner: AGENT_A }), true);
    assert.equal(A.canAccessCase(c, caseOfB), false, 'back_office_owner does not make a sales user an owner');
    assert.equal(A.canAccessCustomer(c, { created_by: AGENT_B }, [caseOfA]), true, 'customer of my case');
    assert.equal(A.canAccessCustomer(c, { created_by: AGENT_B }, [caseOfB]), false);
    assert.equal(A.canAccessLegacyLead(c, { assigned_to: AGENT_A }), true);
    assert.equal(A.canAccessLegacyLead(c, { assigned_to: AGENT_B }), false);
    assert.equal(A.canAccessLead(c, null), false);
  }
});

test('decide(): 401 without caller, 403 without capability, 404 when missing, 403 for another agent, ok otherwise', () => {
  assert.equal(A.decide(null, null, leadOfA, A.canAccessLead).status, 401);
  const revoked = { ...field, overrides: { sales_agent: ['crm.read.assigned'] } };
  assert.deepEqual(A.decide(revoked, 'communications.email.send', leadOfA, A.canAccessLead), { ok: false, status: 403, error: 'Not permitted for your role' }, 'a revoked capability');
  assert.equal(A.decide(inside, 'communications.voice.initiate', leadOfA, A.canAccessLead).status, 403, 'voice is admin-only');
  assert.equal(A.decide(inside, 'communications.email.send', null, A.canAccessLead).status, 404);
  assert.deepEqual(A.decide(inside, 'communications.email.send', leadOfB, A.canAccessLead), { ok: false, status: 403, error: 'Not your record' });
  assert.deepEqual(A.decide(inside, 'communications.email.send', leadOfA, A.canAccessLead), { ok: true });
  assert.deepEqual(A.decide(admin, 'communications.voice.initiate', leadOfB, A.canAccessLead), { ok: true }, 'admin everything');
  assert.equal(A.decide(office, 'campaign.send', leadOfB, A.canAccessLead).status, 403, 'back_office cannot send campaigns');
  assert.equal(A.decide(office, 'case.documents.verify', caseOfB, A.canAccessCase).status, 403, 'legacy back_office can no longer verify documents');
  assert.equal(A.decide(manager, 'campaign.approve', leadOfB, A.canAccessLead).status, 403, 'legacy manager can no longer approve campaigns');
  assert.deepEqual(A.decide(admin, 'case.documents.verify', caseOfB, A.canAccessCase), { ok: true });
  assert.equal(A.decide(inside, 'case.documents.verify', caseOfA, A.canAccessCase).status, 403, 'sales cannot verify');
  assert.deepEqual(A.decide(service, 'campaign.send', leadOfB, A.canAccessLead), { ok: true });
  // admin-editable overrides can grant or remove a capability for non-admin roles, never lock out admin
  const fieldWithEmail = { ...field, overrides: { sales_agent: ['crm.read.assigned', 'case.update.sales', 'communications.email.send'] } };
  assert.deepEqual(A.decide(fieldWithEmail, 'communications.email.send', leadOfA, A.canAccessLead), { ok: true });
  assert.equal(A.decide(fieldWithEmail, 'communications.email.send', leadOfB, A.canAccessLead).status, 403, 'override never widens records');
});

// ───────────────────────────── safe-fetch.ts ─────────────────────────────
test('isBlockedAddress: private, loopback, link-local, metadata, CGNAT, multicast and IPv6 forms are refused', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', '2002:c0a8:0101::1', '2001:db8::1', 'not-an-ip']) {
    assert.equal(F.isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(F.isBlockedAddress(ip), false, ip);
  }
});

test('checkUrl: https only, no credentials, no local names, no odd ports, numeric/hex IP forms and allowlists', () => {
  const bad = {
    'http://example.com': 'bad_protocol', 'file:///etc/passwd': 'bad_protocol', 'gopher://x': 'bad_protocol', 'ftp://x.gr/a': 'bad_protocol',
    'https://user:pw@example.com': 'credentials', 'https://localhost/x': 'blocked_host', 'https://db.internal/': 'blocked_host',
    'https://example.com:8443/': 'blocked_port', 'https://127.0.0.1/': 'blocked_address', 'https://[::1]/': 'blocked_address',
    'https://2130706433/': 'blocked_address', 'https://0x7f000001/': 'blocked_address', 'https://169.254.169.254/latest/meta-data': 'blocked_address',
    'not a url': 'bad_url',
  };
  for (const [u, code] of Object.entries(bad)) {
    assert.throws(() => F.checkUrl(u), (e) => e.code === code, `${u} -> ${code}`);
  }
  assert.equal(F.checkUrl('https://example.com/a?b=1').hostname, 'example.com');
  assert.equal(F.checkUrl('http://example.com', { allowHttp: true }).protocol, 'http:');
  assert.throws(() => F.checkUrl('https://evil.gr', { allowHosts: ['dei.gr'] }), (e) => e.code === 'host_not_allowed');
  assert.throws(() => F.checkUrl('https://dei.gr.evil.gr', { allowHosts: ['dei.gr'] }), (e) => e.code === 'host_not_allowed');
  assert.equal(F.checkUrl('https://www.dei.gr/x', { allowHosts: ['dei.gr'] }).hostname, 'www.dei.gr');
});

const page = (body = 'ok', init = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' }, ...init });
const redirect = (to) => new Response(null, { status: 302, headers: { location: to } });
const dns = (map) => async (h) => { if (!(h in map)) throw new Error('NXDOMAIN'); return map[h]; };

test('safeFetch: a public host is fetched; a host resolving to a private or metadata address is refused before connecting', async () => {
  let connects = 0;
  const fetchImpl = async () => { connects++; return page('hello'); };
  const r = await F.safeFetch('https://public.example/', { resolve: dns({ 'public.example': ['93.184.216.34'] }), fetchImpl });
  assert.equal(r.text(), 'hello');
  for (const addrs of [['10.0.0.5'], ['169.254.169.254'], ['93.184.216.34', '127.0.0.1'], ['::1']]) {
    await assert.rejects(F.safeFetch('https://rebind.example/', { resolve: dns({ 'rebind.example': addrs }), fetchImpl }), (e) => e.code === 'blocked_address', String(addrs));
  }
  await assert.rejects(F.safeFetch('https://nx.example/', { resolve: dns({}), fetchImpl }), (e) => e.code === 'dns_failed');
  assert.equal(connects, 1, 'no connection was made for refused hosts');
});

test('safeFetch: redirect-based SSRF is refused at every hop; redirect limit enforced', async () => {
  const resolve = dns({ 'public.example': ['93.184.216.34'], 'second.example': ['93.184.216.35'], 'inner.example': ['192.168.0.10'] });
  const chain = { 'https://public.example/': redirect('https://second.example/'), 'https://second.example/': page('final') };
  const ok = await F.safeFetch('https://public.example/', { resolve, fetchImpl: async (u) => chain[u] });
  assert.equal(ok.text(), 'final');
  assert.equal(ok.url, 'https://second.example/');
  for (const target of ['http://169.254.169.254/latest/meta-data', 'https://127.0.0.1/', 'https://inner.example/', 'file:///etc/passwd', '//localhost/x']) {
    await assert.rejects(F.safeFetch('https://public.example/', { resolve, fetchImpl: async () => redirect(target) }), (e) => e instanceof F.SafeFetchError, target);
  }
  let n = 0;
  await assert.rejects(F.safeFetch('https://public.example/', { resolve, maxRedirects: 2, fetchImpl: async () => redirect(`https://public.example/${++n}`) }), (e) => e.code === 'too_many_redirects');
});

test('safeFetch: response-size cap (declared and streamed) and timeout', async () => {
  const resolve = dns({ 'public.example': ['93.184.216.34'] });
  await assert.rejects(F.safeFetch('https://public.example/', { resolve, maxBytes: 10, fetchImpl: async () => page('x'.repeat(11)) }), (e) => e.code === 'too_large');
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 5; i++) c.enqueue(new Uint8Array(8)); c.close(); } });
  await assert.rejects(F.safeFetch('https://public.example/', { resolve, maxBytes: 16, fetchImpl: async () => new Response(stream) }), (e) => e.code === 'too_large');
  const slow = (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'TimeoutError' }))));
  await assert.rejects(F.safeFetch('https://public.example/', { resolve, timeoutMs: 50, fetchImpl: slow }), (e) => e.code === 'timeout');
});

// ───────────────────────────── email-safety.ts ─────────────────────────────
test('header injection: CR/LF and control characters are refused in every header value', () => {
  for (const v of ['Hi\r\nBcc: victim@x.gr', 'Hi\nBcc: a@b.gr', 'Hi\rX', 'tab\tnot ok', 'nul\u0000']) {
    assert.throws(() => E.assertHeaderSafe(v, 'Subject'), (e) => e.code === 'header_injection', JSON.stringify(v));
    assert.throws(() => E.buildHeaders({ from: 'info@hlektrismos.gr', to: 'c@example.gr', subject: v }), (e) => e instanceof E.EmailSafetyError);
  }
  assert.equal(E.assertHeaderSafe('Προσφορά ρεύματος — 15% έκπτωση'), 'Προσφορά ρεύματος — 15% έκπτωση');
});

test('recipients: one valid address only; lists, display-name tricks and injection are refused', () => {
  assert.equal(E.parseRecipient(' Customer@Example.GR '), 'customer@example.gr');
  for (const v of ['a@b.gr, c@d.gr', 'a@b.gr;c@d.gr', 'Name <a@b.gr>', 'a@b.gr\r\nBcc: c@d.gr', 'a@localhost', 'a@b', '@b.gr', 'a@@b.gr', 'a b@c.gr', '', null, 42]) {
    assert.throws(() => E.parseRecipient(v), (e) => e instanceof E.EmailSafetyError, String(v));
  }
});

test('sender identity: From is the configured address; display names are sanitised; reserved headers cannot be added', () => {
  const h = E.buildHeaders({ from: 'info@hlektrismos.gr', fromName: 'Evil" <attacker@x.gr>\r\nBcc: v@x.gr', to: 'c@example.gr', subject: 'Offer' });
  assert.match(h, /^From: Evil attacker@x\.gr Bcc: v@x\.gr <info@hlektrismos\.gr>\r\nTo: <c@example\.gr>\r\nSubject: Offer$/);
  assert.equal(h.split('\r\n').length, 3, 'no injected header lines');
  assert.throws(() => E.buildHeaders({ from: 'info@hlektrismos.gr', to: 'c@example.gr', subject: 'x', extra: { Bcc: 'v@x.gr' } }), (e) => e.code === 'bad_header');
  assert.throws(() => E.buildHeaders({ from: 'info@hlektrismos.gr', to: 'c@example.gr', subject: 'x', extra: { 'X-Ok': 'a\r\nBcc: v@x.gr' } }), (e) => e.code === 'header_injection');
  assert.match(E.buildHeaders({ from: 'info@hlektrismos.gr', to: 'c@example.gr', subject: 'Γεια' }), /Subject: =\?UTF-8\?B\?/);
});

test('raw SMTP body: CRLF line endings and dot-stuffing stop an early end of DATA', () => {
  assert.equal(E.smtpDataBody('a\n.\nMAIL FROM:<x@y.gr>\n..b'), 'a\r\n..\r\nMAIL FROM:<x@y.gr>\r\n...b');
});
