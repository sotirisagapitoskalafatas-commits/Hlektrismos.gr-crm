// Run: npm test   (plain Node; TypeScript modules are transpiled on the fly)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function load(rel) {
  const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}
const perms = await load('../permissions.ts');
const elig = await load('../eligibility.ts');

/* ---------------- permissions ---------------- */
test('admin has every capability; unknown role/capability is denied', () => {
  for (const c of perms.CAPABILITIES) assert.equal(perms.hasCapability('admin', c), true);
  assert.equal(perms.hasCapability('intern', 'campaign.send'), false);
  assert.equal(perms.hasCapability(null, 'campaign.send'), false);
  assert.equal(perms.hasCapability('manager', 'made.up'), false);
});

test('conservative defaults: only admin can send campaigns, call, manage integrations, export', () => {
  for (const role of ['manager', 'inside_sales', 'field_sales', 'back_office']) {
    for (const c of ['campaign.send', 'communications.voice.initiate', 'integrations.manage', 'users.manage_roles', 'pii.export']) {
      assert.equal(perms.hasCapability(role, c), false, `${role} must not have ${c}`);
    }
  }
  assert.equal(perms.hasCapability('inside_sales', 'campaign.approve'), false);
  assert.equal(perms.hasCapability('field_sales', 'case.documents.verify'), false);
});

test('legacy manager and back_office hold NO capability — not by default and not through role_permissions overrides', () => {
  const grantEverything = perms.parseOverrides({ manager: [...perms.CAPABILITIES], back_office: [...perms.CAPABILITIES] });
  for (const role of ['manager', 'back_office']) {
    for (const c of perms.CAPABILITIES) {
      assert.equal(perms.hasCapability(role, c), false, `${role} default ${c}`);
      assert.equal(perms.hasCapability(role, c, grantEverything), false, `${role} override ${c}`);
    }
  }
  assert.equal(perms.hasCapability('admin', 'users.manage_roles', grantEverything), true, 'admin unaffected');
});

test('overrides: valid ones apply, malformed ones are ignored, admin cannot be locked out', () => {
  const o = perms.parseOverrides('{"inside_sales":["communications.sms.send","bogus"],"admin":[]}');
  assert.equal(perms.hasCapability('inside_sales', 'communications.sms.send', o), true);
  assert.equal(perms.hasCapability('inside_sales', 'campaign.draft', o), false); // replaced list
  assert.equal(perms.hasCapability('admin', 'integrations.manage', o), true);
  assert.deepEqual(perms.parseOverrides('not json'), {});
  assert.deepEqual(perms.parseOverrides(42), {});
});

/* ---------------- eligibility ---------------- */
const NOW = new Date('2026-10-14T09:00:00Z'); // 12:00 Europe/Athens
const OPEN = { ...elig.DEFAULT_CONFIG, outreachEnabled: true, legalApprovalRecorded: true };
const GOOD_PERM = { status: 'granted', channel: 'email', basis: 'consent', evidenceRef: 'form#42', evidenceAt: '2026-10-01T10:00:00Z' };
const base = (o = {}) => ({
  channel: 'email', purpose: 'promotional', suppressed: false, hasAddress: true,
  permission: GOOD_PERM, recentAttempts: 0, now: NOW, config: OPEN, ...o,
});

test('everything satisfied => allowed', () => {
  assert.deepEqual(elig.decideEligibility(base()), { allowed: true, reasons: [] });
});

test('DEFAULT config denies promotional outreach even with a perfect permission record', () => {
  const d = elig.decideEligibility(base({ config: elig.DEFAULT_CONFIG }));
  assert.equal(d.allowed, false);
  assert.ok(d.reasons.includes('OUTREACH_DISABLED') && d.reasons.includes('LEGAL_APPROVAL_MISSING'));
});

test('a scraped/imported business with no permission record is never eligible', () => {
  for (const permission of [null, undefined, { status: 'none', channel: 'email', basis: null }]) {
    const d = elig.decideEligibility(base({ permission }));
    assert.equal(d.allowed, false);
    assert.ok(d.reasons.includes('NO_CHANNEL_PERMISSION'));
  }
});

test('unknown lookups fail closed (suppression, frequency)', () => {
  assert.ok(elig.decideEligibility(base({ suppressed: null })).reasons.includes('SUPPRESSION_UNKNOWN'));
  assert.ok(elig.decideEligibility(base({ recentAttempts: null })).reasons.includes('FREQUENCY_UNKNOWN'));
});

test('suppression, objection, wrong channel, weak basis, missing evidence, frequency cap', () => {
  assert.ok(elig.decideEligibility(base({ suppressed: true })).reasons.includes('SUPPRESSED'));
  assert.ok(elig.decideEligibility(base({ permission: { ...GOOD_PERM, status: 'withdrawn' } })).reasons.includes('OBJECTION_RECORDED'));
  assert.ok(elig.decideEligibility(base({ permission: { ...GOOD_PERM, channel: 'sms' } })).reasons.includes('PERMISSION_WRONG_CHANNEL'));
  assert.ok(elig.decideEligibility(base({ permission: { ...GOOD_PERM, basis: 'other' } })).reasons.includes('BASIS_NOT_SUFFICIENT'));
  assert.ok(elig.decideEligibility(base({ permission: { ...GOOD_PERM, evidenceRef: null } })).reasons.includes('NO_PERMISSION_EVIDENCE'));
  assert.ok(elig.decideEligibility(base({ recentAttempts: 2 })).reasons.includes('FREQUENCY_CAP'));
});

test('contact hours are evaluated in Europe/Athens', () => {
  const night = new Date('2026-10-14T20:00:00Z'); // 23:00 Athens
  assert.ok(elig.decideEligibility(base({ now: night })).reasons.includes('OUTSIDE_CONTACT_HOURS'));
  const bad = elig.decideEligibility(base({ config: { ...OPEN, timeZone: 'Not/AZone' } }));
  assert.ok(bad.reasons.includes('TIME_UNKNOWN'));
});

test('voice stays disabled by default and needs a fresh opt-out register screening', () => {
  const voicePerm = { ...GOOD_PERM, channel: 'voice', dncScreenedAt: '2026-10-10T00:00:00Z' };
  const off = elig.decideEligibility(base({ channel: 'voice', permission: voicePerm }));
  assert.ok(off.reasons.includes('VOICE_DISABLED'));
  const on = { ...OPEN, voiceEnabled: true };
  assert.equal(elig.decideEligibility(base({ channel: 'voice', permission: voicePerm, config: on })).allowed, true);
  assert.ok(elig.decideEligibility(base({ channel: 'voice', permission: { ...voicePerm, dncScreenedAt: null }, config: on })).reasons.includes('DNC_NOT_SCREENED'));
  assert.ok(elig.decideEligibility(base({ channel: 'voice', permission: { ...voicePerm, dncScreenedAt: '2026-01-01T00:00:00Z' }, config: on })).reasons.includes('DNC_SCREENING_STALE'));
});

test('transactional replies need an address and no recorded objection, but not marketing permission', () => {
  assert.equal(elig.decideEligibility(base({ purpose: 'transactional', permission: null, config: elig.DEFAULT_CONFIG })).allowed, true);
  assert.equal(elig.decideEligibility(base({ purpose: 'transactional', hasAddress: false })).allowed, false);
  assert.equal(elig.decideEligibility(base({ purpose: 'transactional', permission: { ...GOOD_PERM, status: 'withdrawn' } })).allowed, false);
});
