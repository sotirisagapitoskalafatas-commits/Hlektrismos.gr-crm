#!/usr/bin/env node
// Installs the rendered ATLAS Auth e-mail templates into a Supabase project through the Management API.
//   node scripts/ops/push-auth-email-templates.mjs                dry run: lists the fields it WOULD set (default; changes nothing)
//   SUPABASE_ACCESS_TOKEN=... PROJECT_REF=... node scripts/ops/push-auth-email-templates.mjs --apply
// The token is a personal access token of an account owner (supabase.com/dashboard/account/tokens). It is read from the environment only, never printed,
// never written to a file. Only mailer_subjects_* and mailer_templates_* fields are sent: nothing that switches notification e-mails on, nothing about SMTP,
// URLs or rate limits. The hosted dashboard's «Email Templates» page can be used instead (see docs/ops/AUTH_EMAIL_TEMPLATES.md).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const payload = JSON.parse(readFileSync(fileURLToPath(new URL('../../emails/dist/supabase-auth-templates.json', import.meta.url)), 'utf8'));
const keys = Object.keys(payload);
if (!keys.every((k) => /^mailer_(subjects|templates)_[a-z_]+$/.test(k))) { console.error('refusing: the payload holds a field that is not a subject or a template'); process.exit(2); }
console.log(`${keys.length} fields: ${keys.filter((k) => k.startsWith('mailer_subjects_')).length} subjects, ${keys.filter((k) => k.startsWith('mailer_templates_')).length} templates`);
if (!process.argv.includes('--apply')) { console.log('dry run: nothing was sent. Add --apply (with SUPABASE_ACCESS_TOKEN and PROJECT_REF set) to install.'); process.exit(0); }
const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.PROJECT_REF;
if (!token || !ref || !/^[a-z0-9]{20}$/.test(ref)) { console.error('SUPABASE_ACCESS_TOKEN and a 20-character PROJECT_REF are required'); process.exit(2); }
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
console.log(res.ok ? `installed (HTTP ${res.status}). Verify in the dashboard: Authentication, Email Templates.` : `failed (HTTP ${res.status}); nothing is known to have changed`);
process.exit(res.ok ? 0 : 1);
