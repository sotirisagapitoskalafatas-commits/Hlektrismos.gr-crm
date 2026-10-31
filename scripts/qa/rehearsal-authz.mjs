#!/usr/bin/env node
// REAL-JWT authorization rehearsal for a CRM-ONLY staging project (never production, never a project shared with another app).
//   CRM_STAGING_REF=<ref> node scripts/qa/rehearsal-authz.mjs            run the rehearsal
//   CRM_STAGING_REF=<ref> node scripts/qa/rehearsal-authz.mjs --plan     print the matrix, touch nothing
// Needs: the Supabase CLI logged in (npx supabase@2.120.0); the CRM migrations and Edge Functions already deployed to that project;
// this checkout LINKED to that project (supabase/.temp/project-ref must equal CRM_STAGING_REF: SQL runs against the linked project);
// CRM_STAGING_VERSIONS_VERIFIED=yes, set by the owner only after confirming the project runs the reviewed repository functions with
// outreach switched off (older function versions do not check the caller and could start work when called).
// What it does: creates THROWAWAY Auth users (random passwords generated in this process, never printed or stored), signs each in over
// the real Auth API, then sends real requests as: anonymous, Admin, two Sales Agents, an inactive Sales Agent, legacy manager and legacy
// back_office to (a) the sensitive tables and (b) every Edge Function with a payload that is INVALID on purpose, so a function that
// authorizes the caller answers 400/422 for an allowed caller and 401/403 for a denied one, and a function that does not check the
// caller is exposed by answering 400/200/500 to everyone. Only status codes are printed. The throwaway users are removed at the end.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// Functions that start work (campaigns, tariff syncs, scrapers, workers) without needing a request body. They are only exercised with
// --include-work-functions, because an older, unguarded version would run when called, whoever the caller is.
export const WORK_FUNCTIONS = new Set(['campaign-scheduler', 'sync-green-tariffs', 'sync-market-tariffs', 'autonomous-tariff-scraper', 'agent-worker', 'ai-orchestrator', 'orchestrator', 'ai-developer', 'scrape-program-details', 'enrich-lead', 'billing-ocr']);

/** The project this checkout is linked to (supabase db query --linked targets it), or null. */
export function linkedRef(dir = process.cwd()) {
  const f = join(dir, 'supabase', '.temp', 'project-ref');
  try { return existsSync(f) ? readFileSync(f, 'utf8').trim() : null; } catch { return null; }
}
/** null when it is safe to run SQL for `ref`: the linked project must BE the target, otherwise throwaway users would be created elsewhere. */
export function linkProblem(ref, dir = process.cwd()) {
  const linked = linkedRef(dir);
  if (!linked) return 'this checkout is not linked to any Supabase project (supabase link --project-ref ' + ref + ')';
  if (linked !== ref) return 'refusing: SQL would run on the LINKED project (' + (linked === PRODUCTION ? 'production' : linked === SHARED_STAGING ? 'the shared staging project' : 'another project') + '), not on CRM_STAGING_REF';
  return null;
}

export function expectedForFunction(access, caller) {
  if (access === 'public') return 'any';
  if (access === 'secret') return 'denied';
  const allowed = { admin: ['admin'], 'admin+inside': ['admin', 'inside'], staff: ['admin', 'inside', 'fieldA'] }[access];
  return allowed.includes(caller) ? 'allowed' : 'denied';
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const why = refuse(REF);
  if (why) { console.error(why); process.exit(2); }
  if (!plan) {
    const lp = linkProblem(REF);
    if (lp) { console.error(lp); process.exit(2); }
    if (process.env.CRM_STAGING_VERSIONS_VERIFIED !== 'yes') { console.error('refusing: set CRM_STAGING_VERSIONS_VERIFIED=yes after confirming the project runs the reviewed repository functions with outreach switched off'); process.exit(2); }
  }
  if (plan) {
    console.log(`PLAN for ${REF} (nothing is sent):`);
    console.log(`tables: ${Object.keys(TABLES).join(', ')}`);
    console.log(`callers: ${CALLERS.join(', ')}`);
    for (const [fn, access] of FUNCTIONS) console.log(`  ${fn.padEnd(26)} ${access.padEnd(13)} ` + (WORK_FUNCTIONS.has(fn) ? '(skipped unless --include-work-functions) ' : '') + CALLERS.map((c) => `${c}:${expectedForFunction(access, c)}`).join(' '));
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
  let restoreTrigger = () => {};
  const results = [];
  const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`); };
  const cleanup = () => { try { sql(`delete from public.profiles where id in (${Object.values(users).map((u) => `'${u.id}'`).join(',')}); delete from auth.identities where user_id in (${Object.values(users).map((u) => `'${u.id}'`).join(',')}); delete from auth.users where id in (${Object.values(users).map((u) => `'${u.id}'`).join(',')});`); } catch { /* best effort */ } };
  try {
    // Legacy profiles can only be seeded while the trigger that forbids new legacy roles is absent: remember its exact definition,
    // drop it for the seeding statement, and put it back in every case (see the finally block).
    const trig = sql("select pg_get_triggerdef(t.oid) def from pg_trigger t where t.tgname = 'profiles_no_new_legacy_office' and not t.tgisinternal and t.tgrelid = 'public.profiles'::regclass")[0]?.def ?? null;
    restoreTrigger = () => { if (trig) sql(trig.replace(/^CREATE TRIGGER/i, 'CREATE OR REPLACE TRIGGER')); };
    sql('drop trigger if exists profiles_no_new_legacy_office on public.profiles');
    const seeded = Object.values(users).map((u) => `
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000', '${u.id}', 'authenticated', 'authenticated', '${u.email}', crypt('${u.password}', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), '${u.id}', jsonb_build_object('sub', '${u.id}', 'email', '${u.email}'), 'email', '${u.id}', now(), now(), now());
      insert into public.profiles (id, full_name, role, is_active) values ('${u.id}', 'QA ${u.role}', '${u.role}', true);`).join('\n');
    sql(seeded);
    restoreTrigger(); // the guard trigger is back before any test request is sent
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
      if (WORK_FUNCTIONS.has(fn) && !process.argv.includes('--include-work-functions')) { console.log(`SKIP  ${fn}: starts work without a body; use --include-work-functions only against reviewed function versions`); continue; }
      for (const who of CALLERS) {
        const r = await call(`/functions/v1/${fn}`, { method: 'POST', token: tok[who], body: {} });
        const want = expectedForFunction(access, who);
        const denied = r.status === 401 || r.status === 403;
        if (want === 'any') { console.log(`INFO  ${fn}: ${who} -> HTTP ${r.status} (public by design)`); continue; }
        check(`${fn}: ${who} ${want === 'denied' ? 'is refused (401/403)' : 'passes the gate (not 401/403)'}`, want === 'denied' ? denied : !denied, `HTTP ${r.status}`);
      }
    }
  } finally {
    cleanup();
    try { restoreTrigger(); } catch { /* verified just below */ }
    // the guard trigger must exist again whatever happened above
    const trigBack = sql("select count(*)::int n from pg_trigger where tgname = 'profiles_no_new_legacy_office' and not tgisinternal")[0]?.n;
    if (trigBack === 0) console.log('WARNING  the guard trigger profiles_no_new_legacy_office is NOT present after the run; re-apply phase6/21 on this project');
    rmSync(workdir, { recursive: true, force: true });
  }
  const bad = results.filter((x) => !x).length;
  console.log(`\n${results.length - bad}/${results.length} checks passed`);
  process.exit(bad ? 1 : 0);
}
