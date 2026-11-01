// Ασφάλεια & Έλεγχοι: the evidence model. LOCAL tests of the rules and of the probes against FAKE systems (one protected, one exposed). Nothing here talks to Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const out = buildSync({ stdin: { contents: "export * from '@/lib/security-evidence';", resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent', alias: { '@': root.replace(/[\\/]$/, '') } });
const m = { exports: {} };
new Function('module', 'exports', 'require', out.outputFiles[0].text)(m, m.exports, createRequire(import.meta.url));
const E = m.exports;
const read = (rel) => readFileSync(root + rel, 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const PROD = 'https://nonaymiwdayfuulccxrl.supabase.co';
const SECRET = 'sk-THIS-IS-A-SECRET-VALUE-123';
const TIME = '2026-11-01T10:54:17.000Z';
const jwt = (role) => `h.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.s`;

/** A fake Supabase that records every call and refuses anything that is not a read. */
function fakeDeps({ url = PROD, appHost = 'hlektrismos-crm.vercel.app', anonRows = false, signupOpen = false, anonymous = false, scope = 'enabled', staff = 'ok', settings = [], integrations = [], mfa = 'full', key = jwt('anon'), throwOn = null } = {}) {
  const calls = [];
  const strict = (name, t) => new Proxy(t, { get: (o, k) => (k in o ? o[k] : () => { throw new Error(`${name}.${String(k)} is not a read`); }) });
  const anonFrom = (t) => ({ select: (c) => ({ limit: async () => { calls.push(['anon.select', t, c]); if (throwOn === 'anon') throw new Error('boom'); return anonRows ? { data: [{ id: 1 }], error: null } : { data: null, error: { code: '42501', message: 'permission denied for table ' + t } }; } }) });
  const userFrom = (t) => ({ select: async (c) => {
    calls.push(['user.select', t, c]);
    if (t === 'crm_settings') return { data: settings.map((k) => ({ setting_key: k })), error: null };
    if (t === 'crm_integrations') return { data: integrations, error: null };
    return { data: [], error: null };
  } });
  const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.x in the schema cache' } };
  const rpc = async (fn) => {
    calls.push(['rpc', fn]);
    if (fn === 'sales_scope_status') return scope === 'missing' ? missing : { data: { enabled: scope === 'enabled', tables: ['leads'] }, error: null };
    if (fn === 'staff_list') {
      if (staff === 'missing') return missing;
      if (staff === 'legacy') return { data: [{ role: 'admin', is_active: true }, { role: 'manager', is_active: true }, { role: 'field_sales', is_active: true }], error: null };
      if (staff === 'two-admins') return { data: [{ role: 'admin', is_active: true }, { role: 'admin', is_active: true }, { role: 'sales_agent', is_active: true }], error: null };
      return { data: [{ role: 'admin', is_active: true }, { role: 'sales_agent', is_active: true }, { role: 'sales_agent', is_active: false }], error: null };
    }
    throw new Error('unexpected rpc ' + fn);
  };
  const factors = async () => (mfa === 'none' ? { data: { totp: [] }, error: null } : mfa === 'error' ? { data: null, error: { message: 'MFA is not enabled' } } : { data: { totp: [{ status: 'verified' }] }, error: null });
  const aal = async () => (mfa === 'error' ? { data: null, error: { message: 'x' } } : { data: { currentLevel: mfa === 'aal1' ? 'aal1' : mfa === 'none' ? 'aal1' : 'aal2' }, error: null });
  const fetcher = async (u) => {
    calls.push(['fetch', String(u)]);
    if (throwOn === 'fetch') throw new Error('offline');
    return { ok: true, status: 200, json: async () => ({ disable_signup: !signupOpen, external: { anonymous_users: anonymous } }) };
  };
  return { calls, deps: { authUrl: url, appHost, anonKey: key, fetcher, now: () => TIME,
    anon: strict('anon', { from: anonFrom, storage: { from: () => ({ list: async () => { calls.push(['anon.storage.list']); return anonRows ? { data: [{ name: 'x' }], error: null } : { data: [], error: null }; } }) } }),
    user: strict('user', { from: userFrom, rpc, auth: { mfa: { listFactors: factors, getAuthenticatorAssuranceLevel: aal } } }) } };
}
const byId = (run) => Object.fromEntries(run.results.map((c) => [c.id, c]));

/* ───────── the rules ───────── */
test('the five labels are exactly the agreed Greek wording', () => {
  assert.deepEqual(E.STATUS_TEXT, { verified: 'Επαληθευμένο', action: 'Χρειάζεται ενέργεια', unverified: 'Δεν έχει επαληθευτεί ζωντανά', manual: 'Εκκρεμεί χειροκίνητος έλεγχος', accepted: 'Αποδεκτός περιορισμός' });
});

test('«verified» needs a live Production result with a time; every other status needs a next action and an owner', () => {
  const base = { id: 'x', area: 'anonymous', label: 'L', tests: 'T', status: 'verified', detail: 'D', at: TIME, env: 'production', method: 'automated', evidence: 'E', action: null, owner: null };
  assert.deepEqual(E.validateCheck(base), []);
  for (const env of ['local', 'none', 'staging']) assert.ok(E.validateCheck({ ...base, env }).length, `verified from «${env}» must be refused`);
  assert.ok(E.validateCheck({ ...base, at: null }).length, 'no time, no verification');
  assert.ok(E.validateCheck({ ...base, at: 'yesterday-ish' }).length);
  assert.ok(E.validateCheck({ ...base, status: 'action', action: null, owner: null }).length, 'an open finding must say what to do');
  assert.ok(E.validateCheck({ ...base, status: 'manual', env: 'none', at: null, action: 'Do it', owner: null }).length, 'and who');
  assert.deepEqual(E.validateCheck({ ...base, status: 'manual', env: 'none', at: null, action: 'Do it', owner: 'Admin' }), []);
  assert.ok(E.validateCheck({ ...base, status: 'accepted', env: 'none', at: null, detail: 'fine', evidence: 'someone said so', action: 'x', owner: 'Admin' }).length, '«accepted» must name the decision and its date');
  assert.ok(E.validateCheck({ ...base, label: '' }).length);
});

test('the checks that are NOT live evidence are all allowed to exist, none is «verified», and every area has at least one line', () => {
  for (const c of E.STATIC_CHECKS) { assert.deepEqual(E.validateCheck(c), [], c.id); assert.notEqual(c.status, 'verified', `${c.id}: a note or a local test can not be verified`); assert.equal(c.at, null); }
  const all = E.buildChecks(null);
  assert.deepEqual([...new Set(all.map((c) => c.area))].sort(), E.AREAS.map((a) => a.id).sort(), 'all eight areas appear');
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, 'ids are unique');
  const order = E.AREAS.map((a) => a.id); const seen = all.map((c) => order.indexOf(c.area)); assert.deepEqual(seen, [...seen].sort((a, b) => a - b), 'grouped in the order of the areas');
});

