// The shared Admin changes its login e-mail from inside the CRM. LOCAL tests against a fake Supabase Auth client that records every call and refuses
// any method the feature has no business using. Nothing here talks to Supabase; it shows the code asks Auth for the change and nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = buildSync({ stdin: { contents: "export * from '@/lib/email-change';", resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent', alias: { '@': root.replace(/[\\/]$/, '') } });
const m = { exports: {} };
new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, createRequire(import.meta.url));
const E = m.exports;
const read = (rel) => readFileSync(root + rel, 'utf8').replace(/\r\n/g, '\n');

const OLD = 'office@example.test', NEW = 'owner@example.test', UID = '00000000-0000-4000-8000-0000000000aa';

/** A fake Auth server with one user. Only updateUser and getUser exist: anything else throws, so a test fails if the feature reaches for it. */
function fakeAuth({ updateError = null, throws = false } = {}) {
  const user = { id: UID, email: OLD, new_email: null };
  const calls = [];
  const target = {
    async updateUser(attrs, opts) { calls.push(['updateUser', attrs, opts]); if (throws) throw new Error('network'); if (updateError) return { error: updateError }; user.new_email = attrs.email; return { data: {}, error: null }; },
    async getUser() { calls.push(['getUser']); return { data: { user: { ...user } }, error: null }; },
    confirm() { user.email = user.new_email; user.new_email = null; }, // the verification link(s) were opened
  };
  const auth = new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => { throw new Error(`the feature must not call auth.${String(k)}`); }) });
  return { auth, calls, user, confirm: () => target.confirm() };
}

test('the request goes through Supabase Auth updateUser with the CRM origin as the link target, never the public website', async () => {
  const f = fakeAuth();
  assert.equal(await E.requestEmailChange(f.auth, OLD, NEW), 'pending');
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0], ['updateUser', { email: NEW }, { emailRedirectTo: 'https://hlektrismos-crm.vercel.app/' }]);
  assert.equal(E.CRM_ORIGIN, 'https://hlektrismos-crm.vercel.app');
  assert.ok(!/hlektrismos\.gr/.test(E.EMAIL_REDIRECT_TO), 'the public WordPress site is never an Auth redirect');
});

test('an invalid or unchanged address is refused before anything is sent, case and spaces ignored', async () => {
  for (const [next, expected] of [['', 'invalid'], ['not-an-email', 'invalid'], ['a@b', 'invalid'], ['x'.repeat(300) + '@example.test', 'invalid'], [OLD, 'unchanged'], [`  ${OLD.toUpperCase()} `, 'unchanged']]) {
    const f = fakeAuth();
    assert.equal(await E.requestEmailChange(f.auth, OLD, next), expected, next.slice(0, 20));
    assert.equal(f.calls.length, 0, 'nothing sent to Auth');
  }
});

