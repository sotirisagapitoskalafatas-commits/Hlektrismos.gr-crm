// LOCAL verification only (PGlite) of supabase/staged-migrations/phase1/17_anon_restrictive_lockdown.sql and its rollback.
// The legacy tables are rebuilt with the REAL permissive policy shapes found by scripts/audit/security-inventory.mjs («Allow all …» to public using (true)).
// NOT staging or production verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const SQL = read('../staged-migrations/phase1/17_anon_restrictive_lockdown.sql');
const ROLLBACK = read('../../docs/ops/rollback_phase1_17_anon_restrictive_lockdown.sql');
const TABLES = ['agent_provider_commissions', 'customer_agent_attribution', 'customer_commissions_ledger', 'customer_documents', 'sales_agents', 'supply_points', 'customer_meters', 'entity_documents', 'crm_users', 'crm_tasks', 'crm_integrations', 'crm_emails'];
const USER = 'aaaaaaaa-0000-4000-8000-000000000001';

async function mk() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;  -- Supabase default: RLS is the only barrier
    alter default privileges in schema public grant all on sequences to anon, authenticated;
  `);
  for (const t of TABLES) {
    await db.exec(`create table public.${t} (id serial primary key, note text default 'x'); insert into public.${t} (note) values ('secret'); alter table public.${t} enable row level security;
      create policy "Allow all on ${t}" on public.${t} for all to public using (true) with check (true);`);
  }
  // a table the file must NOT touch: the website form inserts here as anon
  await db.exec(`create table public.hlektrismos_leads (id serial primary key, consent boolean not null default false); alter table public.hlektrismos_leads enable row level security;
    create policy leads_anon_insert on public.hlektrismos_leads for insert to anon with check (consent = true);
    create policy leads_auth_all on public.hlektrismos_leads for all to authenticated using (true) with check (true);`);
  await db.exec(`create function public.create_crm_user(a text, b text, c text, d text, e text) returns void language sql security definer as $$ select 1 $$;`);
  return db;
}
const as = async (db, role) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [role === 'authenticated' ? USER : '']); if (role) await db.exec(`set role ${role}`); };
const run = async (db, sql) => { try { const r = await db.query(sql); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } };

const db = await mk();

test('BEFORE: with the public anon key anyone can read AND write the legacy tables (reproduces the finding)', async () => {
  await as(db, 'anon');
  for (const t of TABLES) {
    assert.equal((await run(db, `select * from public.${t}`)).rows?.length, 1, `anon reads ${t}`);
    assert.equal((await run(db, `insert into public.${t} (note) values ('planted')`)).ok, true, `anon writes ${t}`);
    assert.equal((await run(db, `update public.${t} set note = 'changed'`)).ok, true);
  }
});

test('AFTER: anonymous can neither read nor write any of them; nothing is dropped; signed-in users are unaffected', async () => {
  await as(db, null);
  await db.exec(SQL);
  const before = (await db.query("select count(*)::int n from pg_policies where schemaname='public' and policyname like 'Allow all on %'")).rows[0].n;
  assert.equal(before, TABLES.length, 'the original permissive policies are all still there (nothing dropped)');
  await as(db, 'anon');
  for (const t of TABLES) {
    assert.equal((await run(db, `select * from public.${t}`)).rows?.length ?? 0, 0, `anon reads nothing from ${t}`);
    assert.equal((await run(db, `insert into public.${t} (note) values ('again')`)).ok, false, `anon cannot insert into ${t}`);
    const u = await run(db, `update public.${t} set note = 'hacked'`);
    assert.ok(!u.ok || u.rows.length === 0);
  }
  await as(db, 'authenticated');
  for (const t of TABLES) {
    assert.ok((await run(db, `select * from public.${t}`)).rows.length >= 1, `signed-in still reads ${t}`);
    assert.equal((await run(db, `insert into public.${t} (note) values ('staff')`)).ok, true, `signed-in still writes ${t}`);
  }
  await as(db, null);
  const notes = (await db.query(`select note from public.agent_provider_commissions order by id`)).rows.map((r) => r.note);
  assert.ok(!notes.includes('hacked') && !notes.includes('again'), 'no anonymous write landed after the lockdown');
});

test('the website form still works: the file does not touch hlektrismos_leads (anon may insert with consent, nothing else)', async () => {
  await as(db, 'anon');
  assert.equal((await run(db, 'insert into public.hlektrismos_leads (consent) values (true)')).ok, true);
  assert.equal((await run(db, 'insert into public.hlektrismos_leads (consent) values (false)')).ok, false);
  assert.equal((await run(db, 'select * from public.hlektrismos_leads')).rows?.length ?? 0, 0);
});

test('create_crm_user() gets a pinned search_path (F-06); idempotent; tables that do not exist are skipped', async () => {
  await as(db, null);
  const cfg = (await db.query("select proconfig from pg_proc where proname = 'create_crm_user'")).rows[0].proconfig;
  assert.ok((cfg ?? []).some((c) => /^search_path=/.test(c)), JSON.stringify(cfg));
  await db.exec(SQL); // twice
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname = 'anon never (restrictive)'")).rows[0].n, TABLES.length, 'one restrictive policy per table, not two');
  const bare = new PGlite();
  await bare.exec('create role anon nologin; create role authenticated nologin;');
  await bare.exec(SQL); // none of the tables exist: it must not fail
});

test('rollback: removes only the restrictive policies and the function setting; the original policies are untouched', async () => {
  await as(db, null);
  await db.exec(ROLLBACK);
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname = 'anon never (restrictive)'")).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname like 'Allow all on %'")).rows[0].n, TABLES.length);
  const cfg = (await db.query("select proconfig from pg_proc where proname = 'create_crm_user'")).rows[0].proconfig;
  assert.ok(!(cfg ?? []).some((c) => /^search_path=/.test(c)));
  await as(db, 'anon');
  assert.equal((await run(db, 'select * from public.sales_agents')).rows.length >= 1, true, 'rollback restores the old (open) behaviour exactly');
});
