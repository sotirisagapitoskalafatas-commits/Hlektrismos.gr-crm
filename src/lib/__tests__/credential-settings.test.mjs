// Credentials are write-only from the browser (phase6/27). LOCAL unit tests of the client rules; the database side is proved in supabase/tests/credentials-write-only.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
// The module under test, with its Supabase import replaced by a handle the test controls.
const source = readFileSync(root + 'lib/credential-settings.ts', 'utf8').replace("import { supabase } from './supabase';", 'const supabase = { rpc: (...a) => globalThis.__sb.rpc(...a) };');
assert.ok(!source.includes("from './supabase'"), 'the import was replaced');
const out = buildSync({ stdin: { contents: source, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
const C = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('the credential name rule is the database rule (crm_setting_is_credential): same list, case-insensitive substring', () => {
  const sql = readFileSync(fileURLToPath(new URL('../../../supabase/staged-migrations/phase2/05_staff_admin_and_role_preview.sql', import.meta.url)), 'utf8');
  const list = [...sql.slice(sql.indexOf("array['%key%'"), sql.indexOf("]) $$")).matchAll(/'%([a-z]+)%'/g)].map((m) => m[1]);
  assert.deepEqual(list.sort(), ['credential', 'imap', 'key', 'passwd', 'password', 'secret', 'smtp', 'token', 'twilio', 'vapi']);
  for (const k of ['RESEND_API_KEY', 'INFOBIP_API_KEY', 'TWILIO_AUTH_TOKEN', 'VAPI_PHONE_NUMBER_ID', 'ELEVENLABS_API_KEY', 'SERPAPI_KEY', 'imap_host', 'smtp_pass', 'Service_Secret']) assert.equal(C.isCredentialKey(k), true, k);
  for (const k of ['theme', 'role_permissions', 'arrival_prompt_radius_m', 'business_profile', 'PROVIDER_COMMISSIONS', 'email_config']) assert.equal(C.isCredentialKey(k), false, k);
});

test('a credential field is saved only when the Admin typed a new value: empty and the mask send nothing', () => {
  assert.equal(C.credentialToSave(C.CREDENTIAL_MASK), null);
  assert.equal(C.credentialToSave(''), null);
  assert.equal(C.credentialToSave(undefined), null);
  assert.equal(C.credentialToSave('new-secret'), 'new-secret');
  assert.equal(C.credentialToSave({ setting_key: 'RESEND_API_KEY', setting_value: JSON.stringify('re_typed') }), 're_typed', 'the legacy panel shape');
  assert.equal(C.credentialToSave({ setting_key: 'RESEND_API_KEY', setting_value: JSON.stringify(C.CREDENTIAL_MASK) }), null, 'an untouched legacy field');
});

test('status and save go through the two functions, return no value, and fall back cleanly when phase6/27 is not installed', async () => {
  const calls = [];
  globalThis.__sb = { rpc: async (name, args) => { calls.push([name, args]); return name === 'crm_credential_status' ? { data: [{ setting_key: 'RESEND_API_KEY', configured: true }, { setting_key: 'VAPI_API_KEY', configured: false }], error: null } : { data: null, error: null }; } };
  assert.deepEqual(await C.loadCredentialStatus(), { RESEND_API_KEY: true, VAPI_API_KEY: false });
  assert.equal(await C.saveCredential('RESEND_API_KEY', 'v'), true);
  assert.deepEqual(calls[1], ['crm_set_credential', { p_key: 'RESEND_API_KEY', p_value: 'v' }]);
  globalThis.__sb = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) };
  assert.equal(await C.loadCredentialStatus(), null, 'not installed: the old behaviour');
  assert.equal(await C.saveCredential('RESEND_API_KEY', 'v'), false);
});

test('the settings panel: credentials come back only as the mask, are saved only through crm_set_credential, and nothing is read back into the page', () => {
  const p = readFileSync(root + 'components/SettingsPanel.tsx', 'utf8');
  assert.ok(/loadCredentialStatus\(\)/.test(p) && /map\[k\] = CREDENTIAL_MASK/.test(p));
  assert.ok(/!writeOnly \|\| !isCredentialKey\(key\)/.test(p), 'credentials are excluded from the direct table write once write-only');
  assert.ok(/credentialToSave\(value\)/.test(p) && /saveCredential\(key, typed\)/.test(p));
  assert.ok(/apiKey === CREDENTIAL_MASK/.test(p), 'the masked value is never sent to a provider');
  assert.ok(!/console\.(log|info|debug)\([^)]*(setting_value|apiKey|typed)/.test(p));
});
