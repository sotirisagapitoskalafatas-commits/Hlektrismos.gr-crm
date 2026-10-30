#!/usr/bin/env node
// REAL-JWT verification of phase1/20 (crm_integrations hotfix) against the STAGING Supabase project only (never production).
//   node scripts/qa/staging-crm-integrations.mjs
// Creates THROWAWAY Auth users (random passwords generated in-process, never printed), seeds one marker row, applies
// supabase/staged-migrations/phase1/20_crm_integrations_emergency_hotfix.sql (twice), signs everyone in over the real Auth API,
// sends real PostgREST requests, then removes the users and the marker row and re-applies phase6/21 (restores the legacy-role trigger).
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGING = 'jiencxiapucrexpmzxbo';
const REF = STAGING;
const URL_BASE = `https://${REF}.supabase.co`;
const CLI = ['-y', 'supabase@2.120.0'];
const workdir = mkdtempSync(join(tmpdir(), 'ci-hotfix-'));
const TAG = randomBytes(3).toString('hex');
const ROW = `qa-${TAG}`;

function cli(args) {
  const r = spawnSync('npx', [...CLI, ...args], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 20 * 1024 * 1024 });
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

const keys = JSON.parse((() => { const o = cli(['projects', 'api-keys', '--project-ref', REF, '-o', 'json']).out; return o.slice(o.indexOf('['), o.lastIndexOf(']') + 1); })());
const PUB = (keys.find((k) => /publishable/i.test(k.name ?? k.type ?? '')) ?? keys.find((k) => k.name === 'anon'))?.api_key;
const SECRET = (keys.find((k) => /secret|service_role/i.test(k.name ?? k.type ?? '')))?.api_key; // never printed
if (!PUB || !SECRET) { console.error('keys unavailable'); process.exit(2); }

const api = async (path, { method = 'GET', token, key = PUB, body, prefer } = {}) => {
  const headers = { apikey: key, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) };
  headers.Authorization = `Bearer ${token ?? key}`;
  const r = await fetch(URL_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
};
const rows = (r) => (r.status === 200 && Array.isArray(r.json) ? r.json.length : 0);
const wrote = (r) => (r.status === 200 || r.status === 201) && Array.isArray(r.json) && r.json.length > 0;

const WHO = { admin: 'admin', inactiveAdmin: 'admin', fieldSales: 'field_sales', insideSales: 'inside_sales', manager: 'manager', legacyBo: 'back_office' };
const users = Object.fromEntries(Object.entries(WHO).map(([k, role]) => [k, { role, id: randomUUID(), email: `ci-hotfix-${TAG}-${k.toLowerCase()}@example.invalid`, password: randomBytes(18).toString('base64url') + 'aA1' }]));
const insertUsers = Object.values(users).map((u) => `
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', '${u.id}', 'authenticated', 'authenticated', '${u.email}', crypt('${u.password}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), '${u.id}', jsonb_build_object('sub', '${u.id}', 'email', '${u.email}'), 'email', '${u.id}', now(), now(), now());
  insert into public.profiles (id, full_name, role, is_active) values ('${u.id}', 'QA ${u.role}', '${u.role}', true);`).join('\n');
const ids = Object.values(users).map((u) => `'${u.id}'`).join(',');
const cleanup = () => {
  try { sql(`delete from public.crm_integrations where id like 'qa-${TAG}%'; delete from public.profiles where id in (${ids}); delete from auth.users where email like 'ci-hotfix-${TAG}-%';`); } catch (e) { console.error('cleanup failed:', e.message); }
  try { const m = readFileSync(new URL('../../supabase/staged-migrations/phase6/21_two_role_model.sql', import.meta.url), 'utf8'); sql(m); } catch (e) { console.error('phase6/21 re-apply skipped:', e.message.slice(0, 120)); }
};

