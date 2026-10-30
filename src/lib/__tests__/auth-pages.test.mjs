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
