// The REAL provisioning and cleanup scripts (docs/ops/sql/*.sql) run on embedded Postgres (PGlite) against a minimal replica of the Auth and CRM tables.
// LOCAL evidence only: this is not Supabase and not production. The identities are synthetic. Covers: exactly two assignable roles, duplicate prevention, a
// missing or non-signing-in account, a missing profile, provisioning idempotency, no silent role change, untouched legacy records, QA / probe cleanup.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const script = (name) => readFileSync(fileURLToPath(new URL(`../../docs/ops/sql/${name}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const db = new PGlite();

const ORG = 'eeeeeeee-0000-4000-8000-000000000001';
const U = { admin: 'a0000000-0000-4000-8000-000000000001', agent: 'a0000000-0000-4000-8000-000000000002', noIdentity: 'a0000000-0000-4000-8000-000000000003', neverIn: 'a0000000-0000-4000-8000-000000000004',
  qaAdmin: 'a0000000-0000-4000-8000-0000000000b1', demo: 'a0000000-0000-4000-8000-0000000000b2', qaBo: 'a0000000-0000-4000-8000-0000000000b3', qaMgr: 'a0000000-0000-4000-8000-0000000000b4',
  qaField: 'a0000000-0000-4000-8000-0000000000b5', qaInside: 'a0000000-0000-4000-8000-0000000000b6', probe1: 'a0000000-0000-4000-8000-0000000000c1', probe2: 'a0000000-0000-4000-8000-0000000000c2' };
const QA = [['demo@hlektrismos.gr', 'demo', 'admin'], ['qa.admin@hlektrismos.gr', 'qaAdmin', 'admin'], ['qa.backoffice@hlektrismos.gr', 'qaBo', 'back_office'],
  ['qa.manager@hlektrismos.gr', 'qaMgr', 'manager'], ['qa.fieldsales@hlektrismos.gr', 'qaField', 'field_sales'], ['qa.insidesales@hlektrismos.gr', 'qaInside', 'inside_sales']];

async function build() {
  await db.exec(`
    drop schema if exists auth cascade; drop schema if exists public cascade; create schema public; create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, banned_until timestamptz, last_sign_in_at timestamptz);
    create table auth.identities (id serial primary key, user_id uuid references auth.users(id), provider text default 'email');
    create table auth.sessions (id serial primary key, user_id uuid); create table auth.refresh_tokens (id serial primary key, user_id uuid);
    create table public.organizations (id uuid primary key);
    create table public.roles (id uuid primary key default gen_random_uuid(), key text unique);
    create table public.profiles (id uuid primary key references auth.users(id), full_name text not null default '', role text not null, is_active boolean not null default true, organization_id uuid, updated_at timestamptz default now());
    create table public.user_roles (id serial primary key, user_id uuid, role_id uuid, is_primary boolean default false);
    create table public.crm_users (id uuid primary key, role text, is_active boolean, max_leads int);
    create table public.hlektrismos_leads (id serial primary key, assigned_to uuid, status text default 'new');
    create table public.sales_agents (id serial primary key, email text, active boolean);
    insert into public.organizations values ('${ORG}');
    insert into public.roles (key) values ('admin'), ('field_sales'), ('manager'), ('back_office'), ('inside_sales');`);
}
const user = (id, email, { confirmed = true, identity = true, signedIn = true, banned = false } = {}) => db.exec(`
  insert into auth.users values ('${id}', '${email}', ${confirmed ? 'now()' : 'null'}, ${banned ? "now() + interval '1 day'" : 'null'}, ${signedIn ? 'now()' : 'null'});
  ${identity ? `insert into auth.identities (user_id) values ('${id}');` : ''}`);
const fill = (name, { email = 'new.owner@example.test', fullName = 'Test Owner', role = 'admin' } = {}) =>
  script(name).replace("v_email text := 'CHANGE-ME@example.com'", `v_email text := '${email}'`).replace("v_name  text := 'CHANGE ME'", `v_name  text := '${fullName}'`).replace("v_role  text := 'field_sales'", `v_role  text := '${role}'`);
