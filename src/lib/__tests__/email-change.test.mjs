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

/** A fake Auth server with one user. Only updateUser, resend and getUser exist: anything else throws, so a test fails if the feature reaches for it. */
function fakeAuth({ updateError = null, resendError = null, throws = false } = {}) {
  const user = { id: UID, email: OLD, new_email: null };
  const calls = [];
  const target = {
    async updateUser(attrs, opts) { calls.push(['updateUser', attrs, opts]); if (throws) throw new Error('network'); if (updateError) return { error: updateError }; user.new_email = attrs.email; return { data: {}, error: null }; },
    async resend(params) {
      calls.push(['resend', params]); if (throws) throw new Error('network'); if (resendError) return { error: resendError };
      if (params.email.toLowerCase() !== user.email.toLowerCase()) return { error: null, data: 'silently nothing: the server finds the account by its CURRENT address' };
      return { error: null, data: user.new_email ? 'sent' : 'nothing pending' };
    },
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
  assert.equal(await run({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), 'provider_limit', 'the project quota of the built-in sender');
  assert.equal(await run({ status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 59 seconds.' }), 'cooldown', 'this account asked too soon');
  assert.equal(await run({ status: 400, code: 'email_address_not_authorized', message: 'Email address not authorized' }), 'not_authorized');
  assert.equal(await run({ code: 'email_address_invalid', message: 'x' }), 'recipient_rejected', 'the Auth mailer refused a recipient: not a typo in the form');
  assert.equal(await run({ status: 400, message: 'Unable to validate email address: invalid format' }), 'invalid', 'a malformed typed address stays a form error');
  assert.equal(await run({ status: 500, message: 'boom' }), 'failed');
  assert.equal(await E.requestEmailChange(fakeAuth({ throws: true }).auth, OLD, NEW), 'failed', 'a network error is a failure, not an exception');
  for (const o of ['duplicate', 'rate_limited', 'cooldown', 'provider_limit', 'not_authorized', 'invalid', 'unchanged', 'failed']) assert.equal(E.EMAIL_CHANGE_TEXT[o].tone, 'err', o);
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
  await E.resendEmailChange(f.auth, OLD);
  assert.deepEqual(f.calls.map((c) => c[0]), ['updateUser', 'getUser', 'resend']);
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
  assert.match(card, /disabled=\{busy \|\| waiting \|\| \(plan !== 'resend' && !next\.trim\(\)\)\}/, 'loading state, the server-named wait, and an empty box');
});

// ───────────── the state machine: resend versus new versus replace, the two kinds of rate limit, and no duplicate requests ─────────────
test('resend: with a change pending, the mails are re-sent with the CURRENT address as the lookup and the production origin; no new request is made', async () => {
  const f = fakeAuth(); await E.startEmailChange(f.auth, OLD, NEW); f.calls.length = 0;
  const r = await E.resendEmailChange(f.auth, OLD);
  assert.deepEqual(r, { outcome: 'resent', retryAfter: null });
  assert.deepEqual(f.calls, [['resend', { type: 'email_change', email: OLD, options: { emailRedirectTo: 'https://hlektrismos-crm.vercel.app/' } }]]);
  assert.equal(f.user.new_email, NEW, 'the pending address is untouched');
  assert.equal(f.user.id, UID);
  assert.equal(E.EMAIL_CHANGE_TEXT.resent.tone, 'ok');
  assert.match(E.EMAIL_CHANGE_TEXT.resent.text, /και στις δύο διευθύνσεις/);
});

test('the plan: nothing pending starts a request; the same address (or an empty box) resends; a different address replaces, and only on purpose', () => {
  assert.equal(E.planEmailChange(null, NEW), 'new');
  assert.equal(E.planEmailChange(null, ''), 'new');
  assert.equal(E.planEmailChange(NEW, ''), 'resend');
  assert.equal(E.planEmailChange(NEW, '  '), 'resend');
  assert.equal(E.planEmailChange(NEW, NEW.toUpperCase()), 'resend', 'case does not matter');
  assert.equal(E.planEmailChange(NEW, 'other@example.test'), 'replace');
});

test('no duplicate request: with a change pending, the resend path never calls updateUser', async () => {
  const f = fakeAuth(); await E.startEmailChange(f.auth, OLD, NEW); f.calls.length = 0;
  for (let i = 0; i < 3; i++) await E.resendEmailChange(f.auth, OLD);
  assert.ok(f.calls.every((c) => c[0] === 'resend'), 'only resend');
});

test('the server-named wait is quoted exactly; when the server names none, none is invented', () => {
  const e = { status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 37 seconds.' };
  assert.equal(E.retryAfterSeconds(e), 37);
  assert.deepEqual(E.emailChangeMessage({ outcome: 'cooldown', retryAfter: 37 }), { tone: 'err', text: 'Ζητήσατε επιβεβαίωση πολύ πρόσφατα. Δοκιμάστε ξανά σε 37 δευτερόλεπτα.' });
  for (const m of ['email rate limit exceeded', 'something else', '', undefined]) assert.equal(E.retryAfterSeconds({ status: 429, message: m }), null, String(m));
  assert.equal(E.retryAfterSeconds({ message: 'after 99999 seconds' }), null, 'an absurd wait is not trusted');
  assert.equal(E.emailChangeMessage({ outcome: 'provider_limit', retryAfter: null }).text, E.EMAIL_CHANGE_TEXT.provider_limit.text);
  assert.ok(!/\d+ δευτερόλεπτα/.test(E.EMAIL_CHANGE_TEXT.provider_limit.text), 'no invented countdown for the project quota');
});

test('the project quota and a cooldown are different outcomes with different advice; both come back through a resend as well', async () => {
  const quota = { status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' };
  const cool = { status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 12 seconds.' };
  const a = await E.resendEmailChange(fakeAuth({ resendError: quota }).auth, OLD);
  const b = await E.resendEmailChange(fakeAuth({ resendError: cool }).auth, OLD);
  assert.deepEqual(a, { outcome: 'provider_limit', retryAfter: null });
  assert.deepEqual(b, { outcome: 'cooldown', retryAfter: 12 });
  assert.match(E.EMAIL_CHANGE_TEXT.provider_limit.text, /όριο αποστολής email/);
  assert.match(E.EMAIL_CHANGE_TEXT.provider_limit.text, /SMTP/);
  assert.equal((await E.resendEmailChange(fakeAuth({ throws: true }).auth, OLD)).outcome, 'failed');
});

test('production target: both calls ask for the CRM origin, and nothing in the feature can fall back to localhost or the current page', () => {
  const src = read('lib/email-change.ts') + read('components/app/CustomizePage.tsx');
  assert.equal(E.EMAIL_REDIRECT_TO, 'https://hlektrismos-crm.vercel.app/');
  assert.ok(!/localhost|127\.0\.0\.1|window\.location\.origin|location\.href/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'no localhost, no origin of the current page');
  assert.equal((src.match(/emailRedirectTo/g) || []).length >= 2, true);
});

test('the card: one request at a time, a button per state, a replace needs a second click, and the wait is the server\'s own', () => {
  const card = read('components/app/CustomizePage.tsx');
  assert.match(card, /!mayRequest\(lock, inFlight\.current, Date\.now\(\)\)/, 'every request goes through the one gate: nothing in flight and no lock running');
  assert.match(card, /plan === 'resend'[\s\S]{0,80}resendEmailChange\(supabase\.auth, activeEmail\)/, 'resend uses the active (current) address');
  assert.match(card, /plan === 'replace' && !confirmReplace/, 'replacing a pending request needs a second click');
  assert.match(card, /Επαναποστολή επιβεβαίωσης/);
  assert.match(card, /lock\?\.kind === 'server'/, 'a countdown is shown only for a wait the server named');
  assert.ok(!/setInterval\([^)]*(resend|startEmailChange|updateUser)/.test(card), 'no background resend loop');
});

test('a confirmed change keeps the same user: the id, the session and the role are not part of what the feature writes', async () => {
  const f = fakeAuth(); await E.startEmailChange(f.auth, OLD, NEW); f.confirm();
  const id = await E.readIdentity(f.auth);
  assert.equal(id.email, NEW); assert.equal(id.pendingEmail, null); assert.equal(id.id, UID);
  assert.ok(!/role|profiles|user_roles/.test(read('lib/email-change.ts').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'the module never touches roles or profiles');
});

// ───────────── Production evidence (Auth logs, 1 Nov): email_address_invalid on /resend, then six /resend 429s within four seconds ─────────────
const REJECT = { status: 400, code: 'email_address_invalid', message: 'Email address "qa.admin@hlektrismos.gr" is invalid' };

test('email_address_invalid is a refused RECIPIENT: not a typo in the form, not a rate limit, and the pending request is left alone', async () => {
  assert.equal(E.classifyEmailChangeError(REJECT), 'recipient_rejected');
  assert.equal(E.classifyEmailChangeError({ status: 400, code: 'validation_failed', message: 'Unable to validate email address: invalid format' }), 'invalid', 'a malformed typed address stays a form error');
  const f = fakeAuth({ resendError: REJECT }); f.user.new_email = NEW;
  const r = await E.resendEmailChange(f.auth, OLD);
  assert.deepEqual(r, { outcome: 'recipient_rejected', retryAfter: null, address: 'qa.admin@hlektrismos.gr' });
  const text = E.emailChangeMessage(r).text;
  assert.match(text, /qa\.admin@hlektrismos\.gr/); assert.match(text, /email_address_invalid/); assert.match(text, /δεν έστειλε κανένα email/);
  assert.ok(!/Συμπληρώστε μια έγκυρη/.test(text) && !/Πάρα πολλές προσπάθειες|εξαντληθεί/.test(text), 'neither the form-typo nor the rate-limit wording');
  assert.equal((await E.readIdentity(f.auth)).pendingEmail, NEW, 'the pending target survives the refusal');
  assert.deepEqual(f.calls.filter((c) => c[0] === 'resend').map((c) => c[1].email), [OLD], 'the account is looked up by the CURRENT address, as GoTrue resend does');
});

test('six clicks in four seconds after a 429 produce exactly one Auth request', async () => {
  const f = fakeAuth({ resendError: { status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' } });
  let lock = null, inFlight = false, t = 1_000_000;
  const click = async () => { // what the card's submit does, in order
    if (!E.mayRequest(lock, inFlight, t)) return 'blocked';
    inFlight = true; lock = { until: t + 60_000, kind: 'app' };
    const r = await E.resendEmailChange(f.auth, OLD); inFlight = false; lock = E.lockAfter(r, t); return r.outcome;
  };
  const seen = []; for (let i = 0; i < 6; i++) { seen.push(await click()); t += 700; }
  assert.deepEqual(seen, ['provider_limit', 'blocked', 'blocked', 'blocked', 'blocked', 'blocked']);
  assert.equal(f.calls.filter((c) => c[0] === 'resend').length, 1);
  t += 15 * 60_000; assert.equal(await click(), 'provider_limit', 'after the safeguard a single new attempt is allowed'); assert.equal(f.calls.filter((c) => c[0] === 'resend').length, 2);
});

test('concurrent clicks while one request is in flight are blocked; a refusal never retries by itself', async () => {
  assert.equal(E.mayRequest(null, true, 5), false);
  assert.equal(E.mayRequest({ until: 10, kind: 'app' }, false, 5), false);
  assert.equal(E.mayRequest({ until: 10, kind: 'app' }, false, 10), true);
  const f = fakeAuth({ resendError: REJECT }); await E.resendEmailChange(f.auth, OLD);
  assert.equal(f.calls.length, 1, 'one call, no hidden retry inside the library');
  const card = read('components/app/CustomizePage.tsx') + read('lib/email-change.ts');
  assert.ok(!/setTimeout\([^)]*(resend|startEmailChange|updateUser)|setInterval\([^)]*(resend|startEmailChange|updateUser)/.test(card), 'no timer that sends mail');
  assert.equal((read('components/app/CustomizePage.tsx').match(/resendEmailChange\(/g) || []).length, 1, 'a single call site for the re-send');
  assert.equal((read('components/app/CustomizePage.tsx').match(/startEmailChange\(/g) || []).length, 1, 'a single call site for a new request');
});

test('the lock: the server wait when it gave one, a labelled safeguard of our own otherwise, and none for a typo', () => {
  const now = 1_000;
  assert.deepEqual(E.lockAfter({ outcome: 'cooldown', retryAfter: 12 }, now), { until: now + 12_000, kind: 'server' });
  assert.deepEqual(E.lockAfter({ outcome: 'provider_limit', retryAfter: null }, now), { until: now + E.REFUSED_LOCK_MS, kind: 'app' });
  assert.deepEqual(E.lockAfter({ outcome: 'recipient_rejected', retryAfter: null }, now), { until: now + E.REFUSED_LOCK_MS, kind: 'app' });
  assert.deepEqual(E.lockAfter({ outcome: 'resent', retryAfter: null }, now), { until: now + E.SEND_FLOOR_MS, kind: 'app' });
  assert.equal(E.lockAfter({ outcome: 'invalid', retryAfter: null }, now).until, now, 'a typo never reached Auth: nothing to protect');
  const card = read('components/app/CustomizePage.tsx');
  assert.match(card, /Προστασία της εφαρμογής από επαναλαμβανόμενα αιτήματα \(δεν είναι χρόνος της υπηρεσίας email\)/, 'the safeguard says it is ours');
  const i = card.indexOf('writeLock(store, key, pendingLock, t0)'); const j = card.indexOf('await resendEmailChange') >= 0 ? card.indexOf('resendEmailChange(supabase.auth') : -1;
  assert.ok(i > 0 && j > i, 'the lock is taken before the request is sent');
});

test('the lock survives a reload, ignores junk and expired values, and never throws when storage is blocked', () => {
  const mem = new Map(); const kv = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const key = E.lockKey(' Office@Example.test '); assert.equal(key, E.lockKey('office@example.test'));
  E.writeLock(kv, key, { until: 5_000, kind: 'app' }, 1_000);
  assert.deepEqual(E.readLock(kv, key, 2_000), { until: 5_000, kind: 'app' });
  assert.equal(E.readLock(kv, key, 5_000), null, 'expired');
  kv.setItem(key, '{not json'); assert.equal(E.readLock(kv, key, 1), null);
  kv.setItem(key, JSON.stringify({ until: 9e15, kind: 'app' })); assert.equal(E.readLock(kv, key, 1), null, 'an absurd value cannot lock the Admin out for good');
  E.writeLock(kv, key, { until: 500, kind: 'app' }, 1_000); assert.equal(mem.has(key), false, 'an empty lock clears the entry');
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(E.readLock(blocked, key, 1), null); assert.doesNotThrow(() => E.writeLock(blocked, key, { until: 9, kind: 'app' }, 1)); assert.equal(E.readLock(null, key, 1), null);
});

test('a re-send warns first, because Auth issues new links and resets the confirmations already given', () => {
  const card = read('components/app/CustomizePage.tsx');
  assert.match(card, /plan === 'resend' && !confirmReplace[\s\S]{0,120}RESEND_WARNING/, 'a second click is needed to re-send');
  assert.match(E.RESEND_WARNING, /νέους συνδέσμους/); assert.match(E.RESEND_WARNING, /μηδενίζεται/);
  assert.match(card, /δεν δείχνει ποιο από τα δύο email έχει ήδη επιβεβαιωθεί/, 'the card does not pretend to know which mail was confirmed');
});