test('before any live run NOTHING is verified: every probe-backed line says «Δεν έχει επαληθευτεί ζωντανά» and how to run it', () => {
  const all = E.buildChecks(null);
  for (const l of E.LIVE_IDS) { const c = all.find((x) => x.id === l.id); assert.equal(c.status, 'unverified', l.id); assert.equal(c.env, 'none'); assert.match(c.action, /Εκτέλεση ζωντανών ελέγχων/); }
  assert.equal(E.summarize(all).verified, 0);
});

test('the document warnings are a documented decision (accepted), not an open vulnerability', () => {
  const c = E.STATIC_CHECKS.find((x) => x.id === 'workflow-doc-warnings');
  assert.equal(c.status, 'accepted'); assert.match(c.detail, /17\/10\/2026/); assert.match(c.detail, /δεν υπάρχει λειτουργία φραγμού/);
  assert.match(c.label, /προειδοποίηση, όχι φραγμός/);
});

test('every claim the static lines make about the code is pinned by a test of the code', () => {
  // «The app has no MFA enforcement and no enrollment screen» (mfa-enforcement, status action). If someone adds it, this fails and the line must be updated.
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== '__tests__') walk(p); } else if (/\.(ts|tsx)$/.test(f) && !/security-evidence\.ts$/.test(f)) files.push(p); } };
  walk(root);
  const hits = files.filter((f) => /aal2|mfa\.(enroll|challenge|verify|unenroll)|getAuthenticatorAssuranceLevel|listFactors/i.test(strip(readFileSync(f, 'utf8')))).map((f) => f.replace(root, ''));
  assert.deepEqual(hits.filter((h) => !/admin-checks\.ts$/.test(h)), [], 'MFA is used outside the read-only probe: update «mfa-enforcement» first');
  assert.equal(E.STATIC_CHECKS.find((x) => x.id === 'mfa-enforcement').status, 'action');
  // «The legacy settings panel is the only browser reader of crm_settings besides the radius and appearance keys»: the probes read only key NAMES.
  const probes = readFileSync(root + 'lib/security-evidence.ts', 'utf8');
  assert.ok(!/\.(insert|update|upsert|delete)\(/.test(strip(probes)), 'the probes never write');
});

