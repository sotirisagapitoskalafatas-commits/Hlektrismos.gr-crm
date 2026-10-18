// LOCAL verification only (embedded Postgres via PGlite) of supabase/staged-migrations/phase4/18_sales_own_records_scope.sql.
// The tables are reconstructed from the migrations (leads, cases, customers, follow_ups, case_documents, timeline_events,
// case_visits, customer_supply_points, activity_log) with the CURRENT permissive «any active staff» policies, then the
// staged SQL is applied. NOT staging or production verification.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const U = (n) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;
const ADMIN = U(1), MANAGER = U(2), BO = U(3), INS = U(4), INS2 = U(5), FLD = U(6), OFF = U(7);

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }
const ids = async (who, table, col = 'id') => { await as(who); const r = await run(`select ${col} v from public.${table} order by 1`); assert.equal(r.ok, true, r.err); return r.rows.map((x) => x.v); };
const L = (n) => `cccccccc-0000-4000-8000-00000000000${n}`;
const C = (n) => `dddddddd-0000-4000-8000-00000000000${n}`;
const K = (n) => `eeeeeeee-0000-4000-8000-00000000000${n}`;

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean not null default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path = public
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    insert into public.profiles values
      ('${ADMIN}','Admin','admin'),('${MANAGER}','Manager','manager'),('${BO}','BO','back_office'),
      ('${INS}','Ins One','inside_sales'),('${INS2}','Ins Two','inside_sales'),('${FLD}','Field','field_sales');
    insert into public.profiles values ('${OFF}','Gone','inside_sales'); update public.profiles set is_active = false where id = '${OFF}';

    create table public.leads (id uuid primary key default gen_random_uuid(), full_name text, created_by_user_id uuid, assigned_to_user_id uuid, status text default 'new');
    create table public.customers (id uuid primary key default gen_random_uuid(), full_name text, created_by uuid);
    create table public.cases (id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id), title text,
      owner_id uuid, inside_sales_owner uuid, field_sales_owner uuid, back_office_owner uuid, next_action_owner_id uuid, created_by uuid);
    create table public.follow_ups (id uuid primary key default gen_random_uuid(), case_id uuid references public.cases(id), assignee_id uuid, created_by uuid);
    create table public.case_documents (id uuid primary key default gen_random_uuid(), case_id uuid references public.cases(id));
    create table public.timeline_events (id uuid primary key default gen_random_uuid(), case_id uuid references public.cases(id));
    create table public.case_visits (id uuid primary key default gen_random_uuid(), case_id uuid references public.cases(id), user_id uuid);
    create table public.customer_supply_points (id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id), lead_id uuid references public.leads(id), supply_number text);
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid, action text);

    do $$ declare t text; begin
      foreach t in array array['leads','customers','cases','follow_ups','case_documents','timeline_events','case_visits','customer_supply_points','activity_log'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy "staff all" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      end loop;
    end $$;
    grant usage on schema public to anon, authenticated, service_role;
    grant select on public.profiles to authenticated;

    -- leads: L1 mine (INS), L2 INS2's, L3 unassigned, L4 created by INS but assigned to INS2, L5 FLD's
    insert into public.leads (id, full_name, created_by_user_id, assigned_to_user_id) values
      ('${L(1)}','L1',null,'${INS}'),('${L(2)}','L2',null,'${INS2}'),('${L(3)}','L3',null,null),('${L(4)}','L4','${INS}','${INS2}'),('${L(5)}','L5',null,'${FLD}');
    -- customers: C1 created by INS, C2 created by BO but INS has a case, C3 nobody of the sales roles
    insert into public.customers (id, full_name, created_by) values ('${C(1)}','C1','${INS}'),('${C(2)}','C2','${BO}'),('${C(3)}','C3','${BO}');
    -- cases: K1 owner INS (customer C2), K2 owner INS2 (C3), K3 back-office owner only (C3), K4 next-action owner FLD (C3), K5 created by INS (C1)
    insert into public.cases (id, customer_id, title, owner_id, back_office_owner, next_action_owner_id, created_by) values
      ('${K(1)}','${C(2)}','K1','${INS}',null,null,'${BO}'),('${K(2)}','${C(3)}','K2','${INS2}',null,null,'${BO}'),
      ('${K(3)}','${C(3)}','K3',null,'${BO}',null,'${BO}'),('${K(4)}','${C(3)}','K4',null,null,'${FLD}','${BO}'),('${K(5)}','${C(1)}','K5',null,null,null,'${INS}');
    insert into public.follow_ups (case_id, assignee_id, created_by) values ('${K(1)}',null,'${BO}'),('${K(2)}','${INS2}','${BO}'),('${K(3)}','${INS}','${BO}');
    insert into public.case_documents (case_id) values ('${K(1)}'),('${K(2)}'),('${K(3)}');
    insert into public.timeline_events (case_id) values ('${K(1)}'),('${K(2)}');
    insert into public.case_visits (case_id, user_id) values ('${K(1)}',null),('${K(2)}',null),('${K(3)}','${INS}');
    insert into public.customer_supply_points (customer_id, lead_id, supply_number) values ('${C(1)}',null,'mine-customer'),(null,'${L(1)}','mine-lead'),(null,'${L(2)}','theirs-lead'),('${C(3)}',null,'theirs-customer');
    insert into public.activity_log (entity_type, entity_id, action) values ('lead','${L(1)}','a'),('lead','${L(2)}','b'),('case','${K(1)}','c'),('case','${K(2)}','d'),('customer','${C(1)}','e'),('customer','${C(3)}','f'),('login',null,'g');
  `);
});

test('BEFORE: every active staff member (sales included) reads every record — the audit finding F-04', async () => {
  assert.equal((await ids(INS, 'leads')).length, 5);
  assert.equal((await ids(INS, 'cases')).length, 5);
  assert.equal((await ids(INS, 'customers')).length, 3);
  await su(); await db.exec(read('../staged-migrations/phase4/18_sales_own_records_scope.sql'));
});

test('AFTER: a sales agent sees only their own leads (assigned to me or created by me; unassigned are not visible)', async () => {
  assert.deepEqual(await ids(INS, 'leads'), [L(1), L(4)].sort());
  assert.deepEqual(await ids(INS2, 'leads'), [L(2), L(4)].sort());
  assert.deepEqual(await ids(FLD, 'leads'), [L(5)]);
});

test('AFTER: cases are mine through owner / inside / field / next-action / created-by, never through the back-office owner', async () => {
  assert.deepEqual(await ids(INS, 'cases'), [K(1), K(5)].sort());
  assert.deepEqual(await ids(INS2, 'cases'), [K(2)]);
  assert.deepEqual(await ids(FLD, 'cases'), [K(4)]);
});

test('AFTER: customers are mine when I created them or I own one of their cases', async () => {
  assert.deepEqual(await ids(INS, 'customers'), [C(1), C(2)].sort());
  assert.deepEqual(await ids(INS2, 'customers'), [C(3)]);
  assert.deepEqual(await ids(FLD, 'customers'), [C(3)]);
});

test('AFTER: follow-ups, documents, timeline, visits and supply points follow the case / customer / lead', async () => {
  await as(INS);
  assert.equal((await run('select count(*)::int n from public.follow_ups')).rows[0].n, 2, 'follow-up of my case + the one assigned to me');
  assert.equal((await run('select count(*)::int n from public.case_documents')).rows[0].n, 1);
  assert.equal((await run('select count(*)::int n from public.timeline_events')).rows[0].n, 1);
  assert.equal((await run('select count(*)::int n from public.case_visits')).rows[0].n, 2, 'visit on my case + my own visit');
  assert.deepEqual((await run('select supply_number from public.customer_supply_points order by 1')).rows.map((r) => r.supply_number), ['mine-customer', 'mine-lead']);
});

test('AFTER: the activity log is read-scoped to my records; system entries are not shown to sales', async () => {
  await as(INS);
  assert.deepEqual((await run('select action from public.activity_log order by 1')).rows.map((r) => r.action), ['a', 'c', 'e']);
  assert.equal((await run("insert into public.activity_log (entity_type, entity_id, action) values ('login', null, 'x')")).ok, true, 'sales can still write a log entry (read scope only)');
});

test('AFTER: back office, manager and admin see everything', async () => {
  for (const who of [ADMIN, MANAGER, BO]) {
    assert.equal((await ids(who, 'leads')).length, 5);
    assert.equal((await ids(who, 'cases')).length, 5);
    assert.equal((await ids(who, 'customers')).length, 3);
    await as(who);
    assert.equal((await run('select count(*)::int n from public.activity_log')).rows[0].n >= 7, true);
  }
});

test('AFTER: writes are scoped too — I cannot create or hand over a record that is not mine', async () => {
  await as(INS);
  assert.equal((await run("insert into public.leads (full_name, created_by_user_id, assigned_to_user_id) values ('new mine', $1, $1)", [INS])).ok, true, 'my own new lead');
  assert.equal((await run("insert into public.leads (full_name, created_by_user_id, assigned_to_user_id) values ('for someone else', $1, $2)", [INS2, INS2])).ok, false, 'lead for another agent refused');
  assert.equal((await run("update public.leads set status = 'contacted' where id = $1", [L(1)])).ok, true, 'update my lead');
  assert.equal((await run("update public.leads set status = 'contacted' where id = $1", [L(2)])).rows?.length ?? 0, 0);
  await su(); assert.equal((await db.query("select status from public.leads where id = $1", [L(2)])).rows[0].status, 'new', 'other agent lead untouched');
  await as(INS);
  assert.equal((await run("update public.leads set assigned_to_user_id = $2 where id = $1", [L(1), INS2])).ok, false, 'reassigning my lead to someone else is a Back Office action');
  assert.equal((await run("update public.cases set title = 'x' where id = $1", [K(2)])).ok, true);
  await su(); assert.equal((await db.query("select title from public.cases where id = $1", [K(2)])).rows[0].title, 'K2', 'another agent case untouched (update matched no visible row)');
  await as(INS);
  assert.equal((await run("delete from public.cases where id = $1", [K(2)])).ok, true);
  await su(); assert.equal((await db.query('select count(*)::int n from public.cases')).rows[0].n, 5, 'delete of a case that is not mine removed nothing');
});

test('AFTER: a deactivated sales account sees nothing, and anonymous still has no access', async () => {
  await as(OFF);
  assert.equal((await run('select count(*)::int n from public.leads')).rows[0].n, 0);
  await db.exec('reset role'); await db.exec('set role anon');
  assert.equal((await run('select 1 from public.leads limit 1')).ok, false);
  await su();
});

test('status function reports the scope; helper functions are not executable by anon', async () => {
  await as(INS);
  const s = (await run('select public.sales_scope_status() v')).rows[0].v;
  assert.equal(s.enabled, true); assert.ok(s.tables.includes('leads') && s.tables.includes('cases') && s.tables.includes('customers'));
  await db.exec('reset role'); await db.exec('set role anon');
  assert.equal((await run('select public.is_sales_agent()')).ok, false);
  await su();
});

test('idempotent re-apply; rollback gives sales their old visibility back', async () => {
  await su(); await db.exec(read('../staged-migrations/phase4/18_sales_own_records_scope.sql')); await db.exec(read('../staged-migrations/phase4/18_sales_own_records_scope.sql'));
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname = 'sales own records (restrictive)'")).rows[0].n, 9);
  await db.exec(read('../../docs/ops/rollback_phase4_18_sales_own_records_scope.sql'));
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname = 'sales own records (restrictive)'")).rows[0].n, 0);
  assert.equal((await ids(INS, 'leads')).length, 6, 'all 5 original leads + the one INS created above');
  assert.equal((await run('select public.sales_scope_status()')).ok, false, 'status function removed');
});
