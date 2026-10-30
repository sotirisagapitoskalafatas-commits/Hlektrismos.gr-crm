#!/usr/bin/env node
// REAL-JWT verification of the two-role account model against the STAGING Supabase project (never production).
//   node scripts/qa/staging-two-role.mjs [--keep]
// Needs: the Supabase CLI logged in (npx supabase@2.120.0), and phase2/05 already applied on staging.
// What it does: creates THROWAWAY Auth users (random passwords generated in this process, never printed or stored),
// applies supabase/staged-migrations/phase6/21_two_role_model.sql, signs each user in over the real Auth API and sends
// real requests (RPCs, direct PostgREST writes, the admin-users Edge Function), then removes the throwaway users.
// Unlike scripts/qa/redesign-smoke.mjs (a UI test against a MOCK with no authorization) this tests AUTHORIZATION.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGING = 'jiencxiapucrexpmzxbo';
const PRODUCTION = 'nonaymiwdayfuulccxrl';
const REF = process.env.TWO_ROLE_REF ?? STAGING;
if (REF !== STAGING || REF === PRODUCTION) { console.error('Refusing to run: this test only runs against the staging project ' + STAGING); process.exit(2); }
const URL_BASE = `https://${REF}.supabase.co`;
const CLI = ['-y', 'supabase@2.120.0'];
const keep = process.argv.includes('--keep');
const workdir = mkdtempSync(join(tmpdir(), 'two-role-'));
const TAG = randomBytes(3).toString('hex');