const attempt = async (sql) => { try { await db.exec(sql); return { ok: true }; } catch (e) { return { ok: false, err: e.message }; } };
const one = async (sql) => (await db.query(sql)).rows[0];
const count = async (t, where = 'true') => Number((await one(`select count(*) n from ${t} where ${where}`)).n);
const fingerprint = async (...tables) => JSON.stringify(await Promise.all(tables.map(async (t) => (await db.query(`select * from ${t} order by 1`)).rows)));

beforeEach(build);

// ───────── provisioning ─────────
test('the placeholders are refused: the script does nothing until the three values are edited', async () => {
  assert.match((await attempt(script('provision_profile.sql'))).err, /edit the three values first/);
  assert.match((await attempt(fill('provision_profile.sql', { email: 'x@example.test', fullName: 'CHANGE ME' }))).err, /edit the three values first/);
  assert.equal(await count('public.profiles'), 0);
});

test('exactly two roles are assignable: admin and field_sales. inside_sales, manager, back_office and anything else are refused', async () => {
  await user(U.admin, 'new.owner@example.test');
  for (const role of ['inside_sales', 'manager', 'back_office', 'superuser', '']) {
    const r = await attempt(fill('provision_profile.sql', { role }));
    assert.equal(r.ok, false, role);
    assert.match(r.err, /not assignable/, role);
  }
  assert.equal(await count('public.profiles'), 0, 'no profile was created');
});

test('duplicate prevention: no Auth user, two Auth users with the same address in different case, an unconfirmed one and a banned one are all refused', async () => {
  assert.match((await attempt(fill('provision_profile.sql'))).err, /found 0/, 'no Auth user: it does not invent one');
  await user(U.admin, 'New.Owner@example.test'); await user(U.agent, 'new.owner@example.test');
  assert.match((await attempt(fill('provision_profile.sql'))).err, /found 2/, 'ambiguous: refuses to guess which one');
  await build(); await user(U.admin, 'new.owner@example.test', { confirmed: false });
  assert.match((await attempt(fill('provision_profile.sql'))).err, /found 0/, 'unconfirmed');
  await build(); await user(U.admin, 'new.owner@example.test', { banned: true });
  assert.match((await attempt(fill('provision_profile.sql'))).err, /found 0/, 'banned');
  assert.equal(await count('auth.users'), 1, 'and it never created an Auth user');
});

test('profile/Auth mismatch: an Auth user with NO identity row (cannot sign in) is refused, and so is one whose owner has never signed in', async () => {
  await user(U.noIdentity, 'new.owner@example.test', { identity: false, signedIn: false });
  assert.match((await attempt(fill('provision_profile.sql'))).err, /no identity row/);
  await build(); await user(U.neverIn, 'new.owner@example.test', { signedIn: false });
  assert.match((await attempt(fill('provision_profile.sql'))).err, /has not signed in yet/);
  assert.equal(await count('public.profiles'), 0, 'a missing profile stays missing rather than being handed to an account nobody controls');
  assert.equal(await count('public.user_roles'), 0);
});

test('a confirmed, signed-in account without a profile gets exactly one active admin profile and one primary admin role in the single organization', async () => {
  await user(U.admin, 'new.owner@example.test');
  assert.equal(await count('public.profiles'), 0, 'precondition: missing profile');
  assert.equal((await attempt(fill('provision_profile.sql'))).ok, true);
  const p = await one(`select id, role, is_active, organization_id, full_name from public.profiles`);
  assert.deepEqual([p.id, p.role, p.is_active, p.organization_id, p.full_name], [U.admin, 'admin', true, ORG, 'Test Owner']);
  const r = await one(`select count(*) n, bool_and(is_primary) primary_only, min(k.key) key from public.user_roles ur join public.roles k on k.id = ur.role_id where ur.user_id = '${U.admin}'`);
  assert.deepEqual([Number(r.n), r.primary_only, r.key], [1, true, 'admin']);
  assert.equal(await count('auth.users'), 1, 'the existing Auth user is reused: same id, none created');
});

