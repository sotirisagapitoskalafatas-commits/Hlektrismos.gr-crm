// Behaviour, not strings: the REAL handler of every Edge Function is called through the harness as an outsider, and must refuse without touching anything.
// This is what the gateway setting cannot promise. verify_jwt=true only checks that the caller holds SOME key, and the public key ships in every browser
// bundle; verify_jwt=false checks nothing. So each function must refuse on its own, and this test proves it for every directory.
// LOCAL only: fake database, fake provider, fake SMTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadFunction, createDb, PUBLISHABLE_KEY } from './helpers/edge-harness.mjs';

const fnDir = fileURLToPath(new URL('../functions/', import.meta.url));
const directories = readdirSync(fnDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name).sort();

// Gateway settings, read line by line so a comment or another key cannot hide a switched-off function.
const off = new Set();
{
  let fn = null;
  for (const line of readFileSync(join(fnDir, '../config.toml'), 'utf8').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/#.*$/, '').trim())) {
    const head = /^\[functions\.([\w-]+)\]$/.exec(line);
    if (head) fn = head[1]; else if (line.startsWith('[')) fn = null;
    else if (fn && /^verify_jwt\s*=\s*false$/.test(line)) off.add(fn);
  }
}

// Callers that are not signed-in staff, and why. Everything else is staff-only and is swept below. A new function that is in neither list fails the first test.
const EXEMPT = {
  'vapi-webhook': 'provider webhook: authenticates by a shared secret header',
  'receive-lead-webhook': 'ad-platform webhook: authenticates by a shared secret header',
  'accept-offer': 'customer link: authenticates by a signed token',
  'unsubscribe': 'e-mail link: authenticates by a signed address',
  'send-lead-confirmation': 'website form: public by design; sends one mail per fresh website lead and nothing else',
  'chat': 'public chatbot: public by design. KNOWN GAP, an explicit blocker: it has no rate limit and no size cap, and each call may reach a paid model and create a lead',
};
const staff = directories.filter((d) => !(d in EXEMPT));

const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000a1', MANAGER = 'aaaaaaaa-0000-4000-8000-0000000000e1', BACKOFFICE = 'aaaaaaaa-0000-4000-8000-0000000000e2', INACTIVE = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const users = { 'tok-admin': ADMIN, 'tok-manager': MANAGER, 'tok-bo': BACKOFFICE, 'tok-inactive': INACTIVE };
const world = () => createDb({
  profiles: [{ id: ADMIN, role: 'admin', is_active: true }, { id: MANAGER, role: 'manager', is_active: true }, { id: BACKOFFICE, role: 'back_office', is_active: true }, { id: INACTIVE, role: 'inside_sales', is_active: false }],
  hlektrismos_leads: [], leads: [], customers: [], cases: [], crm_settings: [], campaign_sends: [], voice_calls: [],
});
// admin-users authorizes per action, so a signed-in outsider needs a real action to be refused, and the refusal is itself recorded in the audit table.
// That one denial row is the only write any function may make here.
const ACTION_BODY = { 'admin-users': { action: 'create', email: 'new.agent@example.gr', full_name: 'Test Agent', role: 'sales_agent', mode: 'invite' } };
const DENIAL_AUDIT = { 'admin-users': 'staff_admin_audit' };
const untouched = (f, why, allowedTable) => {
  const writes = f.db.log.inserts.length + f.db.log.updates.length + f.db.log.deletes.length;
  if (allowedTable) {
    assert.equal(f.db.log.updates.length + f.db.log.deletes.length, 0, `${why}: nothing changed`);
    assert.ok(f.db.log.inserts.every((i) => i.table === allowedTable && i.rows.every((r) => r.action === 'denied')), `${why}: only a denial row in ${allowedTable}`);
  } else assert.equal(writes, 0, `${why}: nothing written`);
  assert.equal(f.db.log.rpc.length, 0, `${why}: no database function called (a counter would be a write)`);
  assert.equal(f.db.log.invokes.length, 0, `${why}: no other function invoked`);
  assert.equal(f.outbound.length, 0, `${why}: nothing sent to a provider`);
  assert.equal(f.smtp.length, 0, `${why}: no mail connection`);
};

test('every function directory is classified: staff-only or an explicit exemption with a reason', () => {
  assert.ok(directories.length >= 27, 'the directories were found');
  for (const d of Object.keys(EXEMPT)) assert.ok(directories.includes(d), `${d} is exempt but does not exist`);
  assert.equal(staff.length + Object.keys(EXEMPT).length, directories.length);
});