/* ───────── environments, keys ───────── */
test('the environment is read from the URL the browser really talks to', () => {
  const H = 'hlektrismos-crm.vercel.app';
  assert.equal(E.environmentOf(PROD, H), 'production', 'the Production database reached from the Production address');
  assert.equal(E.environmentOf(PROD, 'hlektrismos-crm-git-feat-x-upper-acre.vercel.app'), 'preview', 'a Preview build that talks to the Production database is PREVIEW evidence');
  assert.equal(E.environmentOf(PROD, 'localhost'), 'local'); assert.equal(E.environmentOf(PROD, '127.0.0.1'), 'local');
  assert.equal(E.environmentOf(PROD, ''), 'none', 'an unknown address is never assumed to be Production'); assert.equal(E.environmentOf(PROD), 'none');
  assert.equal(E.environmentOf('http://localhost:54321', H), 'local');
  assert.equal(E.environmentOf('https://other-project.supabase.co', H), 'staging', 'another database is staging even from the Production address');
  assert.equal(E.environmentOf('', H), 'none'); assert.equal(E.environmentOf(undefined, H), 'none');
  assert.equal(new Set(Object.keys(E.ENV_TEXT)).size, 5); assert.notEqual(E.ENV_TEXT.preview, E.ENV_TEXT.production);
});
test('the anon key role is read without trusting or showing the key; credential key names use the same patterns as the database', () => {
  assert.equal(E.jwtRole(jwt('anon')), 'anon'); assert.equal(E.jwtRole(jwt('service_role')), 'service_role'); assert.equal(E.jwtRole('not-a-jwt'), null); assert.equal(E.jwtRole(undefined), null);
  const sql = readFileSync(repo + 'supabase/staged-migrations/phase2/05_staff_admin_and_role_preview.sql', 'utf8');
  const dbPatterns = [...sql.matchAll(/array\[([^\]]*ilike[^\]]*|'%key%'[^\]]*)\]/g)].flatMap((x) => [...x[1].matchAll(/'%([a-z]+)%'/g)].map((y) => y[1]));
  assert.ok(dbPatterns.length >= 8, 'found the database pattern list');
  for (const p of dbPatterns) assert.ok(E.isCredentialKey(`x_${p}_y`), `the page treats «${p}» as a credential name, like the database`);
  for (const k of ['SERPAPI_API_KEY', 'IMAP_PASSWORD', 'RESEND_API_KEY', 'TWILIO_AUTH_TOKEN', 'vapi_x']) assert.ok(E.isCredentialKey(k), k);
  for (const k of ['theme', 'arrival_prompt_radius_m', 'role_permissions', 'appearance_config']) assert.ok(!E.isCredentialKey(k), k);
});

