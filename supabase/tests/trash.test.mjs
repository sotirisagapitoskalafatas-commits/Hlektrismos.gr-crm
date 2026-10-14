// LOCAL verification only (PGlite) of supabase/staged-migrations/phase2/06 (trash for leads & customers).
// NOT staging or production verification.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const MANAGER = 'aaaaaaaa-0000-4000-8000-000000000002';
const INSIDE = 'aaaaaaaa-0000-4000-8000-000000000003';
const L_FREE = 'bbbbbbbb-0000-4000-8000-000000000001';
const L_CONVERTED = 'bbbbbbbb-0000-4000-8000-000000000002';
const C_OPEN = 'cccccccc-0000-4000-8000-000000000001';
const C_CLOSED = 'cccccccc-0000-4000-8000-000000000002';
const C_FREE = 'cccccccc-0000-4000-8000-000000000003';

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth; create schema storage;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    create table public.leads (id uuid primary key, full_name text, client_name text not null default '', phone text, email text, attached_files jsonb);
    create table public.customers (id uuid primary key, full_name text not null default '', phone text, email text);
    create table public.cases (id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id), lead_id uuid references public.leads(id), current_stage text not null);
    create table public.consent_records (id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete cascade);
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, action text, details jsonb, created_at timestamptz default now());
    alter table public.leads enable row level security; alter table public.customers enable row level security;
    -- current permissive policies (20260909120000)
    create policy "staff read leads" on public.leads for select to authenticated using (public.is_staff());
    create policy "staff update leads" on public.leads for update to authenticated using (public.is_staff()) with check (public.is_staff());
    create policy "staff read customers" on public.customers for select to authenticated using (public.is_staff());
    create policy "staff update customers" on public.customers for update to authenticated using (public.is_staff()) with check (public.is_staff());
    -- existing production read policy for the bucket (20261001000100)
    create policy "staff reads lead files" on storage.objects for select to authenticated using (bucket_id = 'hlektrismos_docs' and public.is_staff());
    grant usage on schema public, storage to authenticated;
    grant select, insert, update, delete on public.leads, public.customers, public.cases, public.activity_log, storage.objects to authenticated;
    insert into public.profiles values ('${ADMIN}','Admin','admin',true),('${MANAGER}','Manager','manager',true),('${INSIDE}','Inside','inside_sales',true);
    insert into public.leads values ('${L_FREE}','Ελεύθερο Lead','', '6900000001', null, '[{"path":"contact-forms/1_a_bill.pdf","name":"bill.pdf"}]'),
                                    ('${L_CONVERTED}','Lead με case','', null, null, null);
    insert into public.customers values ('${C_OPEN}','Πελάτης με ανοιχτό case',null,null),('${C_CLOSED}','Πελάτης με κλειστό case',null,null),('${C_FREE}','Πελάτης χωρίς τίποτα',null,null);
    insert into public.cases (customer_id, lead_id, current_stage) values ('${C_OPEN}', '${L_CONVERTED}', 'offer'), ('${C_CLOSED}', null, 'completed');
    insert into public.consent_records (customer_id) values ('${C_CLOSED}');
  `);
  await db.exec(read('../staged-migrations/phase2/06_trash_leads_customers.sql'));
});

test('only admin/manager can move to trash; trash columns cannot be written directly', async () => {
  await as(INSIDE);
  assert.equal((await run("select public.trash_record('lead', $1, 'x')", [L_FREE])).ok, false, 'inside sales cannot trash');
  assert.equal((await run('update public.leads set deleted_at = now() where id = $1', [L_FREE])).ok, false, 'direct write blocked');
  await as(ADMIN);
  assert.equal((await run('update public.leads set deleted_at = now() where id = $1', [L_FREE])).ok, false, 'even admin must use the function');
  await as(MANAGER);
  assert.equal((await run("select public.trash_record('lead', $1, 'Διπλότυπο')", [L_FREE])).ok, true);
  assert.equal((await run("select public.trash_record('lead', $1, null)", [L_FREE])).ok, false, 'already in trash');
});

test('trashed rows are hidden from other roles by the database; visible to admin/manager', async () => {
  await as(INSIDE);
  assert.equal((await run('select id from public.leads where id = $1', [L_FREE])).rows.length, 0);
  assert.equal((await run('select id from public.leads')).rows.length, 1, 'other leads still visible');
  assert.equal((await run('select * from public.trash_list()')).ok, false);
  await as(MANAGER);
  assert.equal((await run('select id from public.leads where id = $1', [L_FREE])).rows.length, 1);
  const list = await run('select * from public.trash_list()');
  assert.equal(list.rows.length, 1); assert.equal(list.rows[0].deleted_reason, 'Διπλότυπο'); assert.equal(list.rows[0].deleted_by_name, 'Manager');
});

test('customers: cannot trash with an open case; can with only closed cases', async () => {
  await as(MANAGER);
  const open = await run("select public.trash_record('customer', $1, null)", [C_OPEN]);
  assert.equal(open.ok, false); assert.match(open.err, /open case/);
  assert.equal((await run("select public.trash_record('customer', $1, null)", [C_CLOSED])).ok, true);
  assert.equal((await run("select public.trash_record('customer', $1, null)", [C_FREE])).ok, true);
  assert.equal((await run("select public.trash_record('lead', $1, null)", [L_CONVERTED])).ok, true, 'a converted lead may be trashed');
});

test('restore: admin/manager only; the row comes back unchanged', async () => {
  await as(INSIDE);
  assert.equal((await run("select public.restore_record('customer', $1)", [C_FREE])).ok, false);
  await as(MANAGER);
  assert.equal((await run("select public.restore_record('customer', $1)", [C_FREE])).ok, true);
  await as(INSIDE);
  assert.equal((await run('select full_name from public.customers where id = $1', [C_FREE])).rows[0]?.full_name, 'Πελάτης χωρίς τίποτα');
  await as(MANAGER);
  assert.equal((await run("select public.trash_record('customer', $1, 'ξανά')", [C_FREE])).ok, true);
});

test('permanent delete: admin only, only from the trash, never with references; returns file paths', async () => {
  await as(MANAGER);
  assert.equal((await run("select public.purge_record('lead', $1)", [L_FREE])).ok, false, 'manager cannot purge');
  await as(ADMIN);
  const withCase = await run("select public.purge_record('lead', $1)", [L_CONVERTED]);
  assert.equal(withCase.ok, false); assert.match(withCase.err, /cases/);
  const consent = await run("select public.purge_record('customer', $1)", [C_CLOSED]);
  assert.equal(consent.ok, false); assert.match(consent.err, /consent_records/, 'cascade tables block too (consent evidence)');
  assert.equal((await run("select public.purge_record('customer', $1)", [C_OPEN])).ok, false, 'not in trash');
  const p = await run("select public.purge_record('lead', $1) r", [L_FREE]);
  assert.equal(p.ok, true); assert.deepEqual(p.rows[0].r, { deleted: true, files: ['contact-forms/1_a_bill.pdf'] });
  assert.equal((await run("select public.purge_record('customer', $1) r", [C_FREE])).rows[0].r.deleted, true);
  await db.exec('reset role');
  const audit = await db.query("select action, details from public.activity_log where entity_id = $1 order by created_at", [L_FREE]);
  assert.deepEqual(audit.rows.map((r) => r.action), ['trashed', 'purged']);
  assert.equal(audit.rows[1].details.actor_id, ADMIN);
  assert.equal(JSON.stringify(audit.rows[1].details).includes('Ελεύθερο'), false, 'purge audit keeps no personal data');
});

test('storage: only an administrator may delete website attachments', async () => {
  await db.exec("reset role; insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', 'contact-forms/x.pdf'), ('hlektrismos_docs', 'contact-forms/y.pdf')");
  await as(MANAGER);
  await run("delete from storage.objects where name = 'contact-forms/x.pdf'");
  await as(ADMIN);
  await run("delete from storage.objects where name = 'contact-forms/y.pdf'");
  await db.exec('reset role');
  const left = await db.query('select name from storage.objects order by name');
  assert.deepEqual(left.rows.map((r) => r.name), ['contact-forms/x.pdf']);
});
