// LOCAL verification only (PGlite) of supabase/staged-migrations/phase6/20_user_preferences.sql. NOT staging or production.
// auth/storage/profiles are emulated (storage.objects with RLS, storage.buckets, storage.foldername, is_staff/is_role).
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const SQL = read('../staged-migrations/phase6/20_user_preferences.sql');
const db = new PGlite();
const A = 'aaaaaaaa-0000-4000-8000-000000000001', B = 'aaaaaaaa-0000-4000-8000-000000000002', ADMIN = 'aaaaaaaa-0000-4000-8000-000000000003',
  BO = 'aaaaaaaa-0000-4000-8000-000000000004', OFF = 'aaaaaaaa-0000-4000-8000-000000000005';

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid && uid !== 'anon' ? uid : '']);
  if (uid === 'anon') await db.exec('set role anon');
  else if (uid) await db.exec('set role authenticated');
}
const run = async (sql, params) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } };
const put = async (who, name, bucket = 'avatars') => { await as(who); return run('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name]); };
const names = async (who) => { await as(who); return (await db.query("select name from storage.objects where bucket_id = 'avatars' order by 1")).rows.map((r) => r.name); };

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path = public
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true) and p.role = r) $$;
    insert into auth.users values ('${A}'),('${B}'),('${ADMIN}'),('${BO}'),('${OFF}');
    insert into public.profiles values ('${A}','inside_sales',true),('${B}','field_sales',true),('${ADMIN}','admin',true),('${BO}','back_office',true),('${OFF}','inside_sales',false);
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null, owner uuid);
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage, public, auth to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    grant select on public.profiles to authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  await db.exec(SQL);
  await db.exec(SQL); // idempotent
});

test('table shape: defaults, checks, jsonb array, one row per user', async () => {
  await as(A);
  assert.equal((await run('insert into public.user_preferences (user_id) values ($1)', [A])).ok, true);
  const row = (await run('select * from public.user_preferences')).rows[0];
  assert.equal(row.shell_theme, 'navy'); assert.equal(row.sidebar_compact, false); assert.deepEqual(row.dashboard_layout, []); assert.equal(row.pipeline_lane, null);
  assert.equal((await run("update public.user_preferences set shell_theme = 'neon'")).ok, false, 'unknown theme rejected');
  assert.equal((await run(`update public.user_preferences set dashboard_layout = '{"a":1}'::jsonb`)).ok, false, 'layout must be an array');
  assert.equal((await run(`update public.user_preferences set shell_theme = 'plum', sidebar_compact = true, dashboard_layout = '[{"id":"kpi","size":"M"}]'::jsonb`)).ok, true);
  assert.equal((await run('insert into public.user_preferences (user_id) values ($1)', [A])).ok, false, 'one row per user');
});

test('updated_at moves on update', async () => {
  await as(null); await db.exec(`update public.user_preferences set updated_at = '2020-01-01' where user_id = '${A}'`);
  await as(A); await run('update public.user_preferences set sidebar_compact = false');
  const t = (await run('select updated_at from public.user_preferences')).rows[0].updated_at;
  assert.ok(new Date(t).getFullYear() >= 2025);
});

test('RLS: own row only; no cross-user read, insert or update; no delete; anon and inactive denied', async () => {
  await as(B);
  assert.equal((await run('select 1 from public.user_preferences')).rows.length, 0, 'B cannot see A');
  assert.equal((await run('insert into public.user_preferences (user_id) values ($1)', [A])).ok, false, 'B cannot insert for A');
  assert.equal((await run('insert into public.user_preferences (user_id) values ($1)', [B])).ok, true);
  assert.equal((await run("update public.user_preferences set shell_theme = 'forest' where user_id = $1", [A])).n, 0, 'B cannot update A');
  assert.equal((await run('update public.user_preferences set user_id = $1 where user_id = $2', [A, B])).ok, false, 'cannot hand a row to someone else');
  assert.equal((await run('delete from public.user_preferences')).ok, false, 'no delete privilege');
  await as(ADMIN);
  assert.equal((await run('select 1 from public.user_preferences')).rows.length, 0, 'not even an admin reads others through the API');
  await as('anon');
  assert.equal((await run('select 1 from public.user_preferences')).ok, false);
  await as(OFF);
  assert.equal((await run('insert into public.user_preferences (user_id) values ($1)', [OFF])).ok, false, 'inactive account');
});

test('avatars bucket is private, JPEG only, size-capped', async () => {
  await as(null);
  const b = (await run("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'")).rows[0];
  assert.equal(b.public, false); assert.deepEqual(b.allowed_mime_types, ['image/jpeg']); assert.ok(Number(b.file_size_limit) <= 1_048_576);
});

test('avatars: own folder and exact filename only; others, anon and inactive denied', async () => {
  assert.equal((await put(A, `${A}/avatar.jpg`)).ok, true);
  assert.equal((await put(A, `${B}/avatar.jpg`)).ok, false, 'not into another folder');
  assert.equal((await put(A, `${A}/other.jpg`)).ok, false, 'fixed filename');
  assert.equal((await put(A, 'avatar.jpg')).ok, false, 'not at the bucket root');
  assert.equal((await put('anon', 'x/avatar.jpg')).ok, false);
  assert.equal((await put(OFF, `${OFF}/avatar.jpg`)).ok, false);
  assert.equal((await put(B, `${B}/avatar.jpg`)).ok, true);
  assert.equal((await put(A, `${A}/avatar.jpg`, 'hlektrismos_docs')).ok, false, 'no policy here grants other buckets');
});

test('avatars: read own; admin and Back Office read all; others and anon cannot; only the owner removes', async () => {
  assert.deepEqual(await names(A), [`${A}/avatar.jpg`]);
  assert.deepEqual(await names(ADMIN), [`${A}/avatar.jpg`, `${B}/avatar.jpg`]);
  assert.deepEqual(await names(BO), [`${A}/avatar.jpg`, `${B}/avatar.jpg`]);
  assert.deepEqual(await names('anon'), []);
  await as(BO);
  assert.equal((await run("update storage.objects set name = name where bucket_id = 'avatars'")).n, 0, 'Back Office reads but cannot change');
  assert.equal((await run("delete from storage.objects where bucket_id = 'avatars'")).n, 0);
  await as(ADMIN);
  assert.equal((await run("delete from storage.objects where bucket_id = 'avatars'")).n, 0, 'admin reads but cannot delete another photo');
  await as(A);
  assert.equal((await run("delete from storage.objects where bucket_id = 'avatars'")).n, 1, 'A removes only the own file');
  assert.deepEqual(await names(ADMIN), [`${B}/avatar.jpg`]);
});

test('rollback removes the table, the policies and the helper', async () => {
  const rb = read('../../docs/ops/rollback_phase6_20_user_preferences.sql');
  await as(null); await db.exec(rb); await db.exec(rb);
  assert.equal((await run("select to_regclass('public.user_preferences') r")).rows[0].r, null);
  assert.equal((await run("select count(*)::int c from pg_policies where policyname like 'avatars %'")).rows[0].c, 0);
});