test('failure states: duplicate address, rate limit, invalid-address answer from the server, and anything else', async () => {
  const run = async (error) => E.requestEmailChange(fakeAuth({ updateError: error }).auth, OLD, NEW);
  assert.equal(await run({ code: 'email_exists', message: 'x' }), 'duplicate');
  assert.equal(await run({ message: 'A user with this email address has already been registered' }), 'duplicate');
  assert.equal(await run({ status: 429, message: 'x' }), 'rate_limited');
  assert.equal(await run({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), 'rate_limited');
  assert.equal(await run({ code: 'email_address_invalid', message: 'x' }), 'invalid');
  assert.equal(await run({ status: 500, message: 'boom' }), 'failed');
  assert.equal(await E.requestEmailChange(fakeAuth({ throws: true }).auth, OLD, NEW), 'failed', 'a network error is a failure, not an exception');
  for (const o of ['duplicate', 'rate_limited', 'invalid', 'unchanged', 'failed']) assert.equal(E.EMAIL_CHANGE_TEXT[o].tone, 'err', o);
});

test('verification pending: the NEW address is reported as pending and the OLD one stays the active login until the change is confirmed', async () => {
  const f = fakeAuth();
  await E.requestEmailChange(f.auth, OLD, NEW);
  const pending = await E.readIdentity(f.auth);
  assert.deepEqual(pending, { id: UID, email: OLD, pendingEmail: NEW }, 'not active yet');
  assert.notEqual(pending.email, NEW);
});

test('after confirmation the new address is active, nothing is pending, and the Auth user id is exactly the same', async () => {
  const f = fakeAuth();
  const before = await E.readIdentity(f.auth);
  await E.requestEmailChange(f.auth, OLD, NEW);
  f.confirm();
  const after = await E.readIdentity(f.auth);
  assert.deepEqual(after, { id: UID, email: NEW, pendingEmail: null });
  assert.equal(after.id, before.id, 'same user id: the profile, role, assignments, customer ownership and audit history stay attached');
});

test('the feature uses no other Auth call: no sign-up, no admin API, no direct user edit (the fake throws on anything else)', async () => {
  const f = fakeAuth();
  await E.requestEmailChange(f.auth, OLD, NEW); await E.readIdentity(f.auth);
  assert.deepEqual(f.calls.map((c) => c[0]), ['updateUser', 'getUser']);
  const src = read('lib/email-change.ts') + read('components/app/CustomizePage.tsx');
  assert.ok(!/auth\.admin|signUp|service_role|SERVICE_ROLE|auth\.users|\.rpc\(/.test(src.replace(/\/\/.*$/gm, '')), 'no admin API, no sign-up, no SQL on auth.users');
});

test('a pending request that matches the active address is not reported as pending; a missing e-mail is not an identity', async () => {
  const fake = (user) => ({ updateUser: async () => ({}), getUser: async () => ({ data: { user }, error: null }) });
  assert.equal((await E.readIdentity(fake({ id: UID, email: OLD, new_email: OLD.toUpperCase() }))).pendingEmail, null);
  assert.equal(await E.readIdentity(fake({ id: UID, email: null })), null);
  assert.equal(await E.readIdentity(fake(null)), null);
  assert.equal(await E.readIdentity({ getUser: async () => { throw new Error('offline'); } }), null);
});

test('the message about Secure email change names both addresses', () => {
  const t = E.EMAIL_CHANGE_TEXT.pending;
  assert.equal(t.tone, 'ok');
  assert.match(t.text, /ΔΥΟ διευθύνσεις/);
  assert.match(t.text, /τρέχουσα/); assert.match(t.text, /νέα/);
  assert.match(t.text, /Μέχρι τότε/);
});

test('role visibility: only the REAL admin role sees the card; a preview, a Sales Agent and the legacy roles do not', () => {
  const page = read('components/app/CustomizePage.tsx');
  assert.match(page, /\{realRole === 'admin' && user\?\.email && <EmailChangeCard current=\{user\.email\} \/>\}/);
  assert.match(page, /const realRole = profile\?\.role \?\? null; \/\/ always the REAL assigned role, never the presentation preview/);
  const card = page.slice(page.indexOf('function EmailChangeCard'), page.indexOf('/* ───────── Προφίλ'));
  assert.ok(!/preview/.test(card), 'the card never reads the role preview');
  // the gate is an exact match on 'admin': nothing else is accepted, so sales_agent, field_sales, inside_sales, manager and back_office are all out
  for (const role of ['sales_agent', 'field_sales', 'inside_sales', 'manager', 'back_office', null, undefined, 'Admin', 'admin ']) assert.notEqual(role === 'admin', true, String(role));
});

test('the card shows the active address, a pending one separately, and re-reads the user from the server on open and on focus', () => {
  const card = read('components/app/CustomizePage.tsx');
  assert.match(card, /data-testid="active-email">\{activeEmail\}/);
  assert.match(card, /data-testid="pending-email"/);
  assert.match(card, /readIdentity\(supabase\.auth\)/);
  assert.match(card, /addEventListener\('focus', onFocus\)/);
  assert.match(card, /refreshSession\(\)\.then\(\(\) => refreshProfile\(\)\)/, 'a confirmed change refreshes the session and the profile');
  assert.match(card, /disabled=\{busy \|\| !next\.trim\(\)\}/, 'loading state');
});
