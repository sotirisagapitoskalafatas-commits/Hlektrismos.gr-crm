// LOCAL verification only (PGlite) of supabase/staged-migrations/phase1/16_storage_docs_lockdown.sql. NOT staging or production.
// storage.objects is emulated (same RLS model: permissive policies per role); the starting state replays EVERY policy
// statement on storage.objects from the real migrations, in order. list() and signed links = SELECT; upload (upsert:false) = INSERT.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const LIVE = ['20260810190238_add_bill_upload_columns_and_storage', '20260819000005_storage_bucket_and_calendar', '20260820000004_fix_storage_anon_policies',
  '20260909120000_p0_foundation_and_security', '20261001000100_age_gate_public_leads'];
const db = new PGlite();
const STAFF = 'aaaaaaaa-0000-4000-8000-000000000005';
const INACTIVE = 'aaaaaaaa-0000-4000-8000-000000000009'; // e.g. a self-registered account (inactive by the signup backstop)

async function as(who) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who === 'anon' ? '' : who ?? '']);
  if (who === 'anon') await db.exec('set role anon');
  else if (who) await db.exec('set role authenticated');
}
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, n: r.affectedRows }; } catch (e) { return { ok: false, err: e.message }; } }
const list = async (who) => { await as(who); return (await db.query("select name from storage.objects where bucket_id = 'hlektrismos_docs' order by name")).rows.map((r) => r.name); };
const upload = async (who, name, bucket = 'hlektrismos_docs') => { await as(who); return run('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name]); };

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    insert into public.profiles values ('${STAFF}', 'back_office', true), ('${INACTIVE}', 'inside_sales', false);
    create schema storage;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null, owner uuid);
    create function storage.foldername(name text) returns text[] language sql immutable
      as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage, public to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', 'contact-forms/bill.pdf'), ('hlektrismos_docs', 'leads/L1/id-front.jpg');
  `);
  for (const m of LIVE) {
    const stmts = read(`../migrations/${m}.sql`).match(/\b(create|drop) policy[\s\S]*?;/gi) ?? [];
    for (const s of stmts.filter((x) => /on\s+storage\.objects/i.test(x))) await db.exec(s);
  }
});

test('BEFORE (reproduces the live finding): anonymous visitors and inactive accounts list every file; anon writes anywhere', async () => {
  assert.deepEqual(await list('anon'), ['contact-forms/bill.pdf', 'leads/L1/id-front.jpg']);
  assert.equal((await list(INACTIVE)).length, 2);
  assert.equal((await upload('anon', 'leads/L1/planted.pdf')).ok, true);
  await as(null); await db.exec("delete from storage.objects where name = 'leads/L1/planted.pdf'");
});

test('apply 16 (twice: idempotent)', async () => {
  const sql = read('../staged-migrations/phase1/16_storage_docs_lockdown.sql');
  await as(null); await db.exec(sql); await db.exec(sql);
  const names = (await db.query("select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual like '%hlektrismos_docs%' or with_check like '%hlektrismos_docs%') order by 1")).rows.map((r) => r.policyname);
  assert.deepEqual(names, ['hlektrismos_docs_service_all', 'service all hlektrismos_docs', 'staff reads lead files', 'staff uploads docs', 'website uploads contact forms']);
});

test('AFTER: the anonymous visitor cannot list, read, change or delete; the website form upload still works', async () => {
  assert.deepEqual(await list('anon'), [], 'list() returns nothing');
  assert.equal((await upload('anon', 'contact-forms/1700000000-new-bill.pdf')).ok, true, 'website form upload (contact-forms/) works');
  assert.equal((await upload('anon', 'leads/L1/planted.pdf')).ok, false, 'anon cannot write outside contact-forms/');
  assert.equal((await upload('anon', 'bill.pdf')).ok, false, 'not at the bucket root either');
  await as('anon');
  assert.equal((await run("update storage.objects set name = 'x' where bucket_id = 'hlektrismos_docs'")).n, 0);
  assert.equal((await run("delete from storage.objects where bucket_id = 'hlektrismos_docs'")).n, 0);
  assert.equal((await list(STAFF)).length, 3, 'nothing was changed or deleted');
});

test('AFTER: inactive / self-registered accounts see nothing and cannot upload; active staff read and upload', async () => {
  assert.deepEqual(await list(INACTIVE), []);
  assert.equal((await upload(INACTIVE, 'leads/L1/x.pdf')).ok, false);
  assert.equal((await list(STAFF)).length, 3, 'active staff still list (and so create signed links)');
  assert.equal((await upload(STAFF, 'leads/L1/id-back.jpg')).ok, true, 'CRM upload under leads/<id>/');
  assert.equal((await upload(STAFF, 'customers/C1/contract/1_x.pdf')).ok, true, 'legacy customer screen path');
  await as(STAFF);
  assert.equal((await run("delete from storage.objects where name = 'leads/L1/id-back.jpg'")).n, 0, 'delete is admin-only (staged phase2/06)');
});

test('other buckets are untouched (energy-bills upload policy unchanged)', async () => {
  assert.equal((await upload('anon', 'any/bill.pdf', 'energy-bills')).ok, true);
});
