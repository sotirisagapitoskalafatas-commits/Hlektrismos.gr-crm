// Contact eligibility for the new CRM (phase3/09): a person phoning ("call"), objections that follow the contact
// point across records, the Article 11 opt-out register, and phone/email normalisation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const load = (rel) => {
  const out = buildSync({ entryPoints: [fileURLToPath(new URL(rel, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const elig = await load('../eligibility.ts');
const keys = await load('../contact-keys.ts');

const NOW = new Date('2026-10-14T09:00:00Z'); // 12:00 Europe/Athens
const FRESH = { result: 'not_listed', screenedAt: '2026-10-10T08:00:00Z' };
const call = (o = {}) => elig.decideEligibility({
  channel: 'call', purpose: 'promotional', suppressed: false, hasAddress: true, permission: null, recentAttempts: null,
  objections: [], article11: FRESH, now: NOW, config: elig.DEFAULT_CONFIG, ...o,
});

test('a sales call needs no campaign switch, but a fresh «not listed» Article 11 screening', () => {
  assert.deepEqual(call(), { allowed: true, reasons: [] }, 'DEFAULT config (campaigns off) does not stop a person phoning');
  assert.deepEqual(call({ article11: { result: null, screenedAt: null } }).reasons, ['ARTICLE11_NOT_SCREENED']);
  assert.deepEqual(call({ article11: { result: 'not_listed', screenedAt: '2026-08-01T00:00:00Z' } }).reasons, ['ARTICLE11_SCREENING_STALE']);
  assert.deepEqual(call({ article11: { result: 'listed', screenedAt: '2026-10-10T00:00:00Z' } }).reasons, ['ARTICLE11_LISTED']);
  assert.deepEqual(call({ article11: null }).reasons, ['ARTICLE11_UNKNOWN'], 'lookup failed => deny');
  assert.deepEqual(call({ article11: undefined }).reasons, ['ARTICLE11_UNKNOWN'], 'not supplied => deny');
});

test('recorded consent for calls replaces the screening, except when the number is listed', () => {
  const consent = { status: 'granted', channel: 'call', basis: 'consent', evidenceRef: 'Έντυπο 0042', evidenceAt: '2026-09-01T10:00:00Z' };
  assert.equal(call({ permission: consent, article11: { result: null, screenedAt: null } }).allowed, true);
  assert.deepEqual(call({ permission: consent, article11: { result: 'listed', screenedAt: '2026-10-01T00:00:00Z' } }).reasons, ['ARTICLE11_LISTED']);
  assert.deepEqual(call({ permission: { ...consent, evidenceRef: null }, article11: { result: null, screenedAt: null } }).reasons, ['ARTICLE11_NOT_SCREENED'], 'consent without evidence counts for nothing');
  assert.deepEqual(call({ permission: { ...consent, channel: 'sms' }, article11: { result: null, screenedAt: null } }).reasons, ['ARTICLE11_NOT_SCREENED'], 'SMS consent is not call consent');
  assert.ok(call({ permission: { ...consent, status: 'withdrawn' } }).reasons.includes('OBJECTION_RECORDED'), 'withdrawn = stop');
});

test('objections: marketing vs all, per channel, unknown fails closed', () => {
  assert.deepEqual(call({ objections: [{ scope: 'marketing', channels: null }] }).reasons, ['OBJECTION_RECORDED']);
  assert.equal(call({ objections: [{ scope: 'marketing', channels: ['sms', 'email'] }] }).allowed, true, 'an SMS/email objection does not stop a call');
  assert.deepEqual(call({ objections: null }).reasons, ['OBJECTION_UNKNOWN']);
  const tx = (o) => elig.decideEligibility({ channel: 'call', purpose: 'transactional', suppressed: false, hasAddress: true, permission: null, recentAttempts: 0, now: NOW, config: elig.DEFAULT_CONFIG, ...o });
  assert.equal(tx({ objections: [{ scope: 'marketing', channels: null }] }).allowed, true, 'returning their call about their own case is not marketing');
  assert.deepEqual(tx({ objections: [{ scope: 'all', channels: null }] }).reasons, ['OBJECTION_RECORDED'], '«stop all contact» stops that too');
  assert.deepEqual(tx({ hasAddress: false, objections: null }).reasons, ['NO_ADDRESS', 'OBJECTION_UNKNOWN']);
});

test('calls respect contact hours in Europe/Athens', () => {
  assert.deepEqual(call({ now: new Date('2026-10-14T18:30:00Z') }).reasons, ['OUTSIDE_CONTACT_HOURS']); // 21:30 Athens
  assert.deepEqual(call({ now: new Date('2026-10-14T05:00:00Z') }).reasons, ['OUTSIDE_CONTACT_HOURS']); // 08:00 Athens
});

test('automated channels: the objection list is checked in addition to everything else', () => {
  const OPEN = { ...elig.DEFAULT_CONFIG, outreachEnabled: true, legalApprovalRecorded: true };
  const perm = { status: 'granted', channel: 'sms', basis: 'consent', evidenceRef: 'form#1', evidenceAt: '2026-10-01T00:00:00Z' };
  const sms = (o) => elig.decideEligibility({ channel: 'sms', purpose: 'promotional', suppressed: false, hasAddress: true, permission: perm, recentAttempts: 0, now: NOW, config: OPEN, objections: [], ...o });
  assert.equal(sms({}).allowed, true);
  assert.deepEqual(sms({ objections: [{ scope: 'marketing', channels: ['sms'] }] }).reasons, ['OBJECTION_RECORDED']);
  assert.ok(sms({ config: elig.DEFAULT_CONFIG }).reasons.includes('OUTREACH_DISABLED'), 'campaign master switch still applies to SMS');
  const voice = elig.decideEligibility({ channel: 'voice', purpose: 'promotional', suppressed: false, hasAddress: true, recentAttempts: 0, now: NOW,
    permission: { ...perm, channel: 'voice' }, objections: [], article11: FRESH, config: { ...OPEN, voiceEnabled: true } });
  assert.equal(voice.allowed, true, 'voice with consent, fresh screening and all switches');
});

test('phone/email keys: formats of the same contact point match; placeholders are not contact points', () => {
  for (const p of ['+30 210 123 4567', '00302101234567', '210-123-4567', '(210) 1234567']) assert.equal(keys.phoneKey(p), '2101234567');
  assert.equal(keys.phoneKey('+30 691 000 0010'), '6910000010');
  assert.equal(keys.phoneKey(''), null);
  assert.equal(keys.phoneKey(null), null);
  assert.equal(keys.emailKey('  Maria@Example.GR '), 'maria@example.gr');
  assert.equal(keys.emailKey('not-provided@hlektrismos.local'), null);
  assert.equal(keys.emailKey('@nouser.gr'), null);
  assert.equal(keys.emailKey('no-at-sign'), null);
});
