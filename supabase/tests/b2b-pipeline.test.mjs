// LOCAL verification only (PGlite) of supabase/staged-migrations/phase3/08 (B2B screening, review, distribution).
// NOT staging or production verification.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const INSIDE = 'aaaaaaaa-0000-4000-8000-000000000003';
const INSIDE2 = 'aaaaaaaa-0000-4000-8000-000000000006';
const FIELD = 'aaaaaaaa-0000-4000-8000-000000000004';
const BO = 'aaaaaaaa-0000-4000-8000-000000000005';

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function svc() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); await db.exec('set role service_role'); }
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }
const insertProspect = async (o) => {
  await svc();
  const r = await db.query(`insert into public.b2b_prospects (place_id, company_name, phone, website, address, city, region, category)
    values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (place_id) where place_id is not null do update set last_seen_at = now() returning *`,
    [o.place_id ?? null, o.name, o.phone ?? null, o.website ?? null, o.address ?? null, o.city ?? null, o.region ?? 'Αττική', o.category ?? 'hotel']);
  await su();
  return r.rows[0];
};

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; -- as in Supabase
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean default true);
    create table public.leads (id uuid primary key default gen_random_uuid(), full_name text, client_name text not null default '', client_contact text not null default '',
      company text, phone text, address text, region text, lead_type text, service_category text, status text default 'new', source text, source_label text,
      assigned_to_user_id uuid, lat double precision, lng double precision, comments text, created_at timestamptz default now());
    create table public.customers (id uuid primary key default gen_random_uuid(), full_name text not null default '', phone text);
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, action text, details jsonb, created_at timestamptz default now());
    create table public.app_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, case_id uuid, title text, body text, type text, created_at timestamptz default now());
    grant usage on schema public to anon, authenticated, service_role;
    grant select, insert, update on public.leads, public.activity_log, public.app_notifications to authenticated;
    grant all on public.leads, public.customers, public.activity_log, public.app_notifications to service_role;
    insert into public.profiles values ('${ADMIN}','Admin','admin',true),('${INSIDE}','Ελένη','inside_sales',true),('${INSIDE2}','Κώστας','inside_sales',true),
      ('${FIELD}','Γιάννης','field_sales',true),('${BO}','Κατερίνα','back_office',true);
    insert into public.leads (full_name, company, phone, status, assigned_to_user_id) values ('Υπάρχον', 'Ξενοδοχείο Ακτή', '+30 210 1234567', 'new', '${INSIDE}'),
      ('Ανοιχτό 2', 'Κάτι', null, 'contacted', '${INSIDE}');
    insert into public.customers (full_name, phone) values ('Φούρνος Αθηνά', '2109998888');
  `);
  await db.exec(read('../staged-migrations/phase3/08_b2b_prospects_review_distribution.sql'));
});

test('screening: keys, quality flags and duplicates against leads/customers/prospects (flag only)', async () => {
  const dupLead = await insertProspect({ place_id: 'p1', name: 'Ξενοδοχείο Ακτή Α.Ε.', phone: '210 123 4567', website: 'https://www.akti.gr/rooms', address: 'Λεωφ. Ποσειδώνος 1' });
  assert.equal(dupLead.name_key, 'ξενοδοχειο ακτη', 'accents and legal form removed');
  assert.equal(dupLead.phone_key, '2101234567');
  assert.equal(dupLead.domain, 'akti.gr');
  assert.deepEqual(dupLead.duplicate_of.type, 'lead');
  assert.equal(dupLead.status, 'new', 'duplicates are flagged for review, never merged automatically');
  const dupCust = await insertProspect({ place_id: 'p2', name: 'ΦΟΥΡΝΟΣ ΑΘΗΝΑ ΙΚΕ' });
  assert.equal(dupCust.duplicate_of.type, 'customer'); assert.equal(dupCust.duplicate_of.reason, 'name');
  assert.deepEqual(dupCust.quality, ['no_phone', 'no_website', 'no_address']);
  const clean = await insertProspect({ place_id: 'p3', name: 'Hotel Glyfada', phone: '6900000003', address: 'Γλυφάδα', city: 'Γλυφάδα' });
  assert.equal(clean.duplicate_of, null);
  const again = await insertProspect({ place_id: 'p3', name: 'Hotel Glyfada', phone: '6900000003' });
  assert.equal(again.id, clean.id, 'the same listing seen again is updated, not duplicated');
  const sameShop = await insertProspect({ place_id: 'p4', name: 'Hotel Glyfada Annex', phone: '+30 690 000 0003' });
  assert.equal(sameShop.duplicate_of.type, 'prospect');
});

test('access: staff roles read; nobody writes prospects directly; anon reads nothing', async () => {
  await as(INSIDE);
  assert.ok((await run('select id from public.b2b_prospects')).rows.length >= 4);
  assert.equal((await run("insert into public.b2b_prospects (company_name, name_key) values ('x','x')")).ok, false);
  assert.equal((await run("update public.b2b_prospects set status = 'approved'")).ok, false);
  await as(FIELD);
  assert.equal((await run('select id from public.b2b_prospects')).rows.length, 0, 'field sales does not see the discovery pool');
  await su(); await db.exec('set role anon');
  assert.equal((await run('select id from public.b2b_prospects')).ok, false);
});

test('review: back office/admin/manager only; exclude needs a reason and keeps only what prevents re-import', async () => {
  await su();
  const ids = (await db.query("select id, place_id from public.b2b_prospects order by place_id")).rows;
  const byPlace = Object.fromEntries(ids.map((r) => [r.place_id, r.id]));
  await as(INSIDE);
  assert.equal((await run("select public.b2b_review($1, 'approve')", [[byPlace.p3]])).ok, false);
  await as(BO);
  assert.equal((await run("select public.b2b_review($1, 'exclude', '')", [[byPlace.p1]])).ok, false, 'reason required');
  assert.equal((await run("select public.b2b_review($1, 'duplicate', 'Υπάρχει ήδη ως lead')", [[byPlace.p1]])).rows[0].b2b_review, 1);
  assert.equal((await run("select public.b2b_review($1, 'exclude', 'Δεν ταιριάζει στο προφίλ')", [[byPlace.p2]])).rows[0].b2b_review, 1);
  assert.equal((await run("select public.b2b_review($1, 'approve')", [[byPlace.p3, byPlace.p4]])).rows[0].b2b_review, 2);
  await su();
  const ex = (await db.query('select website, address, phone, name_key, status from public.b2b_prospects where id = $1', [byPlace.p2])).rows[0];
  assert.equal(ex.status, 'excluded'); assert.equal(ex.address, null); assert.equal(ex.name_key, 'φουρνοσ αθηνα', 'final sigma normalised');
  assert.equal((await db.query("select count(*)::int n from public.activity_log where action like 'b2b_%'")).rows[0].n, 4);
  await as(BO);
  assert.equal((await run("select public.b2b_review($1, 'reopen')", [[byPlace.p2]])).rows[0].b2b_review, 1);
});

test('distribution: approved only; manual / round-robin / workload; one lead per prospect; internal work only', async () => {
  await su();
  const approved = (await db.query("select id from public.b2b_prospects where status = 'approved' order by collected_at")).rows.map((r) => r.id);
  assert.equal(approved.length, 2);
  await as(INSIDE);
  assert.equal((await run("select public.b2b_distribute($1, 'manual', $2)", [approved, [INSIDE]])).ok, false, 'inside sales cannot distribute');
  await as(BO);
  assert.equal((await run("select public.b2b_distribute($1, 'manual', $2)", [approved, [BO]])).ok, false, 'only sales agents receive leads');
  assert.equal((await run("select public.b2b_distribute($1, 'manual', $2)", [approved, [INSIDE, INSIDE2]])).ok, false, 'manual = one agent');
  const r = await run("select public.b2b_distribute($1, 'workload', $2) out", [approved, [INSIDE, INSIDE2]]);
  assert.equal(r.ok, true);
  const out = r.rows[0].out;
  assert.equal(out.length, 2);
  assert.equal(out[0].agent, INSIDE2, 'fewest open leads first (Ελένη already has 2)');
  await su();
  const lead = (await db.query('select * from public.leads where id = $1', [out[0].lead])).rows[0];
  assert.equal(lead.source, 'import'); assert.equal(lead.lead_type, 'B2B'); assert.equal(lead.assigned_to_user_id, INSIDE2);
  assert.match(lead.comments, /Άρθρου 11 — ΔΕΝ έχει γίνει/);
  const p = (await db.query('select status, lead_id, assigned_to from public.b2b_prospects where id = $1', [approved[0]])).rows[0];
  assert.equal(p.status, 'assigned'); assert.equal(p.lead_id, out[0].lead);
  assert.equal((await db.query("select count(*)::int n from public.app_notifications where type = 'b2b_assigned'")).rows[0].n, 2);
  await as(BO);
  assert.equal((await run("select public.b2b_distribute($1, 'round_robin', $2) out", [approved, [INSIDE]])).rows[0].out.length, 0, 'already assigned → nothing happens twice');
});

test('round robin alternates in the given order; quota counter', async () => {
  for (const n of [5, 6, 7]) await insertProspect({ place_id: `rr${n}`, name: `Επιχείρηση ${n}`, phone: `69000000${n}${n}` });
  await su();
  const ids = (await db.query("select id from public.b2b_prospects where place_id like 'rr%' order by place_id")).rows.map((r) => r.id);
  await as(ADMIN);
  await run("select public.b2b_review($1, 'approve')", [ids]);
  const out = (await run("select public.b2b_distribute($1, 'round_robin', $2) out", [ids, [FIELD, INSIDE]])).rows[0].out;
  assert.deepEqual(out.map((x) => x.agent), [FIELD, INSIDE, FIELD]);
  await su();
  await db.exec(`insert into public.b2b_search_jobs (params, queries_done, status) values ('{}', 7, 'done'), ('{}', 3, 'done')`);
  await as(INSIDE);
  assert.equal((await run('select public.b2b_queries_today() n')).rows[0].n, 10);
});
