// A signed-in user changes their OWN password. LOCAL tests: a fake Auth client for the logic, and the REAL installed @supabase/auth-js talking to a mock
// HTTP server for the contract (field names, error codes). Nothing here talks to Supabase and no password is real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GoTrueClient } from '@supabase/auth-js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = buildSync({ stdin: { contents: "export * from '@/lib/password-change';", resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent', alias: { '@': root.replace(/[\\/]$/, '') } });
const m = { exports: {} };
new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, createRequire(import.meta.url));
const P = m.exports;
const repo = fileURLToPath(new URL('../../../', import.meta.url)); // the repository root (`root` above is src/)
const read = (rel) => readFileSync(root + rel, 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const CUR = 'Current-pass-1234', NEW = 'Brand-new-pass-5678';
const ADMIN = { id: '00000000-0000-4000-8000-0000000000aa', role: 'admin', email: 'office@example.test' };
const AGENT = { id: '00000000-0000-4000-8000-0000000000bb', role: 'sales_agent', email: 'agent@example.test' };

/** A fake Auth server for one user. Only updateUser and reauthenticate exist: anything else throws. */
function fakeAuth(user, { password = CUR, requireCurrent = true, requireReauth = false, nonce = '123456', failWith = null, throws = false } = {}) {
  const calls = []; const state = { password, nonceIssued: false, user: { ...user } };
  const target = {
    async updateUser(attrs) {
      calls.push(['updateUser', { ...attrs }]);
      if (throws) throw new Error('network');
      if (failWith) return { error: failWith };
      if (requireReauth && attrs.nonce !== nonce) return { error: { code: attrs.nonce ? 'reauthentication_not_valid' : 'reauthentication_needed', status: 400, message: 'x' } };
      if (requireCurrent) {
        if (!attrs.current_password) return { error: { code: 'current_password_required', status: 400, message: 'x' } };
        if (attrs.current_password !== state.password) return { error: { code: 'current_password_invalid', status: 400, message: 'x' } };
      }
      if (attrs.password === state.password) return { error: { code: 'same_password', status: 422, message: 'x' } };
      if (attrs.password.length < 10) return { error: { code: 'weak_password', status: 422, name: 'AuthWeakPasswordError', reasons: ['length'], message: 'x' } };
      state.password = attrs.password; return { data: { user: state.user }, error: null };
    },
    async reauthenticate() { calls.push(['reauthenticate']); state.nonceIssued = true; return { data: {}, error: null }; },
  };
  const auth = new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => { throw new Error(`the feature must not call auth.${String(k)}`); }) });
  return { auth, calls, state };
}

/* ───────── the contract with the installed SDK ───────── */
test('the installed auth-js (>= 2.98.0) types and sends `current_password` exactly like this', async () => {
  const pkg = JSON.parse(readFileSync(repo + 'node_modules/@supabase/auth-js/package.json', 'utf8'));
  const [maj, min] = pkg.version.split('.').map(Number);
  assert.ok(maj === 2 && min >= 102, `auth-js ${pkg.version} must be 2.102.0 or later: the release the official password guide documents (the typing itself exists from 2.98.0)`);
  const types = readFileSync(repo + 'node_modules/@supabase/auth-js/dist/main/lib/types.d.ts', 'utf8');
  assert.match(types, /current_password\?: string;/, 'snake_case, as typed by the SDK');
  assert.ok(!/currentPassword/.test(types), 'there is no camelCase variant to use');
  assert.match(types, /nonce\?: string;/, 'the reauthentication nonce is a typed attribute too');
  const sdk = JSON.parse(readFileSync(repo + 'node_modules/@supabase/supabase-js/package.json', 'utf8'));
  assert.equal(sdk.dependencies['@supabase/auth-js'], pkg.version, 'supabase-js and auth-js resolve to the same release');
  const wanted = JSON.parse(readFileSync(repo + 'package.json', 'utf8')).dependencies['@supabase/supabase-js'].replace('^', '').split('.').map(Number);
  assert.ok(wanted[0] === 2 && wanted[1] >= 102, 'package.json asks for at least 2.102.0, the documented minimum');
});

