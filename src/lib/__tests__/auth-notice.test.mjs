// What the app tells a person who opens an e-mailed Auth link that did not simply sign them in. LOCAL unit tests of the client rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const load = (rel) => {
  const out = buildSync({ entryPoints: [root + rel], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const N = await load('lib/auth-notice.ts');
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('an expired, invalid or already-used link (Supabase error redirect) gives the Greek explanation', () => {
  for (const hash of [
    '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    '#error=access_denied&error_code=otp_expired',
    '#error_description=Email+link+is+invalid+or+has+expired',
    '#error=server_error',
  ]) assert.deepEqual(N.parseAuthNotice(hash), N.NOTICE_LINK_FAILED, hash);
  assert.match(N.NOTICE_LINK_FAILED.text, /έχει λήξει|ήδη χρησιμοποιηθεί/);
  assert.equal(N.NOTICE_LINK_FAILED.tone, 'err');
});

test('the first half of a two-address e-mail change says the second link is still needed', () => {
  const hash = '#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email';
  assert.deepEqual(N.parseAuthNotice(hash), N.NOTICE_FIRST_CONFIRMED);
  assert.match(N.NOTICE_FIRST_CONFIRMED.text, /άλλη διεύθυνση/);
});

test('a usable sign-in link, an app route and an empty hash give no notice (the sign-in and the router handle them)', () => {
  for (const hash of ['#access_token=abc&type=email_change', '#access_token=x&error=ignored', '#/app', '#/dashboard?view=cases', '', '#', '#foo=bar', '#message=Something+else']) assert.equal(N.parseAuthNotice(hash), null, hash);
});

test('capture stores the notice once; take reads it once and forgets; no token is ever kept', () => {
  const s = memory();
  assert.equal(N.captureAuthNotice('#error=access_denied&error_code=otp_expired', s), true);
  assert.equal(N.captureAuthNotice('#access_token=SECRET&type=email_change', s), false);
  const first = N.takeAuthNotice(s);
  assert.deepEqual(first, N.NOTICE_LINK_FAILED);
  assert.equal(N.takeAuthNotice(s), null, 'shown once');
  s.setItem('atlas.auth.notice', JSON.stringify({ tone: 'err', text: 'x' }));
  s.setItem('atlas.auth.notice', 'not json');
  assert.equal(N.takeAuthNotice(s), null, 'garbage in storage shows nothing');
  s.setItem('atlas.auth.notice', JSON.stringify({ tone: 'bad', text: 'x' }));
  assert.equal(N.takeAuthNotice(s), null, 'unknown tone shows nothing');
  assert.ok(!JSON.stringify(N).includes('SECRET'));
});

test('wiring: the boot captures before the Supabase client, drops the error fragment, the e-mail-change sign-in shows success only then, and the banner is mounted', () => {
  const boot = readFileSync(root + 'lib/auth-link-boot.ts', 'utf8');
  assert.ok(/captureAuthNotice\(\)/.test(boot) && /replaceState/.test(boot));
  const main = readFileSync(root + 'main.tsx', 'utf8');
  assert.ok(main.indexOf("auth-link-boot") < main.indexOf("'./App.tsx'"), 'the boot runs before the app (and the Supabase client)');
  const auth = readFileSync(root + 'lib/auth.tsx', 'utf8');
  assert.ok(/event === 'SIGNED_IN'/.test(auth) && /type === 'email_change'[\s\S]{0,200}pushAuthNotice\(NOTICE_EMAIL_CHANGED\)/.test(auth), 'success only after Supabase signs the person in through the link');
  assert.ok(/type === 'invite'[\s\S]{0,80}'\/reset'/.test(auth), 'invitations still go to the choose-a-password page');
  assert.ok(/<AuthNoticeBanner \/>/.test(readFileSync(root + 'App.tsx', 'utf8')));
  assert.equal(N.NOTICE_EMAIL_CHANGED.tone, 'ok');
});
