// Static guard for the security fix in supabase/functions/send-lead-confirmation (docs/ops/SECURITY_AUDIT.md F-03).
// The function runs on Deno and cannot be imported here, so this reads its source: the claim must come BEFORE the send, a failed send
// must release it, and the caller must never get the internal error text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../../send-lead-confirmation/index.ts', import.meta.url)), 'utf8');

test('one confirmation per lead: ack_sent_at is read, claimed atomically before the SMTP send, and released if the send fails', () => {
  const claim = src.indexOf('.update({ ack_sent_at: new Date().toISOString() })');
  const smtp = src.indexOf('await openSecureSmtp(');
  assert.ok(src.includes('ack_sent_at') && /\.select\("id, first_name, email, created_at, ack_sent_at"\)/.test(src), 'the column is read');
  assert.ok(claim > 0 && smtp > claim, 'claimed before sending');
  assert.ok(/\.is\("ack_sent_at", null\)/.test(src), 'the claim is conditional (atomic): only one caller wins');
  assert.ok(/catch \(sendErr\) \{\s*await releaseClaim\(\);\s*throw sendErr;/.test(src), 'a failed send releases the claim');
  assert.ok(/skipped: "already confirmed"/.test(src));
});

test('the public caller never receives internal error text', () => {
  assert.ok(!/error: err\.message/.test(src), 'no err.message in a response');
  assert.ok(/console\.error\("send-lead-confirmation error:", err instanceof Error \? err\.name : "error"\)/.test(src), 'only the error name is logged');
});