/* ───────── the probes against fake systems ───────── */
test('PROTECTED system, from Production: what is proven is verified, what is not stays manual; nothing local-only turns green', async () => {
  const f = fakeDeps({ settings: ['theme', 'arrival_prompt_radius_m', 'role_permissions'], integrations: [{ id: 'serpapi', config: {} }] });
  const run = await E.runLiveChecks(f.deps); const c = byId(run);
  assert.equal(run.env, 'production'); assert.equal(run.at, TIME);
  for (const r of run.results) assert.deepEqual(E.validateCheck(r), [], r.id);
  for (const id of Object.keys(c).filter((k) => k.startsWith('anon-'))) assert.equal(c[id].status, 'verified', id);
  for (const id of ['auth-signup', 'auth-anonymous', 'secrets-anon-key', 'secrets-credential-rows', 'secrets-integration-config', 'roles-two-model', 'mfa-admin-factor']) { assert.equal(c[id].status, 'verified', id); assert.equal(c[id].env, 'production'); assert.equal(c[id].at, TIME); }
  assert.equal(c['isolation-sales'].status, 'manual', 'the policy is installed, but nobody has tried it with two real agents');
  assert.equal(c['roles-self-promotion'].status, 'manual', 'the guard exists, but the attack was not tried with a real Sales Agent');
  assert.match(c['isolation-sales'].local, /final-state-role-isolation/, 'the local evidence is shown, labelled as local');
  assert.equal(E.buildChecks(run.results).filter((x) => x.status === 'verified').every((x) => x.env === 'production'), true);
});

test('EXPOSED system: every finding becomes «Χρειάζεται ενέργεια» with a named step, and no secret VALUE reaches the result', async () => {
  const f = fakeDeps({ anonRows: true, signupOpen: true, anonymous: true, scope: 'missing', staff: 'missing', mfa: 'none',
    settings: ['SERPAPI_API_KEY', 'IMAP_PASSWORD', 'theme'], integrations: [{ id: 'serpapi', config: { api_key: SECRET, region: 'eu' } }, { id: 'ok', config: { region: 'eu' } }] });
  const run = await E.runLiveChecks(f.deps); const c = byId(run);
  for (const id of ['anon-leads', 'anon-crm_settings', 'anon-storage', 'auth-signup', 'auth-anonymous', 'isolation-sales', 'roles-self-promotion', 'secrets-credential-rows', 'secrets-integration-config', 'mfa-admin-factor']) assert.equal(c[id].status, 'action', id);
  assert.equal(c['roles-two-model'].status, 'unverified');
  assert.match(c['secrets-credential-rows'].detail, /SERPAPI_API_KEY, IMAP_PASSWORD/); assert.ok(!c['secrets-credential-rows'].detail.includes('theme'));
  assert.match(c['secrets-integration-config'].detail, /serpapi/); assert.ok(!/\bok\b.*config/.test(c['secrets-integration-config'].detail));
  assert.match(c['isolation-sales'].action, /phase4\/18/); assert.match(c['roles-self-promotion'].action, /phase1\/18/); assert.match(c['secrets-credential-rows'].action, /phase6\/27/);
  assert.ok(!JSON.stringify(run).includes(SECRET), 'a secret value never appears in a result');
  for (const r of run.results) assert.deepEqual(E.validateCheck(r), [], r.id);
  assert.ok(E.summarize(E.buildChecks(run.results)).action >= 10);
});

test('the role model check reports legacy roles and a wrong number of Admins', async () => {
  const legacy = byId(await E.runLiveChecks(fakeDeps({ staff: 'legacy' }).deps))['roles-two-model'];
  assert.equal(legacy.status, 'action'); assert.match(legacy.detail, /manager/); assert.match(legacy.detail, /field_sales/); assert.match(legacy.action, /phase6\/25/);
  const two = byId(await E.runLiveChecks(fakeDeps({ staff: 'two-admins' }).deps))['roles-two-model'];
  assert.equal(two.status, 'action'); assert.match(two.detail, /Ενεργοί admin: 2/); assert.match(two.action, /phase6\/26/);
});