test('provisioning is idempotent: running it again changes nothing, keeps a name that was set, and never adds a second role row', async () => {
  await user(U.admin, 'new.owner@example.test');
  await attempt(fill('provision_profile.sql'));
  await db.exec(`update public.profiles set full_name = 'Name chosen by the owner'`);
  const before = await fingerprint('public.profiles', 'public.user_roles');
  assert.equal((await attempt(fill('provision_profile.sql', { fullName: 'A different name' }))).ok, true);
  assert.equal((await one('select full_name from public.profiles')).full_name, 'Name chosen by the owner');
  assert.equal(await fingerprint('public.profiles', 'public.user_roles').then((s) => JSON.parse(s)[1].length), JSON.parse(before)[1].length);
  assert.equal(await count('public.user_roles'), 1);
  assert.equal(await count('public.profiles'), 1);
});

test('stale canonical role rows are replaced so exactly one effective role remains', async () => {
  await user(U.agent, 'new.agent@example.test');
  const k = (await one(`select id from public.roles where key = 'manager'`)).id;
  await db.exec(`insert into public.user_roles (user_id, role_id, is_primary) values ('${U.agent}', '${k}', true)`);
  assert.equal((await attempt(fill('provision_profile.sql', { email: 'new.agent@example.test', role: 'field_sales' }))).ok, true);
  const rows = (await db.query(`select k.key from public.user_roles ur join public.roles k on k.id = ur.role_id where ur.user_id = '${U.agent}'`)).rows;
  assert.deepEqual(rows.map((r) => r.key), ['field_sales']);
});

test('no silent role change and no self-promotion through this script: an account that already has another role is refused and left as it was', async () => {
  await user(U.agent, 'new.owner@example.test');
  await db.exec(`insert into public.profiles (id, full_name, role, is_active, organization_id) values ('${U.agent}', 'Existing agent', 'field_sales', true, '${ORG}')`);
  const r = await attempt(fill('provision_profile.sql', { role: 'admin' }));
  assert.equal(r.ok, false);
  assert.match(r.err, /already has the role field_sales/);
  assert.deepEqual(await one('select role, full_name from public.profiles'), { role: 'field_sales', full_name: 'Existing agent' });
  await db.exec(`update public.profiles set role = 'manager'`);
  assert.match((await attempt(fill('provision_profile.sql', { role: 'field_sales' }))).err, /already has the role manager/, 'a legacy role is not silently converted either');
});

test('legacy records are reported, never touched: crm_users, the leads assigned to the account and a same-address sales_agents row stay exactly as they were', async () => {
  await user(U.admin, 'new.owner@example.test');
  await db.exec(`insert into public.crm_users values ('${U.admin}', 'sales', true, 50);
    insert into public.hlektrismos_leads (assigned_to) select '${U.admin}' from generate_series(1, 81);
    insert into public.sales_agents (email, active) values ('new.owner@example.test', false);`);
  const before = await fingerprint('public.crm_users', 'public.hlektrismos_leads', 'public.sales_agents');
  assert.equal((await attempt(fill('provision_profile.sql'))).ok, true);
  assert.equal(await fingerprint('public.crm_users', 'public.hlektrismos_leads', 'public.sales_agents'), before);
  assert.equal(await count('public.hlektrismos_leads', `assigned_to = '${U.admin}'`), 81, 'ownership of the 81 leads is preserved');
});

