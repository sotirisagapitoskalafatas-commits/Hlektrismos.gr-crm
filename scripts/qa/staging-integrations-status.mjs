#!/usr/bin/env node
// REAL-JWT verification of phase6/22 (public.crm_integrations_status becomes security_invoker) against STAGING only.
//   node scripts/qa/staging-integrations-status.mjs
// Creates THROWAWAY Auth users (random passwords generated in-process, never printed) and one marker row, applies phase6/22 (twice),
// signs everyone in over the real Auth API, queries the view over PostgREST, then removes everything and re-applies phase6/21.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REF = 'jiencxiapucrexpmzxbo'; // staging
const URL_BASE = `https://${REF}.supabase.co`;
const workdir = mkdtempSync(join(tmpdir(), 'ci-status-'));
const TAG = randomBytes(3).toString('hex');
const ROW = `qa-${TAG}`;
const rel = (p) => new URL(`../../${p}`, import.meta.url);

function cli(args) {
  const r = spawnSync('npx', ['-y', 'supabase@2.120.0', ...args], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 20 * 1024 * 1024 });
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
const SECRET = keys.find((k) => /secret|service_role/i.test(k.name ?? k.type ?? ''))?.api_key; // never printed
if (!PUB || !SECRET) { console.error('keys unavailable'); process.exit(2); }

const api = async (path, { method = 'GET', token, key = PUB, body } = {}) => {
  const r = await fetch(URL_BASE + path, { method, headers: { apikey: key, Authorization: `Bearer ${token ?? key}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
};
const rows = (r) => (r.status === 200 && Array.isArray(r.json) ? r.json.length : 0);

const WHO = { admin: 'admin', inactiveAdmin: 'admin', fieldSales: 'field_sales', insideSales: 'inside_sales', manager: 'manager', legacyBo: 'back_office' };
const users = Object.fromEntries(Object.entries(WHO).map(([k, role]) => [k, { role, id: randomUUID(), email: `ci-status-${TAG}-${k.toLowerCase()}@example.invalid`, password: randomBytes(18).toString('base64url') + 'aA1' }]));
const insertUsers = Object.values(users).map((u) => `
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', '${u.id}', 'authenticated', 'authenticated', '${u.email}', crypt('${u.password}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), '${u.id}', jsonb_build_object('sub', '${u.id}', 'email', '${u.email}'), 'email', '${u.id}', now(), now(), now());
  insert into public.profiles (id, full_name, role, is_active) values ('${u.id}', 'QA ${u.role}', '${u.role}', true);`).join('\n');
const ids = Object.values(users).map((u) => `'${u.id}'`).join(',');
const cleanup = () => {
  try { sql(`delete from public.crm_integrations where id like 'qa-${TAG}%'; delete from public.profiles where id in (${ids}); delete from auth.users where email like 'ci-status-${TAG}-%';`); } catch (e) { console.error('cleanup failed:', e.message); }
  try { sql(readFileSync(rel('supabase/staged-migrations/phase6/21_two_role_model.sql'), 'utf8')); } catch (e) { console.error('phase6/21 re-apply failed:', e.message.slice(0, 120)); }
};

try {
  console.log('view options BEFORE:', JSON.stringify(sql("select reloptions from pg_class where oid = 'public.crm_integrations_status'::regclass")[0]?.reloptions));
  sql('drop trigger if exists profiles_no_new_legacy_office on public.profiles');
  sql(`select 1; ${insertUsers}`);
  sql(`update public.profiles set is_active = false where id = '${users.inactiveAdmin.id}'`);
  sql(`insert into public.crm_integrations (id, name, connected, config) values ('${ROW}', 'QA row', false, '{"marker":"${TAG}"}'::jsonb)`);
  check('setup: 6 throwaway users', sql(`select count(*)::int a from public.profiles where id in (${ids})`)[0]?.a === 6);

  const mig = readFileSync(rel('supabase/staged-migrations/phase6/22_crm_integrations_status_invoker.sql'), 'utf8');
  sql(mig); sql(mig);
  check('phase6/22 applied twice on staging; the view is security_invoker', sql("select coalesce('security_invoker=true' = any (select unnest(reloptions) from pg_class where oid = 'public.crm_integrations_status'::regclass), false) ok")[0]?.ok === true);

  const tok = {};
  for (const [k, u] of Object.entries(users)) {
    const r = await api('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: u.email, password: u.password } });
    tok[k] = r.json?.access_token;
    check(`sign-in works for ${k}`, r.status === 200 && !!tok[k], `HTTP ${r.status}`);
  }

  const V = '/rest/v1/crm_integrations_status';
  check('anonymous: status view returns nothing', rows(await api(`${V}?select=id`)) === 0);
  for (const k of ['inactiveAdmin', 'fieldSales', 'insideSales', 'manager', 'legacyBo']) {
    check(`${k}: status view returns no rows`, rows(await api(`${V}?select=id`, { token: tok[k] })) === 0);
    check(`${k}: config is not reachable through the view`, rows(await api(`${V}?select=config`, { token: tok[k] })) === 0);
  }
  const a = await api(`${V}?select=id,name,connected,updated_at`, { token: tok.admin });
  check('active admin: sees the marker row through the view', rows(a) >= 1 && a.json.some((r) => r.id === ROW));
  check('active admin: the view has no config column (request refused)', (await api(`${V}?select=config`, { token: tok.admin })).status >= 400);
  check('service_role: reads the view', rows(await api(`${V}?select=id`, { key: SECRET })) >= 1);
  check('no function named crm_integrations_status* exists (no new SECURITY DEFINER API)', sql("select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace and proname like 'crm_integrations_status%'")[0]?.n === 0);
  sql(readFileSync(rel('docs/ops/rollback_phase6_22_crm_integrations_status_invoker.sql'), 'utf8'));
  check('rollback keeps security_invoker = true', sql("select coalesce('security_invoker=true' = any (select unnest(reloptions) from pg_class where oid = 'public.crm_integrations_status'::regclass), false) ok")[0]?.ok === true);
} catch (e) {
  console.error('ABORTED:', e.message); results.push(false);
} finally {
  cleanup();
  rmSync(workdir, { recursive: true, force: true });
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed against STAGING (${REF}) with real Auth JWTs`);
process.exit(failed ? 1 : 0);
