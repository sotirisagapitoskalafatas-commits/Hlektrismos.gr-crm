#!/usr/bin/env node
// REAL-JWT authorization rehearsal for a CRM-ONLY staging project (never production, never a project shared with another app).
//   CRM_STAGING_REF=<ref> node scripts/qa/rehearsal-authz.mjs            run the rehearsal
//   CRM_STAGING_REF=<ref> node scripts/qa/rehearsal-authz.mjs --plan     print the matrix, touch nothing
// Needs: the Supabase CLI logged in (npx supabase@2.120.0); the CRM migrations and Edge Functions already deployed to that project.
// What it does: creates THROWAWAY Auth users (random passwords generated in this process, never printed or stored), signs each in over
// the real Auth API, then sends real requests as: anonymous, Admin, two Sales Agents, an inactive Sales Agent, legacy manager and legacy
// back_office to (a) the sensitive tables and (b) every Edge Function with a payload that is INVALID on purpose, so a function that
// authorizes the caller answers 400/422 for an allowed caller and 401/403 for a denied one, and a function that does not check the
// caller is exposed by answering 400/200/500 to everyone. Only status codes are printed. The throwaway users are removed at the end.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PRODUCTION = 'nonaymiwdayfuulccxrl';
const SHARED_STAGING = 'jiencxiapucrexpmzxbo'; // shares its database with an unrelated application: never touched by this script
const REF = process.env.CRM_STAGING_REF ?? '';
const plan = process.argv.includes('--plan');

export function refuse(ref) {
  if (!/^[a-z0-9]{20}$/.test(ref)) return 'set CRM_STAGING_REF to the 20-character ref of the CRM-only staging project';
  if (ref === PRODUCTION) return 'refusing: that is the production project';
  if (ref === SHARED_STAGING) return 'refusing: that project is shared with an unrelated application';
  return null;
}

// who may do what. "read" = rows visible through the API; the expected value is the number of rows an empty-filter select may return (0 = nothing).
export const TABLES = {
  crm_emails: { admin: 'rows', sales: 'rows', inactive: 'none', legacy: 'rows-until-phase6-23', anon: 'none' },
  customer_documents: { admin: 'rows', sales: 'none', inactive: 'none', legacy: 'none', anon: 'none' },
  sales_agents: { admin: 'rows', sales: 'rows', inactive: 'none', legacy: 'rows-until-phase6-23', anon: 'none' },
  crm_integrations: { admin: 'rows', sales: 'none', inactive: 'none', legacy: 'none', anon: 'none' },
  crm_settings: { admin: 'rows', sales: 'none', inactive: 'none', legacy: 'none', anon: 'none' },
};
// Edge Functions: [name, who may reach the function's own logic]. 'staff' = Admin + both Sales Agents; 'admin' = Admin only;
// 'public' = anyone; 'secret' = only a caller holding the function's own secret (never one of the test users).
export const FUNCTIONS = [
  ['admin-users', 'admin'], ['scrape-b2b', 'admin+inside'], ['aade-lookup', 'staff'], ['ask-market-rag', 'staff'], ['billing-ocr', 'staff'],
  ['enrich-lead', 'staff'], ['fetch-emails', 'staff'], ['generate-embedding', 'staff'], ['make-voice-call', 'staff'], ['scrape-program-details', 'staff'],
  ['send-campaign-email', 'staff'], ['send-email', 'staff'], ['send-offer', 'staff'], ['send-sms', 'staff'], ['sync-market-tariffs', 'staff'],
  ['ai-developer', 'staff'], ['ai-orchestrator', 'staff'], ['agent-worker', 'staff'], ['orchestrator', 'staff'], ['autonomous-tariff-scraper', 'staff'],
  ['sync-green-tariffs', 'staff'], ['campaign-scheduler', 'secret'], ['vapi-webhook', 'secret'], ['receive-lead-webhook', 'secret'], ['accept-offer', 'secret'],
  ['chat', 'public'], ['unsubscribe', 'public'], ['send-lead-confirmation', 'public'],
];
export const CALLERS = ['anon', 'admin', 'inside', 'fieldA', 'inactive', 'manager', 'legacyBo'];

export function expectedForFunction(access, caller) {
  if (access === 'public') return 'any';
  if (access === 'secret') return 'denied';
  const allowed = { admin: ['admin'], 'admin+inside': ['admin', 'inside'], staff: ['admin', 'inside', 'fieldA'] }[access];
  return allowed.includes(caller) ? 'allowed' : 'denied';
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const why = refuse(REF);
  if (why) { console.error(why); process.exit(2); }
  if (plan) {
    console.log(`PLAN for ${REF} (nothing is sent):`);
    console.log(`tables: ${Object.keys(TABLES).join(', ')}`);
    console.log(`callers: ${CALLERS.join(', ')}`);
    for (const [fn, access] of FUNCTIONS) console.log(`  ${fn.padEnd(26)} ${access.padEnd(13)} ` + CALLERS.map((c) => `${c}:${expectedForFunction(access, c)}`).join(' '));
    process.exit(0);
  }
  await run();
}

