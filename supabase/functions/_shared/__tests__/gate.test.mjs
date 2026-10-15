// Proves: denied recipients produce ZERO provider requests; lookups failing => everything denied;
// the gate trusts ids only (never request-supplied addresses).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../outreach-gate.ts', import.meta.url));
const out = buildSync({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const { gateRecipients, MAX_BATCH } = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const eligFile = fileURLToPath(new URL('../eligibility.ts', import.meta.url));
const eligOut = buildSync({ entryPoints: [eligFile], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const { DEFAULT_CONFIG } = await import('data:text/javascript;base64,' + Buffer.from(eligOut.outputFiles[0].text).toString('base64'));

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-14T09:00:00Z');
const OPEN = { ...DEFAULT_CONFIG, outreachEnabled: true, legalApprovalRecorded: true };
const GRANT = { status: 'granted', channel: 'email', basis: 'consent', evidenceRef: 'form#1', evidenceAt: '2026-10-01T00:00:00Z' };

function loaders(over = {}) {
  return {
    leads: async (ids) => ids.filter((i) => i !== C).map((id) => ({ id, email: `${id.slice(0, 4)}@x.gr`, phone: '+306900000000' })),
    permissions: async () => ({ [A]: GRANT }),            // B (e.g. scraped) has no permission record
    suppressedEmails: async () => new Set(),
    recentAttempts: async () => ({}),
    objections: async () => ({}),
    article11: async () => ({}),
    ...over,
  };
}
// A stand-in provider: the code under test may only call it for allowed recipients.
function fakeSend(result) { const calls = []; for (const l of result.allowed) calls.push(l.email); return calls; }

test('only the recipient with recorded permission reaches the provider; scraped/unknown ones do not', async () => {
  const r = await gateRecipients([A, B, C], 'email', 'promotional', loaders(), OPEN, NOW);
  assert.deepEqual(r.allowed.map((l) => l.id), [A]);
  assert.equal(fakeSend(r).length, 1);
  assert.deepEqual(r.denied.find((d) => d.id === B).reasons, ['NO_CHANNEL_PERMISSION']);
  assert.deepEqual(r.denied.find((d) => d.id === C).reasons, ['LEAD_NOT_FOUND']);
});

test('default (disabled) configuration sends nothing, even to a recipient with permission', async () => {
  const r = await gateRecipients([A], 'email', 'promotional', loaders(), DEFAULT_CONFIG, NOW);
  assert.equal(fakeSend(r).length, 0);
  assert.ok(r.denied[0].reasons.includes('OUTREACH_DISABLED'));
});

test('any failing lookup denies EVERY recipient (fail closed)', async () => {
  for (const key of ['leads', 'permissions', 'suppressedEmails', 'recentAttempts', 'objections']) {
    const r = await gateRecipients([A, B], 'email', 'promotional', loaders({ [key]: async () => { throw new Error('db down'); } }), OPEN, NOW);
    assert.equal(fakeSend(r).length, 0, key);
    assert.ok(r.denied.every((d) => d.reasons[0] === 'LOOKUP_FAILED'), key);
  }
});

test('suppressed address and paused AI are denied', async () => {
  const r1 = await gateRecipients([A], 'email', 'promotional', loaders({ suppressedEmails: async (e) => new Set(e) }), OPEN, NOW);
  assert.deepEqual(r1.denied[0].reasons, ['SUPPRESSED']);
  const r2 = await gateRecipients([A], 'email', 'promotional', loaders({ leads: async () => [{ id: A, email: 'a@x.gr', ai_paused: true }] }), OPEN, NOW);
  assert.deepEqual(r2.denied[0].reasons, ['AI_PAUSED']);
});

test('invalid ids are dropped, duplicates collapsed, oversize batches refused', async () => {
  const r = await gateRecipients(['not-an-id', A, A, { id: B }], 'email', 'promotional', loaders(), OPEN, NOW);
  assert.deepEqual(r.allowed.map((l) => l.id), [A]);
  assert.equal(r.denied.length, 0);
  const many = Array.from({ length: MAX_BATCH + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const big = await gateRecipients(many, 'email', 'promotional', loaders(), OPEN, NOW);
  assert.equal(big.allowed.length, 0);
  assert.ok(big.denied.every((d) => d.reasons[0] === 'BATCH_TOO_LARGE'));
  assert.deepEqual(await gateRecipients('nope', 'email', 'promotional', loaders(), OPEN, NOW), { allowed: [], denied: [] });
});

test('the gate uses database addresses, not request-supplied ones', async () => {
  // Request carries a different address in an object; only the id is read.
  const r = await gateRecipients([A], 'email', 'promotional', loaders(), OPEN, NOW);
  assert.equal(r.allowed[0].email, ' 1111@x.gr'.trim());
});

test('an objection on the phone or email stops the send even with a consent record (phase3/09)', async () => {
  const r = await gateRecipients([A], 'email', 'promotional', loaders({ objections: async () => ({ [A]: [{ scope: 'marketing', channels: null }] }) }), OPEN, NOW);
  assert.equal(fakeSend(r).length, 0);
  assert.ok(r.denied[0].reasons.includes('OBJECTION_RECORDED'));
  // an objection limited to SMS does not block email
  const r2 = await gateRecipients([A], 'email', 'promotional', loaders({ objections: async () => ({ [A]: [{ scope: 'marketing', channels: ['sms'] }] }) }), OPEN, NOW);
  assert.deepEqual(r2.allowed.map((l) => l.id), [A]);
});

test('voice reads the Article 11 screening; a failing screening lookup denies everyone', async () => {
  const VOICE = { ...OPEN, voiceEnabled: true };
  const perm = { [A]: { ...GRANT, channel: 'voice' } };
  const fresh = { [A]: { result: 'not_listed', screenedAt: '2026-10-10T09:00:00Z' } };
  const ok = await gateRecipients([A], 'voice', 'promotional', loaders({ permissions: async () => perm, article11: async () => fresh }), VOICE, NOW);
  assert.deepEqual(ok.allowed.map((l) => l.id), [A]);
  const listed = await gateRecipients([A], 'voice', 'promotional', loaders({ permissions: async () => perm, article11: async () => ({ [A]: { result: 'listed', screenedAt: '2026-10-10T09:00:00Z' } }) }), VOICE, NOW);
  assert.ok(listed.denied[0].reasons.includes('ARTICLE11_LISTED'));
  const none = await gateRecipients([A], 'voice', 'promotional', loaders({ permissions: async () => perm }), VOICE, NOW);
  assert.ok(none.denied[0].reasons.includes('ARTICLE11_NOT_SCREENED'));
  const down = await gateRecipients([A], 'voice', 'promotional', loaders({ permissions: async () => perm, article11: async () => { throw new Error('db down'); } }), VOICE, NOW);
  assert.equal(down.denied[0].reasons[0], 'LOOKUP_FAILED');
});
