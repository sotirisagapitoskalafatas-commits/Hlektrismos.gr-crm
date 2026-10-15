import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../role-preview.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const P = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const B = 'https://x.supabase.co';

test('preview read-only guard: every write is blocked, reads and auth are not', () => {
  assert.equal(P.isMutation(`${B}/rest/v1/cases?select=*`, 'GET'), false);
  assert.equal(P.isMutation(`${B}/rest/v1/cases`, 'POST'), true);
  assert.equal(P.isMutation(`${B}/rest/v1/cases?id=eq.1`, 'PATCH'), true);
  assert.equal(P.isMutation(`${B}/rest/v1/cases?id=eq.1`, 'DELETE'), true);
  assert.equal(P.isMutation(`${B}/rest/v1/rpc/convert_lead_to_case`, 'POST'), true, 'unknown RPCs count as writes');
  assert.equal(P.isMutation(`${B}/rest/v1/rpc/staff_update`, 'POST'), true);
  assert.equal(P.isMutation(`${B}/rest/v1/rpc/staff_list`, 'POST'), false);
  assert.equal(P.isMutation(`${B}/rest/v1/rpc/role_preview_event`, 'POST'), false, 'ending the preview must work');
  assert.equal(P.isMutation(`${B}/rest/v1/rpc/contact_facts`, 'POST'), false, 'reading contact eligibility is allowed');
  assert.equal(P.isMutation(`${B}/rest/v1/rpc/record_contact_objection`, 'POST'), true, 'recording an objection is a write');
  assert.equal(P.isMutation(`${B}/storage/v1/object/hlektrismos_docs/x.pdf`, 'POST'), true);
  assert.equal(P.isMutation(`${B}/functions/v1/admin-users`, 'POST'), true);
  assert.equal(P.isMutation(`${B}/auth/v1/token?grant_type=refresh_token`, 'POST'), false);
  assert.equal(P.isMutation(`${B}/auth/v1/logout`, 'POST'), false);
});

test('availability: server says yes AND server clock before expiry AND before the hard stop (16/10 00:00 Athens)', () => {
  const st = { allowed: true, expires_at: '2026-10-15T21:00:00Z' };
  const at = (iso) => Date.parse(iso);
  assert.equal(P.previewAllowed(st, at('2026-10-15T10:00:00Z'), 0), true);
  assert.equal(P.previewAllowed(st, at('2026-10-15T21:00:00Z'), 0), false, 'midnight Athens');
  assert.equal(P.previewAllowed(st, at('2026-10-15T20:59:00Z'), 120_000), false, 'server clock ahead of the browser wins');
  assert.equal(P.previewAllowed({ ...st, expires_at: '2026-12-31T00:00:00Z' }, at('2026-10-16T00:00:00Z'), 0), false, 'hard stop even if the server grant were longer');
  assert.equal(P.previewAllowed({ allowed: false, expires_at: st.expires_at }, at('2026-10-15T10:00:00Z'), 0), false);
  assert.equal(P.previewAllowed(null, at('2026-10-15T10:00:00Z'), 0), false, 'no answer → fail closed');
  assert.equal(P.previewAllowed({ allowed: 'true', expires_at: st.expires_at }, at('2026-10-15T10:00:00Z'), 0), false);
  assert.equal(P.ROLE_PREVIEW_HARD_STOP, at('2026-10-15T21:00:00Z'));
});
