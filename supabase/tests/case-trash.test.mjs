// LOCAL PGlite verification for phase2/08 case Trash and bulk actions. Not a production probe.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const SALES = 'aaaaaaaa-0000-4000-8000-000000000002';
const CUST = 'bbbbbbbb-0000-4000-8000-000000000001';
const LEAD = 'bbbbbbbb-0000-4000-8000-000000000002';
const CASE1 = 'cccccccc-0000-4000-8000-000000000001';
const CASE2 = 'cccccccc-0000-4000-8000-000000000002';
const CASE3 = 'cccccccc-0000-4000-8000-000000000003';
const APP = 'dddddddd-0000-4000-8000-000000000001';
const VISIT = 'eeeeeeee-0000-4000-8000-000000000001';
const DOC = 'ffffffff-0000-4000-8000-000000000001';
const SIGN = 'ffffffff-0000-4000-8000-000000000002';
const CHECKIN = 'ffffffff-0000-4000-8000-000000000003';
const FOLLOW = 'ffffffff-0000-4000-8000-000000000004';
const OFFER = 'ffffffff-0000-4000-8000-000000000005';
const NOTIFY = 'ffffffff-0000-4000-8000-000000000006';
const EVENT = 'ffffffff-0000-4000-8000-000000000007';

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function run(sql, params = []) {
  try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: e.message }; }
}
async function rowCount(table, id) {
  const r = await db.query('select count(*)::int as n from public.' + table + ' where id=$1', [id]);
  return r.rows[0].n;
}

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    create table public.profiles (id uuid primary key, full_name text not null, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to public
      as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_active,true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path to public
      as $$ select coalesce((select p.role=r and coalesce(p.is_active,true) from public.profiles p where p.id=auth.uid()),false) $$;
    create function public.trash_actor_role() returns text language sql stable security definer set search_path to public
      as $$ select p.role from public.profiles p where p.id=auth.uid() and coalesce(p.is_active,true) $$;
    create function public.trash_references(p_type text,p_id uuid) returns jsonb language sql stable security definer
      as $$ select '{}'::jsonb $$;

    create table public.customers (id uuid primary key, full_name text, phone text, email text);
    create table public.leads (id uuid primary key, full_name text, client_name text, phone text, email text, attached_files jsonb, converted_case_id uuid);
    create table public.cases (
      id uuid primary key, case_no text, title text not null, customer_id uuid references public.customers(id),
      lead_id uuid references public.leads(id), source text default 'crm', service_type text default 'energy',
      current_stage text not null, deleted_at timestamptz, deleted_by uuid references public.profiles(id), deleted_reason text
    );
    alter table public.leads add constraint leads_converted_case_id_fkey foreign key(converted_case_id) references public.cases(id);

    create table public.energy_applications (id uuid primary key, primary_case_id uuid references public.cases(id), notes text default '');
    create table public.case_documents (id uuid primary key, case_id uuid not null references public.cases(id), file_url text not null, supply_point_id uuid, file_name text default '');
    create table public.case_signatures (id uuid primary key, case_id uuid not null references public.cases(id), document_id uuid references public.case_documents(id), image_url text not null, notes text default '');
    create table public.case_offers (id uuid primary key, case_id uuid not null references public.cases(id));
    create table public.case_visits (id uuid primary key, case_id uuid references public.cases(id), rescheduled_from_id uuid references public.case_visits(id), application_id uuid references public.energy_applications(id));
    create table public.follow_ups (id uuid primary key, case_id uuid references public.cases(id), visit_id uuid references public.case_visits(id));
    create table public.app_notifications (id uuid primary key, case_id uuid references public.cases(id));
    create table public.timeline_events (id uuid primary key, case_id uuid not null references public.cases(id));
    create table public.field_checkins (id uuid primary key, case_id uuid references public.cases(id) on delete cascade);
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, action text, details jsonb, created_at timestamptz default now());

    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
    alter table storage.objects enable row level security;
    alter table public.cases enable row level security;
    create policy "staff read cases" on public.cases for select to authenticated using (public.is_staff());
    create policy "staff update cases" on public.cases for update to authenticated using (public.is_staff()) with check (public.is_staff());
    create policy "admin delete cases" on public.cases for delete to authenticated using (public.is_role('admin'));
    create policy "staff storage read" on storage.objects for select to authenticated using (public.is_staff());
    grant usage on schema public, storage, auth to authenticated;
    grant select, insert, update, delete on public.profiles, public.customers, public.leads, public.cases,
      public.energy_applications, public.case_documents, public.case_signatures, public.case_offers, public.case_visits,
      public.follow_ups, public.app_notifications, public.timeline_events, public.field_checkins, public.activity_log,
      storage.objects to authenticated;

    insert into public.profiles values
      ('aaaaaaaa-0000-4000-8000-000000000001','Admin','admin',true),
      ('aaaaaaaa-0000-4000-8000-000000000002','Sales','sales_agent',true);
    insert into public.customers values ('bbbbbbbb-0000-4000-8000-000000000001','Customer One','6900000000','cust@example.test');
    insert into public.leads values ('bbbbbbbb-0000-4000-8000-000000000002','Lead One','Lead One','6900000001','lead@example.test',null,null);
    insert into public.cases(id,case_no,title,customer_id,lead_id,current_stage) values
      ('cccccccc-0000-4000-8000-000000000001','C-001','Case one','bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','cancelled'),
      ('cccccccc-0000-4000-8000-000000000002','C-002','Case two','bbbbbbbb-0000-4000-8000-000000000001',null,'completed'),
      ('cccccccc-0000-4000-8000-000000000003','C-003','Case three','bbbbbbbb-0000-4000-8000-000000000001',null,'cancelled');
    insert into public.case_documents values ('ffffffff-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001','cases/case1_bill.pdf',null,'Bill.pdf');
    insert into public.case_signatures values ('ffffffff-0000-4000-8000-000000000002','cccccccc-0000-4000-8000-000000000001','ffffffff-0000-4000-8000-000000000001','cases/signature.jpg','Customer signature');
    insert into public.case_offers values ('ffffffff-0000-4000-8000-000000000005','cccccccc-0000-4000-8000-000000000001');
    insert into public.case_visits values ('eeeeeeee-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000001',null,null);
    insert into public.follow_ups values ('ffffffff-0000-4000-8000-000000000004','cccccccc-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000001');
    insert into public.app_notifications values ('ffffffff-0000-4000-8000-000000000006','cccccccc-0000-4000-8000-000000000001');
    insert into public.timeline_events values ('ffffffff-0000-4000-8000-000000000007','cccccccc-0000-4000-8000-000000000001');
    insert into public.field_checkins values ('ffffffff-0000-4000-8000-000000000003','cccccccc-0000-4000-8000-000000000001');
    insert into storage.objects(bucket_id,name) values
      ('client_documents','cases/case1_bill.pdf'),('client_documents','cases/signature.jpg');
  `);
  await db.exec(read('../staged-migrations/phase2/08_case_trash_bulk.sql'));
});

test('only Admin can bulk-trash cases; IDs are de-duplicated and the batch is atomic', async () => {
  await as(SALES);
  assert.equal((await run('select public.trash_cases_bulk($1::uuid[],null)', [[CASE1]])).ok, false);
  await as(ADMIN);
  const moved = await run('select public.trash_cases_bulk($1::uuid[], $2)', [[CASE1, CASE1, CASE2], 'test cleanup']);
  assert.equal(moved.ok, true);
  assert.equal(moved.rows[0].trash_cases_bulk, 2);
  const invalid = await run('select public.trash_cases_bulk($1::uuid[], null)', [[CASE3, '99999999-0000-4000-8000-000000000099']]);
  assert.equal(invalid.ok, false);
  assert.equal(await rowCount('cases', CASE3), 1);
  const stillActive = await db.query('select deleted_at from public.cases where id=$1', [CASE3]);
  assert.equal(stillActive.rows[0].deleted_at, null, 'failed batch changes nothing');
  assert.equal((await run('select public.trash_cases_bulk($1::uuid[], null)', [[CASE1]])).ok, false);
});

test('direct Trash-column writes are blocked; trashed cases are hidden from normal queries', async () => {
  await as(ADMIN);
  assert.equal((await run('update public.cases set deleted_at=now() where id=$1', [CASE3])).ok, false);
  const directDelete = await run('delete from public.cases where id=$1 returning id', [CASE3]);
  assert.equal(directDelete.ok, true);
  assert.equal(directDelete.rows.length, 0, 'legacy direct-delete policy is neutralized by restrictive RLS');
  assert.equal((await run("select public.trash_record('case',$1,'single test')", [CASE3])).ok, true);
  for (const uid of [ADMIN, SALES]) {
    await as(uid);
    const read = await run('select id from public.cases where id=$1', [CASE3]);
    assert.equal(read.rows.length, 0);
  }
});

test('Trash list provides case name, contact, actor and reason', async () => {
  await as(ADMIN);
  const list = await run('select * from public.trash_list()');
  assert.equal(list.ok, true);
  const row = list.rows.find(x => x.entity_type === 'case' && x.id === CASE1);
  assert.equal(row.name, 'Customer One');
  assert.equal(row.phone, '6900000000');
  assert.equal(row.deleted_reason, 'test cleanup');
  assert.equal(row.deleted_by_name, 'Admin');
  assert.deepEqual(row.references_json, {});
});

test('restore is Admin-only and preserves customer and lead links', async () => {
  await as(SALES);
  assert.equal((await run("select public.restore_record('case',$1)", [CASE1])).ok, false);
  await as(ADMIN);
  assert.equal((await run("select public.restore_record('case',$1)", [CASE1])).ok, true);
  const row = await db.query('select deleted_at,customer_id,lead_id from public.cases where id=$1', [CASE1]);
  assert.equal(row.rows[0].deleted_at, null);
  assert.equal(row.rows[0].customer_id, CUST);
  assert.equal(row.rows[0].lead_id, LEAD);
});

test('purge requires Trash and Admin; deletes owned rows/files while preserving customer and lead', async () => {
  await as(ADMIN);
  assert.equal((await run("select public.purge_record('case',$1)", [CASE1])).ok, false);
  assert.equal((await run("select public.trash_record('case',$1,null)", [CASE1])).ok, true);
  await as(SALES);
  assert.equal((await run("select public.purge_record('case',$1)", [CASE1])).ok, false);
  await as(ADMIN);
  const purged = await run("select public.purge_record('case',$1) as result", [CASE1]);
  assert.equal(purged.ok, true);
  assert.deepEqual(purged.rows[0].result, {
    deleted: true,
    files: [
      { bucket: 'client_documents', path: 'cases/case1_bill.pdf' },
      { bucket: 'client_documents', path: 'cases/signature.jpg' },
    ],
  });
  for (const [table, id] of [
    ['case_documents', DOC], ['case_signatures', SIGN], ['case_offers', OFFER], ['case_visits', VISIT],
    ['follow_ups', FOLLOW], ['app_notifications', NOTIFY], ['timeline_events', EVENT], ['field_checkins', CHECKIN],
  ]) assert.equal(await rowCount(table, id), 0, table + ' child row is removed');
  assert.equal(await rowCount('customers', CUST), 1);
  assert.equal(await rowCount('leads', LEAD), 1);
  const audit = await db.query('select action,details from public.activity_log where entity_id=$1 order by created_at', [CASE1]);
  assert.deepEqual(audit.rows.map(x => x.action), ['trashed','restored','trashed','purged']);
  assert.equal(audit.rows.at(-1).details.actor_id, ADMIN);
  assert.equal(JSON.stringify(audit.rows.at(-1).details).includes('Customer One'), false);
});

test('converted leads and provider applications block permanent deletion', async () => {
  await as(ADMIN);
  await db.exec("update public.leads set converted_case_id='cccccccc-0000-4000-8000-000000000002' where id='bbbbbbbb-0000-4000-8000-000000000002'");
  await run("select public.trash_record('case',$1,null)", [CASE2]);
  const leadBlock = await run("select public.purge_record('case',$1)", [CASE2]);
  assert.equal(leadBlock.ok, false);
  assert.match(leadBlock.err, /converted_leads/);
  await db.exec("update public.leads set converted_case_id=null where id='bbbbbbbb-0000-4000-8000-000000000002'");
  await db.exec("insert into public.energy_applications(id,primary_case_id) values ('dddddddd-0000-4000-8000-000000000001','cccccccc-0000-4000-8000-000000000002')");
  const appBlock = await run("select public.purge_record('case',$1)", [CASE2]);
  assert.equal(appBlock.ok, false);
  assert.match(appBlock.err, /energy_applications/);
});

test('Storage RLS exposes the case-file removal policy only to Admin and only for its owned prefix', async () => {
  const policies = await db.query("select policyname,roles,qual from pg_policies where schemaname='storage' and tablename='objects'");
  const policy = policies.rows.find(p => p.policyname === 'admin deletes case files');
  assert.ok(policy, 'the admin case-file policy exists');
  assert.deepEqual(policy.roles, ['authenticated']);
  assert.match(policy.qual, /client_documents/);
  assert.match(policy.qual, /cases\\/%/);
  assert.match(policy.qual, /is_role\\('admin'/);
});