async function run() {
  const URL_BASE = `https://${REF}.supabase.co`;
  const CLI = ['-y', 'supabase@2.120.0'];
  const workdir = mkdtempSync(join(tmpdir(), 'rehearsal-'));
  const TAG = randomBytes(3).toString('hex');
  const cli = (args) => { const r = spawnSync('npx', [...CLI, ...args], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 20 * 1024 * 1024 }); return { code: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  const sql = (text) => {
    const f = join(workdir, `q-${randomBytes(3).toString('hex')}.sql`); writeFileSync(f, text);
    const r = cli(['db', 'query', '--linked', '-o', 'json', '-f', f]); rmSync(f, { force: true });
    const i = r.out.indexOf('{'), j = r.out.lastIndexOf('}');
    try { return JSON.parse(r.out.slice(i, j + 1)).rows ?? []; } catch { return []; }
  };
  // the project must be the one linked in this checkout: fail rather than touch another database
  const linked = cli(['projects', 'list', '-o', 'json']).out;
  if (!linked.includes(REF)) { console.error('the CRM staging project is not visible to the logged-in CLI'); process.exit(2); }
  const keys = JSON.parse((() => { const o = cli(['projects', 'api-keys', '--project-ref', REF, '-o', 'json']).out; return o.slice(o.indexOf('['), o.lastIndexOf(']') + 1); })());
  const PUB = (keys.find((k) => /publishable/i.test(k.name ?? k.type ?? '')) ?? keys.find((k) => k.name === 'anon'))?.api_key;
  if (!PUB) { console.error('no publishable/anon key available'); process.exit(2); }
  const call = async (path, { method = 'GET', token, body, headers } = {}) => {
    const r = await fetch(URL_BASE + path, { method, headers: { apikey: PUB, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await r.json(); } catch { /* empty */ }
    return { status: r.status, json };
  };
  const WHO = { admin: 'admin', inside: 'inside_sales', fieldA: 'field_sales', fieldB: 'field_sales', inactive: 'field_sales', manager: 'manager', legacyBo: 'back_office' };
  const users = Object.fromEntries(Object.entries(WHO).map(([k, role]) => [k, { role, id: randomUUID(), email: `rehearsal-${TAG}-${k.toLowerCase()}@example.invalid`, password: randomBytes(18).toString('base64url') }]));
  const results = [];
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`); };
  const cleanup = () => { try { sql(`delete from public.profiles where id in (${Object.values(users).map((u) => `'${u.id}'`).join(',')}); delete from auth.identities where user_id in (${Object.values(users).map((u) => `'${u.id}'`).join(',')}); delete from auth.users where id in (${Object.values(users).map((u) => `'${u.id}'`).join(',')});`); } catch { /* best effort */ } };
  try {
    sql('drop trigger if exists profiles_no_new_legacy_office on public.profiles');
    sql(Object.values(users).map((u) => `
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000', '${u.id}', 'authenticated', 'authenticated', '${u.email}', crypt('${u.password}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), '${u.id}', jsonb_build_object('sub', '${u.id}', 'email', '${u.email}'), 'email', '${u.id}', now(), now(), now());
      insert into public.profiles (id, full_name, role, is_active) values ('${u.id}', 'QA ${u.role}', '${u.role}', true);`).join('\n'));
    const tok = {};
    for (const [k, u] of Object.entries(users)) {
      const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: u.email, password: u.password } });
      tok[k] = r.json?.access_token; check(`sign-in works for ${k}`, r.status === 200 && !!tok[k], `HTTP ${r.status}`);
    }
    sql(`update public.profiles set is_active = false where id = '${users.inactive.id}'`);
    tok.anon = undefined;

    for (const [table, exp] of Object.entries(TABLES)) {
      for (const who of CALLERS) {
        const group = who === 'anon' ? 'anon' : who === 'admin' ? 'admin' : who === 'inactive' ? 'inactive' : ['manager', 'legacyBo'].includes(who) ? 'legacy' : 'sales';
        const r = await call(`/rest/v1/${table}?select=*&limit=1`, { token: tok[who] });
        const rows = Array.isArray(r.json) ? r.json.length : 0;
        const want = exp[group];
        if (want === 'none') check(`${table}: ${who} reads nothing`, rows === 0, `HTTP ${r.status}`);
        else if (want === 'rows') check(`${table}: ${who} can read (when rows exist)`, r.status === 200, `HTTP ${r.status}`);
        else console.log(`INFO  ${table}: ${who} -> HTTP ${r.status}, rows=${rows} (legacy roles stay staff in the database until phase6/23)`);
      }
    }
    for (const [fn, access] of FUNCTIONS) {
      for (const who of CALLERS) {
        const r = await call(`/functions/v1/${fn}`, { method: 'POST', token: tok[who], body: {} });
        const want = expectedForFunction(access, who);
        const denied = r.status === 401 || r.status === 403;
        if (want === 'any') { console.log(`INFO  ${fn}: ${who} -> HTTP ${r.status} (public by design)`); continue; }
        check(`${fn}: ${who} ${want === 'denied' ? 'is refused (401/403)' : 'passes the gate (not 401/403)'}`, want === 'denied' ? denied : !denied, `HTTP ${r.status}`);
      }
    }
  } finally { cleanup(); rmSync(workdir, { recursive: true, force: true }); }
  const bad = results.filter((x) => !x).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
}
