// LOCAL verification only (PGlite) of docs/ops/LEAD_CREATION_CHECK.sql: it is one read-only statement, it works against the REAL leads
// definition, it reports a drifted or empty database as findings instead of errors, and it returns no personal data.
// NOT production verification (that is what the file is for).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSync } from 'esbuild';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const SQL = read('../../docs/ops/LEAD_CREATION_CHECK.sql');
const js = buildSync({ entryPoints: [fileURLToPath(new URL('../../src/lib/lead-payload.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const P = await import('data:text/javascript;base64,' + Buffer.from(js.outputFiles[0].text).toString('base64'));
const between = (src, start, end) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf(end, i) + end.length); };

async function realDb({ withFunctions = true } = {}) {
  const db = new PGlite();
  await db.exec('create table public.profiles (id uuid primary key); create table public.cases (id uuid primary key);');
  const m1 = read('../migrations/20260908180001_crm_leads_activity_log.sql');
  await db.exec(between(m1, 'create table if not exists public.leads', ');'));
  const m2 = read('../migrations/20260909200000_p1_lead_foundation.sql');
  await db.exec(between(m2, 'alter table public.leads\n  add constraint leads_status_check', ');'));
  await db.exec(between(m2, 'alter table public.leads\n  add constraint leads_source_check', ');'));
  if (withFunctions) {
    await db.exec(`create function public.insert_website_lead(p_source text, p_payload jsonb) returns uuid language sql as $$ select null::uuid $$;
      create function public.convert_lead_to_case(p_lead uuid) returns uuid language sql as $$ select null::uuid $$;`);
  }
  return db;
}
// Runs the file inside a READ ONLY transaction (any write would raise), returns the rows keyed by n.
async function check(db) {
  await db.exec('begin read only');
  try { const r = await db.query(SQL); return Object.fromEntries(r.rows.map((x) => [x.n, x])); }
  finally { await db.exec('rollback'); }
}

test('real leads definition: one statement, read-only, 15 rows, and it shows exactly the NOT NULL facts that decide the question', async () => {
  const db = await realDb();
  const r = await check(db);
  assert.deepEqual(Object.keys(r).map(Number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 99]);
  assert.equal(r[1].finding, 'present');
  assert.match(r[2].finding, /first_name — NOT NULL/);
  assert.match(r[2].finding, /client_name — NOT NULL/);
  assert.match(r[2].finding, /client_contact — NOT NULL, default ''/);
  assert.match(r[2].finding, /phone — nullable/);
  assert.match(r[3].finding, /leads_status_check/); assert.match(r[3].finding, /leads_source_check/);
  assert.match(r[5].finding, /^RLS OFF/);          // the test table has no RLS; the grid says so instead of failing
  assert.match(r[6].finding, /insert_website_lead: present/); assert.match(r[6].finding, /convert_lead_to_case: present/);
  assert.match(r[6].finding, /get_active_tariff_prices: MISSING/, 'a missing function is a finding');
  assert.equal(r[7].finding, 'not applied');
  assert.equal(r[9].finding, '0 leads; newest -');
  await db.close();
});

test('counts and metadata only: no name, phone or e-mail reaches the grid', async () => {
  const db = await realDb();
  const ids = P.leadIdentityColumns({ full_name: 'Zxqvbn Persona', phone: '6911119999', email: 'zxqvbn.persona@example.test' });
  for (let i = 0; i < 3; i++) {
    const cols = { ...ids, source: i === 2 ? 'website' : 'inside_sales', status: 'new' };
    const keys = Object.keys(cols);
    await db.query(`insert into public.leads (${keys.join(', ')}) values (${keys.map((_, j) => `$${j + 1}`).join(', ')})`, keys.map((k) => cols[k]));
  }
  const r = await check(db);
  assert.match(r[9].finding, /^3 leads; newest 20/);
  assert.match(r[10].finding, /inside_sales {2}2/); assert.match(r[10].finding, /website {2}1/);
  assert.match(r[12].finding, /^0 without first_name; 0 without client_contact; 3 without creator; 3 without assignee$/);
  assert.equal(r[13].finding, 'new: 3');
  assert.equal(r[14].finding, '1 phone numbers (the numbers themselves are not shown)');
  const blob = JSON.stringify(Object.values(r));
  for (const secret of ['Zxqvbn', 'Persona', '6911119999', 'zxqvbn.persona', 'example.test']) assert.ok(!blob.includes(secret), `the grid must not contain «${secret}»`);
  await db.close();
});

test('a drifted production (nullable first_name, no source column, no legacy table) is reported, not an error', async () => {
  const db = new PGlite();
  await db.exec(`create table public.leads (id uuid primary key default gen_random_uuid(), first_name text, client_name text, client_contact text not null default '', status text, created_at timestamptz default now());`);
  const r = await check(db);
  assert.match(r[2].finding, /first_name — nullable/); assert.match(r[2].finding, /client_contact — NOT NULL/);
  assert.equal(r[2].finding, "client_contact — NOT NULL, default ''::text\nclient_name — nullable\nfirst_name — nullable");
  assert.equal(r[10].finding, 'column created_at or source missing');
  assert.match(r[12].finding, /missing/);
  assert.equal(r[11].finding, 'not present');
  assert.equal(r[14].finding, 'column phone missing');
  await db.close();
});

test('an empty database (no leads table at all) answers every row', async () => {
  const db = new PGlite();
  const r = await check(db);
  assert.equal(r[1].finding, 'MISSING');
  for (const n of [9, 10, 12, 13, 14]) assert.equal(r[n].finding, 'n/a', `row ${n}`);
  assert.equal(r[8].finding, 'schema_migrations is not readable here');
  assert.match(r[5].finding, /^table missing/);
  assert.equal(r[3].finding, 'none');
  await db.close();
});

test('recorded migrations and the legacy table are read when they exist', async () => {
  const db = await realDb();
  await db.exec(`create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key);
    insert into supabase_migrations.schema_migrations values ('20260908180001'), ('20260909200000'), ('20260910000200'), ('20261001000100'), ('20261016000000');
    create table public.hlektrismos_leads (id uuid primary key default gen_random_uuid(), created_at timestamptz default now());
    insert into public.hlektrismos_leads default values;
    create function public.customer_match_phone(p text) returns text language sql as $$ select p $$;`);
  const r = await check(db);
  assert.equal(r[8].finding, 'newest 20261016000000; lead migrations recorded: 4 of 4');
  assert.match(r[11].finding, /^1 rows; newest 20/);
  assert.match(r[7].finding, /^applied/);
  await db.close();
});

test('the file is one SELECT: no write or definition keyword outside comments and quoted text, one statement, nothing else', () => {
  const noComments = SQL.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  const noQuoted = noComments.replace(/\$q\$[\s\S]*?\$q\$/g, (m) => ` ${m.slice(3, -3).replace(/'[^']*'/g, "''")} `).replace(/'(?:[^']|'')*'/g, "''");
  const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|reindex|cluster|comment|set|reset|call|do|execute|lock|notify|listen|refresh|merge)\b/i;
  assert.equal(FORBIDDEN.exec(noQuoted), null, FORBIDDEN.exec(noQuoted)?.[0]);
  assert.equal((noQuoted.match(/;/g) ?? []).length, 1, 'exactly one statement');
  assert.ok(noQuoted.trimStart().toLowerCase().startsWith('with') && noQuoted.trimEnd().endsWith(';'));
  assert.ok(/^-- READ ONLY\./.test(SQL), 'says so in the first line');
});
