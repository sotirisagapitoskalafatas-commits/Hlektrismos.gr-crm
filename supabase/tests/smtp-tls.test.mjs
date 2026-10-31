// Handler-level tests (real send-email / send-lead-confirmation / fetch-emails code over a fake server, LOCAL only): credentials and customer data are
// written only on an encrypted connection. Every "refused" case asserts what actually crossed the wire before TLS, not only the status code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunction, createDb } from './helpers/edge-harness.mjs';

const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const users = { 'tok-admin': ADMIN };
const PASS = 'smtp-password-not-real';
const env = { UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000' };
const db = (port) => createDb({
  profiles: [{ id: ADMIN, role: 'admin', is_active: true }],
  crm_settings: [{ setting_key: 'email_config', setting_value: { smtp_host: 'smtp.example.test', smtp_port: port, smtp_user: 'mailer@example.gr', smtp_password: PASS, from_email: 'info@hlektrismos.gr' } }],
  email_suppressions: [], contact_objections: [],
});
const mail = { token: 'tok-admin', body: { to: 'customer@example.gr', subject: 'Θέμα', text: 'Προσωπικό κείμενο πελάτη', transactional: true } };
const send = async (port, smtpMode) => {
  const f = await loadFunction('send-email', { db: db(port), users, env, smtpMode });
  const r = await f.call(mail);
  f.restore();
  return { r, session: f.smtp[0], log: f.db.rows('communication_log') };
};
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

test('STARTTLS: the password and the message cross the wire only after the upgrade', async () => {
  const { r, session } = await send(2525);
  assert.equal(r.status, 200);
  assert.deepEqual(session.plainCommands.map((c) => c.split(' ')[0]), ['EHLO', 'STARTTLS'], 'nothing else in plain text');
  assert.equal(session.commands.filter((c) => c.startsWith('EHLO')).length, 2, 'capabilities are read again over TLS');
  assert.match(session.data, /Content-Type: text\/plain/);
});

test('implicit TLS on 465 needs no upgrade', async () => {
  const { r, session } = await send(465);
  assert.equal(r.status, 200);
  assert.equal(session.plainCommands.length, 0);
  assert.ok(!session.commands.includes('STARTTLS'));
});

test('AUTH PLAIN is the RFC 4616 form (NUL user NUL password, UTF-8)', async () => {
  const { session } = await send(465);
  assert.ok(session.commands.includes(`AUTH PLAIN ${b64(`\0mailer@example.gr\0${PASS}`)}`), session.commands.join(' | '));
});

for (const [mode, why] of [
  ['no-starttls', 'the server does not advertise STARTTLS'], ['refuse-starttls', 'the server refuses STARTTLS'],
  ['upgrade-fails', 'the TLS handshake fails'], ['inject', 'data is smuggled in behind the 220'],
]) {
  test(`fails closed when ${why}: no password, no sender, no recipient, no body in plain text`, async () => {
    const { r, session, log } = await send(2525, mode);
    assert.equal(r.status, 502);
    assert.match(r.json.error, /Nothing was sent/);
    const wire = session.commands.join('\n');
    for (const leak of ['AUTH', 'MAIL', 'RCPT', 'DATA', b64(`\0mailer@example.gr\0${PASS}`)]) assert.ok(!wire.includes(leak), `${leak} must not be written`);
    assert.equal(session.data, null);
    assert.equal(log.at(-1).result, 'failed', 'the audit trail shows the failure');
  });
}

test('send-lead-confirmation: the same transport rule; a failed upgrade releases the claim and sends nothing', async () => {
  const now = new Date().toISOString();
  const lead = () => createDb({
    leads: [{ id: 'bbbbbbbb-0000-4000-8000-0000000000a1', email: 'new@example.gr', first_name: 'Νέος', source: 'website', created_at: now, ack_sent_at: null }],
    crm_settings: db(2525).rows('crm_settings'),
  });
  const body = { body: { email: 'new@example.gr', first_name: 'Νέος' } };
  const bad = await loadFunction('send-lead-confirmation', { db: lead(), smtpMode: 'no-starttls' });
  assert.equal((await bad.call(body)).status, 500);
  assert.equal(bad.smtp[0].data, null);
  assert.ok(!bad.smtp[0].commands.some((c) => /^(AUTH|MAIL|RCPT)/.test(c)));
  assert.equal(bad.db.rows('leads')[0].ack_sent_at, null, 'a genuine retry still works');
  bad.restore();
  const good = await loadFunction('send-lead-confirmation', { db: lead() });
  assert.equal((await good.call(body)).status, 200);
  assert.ok(good.smtp[0].data.includes('\r\n\r\n--'), 'a blank line separates the headers from the body');
  good.restore();
});

test('a soft-deleted website lead gets no confirmation', async () => {
  const now = new Date().toISOString();
  const database = createDb({
    leads: [{ id: 'bbbbbbbb-0000-4000-8000-0000000000a1', email: 'gone@example.gr', source: 'website', created_at: now, deleted_at: now }],
    crm_settings: db(465).rows('crm_settings'),
  });
  const f = await loadFunction('send-lead-confirmation', { db: database });
  assert.equal((await f.call({ body: { email: 'gone@example.gr' } })).json.skipped, 'no recent lead');
  assert.equal(f.smtp.length, 0);
  f.restore();
});

test('fetch-emails: IMAP refuses any port but implicit TLS, so LOGIN is never written in plain text', async () => {
  const database = createDb({
    profiles: [{ id: ADMIN, role: 'admin', is_active: true }],
    crm_settings: [{ setting_key: 'email_config', setting_value: { imap_host: 'imap.example.test', imap_port: 143, imap_user: 'u', imap_password: PASS } }],
  });
  const f = await loadFunction('fetch-emails', { db: database, users });
  const r = await f.call({ token: 'tok-admin', body: {} });
  assert.notEqual(r.status, 200);
  assert.equal(f.smtp.length, 0, 'no connection was opened');
  f.restore();
});

test('a recorded objection stops a staff email; a marketing objection does not stop a service message; unreadable objections stop it', async () => {
  const objection = (scope) => ({ address_kind: 'email', address_key: 'customer@example.gr', scope, channels: null, lifted_at: null });
  const run = async (rows, body = mail.body) => {
    const database = db(465); database.tables.contact_objections = rows;
    const f = await loadFunction('send-email', { db: database, users, env });
    const r = await f.call({ token: 'tok-admin', body });
    f.restore();
    return { status: r.status, sent: f.smtp.length };
  };
  assert.deepEqual(await run([objection('all')]), { status: 409, sent: 0 });
  assert.deepEqual(await run([objection('marketing')]), { status: 200, sent: 1 }, 'transactional');
  assert.deepEqual(await run([objection('marketing')], { ...mail.body, transactional: false }), { status: 409, sent: 0 }, 'commercial');
  const missing = db(465);
  Object.defineProperty(missing.tables, 'contact_objections', { get() { throw new Error('relation does not exist'); } });
  const f = await loadFunction('send-email', { db: missing, users, env });
  assert.equal((await f.call(mail)).status, 409, 'the table is missing: refused');
  assert.equal(f.smtp.length, 0);
  f.restore();
});
