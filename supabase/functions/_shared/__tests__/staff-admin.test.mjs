import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../staff-admin.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const S = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('matrix: admin all roles, manager ops only, back office BO only, sales nothing, inactive nothing', () => {
  assert.deepEqual(S.manageableRoles('admin', true), ['admin', 'manager', 'inside_sales', 'field_sales', 'back_office']);
  assert.deepEqual(S.manageableRoles('manager', true), ['inside_sales', 'field_sales', 'back_office']);
  assert.deepEqual(S.manageableRoles('back_office', true), ['back_office']);
  assert.deepEqual(S.manageableRoles('inside_sales', true), []);
  assert.deepEqual(S.manageableRoles('field_sales', true), []);
  assert.deepEqual(S.manageableRoles('admin', false), []);
  assert.deepEqual(S.manageableRoles(undefined, true), [], 'unknown role is denied by default');
  assert.equal(S.canManage('manager', true, null, 'admin'), false, 'manager cannot create an admin');
  assert.equal(S.canManage('manager', true, 'manager', 'inside_sales'), false, 'manager cannot edit another manager');
  assert.equal(S.canManage('manager', true, 'field_sales', 'back_office'), true);
  assert.equal(S.canManage('back_office', true, null, 'back_office'), true);
  assert.equal(S.canManage('back_office', true, 'back_office', 'inside_sales'), false);
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
  assert.equal(S.decideDelete({ ...base, actorRole: 'manager', targetRole: 'manager' }).status, 403);
  assert.equal(S.decideDelete({ ...base, actorRole: 'back_office', targetRole: 'field_sales' }).status, 403);
  assert.equal(S.decideDelete({ ...base, actorRole: 'back_office', targetRole: 'back_office' }).ok, true);
});
