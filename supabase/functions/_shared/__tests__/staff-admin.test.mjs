import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../staff-admin.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const S = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('two-role model: only the ACTIVE admin (shared Admin / Back Office login) manages accounts; new accounts are sales_agent only', () => {
  assert.deepEqual(S.manageableRoles('admin', true), ['sales_agent'], 'one Sales Agent choice');
  assert.equal(S.canManage('admin', true, null, 'sales_agent'), true);
  for (const r of ['inside_sales', 'field_sales', 'admin', 'manager', 'back_office']) assert.equal(S.canManage('admin', true, null, r), false, 'cannot create ' + r);
  assert.equal(S.canManage('admin', true, 'field_sales'), true);
  assert.equal(S.canManage('admin', true, 'inside_sales', 'field_sales'), true, 'a row not yet converted is a Sales Agent');
  assert.equal(S.canManage('admin', true, 'sales_agent', 'admin'), false, 'no promotion');
  assert.equal(S.canManage('admin', true, 'field_sales', 'admin'), false, 'no promotion');
  assert.equal(S.canManage('admin', true, 'field_sales', 'back_office'), false);
  // existing office rows: keep / reset / deactivate by the admin, never re-role
  assert.equal(S.canManage('admin', true, 'manager'), true);
  assert.equal(S.canManage('admin', true, 'back_office'), true);
  assert.equal(S.canManage('admin', true, 'manager', 'admin'), false);
  // nobody else
  for (const actor of ['manager', 'back_office', 'inside_sales', 'field_sales', 'superuser', '', null, undefined]) {
    assert.deepEqual(S.manageableRoles(actor, true), [], String(actor));
    for (const [t, n] of [[null, 'sales_agent'], ['sales_agent', null], ['inside_sales', 'field_sales'], ['admin', null], ['back_office', null]]) {
      assert.equal(S.canManage(actor, true, t, n), false, `${actor} must not manage ${t}/${n}`);
    }
  }
  assert.deepEqual(S.manageableRoles('admin', false), [], 'an inactive admin has no rights');
  assert.equal(S.canManage('admin', false, null, 'sales_agent'), false);
});
test('password reset: only the active admin; Manager, legacy Back Office and Sales Agents are refused; missing e-mail is a 404', () => {
  const admin = { actorRole: 'admin', actorActive: true, targetRole: 'field_sales', targetEmail: 'a@b.gr' };
  assert.deepEqual(S.decideReset(admin), { ok: true });
  assert.deepEqual(S.decideReset({ ...admin, targetRole: 'back_office' }), { ok: true }, 'the admin may reset a legacy office account');
  for (const actorRole of ['manager', 'back_office', 'inside_sales', 'field_sales']) {
    assert.equal(S.decideReset({ ...admin, actorRole }).status, 403, actorRole + ' cannot reset');
  }
  assert.equal(S.decideReset({ ...admin, actorActive: false }).status, 403, 'inactive admin cannot reset');
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
  const ok = S.validateCreate({ email: ' New.User@Example.com ', full_name: 'Νέος Χρήστης', role: 'sales_agent' });
  assert.equal(ok.ok, true); assert.equal(ok.value.email, 'new.user@example.com'); assert.equal(ok.value.mode, 'invite');
  assert.equal(S.validateCreate({ email: 'x', full_name: 'Α Β', role: 'admin' }).ok, false);
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'superuser' }).ok, false, 'role must be one of the five');
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'admin', mode: 'password', password: 'short1' }).ok, false);
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'admin', mode: 'password', password: 'onlyletterslong' }).ok, false);
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'admin', mode: 'password', password: 'Strong-pass-2026' }).ok, true);
  assert.equal(S.validateCreate({ email: 'a@b.gr', full_name: 'Α Β', role: 'admin', phone: 'abc' }).ok, false);
});