test('MFA: a factor on an aal1 session is still an open item; no factor is an open item; an API error is not a pass', async () => {
  assert.equal(byId(await E.runLiveChecks(fakeDeps({ mfa: 'aal1' }).deps))['mfa-admin-factor'].status, 'action');
  const none = byId(await E.runLiveChecks(fakeDeps({ mfa: 'none' }).deps))['mfa-admin-factor']; assert.equal(none.status, 'action'); assert.match(none.action, /χωρίς έγκριση/);
  assert.equal(byId(await E.runLiveChecks(fakeDeps({ mfa: 'error' }).deps))['mfa-admin-factor'].status, 'unverified');
});

test('Production, Preview, staging and local stay distinguishable, and only Production can verify', async () => {
  const cases = [['https://other-project.supabase.co', 'hlektrismos-crm.vercel.app', 'staging'], ['http://localhost:54321', 'localhost', 'local'],
    [PROD, 'hlektrismos-crm-git-feat-x-upper-acre.vercel.app', 'preview'], [PROD, 'localhost', 'local']];
  for (const [url, appHost, expected] of cases) {
    const run = await E.runLiveChecks(fakeDeps({ url, appHost, settings: ['theme'] }).deps);
    assert.equal(run.env, expected, `${url} from ${appHost}`);
    for (const r of run.results) assert.equal(r.env, expected, r.id);
    assert.equal(run.results.filter((r) => r.status === 'verified').length, 0, url);
    for (const r of run.results) assert.deepEqual(E.validateCheck(r), [], r.id);
    assert.match(byId(run)['anon-leads'].detail, /δεν μετράει ως επαλήθευση/);
    assert.match(byId(run)['anon-leads'].detail, new RegExp(E.ENV_TEXT[expected].split(' (')[0]), 'the result names where it came from');
  }
  const prod = await E.runLiveChecks(fakeDeps({ settings: ['theme'] }).deps);
  assert.equal(prod.env, 'production'); assert.ok(prod.results.some((r) => r.status === 'verified'), 'the same probes DO verify from the Production address');
});

test('a probe that throws becomes «Δεν έχει επαληθευτεί ζωντανά», never a pass', async () => {
  const a = byId(await E.runLiveChecks(fakeDeps({ throwOn: 'anon' }).deps));
  for (const id of Object.keys(a).filter((k) => k.startsWith('anon-'))) assert.equal(a[id].status, 'unverified', id);
  const b = byId(await E.runLiveChecks(fakeDeps({ throwOn: 'fetch' }).deps));
  assert.equal(b['auth-signup'].status, 'unverified'); assert.equal(b['auth-anonymous'].status, 'unverified');
  assert.equal(b['roles-two-model'].status, 'verified', 'the other probes still ran');
});

test('the probes only READ: select, list, two named read-only functions, one public GET', async () => {
  const f = fakeDeps({ settings: ['theme'] });
  await E.runLiveChecks(f.deps);
  const kinds = new Set(f.calls.map((c) => c[0]));
  assert.deepEqual([...kinds].sort(), ['anon.select', 'anon.storage.list', 'fetch', 'rpc', 'user.select']);
  assert.deepEqual([...new Set(f.calls.filter((c) => c[0] === 'rpc').map((c) => c[1]))].sort(), ['sales_scope_status', 'staff_list']);
  assert.deepEqual(f.calls.filter((c) => c[0] === 'fetch').map((c) => c[1]), [`${PROD}/auth/v1/settings`]);
  for (const c of f.calls.filter((x) => x[0] === 'anon.select')) assert.equal(c[2], 'id', 'the anonymous probe reads only the id column');
  assert.deepEqual(f.calls.filter((c) => c[0] === 'user.select').map((c) => `${c[1]}:${c[2]}`).sort(), ['crm_integrations:id, config', 'crm_settings:setting_key']);
});