test('the gateway setting matches the classification: only functions that must authenticate themselves are switched off, and each says why', () => {
  const mayBeOff = new Set(['ai-developer', 'orchestrator', 'agent-worker', 'scrape-b2b', ...Object.keys(EXEMPT).filter((d) => d !== 'send-lead-confirmation')]);
  for (const f of off) {
    assert.ok(directories.includes(f), `config names an unknown function: ${f}`);
    assert.ok(mayBeOff.has(f), `${f} is switched off at the gateway without a reason in this test`);
  }
  for (const f of ['vapi-webhook', 'receive-lead-webhook', 'accept-offer']) assert.ok(off.has(f), `${f} cannot send a Supabase JWT, so it must be declared verify_jwt=false`);
  for (const f of ['send-lead-confirmation']) assert.ok(!off.has(f), `${f} relies on the gateway for nothing: it must not be switched off`);
});

for (const name of staff) {
  test(`${name}: refuses an anonymous caller, the public key alone, a legacy-role session and an inactive session; touches nothing`, async () => {
    for (const [label, req] of [
      ['anonymous', {}],
      ['public key as bearer', { token: PUBLISHABLE_KEY }],
      ['legacy manager', { token: 'tok-manager' }],
      ['legacy back_office', { token: 'tok-bo' }],
      ['inactive profile', { token: 'tok-inactive' }],
    ]) {
      const f = await loadFunction(name, { db: world(), users, env: { LINK_SIGNING_SECRET: 'link-signing-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa', CRON_SECRET: 'cron-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa' } });
      const signedIn = !!req.token && req.token !== PUBLISHABLE_KEY;
      const r = await f.call({ ...req, body: signedIn ? (ACTION_BODY[name] ?? {}) : {} });
      // Exact, not "either": who is refused and why matters. No session (or only the public key) is "not authenticated" = 401; a real session that has no
      // staff access is "not allowed" = 403. Accepting both would let a removed first check hide behind a second one that happens to refuse with the other code.
      const expected = signedIn ? 403 : 401;
      assert.equal(r.status, expected, `${name} / ${label}: ${r.status} ${JSON.stringify(r.json).slice(0, 80)}`);
      untouched(f, `${name} / ${label}`, signedIn ? DENIAL_AUDIT[name] : undefined);
      f.restore();
    }
  });
}

test('exempt functions still refuse an outsider on their own terms and touch nothing', async () => {
  const wrong = { 'x-vapi-secret': 'wrong-secret-wrong-secret-wrong-secret', 'x-webhook-secret': 'wrong-secret-wrong-secret-wrong-secret' };
  const cases = [
    ['vapi-webhook', { body: { message: { type: 'end-of-call-report', call: { id: 'x' } } } }, 401],
    ['vapi-webhook', { body: {}, headers: wrong }, 401],
    ['receive-lead-webhook', { body: { email: 'a@example.gr', age_confirmed: true } }, 401],
    ['receive-lead-webhook', { body: { email: 'a@example.gr', age_confirmed: true }, headers: wrong }, 401],
    ['accept-offer', { body: {} }, 400],
    ['accept-offer', { body: { lead_id: 'bbbbbbbb-0000-4000-8000-0000000000a1', tariff_id: 'cccccccc-0000-4000-8000-0000000000a1', t: 'forged' } }, 403],
    ['send-lead-confirmation', { body: { email: 'nobody@example.gr' } }, 200],
  ];
  for (const [name, req, status] of cases) {
    const db = world(); db.rows('leads');
    const f = await loadFunction(name, { db, users, env: { LINK_SIGNING_SECRET: 'link-signing-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa', VAPI_WEBHOOK_SECRET: 'vapi-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa', LEAD_WEBHOOK_SECRET: 'lead-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa' } });
    const r = await f.call(req);
    assert.equal(r.status, status, `${name}: ${JSON.stringify(r.json).slice(0, 100)}`);
    untouched(f, name);
    f.restore();
  }
  const f = await loadFunction('unsubscribe', { db: world(), env: { UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000', SITE_URL: 'https://crm.example.test' } });
  const e = Buffer.from('victim@example.gr').toString('base64url'); // well formed, so the signature check is what refuses it
  const r = await f.call({ method: 'GET', query: `?e=${e}&t=forged` });
  assert.ok([302, 400].includes(r.status));
  assert.equal(f.db.rows('email_suppressions').length, 0, 'a forged link suppresses nobody');
  untouched(f, 'unsubscribe');
  f.restore();
});
