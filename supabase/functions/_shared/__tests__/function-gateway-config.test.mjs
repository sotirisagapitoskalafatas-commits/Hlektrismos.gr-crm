// Keeps supabase/config.toml (gateway verify_jwt) and each function's own authentication in step.
// A function with verify_jwt=false is reachable by anyone who knows its URL, so it must authenticate the caller itself
// (or be public by design). A function that only the platform JWT check protects must NOT be switched off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const fnDir = fileURLToPath(new URL('../../', import.meta.url));
const cfg = readFileSync(join(fnDir, '../config.toml'), 'utf8').replace(/\r\n/g, '\n');
// Read the TOML sections line by line, so a comment or another key before verify_jwt cannot hide a switched-off function.
const off = new Set();
{
  let fn = null;
  for (const line of cfg.split('\n').map((l) => l.replace(/#.*$/, '').trim())) {
    const head = /^\[functions\.([\w-]+)\]$/.exec(line);
    if (head) fn = head[1]; else if (line.startsWith('[')) fn = null;
    else if (fn && /^verify_jwt\s*=\s*false$/.test(line)) off.add(fn);
  }
}
const fns = readdirSync(fnDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name);
const src = (f) => readFileSync(join(fnDir, f, 'index.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

// the guard each function uses when the gateway does not check a JWT
const OWN_GUARD = /getCaller\(|presentsSecretKey\(|configuredSecrets\(|verifyLink\(|verifyExpiringLink\(|verifyUnsubscribe|createHmac|timingSafeEqual/;
const PUBLIC_BY_DESIGN = new Set(['chat']); // public chatbot: no login, bounded elsewhere

// callers that cannot send a Supabase JWT: provider webhook, e-mailed link, ad-platform webhook
const EXTERNAL = {
  'vapi-webhook': /configuredSecrets\("VAPI_WEBHOOK_SECRET"\)/,
  'accept-offer': /verifyExpiringLink\(/,
  'receive-lead-webhook': /configuredSecrets\("LEAD_WEBHOOK_SECRET"\)/,
};

test('every function with verify_jwt=false authenticates the caller itself (or is public by design)', () => {
  for (const f of off) {
    assert.ok(fns.includes(f), `config names an unknown function: ${f}`);
    assert.ok(PUBLIC_BY_DESIGN.has(f) || OWN_GUARD.test(src(f)), `${f} has verify_jwt=false but no guard of its own`);
  }
});

test('functions that authenticate an external caller by secret or signature are declared verify_jwt=false', () => {
  for (const [f, re] of Object.entries(EXTERNAL)) {
    assert.ok(re.test(src(f)), `${f} no longer has its own guard`);
    assert.ok(off.has(f), `${f} must be verify_jwt=false (its caller cannot send a Supabase JWT); deploying with the default would break it`);
  }
});

test('a function with no guard of its own is never switched off at the gateway', () => {
  for (const f of fns) {
    if (PUBLIC_BY_DESIGN.has(f)) continue;
    if (!OWN_GUARD.test(src(f))) assert.ok(!off.has(f), `${f} has no guard of its own and must keep the gateway JWT check`);
  }
});
