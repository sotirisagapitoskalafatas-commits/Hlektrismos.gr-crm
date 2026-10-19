import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../staff-admin.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const S = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('two-group matrix: only Sales Agent roles can be created/promoted; Admin retains legacy-office maintenance only', () => {
  assert.deepEqual(S.manageableRoles('admin', true), ['field_sales', 'inside_sales']);
  assert.deepEqual(S.manageableRoles('back_office', true), ['field_sales', 'inside_sales']);
  assert.deepEqual(S.manageableRoles('manager', true), ['field_sales', 'inside_sales']);

  for (const officeRole of ['admin', 'manager', 'back_office']) {
    assert.equal(S.canManage(officeRole, true, null, 'field_sales'), true, officeRole + ' can create Sales Agents');
    assert.equal(S.canManage(officeRole, true, null, 'inside_sales'), true, officeRole + ' can maintain the legacy Sales Agent group');
    assert.equal(S.canManage(officeRole, true, null, 'back_office'), false, officeRole + ' cannot create office accounts');
    assert.equal(S.canManage(officeRole, true, null, 'admin'), false, officeRole + ' cannot create admin accounts');
    assert.equal(S.canManage(officeRole, true, 'field_sales', 'back_office'), false, officeRole + ' cannot promote a Sales Agent');
  }

  // During the compatibility period, the legacy admin can still reset/deactivate old office rows without changing their role.
  assert.equal(S.canManage('admin', true, 'manager'), true);
  assert.equal(S.canManage('admin', true, 'manager', 'back_office'), false);
  assert.equal(S.canManage('back_office', true, 'admin'), false);
  for (const salesRole of ['inside_sales', 'field_sales']) assert.deepEqual(S.manageableRoles(salesRole, true), []);
  assert.deepEqual(S.manageableRoles('admin', false), []);
  assert.deepEqual(S.manageableRoles('back_office', false), []);
  assert.deepEqual(S.manageableRoles(undefined, true), [], 'unknown actor is denied by default');
});
test('password reset: Back Office can reset Sales Agent accounts only; missing email and privileged targets are refused', () => {
  const admin = { actorRole: 'admin', actorActive: true, targetRole: 'back_office', targetEmail: 'a@b.gr' };
  assert.deepEqual(S.decideReset(admin), { ok: true });
  for (const actorRole of ['manager', 'back_office']) {
    assert.deepEqual(S.decideReset({ ...admin, actorRole, targetRole: 'field_sales' }), { ok: true }, actorRole + ' may reset Sales Agents');
    assert.equal(S.decideReset({ ...admin, actorRole, targetRole: 'admin' }).status, 403, actorRole + ' cannot reset admins');
  }
  for (const actorRole of ['inside_sales', 'field_sales']) {
    assert.equal(S.decideReset({ ...admin, actorRole, targetRole: 'field_sales' }).status, 403, actorRole + ' cannot reset');
  }
  assert.equal(S.decideReset({ ...admin, actorActive: false }).status, 403, 'inactive admin cannot reset');
  assert.equal(S.decideReset({ ...admin, actorRole: 'back_office', actorActive: false, targetRole: 'field_sales' }).status, 403, 'inactive back office cannot reset');
  assert.equal(S.decideReset({ ...admin, targetEmail: null }).status, 404);
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

test('delete: never yourself, protect last admin, preserve CRM history, and scope Back Office to Sales Agents', () => {
  const base = { actorId: 'a', actorRole: 'admin', actorActive: true, targetId: 't', targetRole: 'field_sales', targetActive: true, activeAdmins: 2, references: 0 };
  assert.deepEqual(S.decideDelete(base), { ok: true });
  assert.equal(S.decideDelete({ ...base, targetId: 'a' }).status, 403);
  assert.equal(S.decideDelete({ ...base, targetRole: 'admin', activeAdmins: 1 }).status, 409);
  assert.equal(S.decideDelete({ ...base, targetRole: 'admin', activeAdmins: 2 }).ok, true);
  const refs = S.decideDelete({ ...base, references: 3 });
  assert.equal(refs.status, 409); assert.match(refs.error, /Απενεργοποιήστε/);
  for (const actorRole of ['manager', 'back_office']) {
    assert.deepEqual(S.decideDelete({ ...base, actorRole, targetRole: 'field_sales' }), { ok: true }, actorRole + ' may administer Sales Agents');
    assert.equal(S.decideDelete({ ...base, actorRole, targetRole: 'admin' }).status, 403, actorRole + ' cannot delete privileged users');
  }
  for (const actorRole of ['inside_sales', 'field_sales']) {
    assert.equal(S.decideDelete({ ...base, actorRole, targetRole: 'field_sales' }).status, 403, actorRole + ' cannot delete accounts');
  }
});

test('no public sign-up anywhere in the app or the edge functions (§2.4): accounts exist only because an admin created them', () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = dir + '/' + f; return statSync(p).isDirectory() ? (f === 'node_modules' || f === '__tests__' ? [] : walk(p)) : /\.(tsx?|jsx?)$/.test(f) ? [p] : []; });
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const hits = [...walk(root + 'src'), ...walk(root + 'supabase/functions')]
    .filter((f) => /signUp\s*\(|auth\/v1\/signup/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, [], 'files that could create an account by themselves');
});