// ───────── read-only report ─────────
test('the report reads the facts and changes nothing, including the legacy distribution and an account that cannot sign in', async () => {
  await user(U.noIdentity, 'new.owner@example.test', { identity: false, signedIn: false });
  await db.exec(`insert into public.crm_users values ('${U.noIdentity}', 'sales', true, 50); insert into public.hlektrismos_leads (assigned_to) select '${U.noIdentity}' from generate_series(1, 3);`);
  const before = await fingerprint('auth.users', 'public.crm_users', 'public.hlektrismos_leads', 'public.profiles');
  const sql = script('admin_identity_report.sql').replaceAll('CHANGE-ME@example.com', 'new.owner@example.test');
  const r = (await db.query(sql)).rows[0];
  assert.equal(Number(r.auth_users_with_this_email), 1);
  assert.equal(Number(r.identity_rows), 0, 'the report shows the account cannot sign in');
  assert.equal(r.has_signed_in, false);
  assert.equal(r.profile_role, null);
  assert.equal(r.legacy_crm_users_role, 'sales');
  assert.equal(Number(r.legacy_leads_assigned), 3);
  assert.equal(Number(r.active_legacy_sales_users_in_distribution), 1);
  assert.equal(await fingerprint('auth.users', 'public.crm_users', 'public.hlektrismos_leads', 'public.profiles'), before);
  assert.ok(!/\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b/i.test(script('admin_identity_report.sql').replace(/--.*$/gm, '')), 'the script contains no write statement');
});

// ───────── QA and probe cleanup ─────────
async function qaWorld({ realAdmin = true, realAdminEmail = 'real.admin@hlektrismos.gr', realIdentity = true } = {}) {
  for (const [email, key, role] of QA) {
    await user(U[key], email);
    await db.exec(`insert into public.profiles (id, full_name, role, is_active, organization_id) values ('${U[key]}', '${key}', '${role}', true, '${ORG}');
      insert into auth.sessions (user_id) values ('${U[key]}'); insert into auth.refresh_tokens (user_id) values ('${U[key]}');`);
  }
  if (realAdmin) {
    await user(U.admin, realAdminEmail, { identity: realIdentity });
    await db.exec(`insert into public.profiles (id, full_name, role, is_active, organization_id) values ('${U.admin}', 'Real admin', 'admin', true, '${ORG}')`);
  }
  await user(U.probe1, 'qa.probe.signup@hlektrismos.gr'); await user(U.probe2, 'qa.tmp.autoconf@hlektrismos.gr');
  await db.exec(`insert into auth.sessions (user_id) values ('${U.probe1}'), ('${U.probe2}'); insert into public.hlektrismos_leads (assigned_to) values ('${U.qaField}'), ('${U.demo}');`);
}

test('QA cleanup refuses when no real admin exists, when the only admin that signed in is one of the QA accounts, or when the real admin has no identity or never signed in', async () => {
  await qaWorld({ realAdmin: false });
  assert.match((await attempt(script('deactivate_qa_accounts.sql'))).err, /no active real admin/);
  await build(); await qaWorld({ realIdentity: false });
  assert.match((await attempt(script('deactivate_qa_accounts.sql'))).err, /no active real admin/, 'an admin that cannot sign in is not a safe fallback');
  await build(); await qaWorld(); await db.exec(`update auth.users set last_sign_in_at = null where id = '${U.admin}'`);
  assert.match((await attempt(script('deactivate_qa_accounts.sql'))).err, /no active real admin/, 'never signed in');
  assert.equal(await count('public.profiles', 'is_active'), 7, 'nothing was deactivated');
  assert.equal(await count('auth.users', 'banned_until is not null'), 0);
});