test('the live ids the page promises are exactly the ones the probes return', async () => {
  const run = await E.runLiveChecks(fakeDeps({ settings: ['theme'] }).deps);
  assert.deepEqual(run.results.map((r) => r.id).sort(), E.LIVE_IDS.map((l) => l.id).sort());
});

/* ───────── the page ───────── */
test('the page shows, for every line, what was tested, the result, when, where, how, the evidence and the next action; the summary counts all five labels', () => {
  const ui = read('components/admin/AdminSecurity.tsx');
  for (const t of ['Τι ελέγχεται', 'Τεκμήριο', 'Επόμενη ενέργεια', 'Τοπικά τεκμήρια', 'Τελευταίος έλεγχος', 'ENV_TEXT[c.env]', 'METHOD_TEXT[c.method]', 'STATUS_TEXT[c.status]', 'data-testid="security-summary"', 'Εκτέλεση ζωντανών ελέγχων']) assert.ok(ui.includes(t), t);
  assert.match(ui, /AREAS\.map/, 'one panel per area');
  assert.match(ui, /δεν δηλώνει ότι το σύστημα είναι ασφαλές/, 'it says it is not a claim of overall security');
  assert.match(ui, /δεν μετράνε ως επαλήθευση/, 'a non-Production run is called out');
  assert.ok(!/status: 'verified'|status="verified"/.test(strip(ui)), 'the page itself never sets a green status');
});
test('the overview no longer reads the old static findings, and the old claims are gone', () => {
  const center = read('components/admin/AdminCenter.tsx'); const checks = read('lib/admin-checks.ts');
  assert.ok(!/SOURCE_FINDINGS|lastAnonChecks|runAnonChecks/.test(center + checks + read('components/admin/AdminSecurity.tsx')));
  assert.match(center, /buildChecks\(last\?\.results \?\? null\)/);
  assert.ok(!/Χωρίς θέματα/.test(center), 'the overview never says «no issues»');
  assert.match(checks, /validateCheck/, 'a stored result that breaks the rules is dropped on load');
  assert.ok(!/Ο Διευθυντής/.test(read('lib/security-evidence.ts')), 'no Manager role in the wording');
});

test('what only the Dashboard or the catalogue can prove is on the page as a manual line, with an owner and the exact step', () => {
  const pw = E.STATIC_CHECKS.find((x) => x.id === 'roles-password-policy');
  assert.equal(pw.status, 'manual'); assert.match(pw.detail, /ΑΓΝΟΕΙ τον τρέχοντα κωδικό/); assert.match(pw.action, /Require current password when updating/); assert.match(pw.action, /12/); assert.ok(pw.owner);
  const mg = E.STATIC_CHECKS.find((x) => x.id === 'migrations-applied');
  assert.equal(mg.status, 'manual'); assert.match(mg.action, /pending_migrations_check\.sql/); assert.match(mg.action, /SECURITY_REMEDIATION_CHECKLIST\.md/);
  assert.match(mg.local, /δεν σημαίνει ότι τα αρχεία έχουν εφαρμοστεί στο Production/, 'a passing local gate is not a statement about Production');
  for (const id of ['roles-password-policy', 'migrations-applied', 'mfa-enforcement', 'backups-platform', 'functions-versions', 'functions-secrets']) assert.notEqual(E.STATIC_CHECKS.find((x) => x.id === id).status, 'verified', id);
});
test('the page says local evidence does not mean the problem is fixed in Production', () => {
  const ui = read('components/admin/AdminSecurity.tsx');
  assert.match(ui, /Τοπικά τεκμήρια \(δεν αντικαθιστούν τον ζωντανό έλεγχο και ΔΕΝ σημαίνουν ότι το πρόβλημα έχει διορθωθεί στο Production\)/);
  assert.match(ui, /Ανοίξτε την εφαρμογή Production για να επαληθευτούν/);
  assert.match(read('lib/admin-checks.ts'), /appHost: typeof window === 'undefined' \? '' : window\.location\.hostname/, 'the page tells the model which address the app runs from');
});