test('delete: never yourself, protect last admin, preserve CRM history; only the admin may delete', () => {
  const base = { actorId: 'a', actorRole: 'admin', actorActive: true, targetId: 't', targetRole: 'field_sales', targetActive: true, activeAdmins: 2, references: 0 };
  assert.deepEqual(S.decideDelete(base), { ok: true });
  assert.equal(S.decideDelete({ ...base, targetId: 'a' }).status, 403);
  assert.equal(S.decideDelete({ ...base, targetRole: 'admin', activeAdmins: 1 }).status, 409);
  const refs = S.decideDelete({ ...base, references: 3 });
  assert.equal(refs.status, 409); assert.match(refs.error, /Απενεργοποιήστε/);
  for (const actorRole of ['manager', 'back_office', 'inside_sales', 'field_sales']) {
    assert.equal(S.decideDelete({ ...base, actorRole }).status, 403, actorRole + ' cannot delete accounts');
  }
  assert.equal(S.decideDelete({ ...base, actorActive: false }).status, 403);
});

test('no public sign-up anywhere in the app or the edge functions (§2.4): accounts exist only because an admin created them', () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = dir + '/' + f; return statSync(p).isDirectory() ? (f === 'node_modules' || f === '__tests__' ? [] : walk(p)) : /\.(tsx?|jsx?)$/.test(f) ? [p] : []; });
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const hits = [...walk(root + 'src'), ...walk(root + 'supabase/functions')]
    .filter((f) => /signUp\s*\(|auth\/v1\/signup/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, [], 'files that could create an account by themselves');
});

test('SITE_URL: only a bare https origin that is not the public WordPress site is accepted; no default', () => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL('../site-url.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')).then(({ crmSiteUrl }) => {
    assert.equal(crmSiteUrl('https://hlektrismos-crm.vercel.app'), 'https://hlektrismos-crm.vercel.app');
    assert.equal(crmSiteUrl(' https://hlektrismos-crm.vercel.app/ '), 'https://hlektrismos-crm.vercel.app', 'whitespace and a trailing slash are tolerated');
    for (const bad of [undefined, null, '', 'hlektrismos-crm.vercel.app', 'http://hlektrismos-crm.vercel.app', 'https://hlektrismos-crm.vercel.app/app', 'https://hlektrismos-crm.vercel.app/#/app',
      'https://hlektrismos-crm.vercel.app?x=1', 'https://user@hlektrismos-crm.vercel.app', 'https://hlektrismos-crm.vercel.app:8443', 'https://hlektrismos.gr', 'https://www.hlektrismos.gr/', 'https://HLEKTRISMOS.GR', 'https://localhost']) {
      assert.equal(crmSiteUrl(bad), null, String(bad));
    }
    const src = readFileSync(fileURLToPath(new URL('../../admin-users/index.ts', import.meta.url)), 'utf8');
    assert.doesNotMatch(src, /https:\/\/hlektrismos\.gr/);
    assert.equal((src.match(/crmSiteUrl\(Deno\.env\.get\("SITE_URL"\)\)/g) || []).length, 2, 'invite and reset both use the validated value');
  });
});


test('temporary-password provisioning enforces a first-login password change using server-controlled app_metadata', () => {
  const src = readFileSync(fileURLToPath(new URL('../../admin-users/index.ts', import.meta.url)), 'utf8');
  assert.match(src, /must_change_password:\s*true/);
  assert.match(src, /body\.action === "complete_password_change"/);
  assert.match(src, /admin\.auth\.admin\.updateUserById\(caller\.id, \{[\s\S]*password: ownPassword,[\s\S]*app_metadata: appMetadata/);
  assert.match(src, /validateChosenPassword\(ownPassword\)/);
  assert.equal(S.validateChosenPassword('Correct-horse-9'), null);
  assert.ok(S.validateChosenPassword('short1'));
  assert.ok(S.validateChosenPassword('aaaaaaaaaaaa'));
  assert.match(src, /password_change_completed/);
  assert.doesNotMatch(src, /user_metadata:\s*\{[^}]*must_change_password/i, 'the user-editable metadata cannot clear the gate');
});
