#!/usr/bin/env node
// Read-only static inventory for docs/ops/SECURITY_AUDIT.md. Reads the repository only (no network, no database). Prints Markdown.
//   node scripts/audit/security-inventory.mjs [functions|policies|definer|secrets|all]
// It never prints a secret value: for key-like strings it prints the file, the commit and the decoded *role claim* only.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(join(root, p), 'utf8');
const section = process.argv[2] ?? 'all';
const want = (s) => section === 'all' || section === s;

/* ---------------- edge functions ---------------- */
if (want('functions')) {
  const cfg = read('supabase/config.toml');
  const noJwt = new Set([...cfg.matchAll(/\[functions\.([\w-]+)\]\s*\n\s*verify_jwt\s*=\s*false/g)].map((m) => m[1]));
  const dirs = readdirSync(join(root, 'supabase/functions')).filter((d) => d !== '_shared' && existsSync(join(root, 'supabase/functions', d, 'index.ts')));
  const guards = [['requireStaff', /requireStaff/], ['requirePermission', /requirePermission/], ['auth.getUser', /auth\.getUser|getUser\(/], ['HMAC', /hmac|HMAC/i], ['webhook secret', /WEBHOOK_SECRET|x-webhook/i], ['cron secret', /CRON_SECRET|x-cron-secret/i], ['role matrix', /canManage|decideDelete/]];
  console.log('## Edge functions\n\n| function | verify_jwt | guard found in code | service-role key | CORS |\n|---|---|---|---|---|');
  for (const d of dirs) {
    const src = read(`supabase/functions/${d}/index.ts`);
    const g = guards.filter(([, re]) => re.test(src)).map(([n]) => n);
    const cors = /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*/.test(src) || /_shared\/cors/.test(src) ? (/_shared\/cors/.test(src) ? 'shared (see _shared/cors.ts)' : '`*`') : 'none';
    const unguarded = noJwt.has(d) && g.length === 0;
    console.log(`| ${d} | ${noJwt.has(d) ? '**false**' : 'default (true)'} | ${g.join(', ') || (noJwt.has(d) ? '**none found**' : 'JWT only')}${unguarded ? ' ⚠' : ''} | ${/SERVICE_ROLE/.test(src) ? 'yes' : 'no'} | ${cors} |`);
  }
  console.log();
}

/* ---------------- policies (net effect, in file order) ---------------- */
function sqlFiles() {
  const live = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => `supabase/migrations/${f}`);
  return live;
}
if (want('policies')) {
  const pol = new Map(); // key `${table}|${name}` -> { file, cmd, roles, using, check }
  const stripc = (s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const f of sqlFiles()) {
    const s = stripc(read(f));
    for (const m of s.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"?([^"\s]+(?:\s[^"]*)?)"?\s+on\s+(?:only\s+)?(?:public\.)?"?([\w]+)"?/gi)) pol.delete(`${m[2]}|${m[1].replace(/"/g, '')}`);
    for (const m of s.matchAll(/create\s+policy\s+"?([^"]+?)"?\s+on\s+(?:public\.)?"?([\w]+)"?\s+(?:as\s+(?:permissive|restrictive)\s+)?(?:for\s+(\w+)\s+)?(?:to\s+([\w,\s]+?)\s+)?(using\s*\(([\s\S]*?)\))?\s*(with\s+check\s*\(([\s\S]*?)\))?\s*;/gi)) {
      pol.set(`${m[2]}|${m[1]}`, { file: f.split('/').pop(), table: m[2], name: m[1], cmd: (m[3] ?? 'all').toLowerCase(), roles: (m[4] ?? 'public').toLowerCase().replace(/\s+/g, ''), using: (m[6] ?? '').replace(/\s+/g, ' ').trim(), check: (m[8] ?? '').replace(/\s+/g, ' ').trim() });
    }
  }
  const all = [...pol.values()];
  const openTo = (p) => /(^|,)(anon|public)(,|$)/.test(p.roles);
  const trueish = (e) => e === 'true' || e === '';
  console.log(`## Policies from the live migrations (net effect: later drops applied; ${all.length} policies remain after parsing)\n`);
  console.log('Anonymous / public policies and policies that are `true` for every signed-in user (`using (true)`), by table:\n');
  console.log('| table | policy | command | roles | using | with check | file |\n|---|---|---|---|---|---|---|');
  for (const p of all.filter((x) => openTo(x) || (trueish(x.using) && /all|insert|update|delete/.test(x.cmd))).sort((a, b) => a.table.localeCompare(b.table))) {
    console.log(`| ${p.table} | ${p.name} | ${p.cmd} | ${p.roles} | \`${p.using.slice(0, 60) || '—'}\` | \`${p.check.slice(0, 40) || '—'}\` | ${p.file} |`);
  }
  console.log('\nParser limits: policies created inside `DO $$` blocks, `ALTER POLICY`, and dynamic SQL are not seen; staged files are not included (they are not applied).\n');
}

