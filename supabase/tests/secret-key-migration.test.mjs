// Secret API key migration (incident: exposed legacy service-role JWT). Proves, on the REAL function code:
//   * every privileged client is built with SUPABASE_SECRET_KEYS["default"], every public client with the
//     publishable key, and no client is ever built with the legacy SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
//     or the custom SERVICE_ROLE_KEY (they hold a stand-in for the exposed JWT in the harness);
//   * the exposed legacy JWT is NOT accepted as an internal caller anywhere;
//   * the secret key in the documented `apikey` header IS accepted as an internal caller;
//   * a missing secret key fails closed with a redacted 500 (no fallback, no value in the body);
//   * admin-users never treats an API key as a user.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, buildSync } from 'esbuild';
import { loadFunction, createDb, SERVICE_KEY, PUBLISHABLE_KEY, LEGACY_SERVICE_JWT } from './helpers/edge-harness.mjs';

const FUNCTIONS = fileURLToPath(new URL('../functions/', import.meta.url));
const ALL = readdirSync(FUNCTIONS).filter((n) => !n.startsWith('_') && statSync(join(FUNCTIONS, n)).isDirectory() && existsSync(join(FUNCTIONS, n, 'index.ts'))).sort();
const OFFICE = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const users = { 'tok-office': OFFICE };
const db = () => createDb({ profiles: [{ id: OFFICE, role: 'admin', is_active: true }], crm_settings: [], hlektrismos_leads: [], rag_document_endpoints: [], scraper_logs: [], agent_memory: [], ai_agents: [], email_suppressions: [] });

// ── keys.ts rules (bundled with a fake Deno global) ──
async function loadKeys(env) {
  const out = buildSync({ entryPoints: [join(FUNCTIONS, '_shared/keys.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  globalThis.Deno = { env: { get: (k) => env[k] } };
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64') + `#${Math.random()}`);
}
const req = (headers) => new Request('https://x.test/functions/v1/f', { headers });

test('keys.ts: only SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS are read; legacy and custom keys never are', async () => {
  let K = await loadKeys({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: SERVICE_KEY }), SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_KEY }), SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_JWT, SERVICE_ROLE_KEY: LEGACY_SERVICE_JWT });
  assert.equal(K.secretKey(), SERVICE_KEY);
  assert.equal(K.publishableKey(), PUBLISHABLE_KEY);
  K = await loadKeys({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_JWT, SERVICE_ROLE_KEY: LEGACY_SERVICE_JWT, SUPABASE_ANON_KEY: 'eyJ.legacy' });
  assert.equal(K.secretKey(), '', 'no fallback to the legacy or custom key');
  assert.equal(K.publishableKey(), '', 'no fallback to the legacy anon key');
  K = await loadKeys({ SUPABASE_SECRET_KEYS: 'not json' });
  assert.equal(K.secretKey(), '');
  K = await loadKeys({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: LEGACY_SERVICE_JWT }) });
  assert.equal(K.secretKey(), '', 'a JWT placed in the dictionary is not accepted as a secret key');
});

test('keys.ts: internal caller = this project\'s sb_secret_ key (apikey header, or Bearer); never a JWT or another key', async () => {
  const K = await loadKeys({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: SERVICE_KEY }), SERVICE_ROLE_KEY: LEGACY_SERVICE_JWT });
  assert.equal(K.presentsSecretKey(req({ apikey: SERVICE_KEY })), true);
  assert.equal(K.presentsSecretKey(req({ authorization: `Bearer ${SERVICE_KEY}` })), true);
  assert.equal(K.presentsSecretKey(req({ authorization: `Bearer ${LEGACY_SERVICE_JWT}` })), false, 'exposed legacy JWT');
  assert.equal(K.presentsSecretKey(req({ apikey: LEGACY_SERVICE_JWT })), false);
  assert.equal(K.presentsSecretKey(req({ apikey: PUBLISHABLE_KEY })), false);
  assert.equal(K.presentsSecretKey(req({ apikey: 'sb_secret_some_other_project_key_000000' })), false);
  assert.equal(K.userBearer(req({ authorization: `Bearer ${SERVICE_KEY}` })), '', 'an API key is not a user session');
  assert.equal(K.userBearer(req({ authorization: 'Bearer user.jwt.token' })), 'user.jwt.token');
  assert.deepEqual(K.internalCallHeaders(), { apikey: SERVICE_KEY, 'Content-Type': 'application/json' });
});