function realClient(reply) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ADMIN.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: '11111111-1111-4111-8111-111111111111' })}.sig`;
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url: String(url), method, body: init.body ? JSON.parse(init.body) : null });
    if (method === 'GET') return new Response(JSON.stringify({ id: ADMIN.id, aud: 'authenticated', email: ADMIN.email }), { status: 200, headers: { 'content-type': 'application/json' } });
    const r = reply(calls); return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
  const client = new GoTrueClient({ url: 'https://x.test/auth/v1', headers: { apikey: 'anon' }, fetch: fetchMock, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `t-${Math.random()}` });
  return { client, calls, ready: client.setSession({ access_token: jwt, refresh_token: 'r' }) };
}

test('through the real SDK: PUT /user carries password + current_password (+ nonce) and nothing else', async () => {
  const r = realClient(() => ({ status: 200, body: { id: ADMIN.id, aud: 'authenticated', email: ADMIN.email } }));
  await r.ready;
  assert.deepEqual(await P.changePassword(r.client, { current: CUR, next: NEW }), { outcome: 'changed' });
  const put = r.calls.filter((c) => c.method === 'PUT');
  assert.equal(put.length, 1, 'exactly one request');
  assert.ok(put[0].url.endsWith('/auth/v1/user'));
  // the SDK itself adds two PKCE fields (null here); everything else in the body is ours
  const { code_challenge, code_challenge_method, ...ours } = put[0].body;
  assert.deepEqual([code_challenge, code_challenge_method], [null, null]);
  assert.deepEqual(Object.keys(ours).sort(), ['current_password', 'password']);
  assert.equal(put[0].body.current_password, CUR); assert.equal(put[0].body.password, NEW);
  const r2 = realClient(() => ({ status: 200, body: { id: ADMIN.id, aud: 'authenticated' } })); await r2.ready;
  await P.changePassword(r2.client, { current: CUR, next: NEW, nonce: ' 123456 ' });
  assert.equal(r2.calls.filter((c) => c.method === 'PUT')[0].body.nonce, '123456', 'the nonce answers a reauthentication');
});

test('through the real SDK: the server codes become the right outcome', async () => {
  const run = async (status, body) => { const r = realClient(() => ({ status, body })); await r.ready; return P.changePassword(r.client, { current: CUR, next: NEW }); };
  assert.equal((await run(400, { code: 400, error_code: 'current_password_invalid', msg: 'Current password required when setting new password.' })).outcome, 'current_wrong');
  assert.equal((await run(400, { code: 400, error_code: 'current_password_required', msg: 'x' })).outcome, 'current_required');
  assert.equal((await run(422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' })).outcome, 'same');
  assert.equal((await run(400, { code: 400, error_code: 'reauthentication_needed', msg: 'Password update requires reauthentication' })).outcome, 'reauth_needed');
  assert.equal((await run(400, { code: 400, error_code: 'reauthentication_not_valid', msg: 'x' })).outcome, 'reauth_invalid');
  assert.equal((await run(401, { code: 401, error_code: 'insufficient_aal', msg: 'AAL2 session is required' })).outcome, 'mfa_required');
  assert.equal((await run(403, { code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' })).outcome, 'session');
  assert.equal((await run(429, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' })).outcome, 'rate_limited');
  const weak = await run(422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 12 characters.', weak_password: { reasons: ['length', 'pwned'] } });
  assert.equal(weak.outcome, 'weak'); assert.deepEqual(weak.reasons, ['length', 'pwned']);
  assert.match(P.passwordChangeMessage(weak).text, /σύντομος[\s\S]*διαρροές/, 'the reasons are explained in Greek');
});

/* ───────── behaviour with a fake Auth ───────── */
test('an Admin / Back Office user and a Sales Agent each change their own password, and only the password', async () => {
  for (const who of [ADMIN, AGENT]) {
    const f = fakeAuth(who);
    assert.deepEqual(await P.changePassword(f.auth, { current: CUR, next: NEW }), { outcome: 'changed' }, who.role);
    assert.equal(f.state.password, NEW);
    assert.deepEqual(f.state.user, who, 'identity, e-mail and role are untouched');
    assert.deepEqual(Object.keys(f.calls[0][1]).sort(), ['current_password', 'password']);
    assert.equal(f.calls.length, 1);
  }
});

test('a wrong current password is rejected by Auth and nothing changes', async () => {
  const f = fakeAuth(ADMIN); const r = await P.changePassword(f.auth, { current: 'not-the-password', next: NEW });
  assert.equal(r.outcome, 'current_wrong'); assert.equal(f.state.password, CUR);
  assert.equal(P.passwordChangeMessage(r).tone, 'err');
  assert.equal((await P.changePassword(f.auth, { current: '', next: NEW })).outcome, 'current_required');
  assert.equal(f.calls.length, 1, 'an empty current password never reaches Auth');
});

test('mismatch, weak and same-as-current are caught before anything is sent, and Auth has the last word', async () => {
  assert.equal(P.canSubmitPassword(CUR, NEW, 'Different-pass-9999'), false, 'mismatch');
  assert.equal(P.canSubmitPassword(CUR, 'short1', 'short1'), false, 'too short');
  assert.equal(P.canSubmitPassword(CUR, 'onlyletterslongenough', 'onlyletterslongenough'), false, 'letters and numbers needed');
  assert.equal(P.canSubmitPassword(CUR, CUR, CUR), false, 'same as current');
  assert.equal(P.canSubmitPassword('', NEW, NEW), false, 'current password empty');
  assert.equal(P.canSubmitPassword(CUR, NEW, NEW), true);
  const reqs = P.passwordRequirements(CUR, NEW, NEW); assert.deepEqual(reqs.map((r) => r.id), ['length', 'mix', 'differs', 'match']); assert.ok(reqs.every((r) => r.met));
  const f = fakeAuth(ADMIN); assert.equal((await P.changePassword(f.auth, { current: CUR, next: CUR })).outcome, 'same'); assert.equal(f.calls.length, 0, 'identical passwords are not even sent');
  const g = fakeAuth(ADMIN); assert.equal((await P.changePassword(g.auth, { current: CUR, next: 'short1A' })).outcome, 'weak', 'Auth rejects a weak one');
});

test('an expired session is explained, and nothing is retried', async () => {
  const f = fakeAuth(ADMIN, { failWith: { code: 'session_not_found', status: 403, message: 'x' } });
  const r = await P.changePassword(f.auth, { current: CUR, next: NEW });
  assert.equal(r.outcome, 'session'); assert.match(P.passwordChangeMessage(r).text, /Συνδεθείτε ξανά/); assert.equal(f.calls.length, 1);
  assert.equal((await P.changePassword(fakeAuth(ADMIN, { failWith: { name: 'AuthSessionMissingError', message: 'x' } }).auth, { current: CUR, next: NEW })).outcome, 'session');
});

test('a reauthentication is answered with the supported flow: reauthenticate() once, then the nonce goes with the same update', async () => {
  const f = fakeAuth(ADMIN, { requireReauth: true });
  const first = await P.changePassword(f.auth, { current: CUR, next: NEW });
  assert.equal(first.outcome, 'reauth_needed'); assert.equal(f.state.password, CUR);
  assert.equal(await P.requestReauthCode(f.auth), 'sent'); assert.equal(f.state.nonceIssued, true);
  assert.equal((await P.changePassword(f.auth, { current: CUR, next: NEW, nonce: 'wrong' })).outcome, 'reauth_invalid');
  const done = await P.changePassword(f.auth, { current: CUR, next: NEW, nonce: '123456' });
  assert.equal(done.outcome, 'changed'); assert.equal(f.state.password, NEW);
  assert.equal(f.calls.filter((c) => c[0] === 'reauthenticate').length, 1, 'one e-mail only');
  const last = f.calls.at(-1)[1]; assert.equal(last.nonce, '123456'); assert.equal(last.current_password, CUR);
  assert.equal(await P.requestReauthCode(fakeAuth(ADMIN, { failWith: null, throws: false }).auth), 'sent');
});

test('rate limits and network failures never claim success and never retry', async () => {
  const rl = fakeAuth(ADMIN, { failWith: { code: 'over_request_rate_limit', status: 429, message: 'x' } });
  assert.equal((await P.changePassword(rl.auth, { current: CUR, next: NEW })).outcome, 'rate_limited');
  assert.ok(!/\d+ δευτερόλεπτα/.test(P.PASSWORD_CHANGE_TEXT.rate_limited.text), 'no invented countdown');
  const net = fakeAuth(ADMIN, { throws: true }); const r = await P.changePassword(net.auth, { current: CUR, next: NEW });
  assert.equal(r.outcome, 'network'); assert.equal(net.calls.length, 1); assert.match(P.passwordChangeMessage(r).text, /ίσως άλλαξε ήδη/, 'the lost-answer case is honest');
  assert.equal((await P.changePassword(fakeAuth(ADMIN, { failWith: { name: 'AuthRetryableFetchError', status: 0, message: 'x' } }).auth, { current: CUR, next: NEW })).outcome, 'network');
  assert.equal((await P.requestReauthCode(fakeAuth(ADMIN).auth)), 'sent');
  assert.equal(P.PASSWORD_CHANGE_TEXT.changed.tone, 'ok'); for (const k of Object.keys(P.PASSWORD_CHANGE_TEXT)) if (k !== 'changed') assert.equal(P.PASSWORD_CHANGE_TEXT[k].tone, 'err', k);
});

test('repeated submissions: one request at a time, a lock after each attempt, and a single call site', () => {
  assert.equal(P.maySubmit(true, 0, 10), false, 'in flight'); assert.equal(P.maySubmit(false, 100, 99), false, 'locked'); assert.equal(P.maySubmit(false, 100, 100), true);
  assert.ok(P.lockMsAfter('rate_limited') >= 60_000); assert.ok(P.lockMsAfter('current_wrong') >= 1_000);
  assert.equal(P.lockMsAfter('reauth_needed'), 0, 'asking for a reauthentication is not a failed guess');
  assert.ok(P.lockMsAfter('reauth_invalid') >= 1_000, 'a wrong code is a guess');
  const card = read('components/app/PasswordChangeCard.tsx');
  assert.match(card, /!maySubmit\(inFlight\.current, save\.until\.current, Date\.now\(\)\)/, 'the save goes through the gate');
  assert.match(card, /!maySubmit\(inFlight\.current, code\.until\.current, Date\.now\(\)\)/, 'so does the code request, with its OWN lock (the minute after a code must not block entering it)');
  assert.equal((card.match(/changePassword\(/g) || []).length, 1, 'one call site for the change');
  assert.equal((card.match(/requestReauthCode\(/g) || []).length, 1, 'one call site for the code');
  assert.match(card, /disabled=\{!ready \|\| busy \|\| save\.locked\}/, 'the button is off while busy or locked');
  assert.match(card, /disabled=\{busy \|\| code\.locked\}/, 'and so is the code button');
  assert.ok(!/save\.lockFor\(60_000\)/.test(card), 'asking for a code never locks the save');
  assert.ok(!/setInterval|setTimeout\([^)]*(changePassword|requestReauthCode)/.test(stripComments(card).replace(/window\.setTimeout\(\(\) => setLocked\(false\), ms\)/, '')), 'no timer that sends anything');
});

test('the form is cleared only after Auth confirmed, and the success text appears only then', () => {
  const card = read('components/app/PasswordChangeCard.tsx');
  const i = card.indexOf("result.outcome === 'changed'"); assert.ok(i > 0);
  assert.match(card.slice(i, i + 200), /setCurrent\(''\); setNext\(''\); setConfirm\(''\)/);
  assert.equal((card.match(/setCurrent\(''\)/g) || []).length, 1, 'cleared in exactly one place');
  assert.equal(P.PASSWORD_CHANGE_TEXT.changed.tone, 'ok');
  assert.match(P.PASSWORD_CHANGE_TEXT.changed.text, /οι υπόλοιπες συσκευές θα ζητήσουν νέα σύνδεση/, 'matches Auth: every OTHER session is signed out, this one stays');
});

test('no password reaches a log, a table, storage, an audit record or the page text', async () => {
  const files = ['lib/password-change.ts', 'components/app/PasswordChangeCard.tsx'].map((f) => stripComments(read(f)));
  for (const src of files) {
    assert.ok(!/console\.|localStorage|sessionStorage|indexedDB|\.from\(|\.rpc\(|\.insert\(|\.upsert\(|audit|analytics|track\(|fetch\(|sendBeacon|service_role|auth\.admin/i.test(src), 'no sink for the password');
    assert.ok(!/supabase\.auth\.(signInWithPassword|admin)/.test(src), 'Auth verifies the current password, not the browser');
  }
  const leaky = { code: 'something_new', status: 400, message: `bad request for ${NEW} and ${CUR}` };
  const r = await P.changePassword(fakeAuth(ADMIN, { failWith: leaky }).auth, { current: CUR, next: NEW });
  assert.equal(r.outcome, 'failed');
  for (const text of [P.passwordChangeMessage(r).text, JSON.stringify(r)]) { assert.ok(!text.includes(NEW) && !text.includes(CUR), 'the Auth message is never echoed'); }
  const weak = await P.changePassword(fakeAuth(ADMIN, { failWith: { code: 'weak_password', status: 422, reasons: ['length', `reason with ${NEW}`], message: NEW } }).auth, { current: CUR, next: NEW });
  assert.ok(!P.passwordChangeMessage(weak).text.includes(NEW), 'only known reasons are used');
});

test('the minimum length is ONE policy (12), shared by the reset page and this card, and the docs say Auth is the final authority', () => {
  assert.equal(readFileSync(root + 'lib/password-rules.ts', 'utf8').match(/MIN_PASSWORD_LENGTH = (\d+)/)[1], '12');
  assert.ok(!P.canSubmitPassword(CUR, 'Abcdef12345', 'Abcdef12345'), '11 characters are refused before sending');
  assert.ok(P.canSubmitPassword(CUR, 'Abcdef123456', 'Abcdef123456'), '12 are accepted');
  const doc = readFileSync(repo + 'docs/ops/PASSWORD_CHANGE.md', 'utf8');
  assert.match(doc, /Minimum password length[^\n]*\*\*12\*\*/, 'the documented Dashboard policy names the same 12');
  assert.match(doc, /last word|final authority/i);
});

test('asking for the reauthentication code reports what happened and never throws', async () => {
  const failing = (error, throws = false) => ({ reauthenticate: async () => { if (throws) throw new Error('offline'); return { error }; } });
  assert.equal(await P.requestReauthCode(failing(null)), 'sent');
  assert.equal(await P.requestReauthCode(failing({ code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' })), 'rate_limited', 'the built-in sender quota');
  assert.equal(await P.requestReauthCode(failing({ code: 'session_not_found', status: 403, message: 'x' })), 'session');
  assert.equal(await P.requestReauthCode(failing({ code: 'unexpected', status: 500, message: 'x' })), 'failed');
  assert.equal(await P.requestReauthCode(failing(null, true)), 'network');
  for (const code of ['email_address_not_authorized', 'email_address_invalid']) assert.equal(await P.requestReauthCode(failing({ code, status: 400, message: 'x' })), 'undeliverable', code);
  assert.match(P.REAUTH_TEXT.undeliverable.text, /αποσυνδεθείτε και συνδεθείτε ξανά/, 'the built-in sender can not reach every address: the answer is the no-email route');
  assert.match(P.REAUTH_TEXT.rate_limited.text, /Συνδεθείτε ξανά \(χωρίς email\)/, 'the no-email way out is offered when the quota is gone');
  assert.ok(P.lockMsAfter('sent') >= 60_000, 'one code at a time');
});

test('strength is a guide: length and variety raise it, common words and the e-mail cap it', () => {
  assert.equal(P.passwordStrength('').label, '');
  assert.ok(P.passwordStrength('abc12').level <= 1);
  assert.ok(P.passwordStrength('1234567890123').level === 0, 'only digits');
  assert.ok(P.passwordStrength('Password12345!').level <= 1, 'common word');
  assert.ok(P.passwordStrength('office-Qx7!mT4zLp', ['office']).level <= 1, 'built from the e-mail name');
  assert.ok(P.passwordStrength('Qx7!mT4zLpW2#vN9').level === 4);
  const lv = ['short1A', 'Longerpass12', 'Longerpass12Xy!', 'Qx7!mT4zLpW2#vN9'].map((p) => P.passwordStrength(p).level);
  assert.deepEqual([...lv].sort((a, b) => a - b), lv, 'monotonic with length and variety');
});

test('the card: Greek labels, show/hide, strength, requirements, and it is available to every role', () => {
  const card = read('components/app/PasswordChangeCard.tsx'); const page = read('components/app/CustomizePage.tsx');
  for (const t of ['Ασφάλεια λογαριασμού', 'Αλλαγή κωδικού πρόσβασης', 'Τρέχων κωδικός πρόσβασης', 'Νέος κωδικός πρόσβασης', 'Επιβεβαίωση νέου κωδικού πρόσβασης', 'Αποθήκευση νέου κωδικού']) assert.ok(card.includes(t), t);
  assert.match(card, /aria-pressed=\{show\}/); assert.match(card, /autoComplete="current-password"/); assert.equal((card.match(/autoComplete="new-password"/g) || []).length, 2);
  assert.match(card, /data-testid="password-strength"/); assert.match(card, /aria-label="Απαιτήσεις κωδικού"/);
  assert.match(page, /<PasswordChangeCard \/>/); assert.ok(!/realRole === 'admin'[^\n]*<PasswordChangeCard/.test(page), 'not limited to Admin');
  assert.match(card, /new_email/, 'warns when a pending e-mail change would be invalidated');
  assert.ok(!/profiles?\b.*\bpassword|\.from\('/.test(stripComments(card)), 'no table access');
});

test('the shared Admin login: the consequence for the whole office is stated before, asked for with a second click, and repeated after', () => {
  const card = read('components/app/PasswordChangeCard.tsx');
  assert.match(card, /const shared = profile\?\.role === 'admin'/);
  assert.match(card, /shared && !confirmShared[\s\S]{0,120}SHARED_ADMIN_CONFIRM/, 'a second click is needed for the shared login');
  assert.match(card, /data-testid="password-shared-note"/);
  for (const t of [P.SHARED_ADMIN_NOTICE, P.SHARED_ADMIN_CONFIRM, P.SHARED_ADMIN_DONE]) assert.match(t, /ΟΛΕΣ οι άλλες συσκευές/);
  assert.match(P.SHARED_ADMIN_NOTICE, /κοινός/);
  const done = P.passwordChangeMessage({ outcome: 'changed' }, { shared: true });
  assert.equal(done.tone, 'ok'); assert.match(done.text, /ΟΛΕΣ οι άλλες συσκευές του γραφείου αποσυνδέθηκαν/); assert.match(done.text, /ασφαλή τρόπο/);
  assert.ok(!/ΟΛΕΣ οι άλλες/.test(P.passwordChangeMessage({ outcome: 'changed' }).text), 'a Sales Agent account is individual: no office-wide warning');
  assert.deepEqual(P.passwordChangeMessage({ outcome: 'current_wrong' }, { shared: true }), P.passwordChangeMessage({ outcome: 'current_wrong' }), 'errors are the same for both');
});

test('re-authentication never depends on e-mail: a sign-out and sign-in route is always offered next to the code request', () => {
  const card = read('components/app/PasswordChangeCard.tsx');
  assert.match(card, /data-testid="password-signout-route"/);
  assert.match(card, /void signOut\(\); window\.location\.hash = '\/'/);
  const i = card.indexOf('password-signout-route'); const j = card.indexOf('sendCode()', i);
  assert.ok(i > 0 && j > i, 'the no-email route comes first');
  assert.match(card, /r === 'failed' \|\| r === 'session' \|\| r === 'undeliverable'/);
  assert.match(P.PASSWORD_CHANGE_TEXT.reauth_needed.text, /Συνδεθείτε ξανά ή ζητήστε κωδικό/);
});