/* ---------------- SECURITY DEFINER functions ---------------- */
if (want('definer')) {
  const rows = [];
  for (const f of [...sqlFiles(), ...readdirSync(join(root, 'supabase/staged-migrations'), { recursive: true }).filter((x) => String(x).endsWith('.sql')).map((x) => `supabase/staged-migrations/${x}`)]) {
    const s = read(f);
    for (const m of s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?(?:as\s+\$\$|as\s+\$\w+\$)/gi)) {
      const head = m[0];
      if (!/security\s+definer/i.test(head)) continue;
      const hasPath = /set\s+search_path/i.test(head);
      rows.push({ f: f.replace('supabase/', ''), name: m[1], hasPath });
    }
  }
  const bad = rows.filter((r) => !r.hasPath);
  console.log(`## SECURITY DEFINER functions: ${rows.length} definitions; **${bad.length} without \`set search_path\`**\n`);
  for (const r of bad) console.log(`- ${r.name} — ${r.f}`);
  console.log();
}

/* ---------------- secrets ---------------- */
if (want('secrets')) {
  const git = (args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (e) { return e.stdout ?? ''; } };
  const decodeRole = (jwt) => { try { const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')); return `role=${p.role ?? '?'}${p.ref ? ' ref=' + p.ref : ''}`; } catch { return 'not a JWT'; } };
  console.log('## Secrets search\n');
  const files = git(['ls-files']).split('\n').filter(Boolean).filter((f) => !/\.(png|jpe?g|webp|gif|ico|woff2?|pdf|lock)$|package-lock/.test(f));
  const patterns = [['JWT-like key', /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/g], ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g], ['provider secret prefix', /\b(sk_live_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{20,})\b/g], ['password literal', /(password|passwd|secret)\s*[:=]\s*['"][^'"\s]{8,}['"]/gi]];
  const hits = [];
  for (const f of files) {
    let t; try { if (statSync(join(root, f)).size > 3_000_000) continue; t = read(f); } catch { continue; }
    for (const [label, re] of patterns) { for (const m of t.matchAll(re)) hits.push({ f, label, extra: label === 'JWT-like key' ? decodeRole(m[0]) : '' }); }
  }
  console.log(`### Working tree (${files.length} tracked files)\n`);
  if (!hits.length) console.log('No match.\n');
  else { const g = new Map(); for (const h of hits) { const k = `${h.f} | ${h.label}${h.extra ? ' | ' + h.extra : ''}`; g.set(k, (g.get(k) ?? 0) + 1); } for (const [k, n] of g) console.log(`- ${k} (${n}x)`); console.log(); }
  console.log('### Git history (all branches; values are never printed)\n');
  const out = git(['log', '--all', '-G', 'eyJ[A-Za-z0-9_-]{15,}\\.eyJ[A-Za-z0-9_-]{15,}', '--pretty=format:%h %ad', '--date=short', '--name-only', '--diff-filter=AM']);
  const byFile = new Map(); let cur = '';
  for (const l of out.split('\n')) { if (/^[0-9a-f]{7,} \d{4}-/.test(l)) cur = l; else if (l.trim()) { const a = byFile.get(l) ?? []; a.push(cur.split(' ')[0]); byFile.set(l, a); } }
  console.log(`Files whose history contains a JWT-like string: ${byFile.size}\n`);
  for (const [f, c] of [...byFile].slice(0, 25)) console.log(`- ${f} — ${new Set(c).size} commit(s), first ${c[c.length - 1]}`);
  const envs = git(['log', '--all', '--diff-filter=A', '--name-only', '--pretty=format:', '--', '*.env', '.env*', '*.pem', '*.key', 'deploy_output*']).split('\n').filter(Boolean);
  console.log(`\nEnv/key/log files that were ever added to history: ${[...new Set(envs)].join(', ') || 'none'}\n`);
}