// ── every function, real code ──
test(`every function (${ALL.length}) builds clients only with the new keys, never the legacy/custom key`, async () => {
  for (const name of ALL) {
    const f = await loadFunction(name, { db: db(), users, env: { CRON_SECRET: 'cron-secret-for-tests-not-real-0000000000', UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000', LINK_SIGNING_SECRET: 'link-secret-not-real-0000000000000000' } });
    try { await f.call({ token: 'tok-office', body: {} }); } catch { /* a handler may reject an empty body; only the keys matter here */ }
    for (const k of f.clientKeys) {
      assert.ok(k === SERVICE_KEY || k === PUBLISHABLE_KEY, `${name} built a client with an unexpected key (${String(k).slice(0, 12)}…)`);
    }
    f.restore();
  }
});

test('source: no function or shared module reads SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY or SERVICE_ROLE_KEY', () => {
  const offenders = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) { if (n !== '__tests__') walk(p); continue; }
      if (!p.endsWith('.ts')) continue;
      const code = readFileSync(p, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      if (/Deno\.env\.get\(\s*['"](SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|SERVICE_ROLE_KEY)['"]/.test(code)) offenders.push(p.slice(FUNCTIONS.length));
    }
  };
  walk(FUNCTIONS);
  assert.deepEqual(offenders, []);
});

const PROTECTED = ['agent-worker', 'orchestrator', 'send-email', 'campaign-scheduler', 'scrape-b2b', 'sync-green-tariffs', 'fetch-emails', 'ai-developer'];

test('the exposed legacy JWT is refused as a caller by the protected functions (incl. agent-worker, orchestrator)', async () => {
  for (const name of PROTECTED) {
    const f = await loadFunction(name, { db: db(), users });
    const r = await f.call({ token: LEGACY_SERVICE_JWT, body: {} });
    assert.equal(r.status, 401, `${name}: legacy JWT must not authenticate (got ${r.status})`);
    const r2 = await f.call({ headers: { apikey: LEGACY_SERVICE_JWT }, body: {} });
    assert.equal(r2.status, 401, `${name}: legacy JWT in apikey must not authenticate (got ${r2.status})`);
    f.restore();
  }
});

test('the secret key in the apikey header is accepted as an internal caller (agent-worker, orchestrator, scrape-b2b)', async () => {
  for (const name of ['agent-worker', 'orchestrator', 'scrape-b2b']) {
    const f = await loadFunction(name, { db: db(), users, env: { GEMINI_API_KEY: 'test-key-not-real' } });
    const r = await f.call({ headers: { apikey: SERVICE_KEY }, body: {} });
    assert.notEqual(r.status, 401, `${name}: secret key in apikey must pass the caller check (got 401)`);
    assert.notEqual(r.status, 403, `${name}: service caller must not be refused (got 403)`);
    f.restore();
  }
});

test('missing SUPABASE_SECRET_KEYS fails closed with a redacted 500, without falling back to the legacy key', async () => {
  for (const name of ['agent-worker', 'orchestrator', 'send-email', 'unsubscribe', 'accept-offer', 'sync-green-tariffs', 'scrape-b2b', 'admin-users', 'receive-lead-webhook', 'vapi-webhook', 'send-lead-confirmation']) {
    const f = await loadFunction(name, { db: db(), users, env: { SUPABASE_SECRET_KEYS: undefined, UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000', LINK_SIGNING_SECRET: 'link-secret-not-real-0000000000000000', LEAD_WEBHOOK_SECRET: 'webhook-secret-not-real-000000000000', VAPI_WEBHOOK_SECRET: 'vapi-secret-not-real-0000000000000' } });
    let r;
    try { r = await f.call({ token: 'tok-office', body: { email: 'x@example.invalid' } }); } catch (e) { assert.fail(`${name} threw instead of failing safely: ${e.message}`); }
    assert.ok(!f.clientKeys.includes(LEGACY_SERVICE_JWT), `${name} fell back to the legacy key`);
    assert.ok(f.clientKeys.every((k) => k === 'sb_secret_not_configured' || k === PUBLISHABLE_KEY), `${name} built a client with a real key although none is configured`);
    if (r.status === 500) {
      const body = typeof r.json === 'string' ? r.json : JSON.stringify(r.json);
      assert.ok(!body.includes(LEGACY_SERVICE_JWT) && !body.includes('sb_secret_'), `${name}: key material in the error body`);
    }
    assert.ok([400, 401, 403, 404, 405, 500].includes(r.status) || r.status === 302, `${name}: unexpected status ${r.status}`);
    assert.notEqual(r.status, 200, `${name} must not succeed without its secret key`);
    f.restore();
  }
  const f = await loadFunction('agent-worker', { db: db(), users, env: { SUPABASE_SECRET_KEYS: undefined } });
  const r = await f.call({ token: 'tok-office', body: {} });
  assert.equal(r.status, 500);
  assert.match(JSON.stringify(r.json), /SUPABASE_SECRET_KEYS/, 'the diagnostic names the variable');
  f.restore();
});

test('admin-users: an API key is never accepted as the acting user', async () => {
  const f = await loadFunction('admin-users', { db: db(), users });
  for (const headers of [{ apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` }, { authorization: `Bearer ${SERVICE_KEY}` }, { authorization: `Bearer ${LEGACY_SERVICE_JWT}` }]) {
    const r = await f.call({ headers, body: { action: 'list' } });
    assert.equal(r.status, 401, `admin-users accepted an API key (${JSON.stringify(Object.keys(headers))})`);
  }
  f.restore();
});

test('chat (public) uses the publishable key only, never a privileged one', async () => {
  const f = await loadFunction('chat', { db: db(), users, env: { GEMINI_API_KEY: 'test-key-not-real' }, fetchHandler: () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } }) });
  await f.call({ body: { messages: [{ role: 'user', content: 'Γεια' }] } });
  assert.ok(f.clientKeys.length > 0, 'chat built a client');
  assert.ok(f.clientKeys.every((k) => k === PUBLISHABLE_KEY), 'chat must not use the secret key');
  f.restore();
});

test('campaign-scheduler calls make-voice-call with the secret key in apikey, not a legacy Bearer', () => {
  const src = readFileSync(join(FUNCTIONS, 'campaign-scheduler/index.ts'), 'utf8');
  assert.match(src, /internalCallHeaders\(\)/);
  assert.doesNotMatch(src, /Bearer \$\{Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)\}/);
});

test('guard.ts: requireStaffOrCron accepts the cron secret, refuses a wrong one and the legacy JWT (regression: found by deno check)', async () => {
  const out = await build({ entryPoints: [join(FUNCTIONS, '_shared/guard.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    plugins: [{ name: 'stub-supabase', setup(b) {
      b.onResolve({ filter: /^https:\/\/esm\.sh\// }, () => ({ path: 'sb', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const createClient = () => ({ auth: { getUser: async () => ({ data: { user: null }, error: { message: "invalid" } }) } });', loader: 'js' }));
    } }] });
  const cron = 'cron-secret-for-tests-not-real-0000000000';
  globalThis.Deno = { env: { get: (k) => ({ CRON_SECRET: cron, SUPABASE_URL: 'https://x.test', SUPABASE_SECRET_KEYS: JSON.stringify({ default: SERVICE_KEY }), SERVICE_ROLE_KEY: LEGACY_SERVICE_JWT, SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_JWT })[k] } };
  const G = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64') + `#${Math.random()}`);
  assert.equal(await G.requireStaffOrCron(req({ 'x-cron-secret': cron })), null, 'cron secret accepted');
  assert.equal((await G.requireStaffOrCron(req({ 'x-cron-secret': 'wrong-wrong-wrong-wrong-wrong' })))?.status, 401);
  assert.equal((await G.requireStaffOrCron(req({ authorization: `Bearer ${LEGACY_SERVICE_JWT}` })))?.status, 401, 'legacy JWT refused');
  assert.equal(await G.requireStaff(req({ apikey: SERVICE_KEY })), null, 'secret key in apikey accepted');
});

// orchestrator -> scrape-b2b: a service caller that authenticated with the apikey header must be forwarded the same
// way (the Authorization header is empty for it); a user caller still forwards its OWN token, never an API key.
async function orchestratorB2bCall(callerHeaders, token) {
  const toolCall = { candidates: [{ content: { parts: [{ functionCall: { name: 'trigger_b2b_scraper', args: { region: 'Αττική', category: 'energy' } } }] } }] };
  const answer = { candidates: [{ content: { parts: [{ text: 'ok' }] } }] };
  let geminiCalls = 0;
  const f = await loadFunction('orchestrator', {
    db: createDb({ profiles: [{ id: OFFICE, role: 'admin', is_active: true }], ai_agents: [], agent_memory: [], crm_settings: [] }), users,
    env: { GEMINI_API_KEY: 'test-key-not-real' },
    fetchHandler: (url) => {
      if (url.includes('generativelanguage.googleapis.com')) return new Response(JSON.stringify(geminiCalls++ === 0 ? toolCall : answer), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ leads_found: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  await f.call({ token, headers: callerHeaders, body: { message: 'start the b2b scraper' } });
  const scrape = f.outbound.find((o) => o.url.endsWith('/functions/v1/scrape-b2b'));
  f.restore();
  return scrape;
}

test('orchestrator forwards the secret key (apikey) to scrape-b2b for a service caller, and the user\'s own token for a user', async () => {
  const svc = await orchestratorB2bCall({ apikey: SERVICE_KEY });
  assert.ok(svc, 'the B2B tool reached scrape-b2b');
  assert.equal(svc.headers.apikey, SERVICE_KEY, 'secret key forwarded in apikey');
  assert.ok(!JSON.stringify(svc.headers).includes(LEGACY_SERVICE_JWT), 'legacy JWT never forwarded');
  const usr = await orchestratorB2bCall({}, 'tok-office');
  assert.ok(usr, 'user call reached scrape-b2b');
  assert.equal(usr.headers.Authorization, 'Bearer tok-office', 'the user\'s own token is forwarded');
  assert.equal(usr.headers.apikey, undefined, 'no API key is forwarded on behalf of a user');
});
