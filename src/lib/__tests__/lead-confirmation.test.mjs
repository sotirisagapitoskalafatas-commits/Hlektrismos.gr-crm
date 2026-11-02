import test from 'node:test';
import assert from 'node:assert/strict';
import { isLeadConfirmationDelivered } from '../lead-confirmation.mjs';

test('accepts an explicit successful delivery response', () => {
  assert.equal(isLeadConfirmationDelivered({ data: { ok: true, message: 'Confirmation email sent' }, error: null }), true);
});

test('rejects HTTP 200 responses where delivery failed or was skipped', () => {
  assert.equal(isLeadConfirmationDelivered({ data: { ok: false, error: 'SMTP not configured' }, error: null }), false);
  assert.equal(isLeadConfirmationDelivered({ data: { ok: true, skipped: 'no recent lead' }, error: null }), false);
  assert.equal(isLeadConfirmationDelivered({ data: { ok: true, skipped: 'not sent' }, error: null }), false);
});

test('rejects invocation errors and missing or malformed response data', () => {
  assert.equal(isLeadConfirmationDelivered({ data: null, error: new Error('network') }), false);
  assert.equal(isLeadConfirmationDelivered({ data: null, error: null }), false);
  assert.equal(isLeadConfirmationDelivered({ data: { message: 'OK' }, error: null }), false);
});
