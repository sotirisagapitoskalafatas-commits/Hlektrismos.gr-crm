// Sign-in / reset pages: password rules, routing, and the properties that must not regress (no account enumeration).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(path(rel), 'utf8');
const out = buildSync({ entryPoints: [path('../password-rules.ts')], bundle: true, write: false, format: 'esm', logLevel: 'silent' });
const P = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('passwordIssues: length, variety, repeated character, match', () => {
  assert.ok(P.passwordIssues('short1', 'short1').length);
  assert.ok(P.passwordIssues('aaaaaaaaaaaa', 'aaaaaaaaaaaa').length, 'one repeated character');
  assert.ok(P.passwordIssues('onlyletterslong', 'onlyletterslong').length, 'needs a digit');
  assert.ok(P.passwordIssues('1234567890123', '1234567890123').length, 'needs a letter');
  assert.deepEqual(P.passwordIssues('καλημερα12345', 'καλημερα12345'), [], 'Greek letters count');
  assert.deepEqual(P.passwordIssues('Correct-horse-9', 'Correct-horse-9'), []);
  assert.ok(P.passwordIssues('Correct-horse-9', 'Correct-horse-8').some((m) => /ταιριάζουν/.test(m)));
  assert.ok(P.passwordIssues('Correct-horse-9', '').length, 'must confirm');
});

test('looksLikeEmail is a shape check only', () => {
  for (const ok of ['a@b.gr', ' user.name+tag@example.com ']) assert.ok(P.looksLikeEmail(ok), ok);
  for (const bad of ['', 'a@b', 'a b@c.gr', '@x.gr', 'x@.gr']) assert.ok(!P.looksLikeEmail(bad), bad);
});

test('the reset route exists and the recovery event leads to it', () => {
  assert.match(read('../router.ts'), /'\/reset': 'reset'/);
  assert.match(read('../auth.tsx'), /PASSWORD_RECOVERY'\) window\.location\.hash = '\/reset'/);
  assert.match(read('../../App.tsx'), /case 'reset':\s*return <ResetPasswordPage/);
});

test('sign-in and forgot-password never reveal whether an account exists', () => {
  const login = read('../../components/LoginPage.tsx');
  assert.equal((login.match(/Λάθος στοιχεία/g) || []).length, 1, 'one generic sign-in failure message');
  // the reset answer does not depend on the Supabase result: it ignores errors and always shows the same text
  assert.match(login, /try \{ await supabase\?\.auth\.resetPasswordForEmail[^\n]*catch \{[^}]*\}\s*\n\s*setBusy\(false\); setSent\(true\);/);
  assert.match(login, /Αν υπάρχει λογαριασμός/);
});

const L = await (async () => {
  const o = buildSync({ entryPoints: [path('../auth-link.ts')], bundle: true, write: false, format: 'esm', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(o.outputFiles[0].text).toString('base64'));
})();
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), m }; };

test('e-mailed links: the type is noted (never the tokens); app routes and error fragments are ignored; read once', () => {
  assert.equal(L.parseAuthLinkType('#access_token=abc&refresh_token=def&type=invite'), 'invite');
  assert.equal(L.parseAuthLinkType('#access_token=abc&type=recovery'), 'recovery');
  assert.equal(L.parseAuthLinkType('#access_token=abc&type=email_change'), 'email_change');
  for (const h of ['', '#', '#/app', '#/reset', '#/dashboard', '#error=access_denied&type=invite', '#access_token=abc&type=weird', '#access_token=abc']) assert.equal(L.parseAuthLinkType(h), null, h);
  const s = mem();
  assert.equal(L.captureAuthLink('#access_token=SECRET&refresh_token=SECRET2&type=invite', s), 'invite');
  assert.ok(![...s.m.values()].some((v) => /SECRET/.test(v)), 'no token is stored');
  assert.equal(L.takeAuthLink(s), 'invite'); assert.equal(L.takeAuthLink(s), null, 'consumed once');
  assert.equal(L.takeAuthLink({ getItem() { throw new Error('x'); }, removeItem() {}, setItem() {} }), null, 'blocked storage never throws');
});

test('invite and recovery links land on the site root and are routed to «choose a password»; boot capture runs first', () => {
  assert.match(read('../auth.tsx'), /event === 'SIGNED_IN'[\s\S]{0,200}type === 'invite'\) window\.location\.hash = '\/reset'/);
  const edge = read('../../../supabase/functions/admin-users/index.ts');
  assert.equal((edge.match(/redirectTo: `\$\{site\}\/`/g) || []).length, 2, 'invite and reset use the site root (a #/route would collide with the token fragment)');
  assert.doesNotMatch(edge, /redirectTo: `\$\{site\}\/#/);
  const main = read('../../main.tsx');
  assert.ok(main.indexOf("./lib/auth-link-boot") < main.indexOf("./App.tsx"), 'captured before the Supabase client exists');
});


test('temporary credentials are routed to the reset page and cannot enter any other route until the server flag is cleared', () => {
  assert.match(read('../auth.tsx'), /app_metadata\?\.must_change_password === true \|\| type === 'invite'/);
  assert.match(read('../../App.tsx'), /mustChangePassword && route !== 'reset'/);
  assert.match(read('../../components/auth/ResetPasswordPage.tsx'), /action: 'complete_password_change'/);
  assert.match(read('../../components/auth/ResetPasswordPage.tsx'), /auth\.refreshSession\(\)/);
});
