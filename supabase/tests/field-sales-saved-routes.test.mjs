// LOCAL verification only (PGlite) for phase5/19_field_sales_saved_routes.sql.
// This test never connects to Supabase staging or production.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const SQL = read('../staged-migrations/phase5/19_field_sales_saved_routes.sql');
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const BO = 'aaaaaaaa-0000-4000-8000-000000000002';
const AGENT_A = 'aaaaaaaa-0000-4000-8000-000000000003';
const AGENT_B = 'aaaaaaaa-0000-4000-8000-000000000004';
const ROUTE_A = 'bbbbbbbb-0000-4000-8000-000000000001';
const ROUTE_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const STOP_B = 'cccccccc-0000-4000-8000-000000000001';
const db = new PGlite();

async function owner() {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}
async function as(uid, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  await db.exec('set role ' + role);
}
async function run(sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return { ok: true, rows: result.rows };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
async function createRoute(ownerId, name, status = 'draft') {
  await as(ownerId);
  const result = await run(
    'insert into public.field_sales_routes (owner_id,route_name,status) values ($1,$2,$3) returning id',
    [ownerId, name, status],
  );
  assert.equal(result.ok, true, result.error);
  return result.rows[0].id;
}
async function createStop(actor, routeId, order, label, lat, lng, sourceType = 'manual') {
  await as(actor);
  return run(
    'insert into public.field_sales_route_stops (route_id,sort_order,source_type,label,latitude,longitude) values ($1,$2,$3,$4,$5,$6) returning id',
    [routeId, order, sourceType, label, lat, lng],
  );
}

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (
      id uuid primary key references auth.users(id),
      role text not null,
      is_active boolean not null default true
    );
    create function public.is_staff() returns boolean language sql stable security definer set search_path=public
      as $$ select exists (select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_active,true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path=public
      as $$ select exists (select 1 from public.profiles p where p.id=auth.uid() and p.role=r and coalesce(p.is_active,true)) $$;
    create table public.customers (
      id uuid primary key default gen_random_uuid(),
      full_name text, phone text, address text, lat double precision, lng double precision
    );
    create table public.cases (
      id uuid primary key default gen_random_uuid(),
      title text, customer_id uuid references public.customers(id), address text,
      lat double precision, lng double precision
    );
    create table public.leads (
      id uuid primary key default gen_random_uuid(),
      full_name text, client_name text, company text, phone text, address text,
      lat double precision, lng double precision
    );
    grant select on public.customers, public.cases, public.leads to authenticated;
    grant usage on schema public to anon, authenticated, service_role;
    insert into auth.users (id,email) values
      ('aaaaaaaa-0000-4000-8000-000000000001','admin@example.invalid'),
      ('aaaaaaaa-0000-4000-8000-000000000002','office@example.invalid'),
      ('aaaaaaaa-0000-4000-8000-000000000003','agent-a@example.invalid'),
      ('aaaaaaaa-0000-4000-8000-000000000004','agent-b@example.invalid');
    insert into public.profiles (id,role,is_active) values
      ('aaaaaaaa-0000-4000-8000-000000000001','admin',true),
      ('aaaaaaaa-0000-4000-8000-000000000002','back_office',true),
      ('aaaaaaaa-0000-4000-8000-000000000003','field_sales',true),
      ('aaaaaaaa-0000-4000-8000-000000000004','field_sales',true);
  `);
  await db.exec(SQL);
  await db.exec(SQL); // idempotent migration re-application
});

test('agents can save multiple routes and route stops, including discovered businesses', async () => {
  const first = await createRoute(AGENT_A, 'Αττική — Δευτέρα');
  const second = await createRoute(AGENT_A, 'Νότια προάστια — Τρίτη');
  assert.notEqual(first, second);

  const crmStop = await createStop(AGENT_A, first, 0, 'Υπάρχων πελάτης', 37.98, 23.73, 'crm');
  const discoveryStop = await createStop(AGENT_A, first, 1, 'Νέα επιχείρηση', 37.97, 23.72, 'discovery');
  assert.equal(crmStop.ok, true, crmStop.error);
  assert.equal(discoveryStop.ok, true, discoveryStop.error);

  await owner();
  assert.equal((await db.query('select count(*)::int n from public.field_sales_routes where owner_id=$1', [AGENT_A])).rows[0].n, 2);
  assert.equal((await db.query('select count(*)::int n from public.field_sales_route_stops where route_id=$1', [first])).rows[0].n, 2);

  await as(AGENT_A);
  const replacement = await run(
    'select public.field_sales_replace_route_stops($1,$2::jsonb)',
    [first, JSON.stringify([
      { source_type: 'crm', label: 'Reordered customer', latitude: 37.981, longitude: 23.731, stop_status: 'pending', metadata: {} },
      { source_type: 'discovery', label: 'New business', latitude: 37.972, longitude: 23.722, stop_status: 'pending', metadata: { source: 'OpenStreetMap / Photon' } },
    ])],
  );
  assert.equal(replacement.ok, true, replacement.error);
  await owner();
  const order = (await db.query('select label,sort_order from public.field_sales_route_stops where route_id=$1 order by sort_order', [first])).rows;
  assert.deepEqual(order.map(row => [row.label, row.sort_order]), [['Reordered customer', 0], ['New business', 1]]);
});

test('route-owner eligibility helper does not disclose other agents to a Sales Agent', async () => {
  await as(AGENT_A);
  const own = await run('select public.field_sales_route_owner_allowed($1) as allowed', [AGENT_A]);
  assert.equal(own.ok, true, own.error);
  assert.equal(own.rows[0].allowed, true);
  const other = await run('select public.field_sales_route_owner_allowed($1) as allowed', [AGENT_B]);
  assert.equal(other.ok, true, other.error);
  assert.equal(other.rows[0].allowed, false);
  await as(BO);
  const office = await run('select public.field_sales_route_owner_allowed($1) as allowed', [AGENT_B]);
  assert.equal(office.ok, true, office.error);
  assert.equal(office.rows[0].allowed, true, 'Back Office may check an active Sales Agent owner');
});

test('a Sales Agent cannot read or modify another agent route or stops', async () => {
  await owner();
  await db.exec("insert into public.field_sales_routes (id,owner_id,route_name) values ('bbbbbbbb-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000004','Private B route')");
  await db.exec("insert into public.field_sales_route_stops (id,route_id,sort_order,label,latitude,longitude) values ('cccccccc-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002',0,'Private stop',38.01,23.75)");

  await as(AGENT_A);
  const routes = await run('select id from public.field_sales_routes');
  assert.equal(routes.ok, true, routes.error);
  assert.ok(routes.rows.every(row => row.id !== ROUTE_B), 'Agent B route must be invisible');
  const stops = await run('select id from public.field_sales_route_stops');
  assert.equal(stops.ok, true, stops.error);
  assert.ok(stops.rows.every(row => row.id !== STOP_B), 'Agent B stop must be invisible');
  assert.equal((await run("update public.field_sales_routes set route_name='stolen' where id=$1 returning id", [ROUTE_B])).rows.length, 0);
  assert.equal((await run('delete from public.field_sales_route_stops where route_id=$1 returning id', [ROUTE_B])).rows.length, 0);
});

test('Back Office can inspect, reassign and manage routes and their stops', async () => {
  const ownRoute = await createRoute(AGENT_A, 'Route to reassign');
  const initialStop = await createStop(AGENT_A, ownRoute, 0, 'Initial stop', 37.96, 23.70);
  assert.equal(initialStop.ok, true, initialStop.error);

  await as(BO);
  const visible = await run('select id,owner_id from public.field_sales_routes');
  assert.equal(visible.ok, true, visible.error);
  assert.ok(visible.rows.some(row => row.id === ownRoute));
  const reassigned = await run('update public.field_sales_routes set owner_id=$1 where id=$2 returning owner_id', [AGENT_B, ownRoute]);
  assert.equal(reassigned.ok, true, reassigned.error);
  assert.equal(reassigned.rows[0].owner_id, AGENT_B);

  const added = await run(
    "insert into public.field_sales_route_stops (route_id,sort_order,source_type,label,latitude,longitude) values ($1,1,'discovery','Discovered candidate',37.95,23.71) returning id",
    [ownRoute],
  );
  assert.equal(added.ok, true, added.error);
  const updated = await run("update public.field_sales_route_stops set stop_status='completed' where id=$1 returning id", [added.rows[0].id]);
  assert.equal(updated.ok, true, updated.error);
  assert.equal(updated.rows.length, 1);
});

test('manual arrival/completion timestamps are server-stamped and cannot be reversed or deleted', async () => {
  const route = await createRoute(AGENT_A, 'Timestamped visit route');
  const stop = await createStop(AGENT_A, route, 0, 'Manual check-in', 37.98, 23.73);
  assert.equal(stop.ok, true, stop.error);
  const stopId = stop.rows[0].id;

  await as(AGENT_A);
  const arrived = await run("update public.field_sales_route_stops set stop_status='arrived' where id=$1 returning arrived_at,completed_at", [stopId]);
  assert.equal(arrived.ok, true, arrived.error);
  assert.ok(arrived.rows[0].arrived_at, 'arrival timestamp is populated by the database');
  assert.equal(arrived.rows[0].completed_at, null);

  const completed = await run("update public.field_sales_route_stops set stop_status='completed' where id=$1 returning arrived_at,completed_at", [stopId]);
  assert.equal(completed.ok, true, completed.error);
  assert.ok(completed.rows[0].arrived_at);
  assert.ok(completed.rows[0].completed_at, 'completion timestamp is populated by the database');
  const recordedAt = completed.rows[0].completed_at;

  const contentTamper = await run("update public.field_sales_route_stops set label='Altered history' where id=$1 returning id", [stopId]);
  assert.equal(contentTamper.ok, false, 'arrived/completed stop content is immutable');
  const timestampTamper = await run("update public.field_sales_route_stops set completed_at='2099-01-01T00:00:00Z' where id=$1 returning completed_at", [stopId]);
  assert.equal(timestampTamper.ok, true, timestampTamper.error);
  // Compare instants, not Date object identity (pglite returns a new Date per row).
  assert.equal(new Date(timestampTamper.rows[0].completed_at).getTime(), new Date(recordedAt).getTime(), 'clients cannot rewrite database-stamped visit times');

  const regression = await run("update public.field_sales_route_stops set stop_status='pending' where id=$1 returning id", [stopId]);
  assert.equal(regression.ok, false, 'completed history cannot regress to pending');
  const deletion = await run('delete from public.field_sales_route_stops where id=$1 returning id', [stopId]);
  assert.equal(deletion.ok, false, 'a completed stop cannot be removed');
});

test('saving a route with historical stop IDs keeps the historical row and refuses omission', async () => {
  const route = await createRoute(AGENT_A, 'Preserved history route');
  const historical = await createStop(AGENT_A, route, 0, 'History that stays', 37.98, 23.73);
  const pending = await createStop(AGENT_A, route, 1, 'Editable pending stop', 37.97, 23.72);
  assert.equal(historical.ok, true, historical.error);
  assert.equal(pending.ok, true, pending.error);

  await as(AGENT_A);
  await run("update public.field_sales_route_stops set stop_status='completed' where id=$1", [historical.rows[0].id]);
  const updated = await run('select public.field_sales_replace_route_stops($1,$2::jsonb)', [route, JSON.stringify([
    { id: historical.rows[0].id, sort_order: 0, source_type: 'manual', label: 'Edited text must not overwrite history', latitude: 37.98, longitude: 23.73, stop_status: 'completed', metadata: {} },
    { id: pending.rows[0].id, sort_order: 1, source_type: 'manual', label: 'Updated pending stop', latitude: 37.971, longitude: 23.721, stop_status: 'pending', metadata: {} },
  ])]);
  assert.equal(updated.ok, true, updated.error);
  await owner();
  const preserved = (await db.query('select id,label,stop_status,completed_at from public.field_sales_route_stops where id=$1', [historical.rows[0].id])).rows[0];
  assert.equal(preserved.label, 'History that stays');
  assert.equal(preserved.stop_status, 'completed');
  assert.ok(preserved.completed_at);
  const pendingAfter = (await db.query('select id,label,latitude from public.field_sales_route_stops where id=$1', [pending.rows[0].id])).rows[0];
  assert.equal(pendingAfter.id, pending.rows[0].id);
  assert.equal(pendingAfter.label, 'Updated pending stop');
  assert.equal(Number(pendingAfter.latitude), 37.971);

  await as(AGENT_A);
  const omitted = await run('select public.field_sales_replace_route_stops($1,$2::jsonb)', [route, JSON.stringify([
    { id: pending.rows[0].id, source_type: 'manual', label: 'Still editable', latitude: 37.971, longitude: 23.721, stop_status: 'pending', metadata: {} },
  ])]);
  assert.equal(omitted.ok, false, 'historical stop omission is refused');
  await owner();
  assert.equal((await db.query('select count(*)::int n from public.field_sales_route_stops where id=$1', [historical.rows[0].id])).rows[0].n, 1);
});

test('Back Office can assign only to active Sales Agents; route history cannot be deleted', async () => {
  await as(BO);
  const invalidOwner = await run(
    "insert into public.field_sales_routes (owner_id,route_name) values ($1,'Office-owned route') returning id",
    [BO],
  );
  assert.equal(invalidOwner.ok, false, 'route owner must be an active Sales Agent');
  const validOwner = await run(
    "insert into public.field_sales_routes (owner_id,route_name) values ($1,'Assigned by office') returning id",
    [AGENT_A],
  );
  assert.equal(validOwner.ok, true, validOwner.error);
  const historicalRoute = validOwner.rows[0].id;
  const historicalStop = await run(
    "insert into public.field_sales_route_stops (route_id,sort_order,label,latitude,longitude) values ($1,0,'Completed stop',37.97,23.74) returning id",
    [historicalRoute],
  );
  assert.equal(historicalStop.ok, true, historicalStop.error);
  const completeStop = await run("update public.field_sales_route_stops set stop_status='completed' where id=$1 returning id", [historicalStop.rows[0].id]);
  assert.equal(completeStop.ok, true, completeStop.error);
  const deletion = await run('delete from public.field_sales_routes where id=$1 returning id', [historicalRoute]);
  assert.equal(deletion.ok, false, 'routes with arrived/completed stops must be retained as history');
  assert.match(deletion.error, /visit history/i);
});

test('duplicate signal returns only a boolean and queue access is scoped to the requester or Back Office', async () => {
  await owner();
  await db.query(
    "insert into public.leads (full_name, company, phone, address, lat, lng) values ($1,$2,$3,$4,$5,$6)",
    ['Other Agent Prospect', 'Other Agent Prospect', '2105550101', 'Athens Business Road 10', 38.0100, 23.7500],
  );
  await as(AGENT_A);
  const signal = await run(
    'select public.field_sales_candidate_duplicate_signal($1,$2,$3,$4,$5) as possible',
    ['Other Agent Prospect', null, null, null, null],
  );
  assert.equal(signal.ok, true, signal.error);
  assert.equal(signal.rows[0].possible, true, 'a duplicate exists on another agent-visible scope');
  assert.deepEqual(Object.keys(signal.rows[0]), ['possible'], 'signal returns no matching entity ID, name, phone or owner');
  const noSignal = await run(
    'select public.field_sales_candidate_duplicate_signal($1,$2,$3,$4,$5) as possible',
    ['New Example Company', 'No Match Street 1', null, 37.98, 23.73],
  );
  assert.equal(noSignal.ok, true, noSignal.error);
  assert.equal(noSignal.rows[0].possible, false);

  const created = await run(
    `insert into public.field_sales_duplicate_reviews
      (requested_by,candidate_name,candidate_address,candidate_lat,candidate_lng,duplicate_signal,status,source_url)
     values ($1,$2,$3,$4,$5,$6,'pending',$7) returning id,status,reviewed_by,reviewed_at`,
    [AGENT_A, 'Possible Prospect', 'Example Avenue 3', 37.98, 23.73, 'possible_match', 'https://www.openstreetmap.org/'],
  );
  assert.equal(created.ok, true, created.error);
  const reviewId = created.rows[0].id;
  assert.equal(created.rows[0].status, 'pending');
  assert.equal(created.rows[0].reviewed_by, null);
  assert.equal(created.rows[0].reviewed_at, null);

  await as(AGENT_A);
  const requesterRead = await run('select id,candidate_name from public.field_sales_duplicate_reviews where id=$1', [reviewId]);
  assert.equal(requesterRead.ok, true, requesterRead.error);
  assert.equal(requesterRead.rows.length, 1, 'the submitting agent can view their own request');

  await as(AGENT_B);
  const otherSales = await run('select id,candidate_name from public.field_sales_duplicate_reviews where id=$1', [reviewId]);
  assert.equal(otherSales.ok, true, otherSales.error);
  assert.equal(otherSales.rows.length, 0, 'another Sales Agent cannot inspect the request or its candidate details');
  const cannotUpdate = await run("update public.field_sales_duplicate_reviews set status='rejected' where id=$1 returning id", [reviewId]);
  assert.equal(cannotUpdate.ok, true, cannotUpdate.error);
  assert.equal(cannotUpdate.rows.length, 0, 'Sales Agents cannot approve/reject reviews');

  await as(BO);
  const officeRead = await run('select id,candidate_name,status from public.field_sales_duplicate_reviews where id=$1', [reviewId]);
  assert.equal(officeRead.ok, true, officeRead.error);
  assert.equal(officeRead.rows.length, 1, 'Back Office can inspect the queue');

  const claim = await run("update public.field_sales_duplicate_reviews set status='approved',review_note='Reviewed' where id=$1 returning reviewed_by,reviewed_at", [reviewId]);
  assert.equal(claim.ok, true, claim.error);
  assert.equal(claim.rows.length, 1);
  assert.equal(claim.rows[0].reviewed_by, BO, 'reviewer identity is stamped by the database, not trusted from the browser');
  assert.ok(claim.rows[0].reviewed_at);

  const reset = await run("update public.field_sales_duplicate_reviews set status='pending' where id=$1 returning reviewed_by,reviewed_at", [reviewId]);
  assert.equal(reset.ok, true, reset.error);
  assert.equal(reset.rows[0].reviewed_by, null, 'resetting after a failed conversion clears the prior review stamp');
  assert.equal(reset.rows[0].reviewed_at, null);

  await as(null, 'anon');
  assert.equal((await run('select * from public.field_sales_duplicate_reviews')).ok, false, 'anonymous queue read denied');
  assert.equal((await run('select public.field_sales_candidate_duplicate_signal($1,null,null,null,null)', ['Possible Prospect'])).ok, false, 'anonymous duplicate probing denied');
  assert.equal((await run("insert into public.field_sales_duplicate_reviews (requested_by,candidate_name,status) values ('aaaaaaaa-0000-4000-8000-000000000003','Anonymous candidate','pending')")).ok, false, 'anonymous review submissions are denied');
});

test('anonymous visitors cannot read or write saved routes', async () => {
  await as(null, 'anon');
  assert.equal((await run('select * from public.field_sales_routes')).ok, false);
  assert.equal((await run('select * from public.field_sales_route_stops')).ok, false);
  assert.equal((await run("insert into public.field_sales_routes (owner_id,route_name) values ('aaaaaaaa-0000-4000-8000-000000000003','Anon route')")).ok, false);
});

test('inactive agents lose route access and invalid coordinates are rejected', async () => {
  await owner();
  await db.query('update public.profiles set is_active=false where id=$1', [AGENT_A]);
  await as(AGENT_A);
  const own = await run('select * from public.field_sales_routes');
  assert.equal(own.ok, true, own.error);
  assert.equal(own.rows.length, 0);

  const invalid = await run(
    "insert into public.field_sales_route_stops (route_id,sort_order,label,latitude,longitude) values ($1,99,'Invalid',110,999)",
    [ROUTE_B],
  );
  assert.equal(invalid.ok, false);
});
