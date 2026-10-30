// LOCAL verification only (PGlite). Not staging or production evidence.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const AGENT = 'aaaaaaaa-0000-4000-8000-000000000003';
const INACTIVE = 'aaaaaaaa-0000-4000-8000-000000000004';

async function as(role, uid = null) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (role) await db.exec(`set role ${role}`);
}
async function can(sql) { try { const r = await db.query(sql); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
  `);
  await db.exec(read('../migrations/20260818160000_create_integrations_table.sql'));
  await db.exec(`
    insert into auth.users values ('${ADMIN}'),('${AGENT}'),('${INACTIVE}');
    insert into public.profiles values ('${ADMIN}','admin',true),('${AGENT}','field_sales',true),('${INACTIVE}','field_sales',false);
    update public.crm_integrations set config = '{"token":"SECRET-PLACEHOLDER"}'::jsonb where id = 'gmail';
    grant all on all tables in schema public to anon, authenticated;
  `);
  await db.exec(read('../staged-migrations/phase1/01_rls_hardening.sql'));
  for (let i = 0; i < 2; i++) await db.exec(read('../staged-migrations/phase6/22_crm_integrations_status_invoker.sql'));
});

test('view is security_invoker after the migration (idempotent)', async () => {
  await as(null);
  const o = (await db.query("select reloptions from pg_class where oid='public.crm_integrations_status'::regclass")).rows[0].reloptions;
  assert.ok((o ?? []).includes('security_invoker=true'));
});

test('view no longer bypasses RLS: admin sees rows, non-admin staff and anon see none, no config column', async () => {
  await as('authenticated', ADMIN);
  const a = await can('select * from public.crm_integrations_status');
  assert.equal(a.rows.length, 8);
  assert.ok(!('config' in a.rows[0]));
  await as('authenticated', AGENT);
  assert.equal((await can('select * from public.crm_integrations_status')).rows.length, 0);
  await as('anon');
  const n = await can('select * from public.crm_integrations_status');
  assert.ok(!n.ok || n.rows.length === 0);
});

test('safe status for staff is served by the checked function; secrets never exposed', async () => {
  await as('authenticated', AGENT);
  const s = await can('select * from public.crm_integrations_status_for_staff()');
  assert.equal(s.rows.length, 8);
  assert.deepEqual(Object.keys(s.rows[0]).sort(), ['connected', 'id', 'name', 'updated_at']);
  assert.ok(!JSON.stringify(s.rows).includes('SECRET-PLACEHOLDER'));
  await as('authenticated', INACTIVE);
  assert.equal((await can('select * from public.crm_integrations_status_for_staff()')).rows.length, 0, 'inactive account gets nothing');
  await as('anon');
  assert.ok(!(await can('select * from public.crm_integrations_status_for_staff()')).ok, 'anon cannot execute');
});

test('rollback restores the owner-rights view and removes the function', async () => {
  await as(null);
  await db.exec(read('../../docs/ops/rollback_phase6_22_crm_integrations_status_invoker.sql'));
  const o = (await db.query("select reloptions from pg_class where oid='public.crm_integrations_status'::regclass")).rows[0].reloptions;
  assert.ok(!(o ?? []).includes('security_invoker=true'));
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname='crm_integrations_status_for_staff'")).rows[0].n, 0);
});
