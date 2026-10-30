#!/usr/bin/env node
// READ-ONLY check of the PUBLIC Auth settings of a Hlektrismos Supabase project (the same document every browser can fetch):
//   node scripts/ops/auth-settings-check.mjs [--ref nonaymiwdayfuulccxrl]
// Expected for production: public sign-up OFF, e-mail auto-confirm OFF, only the e-mail provider. Exit code 1 when a requirement fails.
// It cannot see the Site URL, the redirect allow-list, the e-mail templates or SMTP (those are dashboard-only: see docs/ops/AUTH_URL_CONFIGURATION.md).
import { spawnSync } from 'node:child_process';

const ALLOWED = new Set(['nonaymiwdayfuulccxrl', 'jiencxiapucrexpmzxbo']);
const i = process.argv.indexOf('--ref');
const REF = i > 0 ? process.argv[i + 1] : 'nonaymiwdayfuulccxrl';
if (!ALLOWED.has(REF)) { console.error('refusing unknown project ' + REF); process.exit(2); }
const r = spawnSync('npx', ['-y', 'supabase@2.120.0', 'projects', 'api-keys', '--project-ref', REF, '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32' });
const out = (r.stdout || '') + (r.stderr || '');
const keys = JSON.parse(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1));
const pub = (keys.find((k) => /publishable/i.test(k.name ?? k.type ?? '')) ?? keys.find((k) => k.name === 'anon'))?.api_key; // public by design, never printed
if (!pub) { console.error('no publishable key'); process.exit(2); }
const res = await fetch(`https://${REF}.supabase.co/auth/v1/settings`, { headers: { apikey: pub } });
const s = await res.json();
const enabled = Object.entries(s.external ?? {}).filter(([, v]) => v === true).map(([k]) => k);
const checks = [
  ['public sign-up is disabled (disable_signup = true)', s.disable_signup === true],
  ['e-mail auto-confirm is off (mailer_autoconfirm = false)', s.mailer_autoconfirm === false],
  ['phone auto-confirm is off', s.phone_autoconfirm === false],
  ['only the e-mail provider is enabled', enabled.length === 1 && enabled[0] === 'email'],
];
let bad = 0;
console.log(`Auth settings of ${REF}: ${JSON.stringify({ disable_signup: s.disable_signup, mailer_autoconfirm: s.mailer_autoconfirm, phone_autoconfirm: s.phone_autoconfirm, providers: enabled })}`);
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) bad++; }
process.exit(bad ? 1 : 0);