try {
  console.log('state BEFORE the hotfix on staging:');
  const pol = sql("select policyname from pg_policies where schemaname='public' and tablename='crm_integrations' order by 1");
  console.log('  policies:', pol.map((p) => p.policyname).join(' | '));
  sql('drop trigger if exists profiles_no_new_legacy_office on public.profiles');
  sql(`select 1; ${insertUsers}`);
  sql(`update public.profiles set is_active = false where id = '${users.inactiveAdmin.id}'`);
  sql(`insert into public.crm_integrations (id, name, connected, config) values ('${ROW}', 'QA row', false, '{"marker":"${TAG}"}'::jsonb)`);
  check('setup: 6 throwaway users and 1 marker integration row', sql(`select (select count(*)::int from public.profiles where id in (${ids})) a, (select count(*)::int from public.crm_integrations where id = '${ROW}') b`)[0]?.a === 6);

  const mig = readFileSync(new URL('../../supabase/staged-migrations/phase1/20_crm_integrations_emergency_hotfix.sql', import.meta.url), 'utf8');
  sql(mig); sql(mig);
  const after = sql("select policyname from pg_policies where schemaname='public' and tablename='crm_integrations' order by 1").map((p) => p.policyname);
  check('phase1/20 applied twice on staging; no permissive policy for public remains', !sql("select 1 from pg_policies where schemaname='public' and tablename='crm_integrations' and permissive='PERMISSIVE' and roles @> array['public']::name[]").length, after.join(' | '));

  const tok = {};
  for (const [k, u] of Object.entries(users)) {
    const r = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: u.email, password: u.password } });
    tok[k] = r.json?.access_token;
    check(`sign-in works for ${k}`, r.status === 200 && !!tok[k], `HTTP ${r.status}`);
  }

  // anonymous
  check('anonymous: SELECT config returns nothing', rows(await api('/rest/v1/crm_integrations?select=config')) === 0);
  check('anonymous: PATCH changes nothing', !wrote(await api(`/rest/v1/crm_integrations?id=eq.${ROW}`, { method: 'PATCH', body: { connected: true }, prefer: 'return=representation' })));
  check('anonymous: INSERT refused', ![200, 201].includes((await api('/rest/v1/crm_integrations', { method: 'POST', body: { id: `${ROW}-x`, name: 'x' }, prefer: 'return=representation' })).status));

  // everyone except the active admin
  for (const k of ['inactiveAdmin', 'fieldSales', 'insideSales', 'manager', 'legacyBo']) {
    check(`${k}: SELECT config returns nothing`, rows(await api('/rest/v1/crm_integrations?select=config', { token: tok[k] })) === 0);
    check(`${k}: PATCH changes nothing`, !wrote(await api(`/rest/v1/crm_integrations?id=eq.${ROW}`, { method: 'PATCH', token: tok[k], body: { connected: true }, prefer: 'return=representation' })));
    check(`${k}: INSERT refused`, ![200, 201].includes((await api('/rest/v1/crm_integrations', { method: 'POST', token: tok[k], body: { id: `${ROW}-${k}`, name: 'x' }, prefer: 'return=representation' })).status));
    check(`${k}: DELETE removes nothing`, !wrote(await api(`/rest/v1/crm_integrations?id=eq.${ROW}`, { method: 'DELETE', token: tok[k], prefer: 'return=representation' })));
  }
  check('marker row still present after all refused attempts', sql(`select count(*)::int n from public.crm_integrations where id = '${ROW}'`)[0]?.n === 1);

  // the active admin keeps management
  const a = await api('/rest/v1/crm_integrations?select=id,config', { token: tok.admin });
  check('active admin: reads rows including config', rows(a) >= 1 && a.json.some((r) => r.id === ROW));
  check('active admin: updates', wrote(await api(`/rest/v1/crm_integrations?id=eq.${ROW}`, { method: 'PATCH', token: tok.admin, body: { connected: true }, prefer: 'return=representation' })));
  check('active admin: inserts and deletes', wrote(await api('/rest/v1/crm_integrations', { method: 'POST', token: tok.admin, body: { id: `${ROW}-adm`, name: 'adm' }, prefer: 'return=representation' })) && wrote(await api(`/rest/v1/crm_integrations?id=eq.${ROW}-adm`, { method: 'DELETE', token: tok.admin, prefer: 'return=representation' })));

  // service role (what Edge Functions use)
  check('service_role: reads and updates (Edge Function path intact)', rows(await api(`/rest/v1/crm_integrations?id=eq.${ROW}&select=id`, { key: SECRET })) === 1 && wrote(await api(`/rest/v1/crm_integrations?id=eq.${ROW}`, { method: 'PATCH', key: SECRET, body: { connected: false }, prefer: 'return=representation' })));
} catch (e) {
  console.error('ABORTED:', e.message); results.push(false);
} finally {
  cleanup();
  rmSync(workdir, { recursive: true, force: true });
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed against STAGING (${REF}) with real Auth JWTs`);
process.exit(failed ? 1 : 0);
