// LOCAL verification only (PGlite) of supabase/staged-migrations/phase4/10_field_checkin_manual_flag.sql, applied on top
// of the real live migration 20260911010000_field_sales_geofence.sql. NOT staging or production verification.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const MANAGER = 'aaaaaaaa-0000-4000-8000-000000000002';
const FIELD = 'aaaaaaaa-0000-4000-8000-000000000004';
const FIELD2 = 'aaaaaaaa-0000-4000-8000-000000000006';
const BO = 'aaaaaaaa-0000-4000-8000-000000000005';
const CASE = 'cccccccc-0000-4000-8000-000000000001';
const NOPIN = 'cccccccc-0000-4000-8000-000000000002';
const V = (n) => `dddddddd-0000-4000-8000-00000000000${n}`;
// Stored customer location: Σύνταγμα, Αθήνα
const HOME = { lat: 37.9755, lng: 23.7348 };

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }
const checkin = async (uid, visit, lat, lng, acc) => { await as(uid); return run('select public.field_checkin($1, $2, $3, $4) as r', [visit, lat, lng, acc]); };

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create table public.crm_settings (setting_key text primary key, setting_value jsonb, category text, description text);
    create table public.leads (id uuid primary key default gen_random_uuid());
    create table public.customers (id uuid primary key, full_name text);
    create table public.cases (id uuid primary key, case_no text, customer_id uuid, lat double precision, lng double precision, current_stage text default 'new');
    create table public.case_visits (id uuid primary key, case_id uuid references public.cases(id), user_id uuid, status text not null default 'planned',
      started_at timestamptz, ended_at timestamptz, check_in jsonb, check_out jsonb, location jsonb, notes text default '', result text default '');
    create table public.timeline_events (id uuid primary key default gen_random_uuid(), case_id uuid, role text, activity_type text, title text, description text,
      user_id uuid, location jsonb, metadata jsonb, occurred_at timestamptz default now());
    grant usage on schema public to authenticated;
    grant select on public.case_visits, public.timeline_events to authenticated;
    insert into auth.users values ('${MANAGER}'),('${FIELD}'),('${FIELD2}'),('${BO}');
    insert into public.profiles values ('${MANAGER}','Μάνος','manager',true),('${FIELD}','Γιάννης','field_sales',true),('${FIELD2}','Άλλος','field_sales',true),('${BO}','Κατερίνα','back_office',true);
    insert into public.customers values ('eeeeeeee-0000-4000-8000-000000000001', 'Καφέ Αθηνά');
    insert into public.cases values ('${CASE}', 'CS-1', 'eeeeeeee-0000-4000-8000-000000000001', ${HOME.lat}, ${HOME.lng}), ('${NOPIN}', 'CS-2', null, null, null);
    insert into public.case_visits (id, case_id, user_id) values ('${V(1)}','${CASE}','${FIELD}'),('${V(2)}','${CASE}','${FIELD}'),('${V(3)}','${CASE}','${FIELD}'),
      ('${V(4)}','${NOPIN}','${FIELD}'),('${V(5)}','${CASE}','${FIELD}'),('${V(6)}','${CASE}','${FIELD}');
  `);
  await db.exec(read('../migrations/20260911010000_field_sales_geofence.sql')); // the LIVE rejecting version
  const before = await checkin(FIELD, V(1), HOME.lat + 0.01, HOME.lng, 10); // ~1.1 km away
  assert.equal(before.rows[0].r.accepted, false, 'sanity: the live function rejects a far check-in');
  await su(); await db.exec(`update public.case_visits set status = 'planned' where id = '${V(1)}'`);
  const sql = read('../staged-migrations/phase4/10_field_checkin_manual_flag.sql');
  await db.exec(sql); await db.exec(sql); // idempotent re-apply
});

test('inside the radius: accepted, no review flag', async () => {
  const r = (await checkin(FIELD, V(1), HOME.lat + 0.0005, HOME.lng, 15)).rows[0].r; // ~55 m
  assert.equal(r.accepted, true); assert.equal(r.code, 'INSIDE_RADIUS'); assert.equal(r.flag, null);
});

test('far from the stored address: still accepted, distance recorded, flagged for review', async () => {
  const r = (await checkin(FIELD, V(2), HOME.lat + 0.01, HOME.lng, 10)).rows[0].r;
  assert.equal(r.accepted, true); assert.equal(r.code, 'FAR_FROM_ADDRESS'); assert.equal(r.flag, 'far_from_address');
  assert.ok(r.distanceMeters > 1000 && r.distanceMeters < 1200, String(r.distanceMeters));
  await su();
  const v = (await db.query('select status, check_in from public.case_visits where id = $1', [V(2)])).rows[0];
  assert.equal(v.status, 'in_progress', 'the visit is open — the agent can record the outcome');
  assert.equal(v.check_in.review_flag, 'far_from_address');
  const t = (await db.query("select description, metadata from public.timeline_events where metadata->>'visit_id' = $1", [V(2)])).rows[0];
  assert.ok(t.description.includes('προς έλεγχο'));
});

test('no GPS, poor accuracy, or no stored address: accepted with the matching flag', async () => {
  assert.equal((await checkin(FIELD, V(3), null, null, null)).rows[0].r.flag, 'no_gps');
  assert.equal((await checkin(FIELD, V(4), HOME.lat, HOME.lng, 10)).rows[0].r.flag, 'no_target');
  assert.equal((await checkin(FIELD, V(5), HOME.lat, HOME.lng, 900)).rows[0].r.flag, 'gps_uncertain');
});

test('unchanged rules: a repeated check-in is idempotent; another agent cannot check in to my visit', async () => {
  const again = (await checkin(FIELD, V(2), HOME.lat, HOME.lng, 10)).rows[0].r;
  assert.equal(again.code, 'IDEMPOTENT'); assert.equal(again.already, true);
  assert.ok(!(await checkin(FIELD2, V(6), HOME.lat, HOME.lng, 10)).ok, 'not your visit');
  await as(null); await db.exec('set role anon');
  assert.ok(!(await run('select public.field_checkin($1)', [V(6)])).ok, 'anon cannot call it');
});

test('review: manager / back office list flagged check-ins and mark them reviewed; field sales cannot', async () => {
  await as(FIELD);
  assert.ok(!(await run('select * from public.field_checkins_for_review(30)')).ok);
  await as(MANAGER);
  const list = (await run('select * from public.field_checkins_for_review(30)')).rows;
  assert.deepEqual(list.map((x) => x.review_flag).sort(), ['far_from_address', 'gps_uncertain', 'no_gps', 'no_target']);
  const far = list.find((x) => x.review_flag === 'far_from_address');
  assert.equal(far.agent, 'Γιάννης'); assert.equal(far.case_no, 'CS-1'); assert.equal(far.customer, 'Καφέ Αθηνά');
  await as(BO);
  assert.equal((await run('select public.review_field_checkin($1, $2) as ok', [far.id, 'Λάθος διεύθυνση στο case'])).rows[0].ok, true);
  assert.equal((await run('select public.review_field_checkin($1) as ok', [far.id])).rows[0].ok, false, 'only once');
  assert.equal((await run('select * from public.field_checkins_for_review(30)')).rows.length, 3);
  await su();
  assert.equal((await db.query("select setting_value from public.crm_settings where setting_key = 'arrival_prompt_radius_m'")).rows[0].setting_value, 75);
});

test('rollback file docs/ops/rollback_phase4_10_field_checkin.sql restores the old rejecting check-in', async () => {
  await su();
  await db.exec(read('../../docs/ops/rollback_phase4_10_field_checkin.sql'));
  await db.exec(`update public.case_visits set status = 'planned' where id = '${V(6)}'`);
  const r = (await checkin(FIELD, V(6), HOME.lat + 0.01, HOME.lng, 10)).rows[0].r;
  assert.equal(r.accepted, false); assert.equal(r.code, 'OUTSIDE_RADIUS');
  await su();
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname = 'field_checkins_for_review'")).rows[0].n, 0);
});
