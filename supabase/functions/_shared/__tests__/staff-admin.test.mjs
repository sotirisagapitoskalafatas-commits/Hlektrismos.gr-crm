import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../staff-admin.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const S = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('matrix (admin-only provisioning, §2.4): admin manages all roles; manager, back office and sales manage nobody; inactive nothing', () => {
  assert.deepEqual(S.manageableRoles('admin', true), ['admin', 'manager', 'inside_sales', 'field_sales', 'back_office']);
  for (const r of ['manager', 'back_office', 'inside_sales', 'field_sales']) assert.deepEqual(S.manageableRoles(r, true), [], `${r} manages nobody`);
  assert.deepEqual(S.manageableRoles('admin', false), []);
  assert.deepEqual(S.manageableRoles(undefined, true), [], 'unknown role is denied by default');
  assert.equal(S.canManage('manager', true, null, 'inside_sales'), false, 'manager cannot create staff any more');
  assert.equal(S.canManage('manager', true, 'field_sales', 'back_office'), false);
  assert.equal(S.canManage('back_office', true, null, 'back_office'), false, 'back office cannot create back office accounts (each person gets one from an admin)');
  assert.equal(S.canManage('admin', true, null, 'back_office'), true);
  assert.equal(S.canManage('admin', true, 'field_sales', 'manager'), true);
});

test('password reset: admin only, only for an account that has an e-mail; refusals are 403/404', () => {
  const ok = { actorRole: 'admin', actorActive: true, targetRole: 'back_office', targetEmail: 'a@b.gr' };
  assert.deepEqual(S.decideReset(ok), { ok: true });
  for (const r of ['manager', 'back_office', 'inside_sales', 'field_sales']) assert.equal(S.decideReset({ ...ok, actorRole: r }).status, 403, `${r} cannot reset`);
  assert.equal(S.decideReset({ ...ok, actorActive: false }).status, 403, 'a disabled admin cannot reset');
  assert.equal(S.decideReset({ ...ok, targetEmail: null }).status, 404);
});

test('edge function wiring: reset is audited, returns no link or password, and the public sign-up path is not used', () => {
  const src = readFileSync(fileURLToPath(new URL('../../admin-users/index.ts', import.meta.url)), 'utf8');
  assert.match(src, /body\.action === "reset"/);
  assert.match(src, /decideReset\(/);
  assert.match(src, /action: "password_reset"/);
  assert.match(src, /action: "denied", target_id: targetId, target_email: email, note: "reset"/, 'a refused reset is audited');
  assert.doesNotMatch(src, /generateLink|signUp\(/, 'no recovery link is generated for the caller and sign-up is never called');
  const resetBlock = src.slice(src.indexOf('body.action === "reset"'), src.indexOf('Άγνωστη ενέργεια'));
  assert.doesNotMatch(resetBlock, /jsonResponse\(\{[^}]*(link|token|password)/i, 'the response carries no secret');
});

test('create validation: email, name, role, phone and temporary password strength', () => {
  const ok = S.validateCreate({ email: ' New.User@Example.com ', full_name: 'Νέος Χρήστης', role: 'field_sales' });
  assert.equal(ok.ok, true); assert.equal(ok.value.email, 'new.user@example.com'); assert.equal(ok.value.mode, 'invite');
  assert.equal(S.validateCreate({ email: 'x', full_name: 'Α Β', role: 'admin' }).ok, false);
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'superuser' }).ok, false, 'role must be one of the five');
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'admin', mode: 'password', password: 'short1' }).ok, false);
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'admin', mode: 'password', password: 'onlyletterslong' }).ok, false);
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'admin', mode: 'password', password: 'Strong-pass-2026' }).ok, true);
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'admin', phone: 'abc' }).ok, false);
});

test('delete: never yourself, never the last admin, never someone in CRM history, only within your scope', () => {
  const base = { actorId: 'a', actorRole: 'admin', actorActive: true, targetId: 't', targetRole: 'field_sales', targetActive: true, activeAdmins: 2, references: 0 };
  assert.deepEqual(S.decideDelete(base), { ok: true });
  assert.equal(S.decideDelete({ ...base, targetId: 'a' }).status, 403);
  assert.equal(S.decideDelete({ ...base, targetRole: 'admin', activeAdmins: 1 }).status, 409);
  assert.equal(S.decideDelete({ ...base, targetRole: 'admin', activeAdmins: 2 }).ok, true);
  const refs = S.decideDelete({ ...base, references: 3 });
  assert.equal(refs.status, 409); assert.match(refs.error, /Απενεργοποιήστε/);
  for (const r of ['manager', 'back_office', 'inside_sales', 'field_sales']) assert.equal(S.decideDelete({ ...base, actorRole: r, targetRole: 'field_sales' }).status, 403, `${r} cannot delete accounts`);
});

test('no public sign-up anywhere in the app or the edge functions (§2.4): accounts exist only because an admin created them', () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = dir + '/' + f; return statSync(p).isDirectory() ? (f === 'node_modules' || f === '__tests__' ? [] : walk(p)) : /\.(tsx?|jsx?)$/.test(f) ? [p] : []; });
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const hits = [...walk(root + 'src'), ...walk(root + 'supabase/functions')]
    .filter((f) => /signUp\s*\(|auth\/v1\/signup/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, [], 'files that could create an account by themselves');
});