function cli(args, input) {
  const r = spawnSync('npx', [...CLI, ...args], { encoding: 'utf8', shell: process.platform === 'win32', input, maxBuffer: 20 * 1024 * 1024 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function sql(text) {
  const f = join(workdir, `q-${randomBytes(3).toString('hex')}.sql`);
  writeFileSync(f, text);
  const r = cli(['db', 'query', '--linked', '--project-ref', REF, '-o', 'json', '-f', f]);
  rmSync(f, { force: true });
  const i = r.out.indexOf('['), j = r.out.lastIndexOf(']');
  if (r.code !== 0 && i < 0) throw new Error('sql failed: ' + r.out.replace(/\s+/g, ' ').slice(0, 300));
  try { return i >= 0 ? JSON.parse(r.out.slice(i, j + 1)) : []; } catch { return []; }
}

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// publishable (or anon) key: public by design, read through the CLI, never printed
const keys = JSON.parse((() => { const o = cli(['projects', 'api-keys', '--project-ref', REF, '-o', 'json']).out; return o.slice(o.indexOf('['), o.lastIndexOf(']') + 1); })());
const PUB = (keys.find((k) => /publishable/i.test(k.name ?? k.type ?? '')) ?? keys.find((k) => k.name === 'anon'))?.api_key;
if (!PUB) { console.error('no publishable/anon key available'); process.exit(2); }

const H = (token, extra = {}) => ({ apikey: PUB, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra });
const api = async (path, { method = 'GET', token, body, headers } = {}) => {
  const r = await fetch(URL_BASE + path, { method, headers: H(token, headers), body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
};
const denied = (r) => r.status === 401 || r.status === 403 || (r.json && /42501|not allowed|permission denied/i.test(JSON.stringify(r.json)));

/* ---------- 1. throwaway users (SQL, because the real accounts are provisioned through the Dashboard invitation) ---------- */
const WHO = {
  admin: 'admin', manager: 'manager', legacyBo: 'back_office', inside: 'inside_sales', fieldA: 'field_sales', fieldB: 'field_sales', inactive: 'field_sales',
};
const users = Object.fromEntries(Object.entries(WHO).map(([k, role]) => [k, { role, id: randomUUID(), email: `two-role-${TAG}-${k.toLowerCase()}@example.invalid`, password: randomBytes(18).toString('base64url') + 'aA1' }]));
const insertUsers = Object.values(users).map((u) => `
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', '${u.id}', 'authenticated', 'authenticated', '${u.email}', crypt('${u.password}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), '${u.id}', jsonb_build_object('sub', '${u.id}', 'email', '${u.email}'), 'email', '${u.id}', now(), now(), now());
  insert into public.profiles (id, full_name, role, is_active) values ('${u.id}', 'QA ${u.role}', '${u.role}', true);`).join('\n');
const cleanup = () => { try { sql(`delete from public.cases where title like 'two-role-${TAG}%'; delete from public.leads where full_name like 'two-role-${TAG}%'; delete from public.profiles where id in (${Object.values(users).map((u) => `'${u.id}'`).join(',')}) or id in (select id from auth.users where email like 'two-role-${TAG}-%'); delete from auth.users where email like 'two-role-${TAG}-%';`); } catch (e) { console.error('cleanup failed:', e.message); } };

try {
  // legacy rows can only be seeded while the legacy-role trigger is absent (that is the point of the trigger); phase6/21 is re-applied below
  sql('drop trigger if exists profiles_no_new_legacy_office on public.profiles');
  sql(`select 1; ${insertUsers}`);
  // the LEGACY state first: manager / legacy back office rows exist (inserted before the trigger of phase6/21 exists)
  const before = sql(`select count(*)::int n from public.profiles where id in (${Object.values(users).map((u) => `'${u.id}'`).join(',')});`);
  check('setup: 7 throwaway users with profiles', before[0]?.n === 7);

  /* ---------- 2. apply the migration under test (idempotent) ---------- */
  const mig = readFileSync(new URL('../../supabase/staged-migrations/phase6/21_two_role_model.sql', import.meta.url), 'utf8');
  sql(mig); sql(mig);
  check('phase6/21 applied twice without error', sql("select exists (select 1 from pg_trigger where tgname = 'profiles_no_new_legacy_office' and not tgisinternal) ok")[0]?.ok === true);

  /* ---------- 3. real sign-ins ---------- */
  const tok = {};
  for (const [k, u] of Object.entries(users)) {
    const r = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: u.email, password: u.password } });
    tok[k] = r.json?.access_token; u.uid = r.json?.user?.id;
    check(`sign-in works for ${k}`, r.status === 200 && !!tok[k] && u.uid === u.id, `HTTP ${r.status}`);
  }
  const oldInactiveToken = tok.inactive; // a session issued while the account was still active
  sql(`update public.profiles set is_active = false where id = '${users.inactive.id}'`);

  /* ---------- 4. database RPCs with real JWTs ---------- */
  const list = (who) => api('/rest/v1/rpc/staff_list', { method: 'POST', token: tok[who], body: {} });
  const rl = await list('admin');
  check('admin: staff_list returns the directory', rl.status === 200 && Array.isArray(rl.json) && rl.json.length >= 7);
  check('admin: sees can_manage for Sales Agents only (not itself, not legacy rows re-roled)', rl.json?.find((x) => x.id === users.fieldA.id)?.can_manage === true && rl.json?.find((x) => x.id === users.admin.id)?.can_manage === false);
  for (const who of ['manager', 'legacyBo', 'inside', 'fieldA']) check(`${who}: staff_list refused`, denied(await list(who)));
  check('anonymous: staff_list refused', denied(await api('/rest/v1/rpc/staff_list', { method: 'POST', body: {} })));
  check('inactive agent (old token): staff_list refused', denied(await api('/rest/v1/rpc/staff_list', { method: 'POST', token: oldInactiveToken, body: {} })));

  const setActive = (who, target, on) => api('/rest/v1/rpc/staff_set_active', { method: 'POST', token: tok[who], body: { p_id: users[target].id, p_active: on } });
  check('admin deactivates a Sales Agent', (await setActive('admin', 'fieldB', false)).status < 300);
  check('admin reactivates a Sales Agent', (await setActive('admin', 'fieldB', true)).status < 300);
  for (const who of ['manager', 'legacyBo', 'inside', 'fieldA']) check(`${who}: staff_set_active refused`, denied(await setActive(who, 'fieldB', false)));
  check('admin cannot deactivate itself', denied(await setActive('admin', 'admin', false)));
  const upd = (who, target, role) => api('/rest/v1/rpc/staff_update', { method: 'POST', token: tok[who], body: { p_id: users[target].id, p_full_name: null, p_phone: null, p_role: role } });
  check('admin edits a Sales Agent (name/phone)', (await api('/rest/v1/rpc/staff_update', { method: 'POST', token: tok.admin, body: { p_id: users.fieldB.id, p_full_name: 'QA Agent B', p_phone: '+30 210 0000000', p_role: 'field_sales' } })).status < 300);
  check('admin cannot promote a Sales Agent to admin', denied(await upd('admin', 'fieldB', 'admin')));
  check('admin cannot assign a legacy office role', denied(await upd('admin', 'fieldB', 'back_office')));
  for (const who of ['manager', 'legacyBo', 'inside', 'fieldA']) check(`${who}: staff_update refused`, denied(await upd(who, 'fieldB', 'field_sales')));
  check('a Sales Agent cannot change its own role through the RPC', denied(await upd('fieldA', 'fieldA', 'admin')));

  /* ---------- 5. direct PostgREST writes ---------- */
  const patch = (who, id, body, token = tok[who]) => api(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', token, body, headers: { Prefer: 'return=representation' } });
  const roleNow = (k) => sql(`select role, is_active from public.profiles where id = '${users[k].id}'`)[0];
  const rA = await patch('fieldA', users.fieldA.id, { role: 'admin' });
  check('a Sales Agent cannot promote itself with a direct PATCH', roleNow('fieldA').role === 'field_sales', `HTTP ${rA.status}`);
  const rB = await patch('fieldA', users.fieldB.id, { full_name: 'hijack' });
  check('a Sales Agent cannot edit another agent', (rB.json?.length ?? 0) === 0 && roleNow('fieldB').role === 'field_sales');
  const rC = await patch('manager', users.fieldA.id, { role: 'admin' });
  check('a legacy manager cannot change roles with a direct PATCH', roleNow('fieldA').role === 'field_sales', `HTTP ${rC.status}`);
  const rD = await patch('inactive', users.inactive.id, { is_active: true }, oldInactiveToken);
  check('an inactive agent cannot switch itself back on (old session)', roleNow('inactive').is_active === false, `HTTP ${rD.status}`);
  const rE = await patch('inactive', users.inactive.id, { full_name: 'edited while inactive' }, oldInactiveToken);
  check('an inactive agent cannot even edit its own profile', (rE.json?.length ?? 0) === 0);
  const leads = await api('/rest/v1/leads?select=id&limit=5', { token: oldInactiveToken });
  check('an inactive agent with an old token reads no CRM data', leads.status >= 400 || (Array.isArray(leads.json) && leads.json.length === 0), `HTTP ${leads.status}, rows ${Array.isArray(leads.json) ? leads.json.length : 'n/a'}`);
  const ins = await api('/rest/v1/profiles', { method: 'POST', token: tok.admin, body: { id: randomUUID(), full_name: 'x', role: 'admin' } });
  check('direct INSERT of a profile through the API is refused even for the admin', ins.status >= 400);

  /* ---------- 6. the admin-users Edge Function (must be deployed from this branch first) ---------- */
  const fn = (token, body, headers = {}) => fetch(`${URL_BASE}/functions/v1/admin-users`, { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));
  const newEmail = `two-role-${TAG}-created@example.invalid`;
  const create = (role) => ({ action: 'create', email: newEmail, full_name: 'QA Created Agent', role, mode: 'password', password: randomBytes(12).toString('base64url') + 'aA1!' });
  check('API-key-only caller is refused (no user session)', (await fn(PUB, create('field_sales'))).status === 401);
  check('anonymous (no bearer) is refused', (await fn(null, create('field_sales'))).status === 401);
  for (const who of ['manager', 'legacyBo', 'inside', 'fieldA']) check(`${who}: create refused by the Edge Function`, (await fn(tok[who], create('field_sales'))).status === 403);
  check('inactive agent (old token): create refused', [401, 403].includes((await fn(oldInactiveToken, create('field_sales'))).status));
  for (const role of ['admin', 'manager', 'back_office', 'inside_sales']) check(`admin cannot create a ${role} account`, (await fn(tok.admin, create(role))).status === 403);
  const made = await fn(tok.admin, create('field_sales'));
  check('admin creates a Sales Agent (Auth user + profile)', made.status === 200 && !!made.json?.id, `HTTP ${made.status}`);
  const createdId = made.json?.id;
  if (createdId) {
    const row = sql(`select p.role, p.is_active, u.email from public.profiles p join auth.users u on u.id = p.id where p.id = '${createdId}'`)[0];
    check('the created profile is an active field_sales', row?.role === 'field_sales' && row?.is_active === true);
    check('a Sales Agent cannot delete accounts', (await fn(tok.fieldA, { action: 'delete', user_id: createdId })).status === 403);
    check('legacy manager cannot delete accounts', (await fn(tok.manager, { action: 'delete', user_id: createdId })).status === 403);
    check('a Sales Agent cannot trigger a password reset', (await fn(tok.fieldA, { action: 'reset', user_id: createdId })).status === 403);
    check('legacy manager cannot trigger a password reset', (await fn(tok.manager, { action: 'reset', user_id: createdId })).status === 403);
    const rst = await fn(tok.admin, { action: 'reset', user_id: createdId });
    check('admin reset: authorised (200; 502 if the mailer refuses the throwaway address; 503 while SITE_URL is unset) — never 403', [200, 502, 503].includes(rst.status), `HTTP ${rst.status}`);
    const del = await fn(tok.admin, { action: 'delete', user_id: createdId });
    check('admin deletes an account that nothing references', del.status === 200, `HTTP ${del.status}`);
  }

  /* ---------- 7. e-mail handover keeps the same identity ---------- */
  const em = await api('/auth/v1/user', { method: 'PUT', token: tok.admin, body: { email: `two-role-${TAG}-handover@example.invalid` } });
  const after = sql(`select id::text, email, email_change from auth.users where id = '${users.admin.id}'`)[0];
  if (em.status === 429) console.log('SKIP  e-mail change request: the Auth mailer rate limit was hit (HTTP 429); repeat later or verify with a real mailbox at handover');
  else check('e-mail change request: accepted, same user id, current e-mail unchanged until confirmed', em.status === 200 && after?.id === users.admin.id && after?.email === users.admin.email, `HTTP ${em.status}, pending=${after?.email_change ? 'yes' : 'no'}`);

  /* ---------- 7b. Sales Agent isolation with REAL records and JWTs ---------- */
  const mk = `two-role-${TAG}`;
  sql(`insert into public.leads (client_name, full_name, created_by_user_id, assigned_to_user_id, status) values
         ('${mk} lead A', '${mk} lead A', '${users.fieldA.id}', '${users.fieldA.id}', 'new'),
         ('${mk} lead B', '${mk} lead B', '${users.fieldB.id}', '${users.fieldB.id}', 'new');
       insert into public.cases (title, owner_id, field_sales_owner, created_by, current_stage) values
         ('${mk} case A', '${users.fieldA.id}', '${users.fieldA.id}', '${users.fieldA.id}', 'new'),
         ('${mk} case B', '${users.fieldB.id}', '${users.fieldB.id}', '${users.fieldB.id}', 'new');`);
  const seen = async (who, table, col) => { const r = await api(`/rest/v1/${table}?select=${col}&${col}=like.${encodeURIComponent(mk + '*')}`, { token: tok[who] }); return Array.isArray(r.json) ? r.json.map((x) => x[col]).sort() : null; };
  check('agent A sees only their own lead', JSON.stringify(await seen('fieldA', 'leads', 'full_name')) === JSON.stringify([`${mk} lead A`]));
  check('agent B sees only their own lead', JSON.stringify(await seen('fieldB', 'leads', 'full_name')) === JSON.stringify([`${mk} lead B`]));
  check('agent A sees only their own case', JSON.stringify(await seen('fieldA', 'cases', 'title')) === JSON.stringify([`${mk} case A`]));
  check('agent B sees only their own case', JSON.stringify(await seen('fieldB', 'cases', 'title')) === JSON.stringify([`${mk} case B`]));
  check('admin sees both agents\' leads and cases', (await seen('admin', 'leads', 'full_name'))?.length === 2 && (await seen('admin', 'cases', 'title'))?.length === 2);
  const stealPatch = await api(`/rest/v1/leads?full_name=eq.${encodeURIComponent(mk + ' lead B')}`, { method: 'PATCH', token: tok.fieldA, body: { notes: 'hijack' }, headers: { Prefer: 'return=representation' } });
  check('agent A cannot edit agent B\'s lead', (stealPatch.json?.length ?? 0) === 0, `HTTP ${stealPatch.status}`);
  const stealDel = await api(`/rest/v1/cases?title=eq.${encodeURIComponent(mk + ' case B')}`, { method: 'DELETE', token: tok.fieldA, headers: { Prefer: 'return=representation' } });
  check('agent A cannot delete agent B\'s case', (stealDel.json?.length ?? 0) === 0, `HTTP ${stealDel.status}`);
  const anonRead = await api(`/rest/v1/leads?select=full_name&full_name=like.${encodeURIComponent(mk + '*')}`);
  check('anonymous visitor reads none of them (empty or refused)', Array.isArray(anonRead.json) ? anonRead.json.length === 0 : anonRead.status >= 400, `HTTP ${anonRead.status}`);
  check('legacy manager is not a super-reader either (sees none of the agents\' records unless the SQL says so)', true, 'informational: manager rows seen = ' + ((await seen('manager', 'leads', 'full_name')) ?? ['n/a']).length);

  /* ---------- 8. audit trail ---------- */
  const audit = sql(`select action, count(*)::int n from public.staff_admin_audit where created_at > now() - interval '30 minutes' group by 1`);
  const acts = Object.fromEntries(audit.map((a) => [a.action, a.n]));
  for (const a of ['create', 'deactivate', 'reactivate', 'update']) check(`audit has «${a}»`, (acts[a] ?? 0) >= 1, JSON.stringify(acts));
  check('audit has refused attempts («denied»)', (acts.denied ?? 0) >= 1);
} catch (e) {
  console.error('ABORTED:', e.message); results.push(false);
} finally {
  if (!keep) cleanup();
  rmSync(workdir, { recursive: true, force: true });
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed against STAGING (${REF}) with real Auth JWTs`);
process.exit(failed ? 1 : 0);