test('QA cleanup: the real admin may use a @hlektrismos.gr address (the old guard refused exactly that), and the six accounts are switched off without deleting anything', async () => {
  await qaWorld({ realAdminEmail: 'owner@hlektrismos.gr' });
  const usersBefore = await count('auth.users'), identitiesBefore = await count('auth.identities'), leadsBefore = await fingerprint('public.hlektrismos_leads');
  assert.equal((await attempt(script('deactivate_qa_accounts.sql'))).ok, true);
  assert.equal(await count('public.profiles', `is_active and id in ('${U.admin}')`), 1, 'the real admin stays active');
  for (const [, key] of QA) {
    assert.equal((await one(`select is_active from public.profiles where id = '${U[key]}'`)).is_active, false, key);
    assert.equal(await count('auth.users', `id = '${U[key]}' and banned_until > now()`), 1, `${key} banned`);
    assert.equal(await count('auth.sessions', `user_id = '${U[key]}'`) + await count('auth.refresh_tokens', `user_id = '${U[key]}'`), 0, `${key} sessions revoked`);
  }
  assert.equal(await count('auth.users', `id = '${U.admin}' and banned_until is not null`), 0, 'the real admin is not banned');
  assert.equal(await count('auth.users'), usersBefore, 'no Auth user deleted');
  assert.equal(await count('auth.identities'), identitiesBefore, 'no identity deleted');
  assert.equal(await fingerprint('public.hlektrismos_leads'), leadsBefore, 'customer and ownership data untouched');
  assert.equal(await count('auth.sessions', `user_id in ('${U.probe1}', '${U.probe2}')`), 2, 'the probe accounts are NOT handled by this script');
});

test('QA cleanup refuses an unexpected set of accounts, and is safe to run twice', async () => {
  await qaWorld();
  await db.exec(`delete from public.profiles where id = '${U.qaInside}'; delete from auth.identities where user_id = '${U.qaInside}'; delete from auth.users where id = '${U.qaInside}'`);
  assert.match((await attempt(script('deactivate_qa_accounts.sql'))).err, /expected the 6 known/);
  await build(); await qaWorld();
  assert.equal((await attempt(script('deactivate_qa_accounts.sql'))).ok, true);
  assert.equal((await attempt(script('deactivate_qa_accounts.sql'))).ok, true, 'second run');
  assert.equal(await count('public.profiles', 'is_active'), 1);
});

test('probe cleanup is separate: it bans and revokes the two probe accounts only, deletes nothing, and has the same real-admin guard', async () => {
  await qaWorld({ realAdmin: false });
  assert.match((await attempt(script('deactivate_probe_accounts.sql'))).err, /no active real admin/);
  await build(); await qaWorld();
  const usersBefore = await count('auth.users');
  assert.equal((await attempt(script('deactivate_probe_accounts.sql'))).ok, true);
  assert.equal(await count('auth.users', `id in ('${U.probe1}', '${U.probe2}') and banned_until > now()`), 2);
  assert.equal(await count('auth.sessions', `user_id in ('${U.probe1}', '${U.probe2}')`), 0);
  assert.equal(await count('auth.identities', `user_id in ('${U.probe1}', '${U.probe2}')`), 2, 'identities kept');
  assert.equal(await count('auth.users'), usersBefore, 'no Auth user deleted');
  assert.equal(await count('public.profiles', 'is_active'), 7, 'no profile was changed');
  assert.equal(await count('auth.sessions', `user_id = '${U.qaAdmin}'`), 1, 'the six QA accounts are not touched by it');
});

test('probe cleanup refuses when a probe has gained a CRM profile, or when a probe is missing', async () => {
  await qaWorld();
  await db.exec(`insert into public.profiles (id, full_name, role, is_active, organization_id) values ('${U.probe1}', 'x', 'field_sales', true, '${ORG}')`);
  assert.match((await attempt(script('deactivate_probe_accounts.sql'))).err, /not a probe any more/);
  await build(); await qaWorld();
  await db.exec(`delete from auth.identities where user_id = '${U.probe2}'; delete from auth.users where id = '${U.probe2}'`);
  assert.match((await attempt(script('deactivate_probe_accounts.sql'))).err, /expected the 2 known/);
});
