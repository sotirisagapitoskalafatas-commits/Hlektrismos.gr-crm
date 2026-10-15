// LOCAL verification only (PGlite) of supabase/staged-migrations/phase4/12_default_backoffice_assignee.sql.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const INSIDE = 'aaaaaaaa-0000-4000-8000-000000000003';
const BO = 'aaaaaaaa-0000-4000-8000-000000000005';
const BO_OFF = 'aaaaaaaa-0000-4000-8000-000000000007';
const LEAD = 'bbbbbbbb-0000-4000-8000-000000000001';

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
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    create table public.crm_settings (setting_key text primary key, setting_value jsonb, category text, description text);
    create table public.leads (id uuid primary key, full_name text, client_name text not null default '', assigned_to_user_id uuid, created_by_user_id uuid);
    create table public.app_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, case_id uuid, title text, body text, type text, link text);
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, action text, details jsonb);
    grant usage on schema public to authenticated;
    insert into public.profiles values ('${ADMIN}','Admin','admin',true),('${INSIDE}','Ελένη','inside_sales',true),('${BO}','Εύα','back_office',true),('${BO_OFF}','Πρώην','back_office',false);
    insert into public.leads (id, full_name, created_by_user_id, assigned_to_user_id) values ('${LEAD}', 'Καφέ Αθηνά', '${INSIDE}', '${INSIDE}');
  `);
  await db.exec(read('../staged-migrations/phase4/12_default_backoffice_assignee.sql'));
});

test('no assignee set: routing changes nothing and says so (null)', async () => {
  await as(INSIDE);
  assert.equal((await run('select public.route_lead_to_backoffice($1) a', [LEAD])).rows[0].a, null);
  await su();
  assert.equal((await db.query('select assigned_to_user_id from public.leads')).rows[0].assigned_to_user_id, INSIDE);
});

test('only an admin sets the assignee, and only to an active Back Office user; audited', async () => {
  await as(INSIDE);
  assert.ok(!(await run('select public.set_default_backoffice_assignee($1)', [BO])).ok);
  await as(ADMIN);
  assert.ok(!(await run('select public.set_default_backoffice_assignee($1)', [INSIDE])).ok, 'not a Back Office user');
  assert.ok(!(await run('select public.set_default_backoffice_assignee($1)', [BO_OFF])).ok, 'inactive');
  assert.equal((await run('select public.set_default_backoffice_assignee($1) ok', [BO])).rows[0].ok, true);
  await su();
  assert.equal((await db.query("select details->>'to' t from public.activity_log where action = 'default_backoffice_assignee'")).rows[0].t, BO);
});

test('a lead with documents is routed to the assignee, who is notified; the creator is kept', async () => {
  await as(INSIDE);
  const a = (await run('select public.route_lead_to_backoffice($1) a', [LEAD])).rows[0].a;
  assert.deepEqual(a, { id: BO, full_name: 'Εύα' });
  await su();
  const l = (await db.query('select assigned_to_user_id, created_by_user_id from public.leads')).rows[0];
  assert.equal(l.assigned_to_user_id, BO); assert.equal(l.created_by_user_id, INSIDE);
  assert.equal((await db.query("select count(*)::int n from public.app_notifications where user_id = $1 and type = 'lead'", [BO])).rows[0].n, 1);
});

test('a deactivated assignee counts as not set', async () => {
  await su(); await db.exec(`update public.profiles set is_active = false where id = '${BO}'`);
  await as(INSIDE);
  assert.equal((await run('select public.default_backoffice_assignee() a')).rows[0].a, null);
});
