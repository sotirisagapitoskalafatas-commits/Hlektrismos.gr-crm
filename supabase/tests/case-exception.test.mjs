// LOCAL verification only (PGlite) of supabase/staged-migrations/phase4/13_case_exception_state.sql.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const BO = 'aaaaaaaa-0000-4000-8000-000000000005';
const GONE = 'aaaaaaaa-0000-4000-8000-000000000009';
const CASE = 'cccccccc-0000-4000-8000-000000000001';

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean default true);
    create table public.cases (id uuid primary key, current_stage text not null default 'offer');
    create table public.timeline_events (id uuid primary key default gen_random_uuid(), case_id uuid, role text, activity_type text, title text, description text, user_id uuid, metadata jsonb);
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, action text, details jsonb);
    grant usage on schema public to authenticated;
    insert into public.profiles values ('${BO}','Εύα','back_office',true),('${GONE}','Πρώην','back_office',false);
    insert into public.cases values ('${CASE}', 'offer');
  `);
  const sql = read('../staged-migrations/phase4/13_case_exception_state.sql');
  await db.exec(sql); await db.exec(sql);
});

test('set an exception with a note; stage is untouched; timeline + audit written', async () => {
  await as(BO);
  assert.ok(!(await run("select public.set_case_exception($1, 'offer_declined', '')", [CASE])).ok, 'note required');
  assert.ok(!(await run("select public.set_case_exception($1, 'missing_info', 'x y z')", [CASE])).ok, 'missing info uses the existing return, not a new value');
  assert.equal((await run("select public.set_case_exception($1, 'offer_declined', 'Βρήκε φθηνότερο') ok", [CASE])).rows[0].ok, true);
  await su();
  const c = (await db.query('select * from public.cases')).rows[0];
  assert.equal(c.exception_state, 'offer_declined'); assert.equal(c.current_stage, 'offer'); assert.equal(c.exception_by, BO);
  assert.equal((await db.query("select count(*)::int n from public.timeline_events where metadata->>'exception_to' = 'offer_declined'")).rows[0].n, 1);
  assert.equal((await db.query("select count(*)::int n from public.activity_log where action = 'case_exception'")).rows[0].n, 1);
});

test('clear the exception; inactive staff and anonymous callers are refused', async () => {
  await as(BO);
  assert.equal((await run('select public.set_case_exception($1, null) ok', [CASE])).rows[0].ok, true);
  await su();
  assert.equal((await db.query('select exception_state, exception_note from public.cases')).rows[0].exception_state, null);
  await as(GONE);
  assert.ok(!(await run("select public.set_case_exception($1, 'no_response', 'Δεν απαντά')", [CASE])).ok);
  await as(null); await db.exec('set role anon');
  assert.ok(!(await run("select public.set_case_exception($1, 'no_response', 'Δεν απαντά')", [CASE])).ok);
});
