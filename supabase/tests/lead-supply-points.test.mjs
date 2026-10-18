// LOCAL verification only (PGlite) of supabase/staged-migrations/phase5/18_lead_supply_points.sql (connections on a LEAD, moved to the
// customer when the lead is converted), on top of phase5/17, with the REAL live convert_lead_to_case() and, separately, the staged phase4/15 one.
// NOT staging or production verification. The surrounding tables are small stubs with the columns the files use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const F17 = read('../staged-migrations/phase5/17_customer_supply_points.sql');
const F18 = read('../staged-migrations/phase5/18_lead_supply_points.sql');
const F15 = read('../staged-migrations/phase4/15_convert_lead_match_phone_only.sql');
const ROLLBACK = read('../../docs/ops/rollback_phase5_18_lead_supply_points.sql');
const liveConvert = () => {
  const src = read('../migrations/20260909200000_p1_lead_foundation.sql');
  const a = src.indexOf('create or replace function public.convert_lead_to_case(p_lead_id uuid)');
  const end = 'grant execute on function public.convert_lead_to_case(uuid) to authenticated;';
  return src.slice(a, src.indexOf(end, a) + end.length);
};

const U = { admin: 'aaaaaaaa-0000-4000-8000-000000000001', inside: 'aaaaaaaa-0000-4000-8000-000000000003', stranger: 'aaaaaaaa-0000-4000-8000-000000000006' };
const ROLE = { admin: 'admin', inside: 'inside_sales' };

async function mkDb({ convert = liveConvert(), files = [F17, F18] } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true) and p.role = r) $$;
    create table public.leads (id uuid primary key default gen_random_uuid(), full_name text, first_name text, last_name text, client_name text, phone text, email text,
      status text default 'new', converted_case_id uuid, converted_by_user_id uuid, converted_at timestamptz, first_contact_user_id uuid,
      assigned_to_user_id uuid, service_category text, source text default 'website', property_type text, comments text, notes text,
      campaign_name text, attached_files jsonb default '[]'::jsonb, created_at timestamptz default clock_timestamp());
    create table public.customers (id uuid primary key default gen_random_uuid(), full_name text not null default '', email text, phone text, created_at timestamptz default clock_timestamp());
    create sequence case_no_seq;
    create table public.cases (id uuid primary key default gen_random_uuid(), case_no text default 'CS-' || nextval('case_no_seq'), title text,
      customer_id uuid references public.customers(id), source text, service_type text, property_type text, current_stage text, status text,
      lead_id uuid, owner_id uuid, inside_sales_owner uuid, created_by uuid, stage_entered_at timestamptz, notes text);
    create table public.case_documents (id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id), category text not null default 'other');
    create table public.timeline_events (id uuid primary key default gen_random_uuid(), case_id uuid, role text, activity_type text, title text, description text, user_id uuid, metadata jsonb);
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid, action text not null, details jsonb default '{}'::jsonb, created_at timestamptz not null default now());
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
    grant usage on schema public to authenticated;
    grant select, insert, update on public.customers, public.cases, public.case_documents, public.activity_log, public.timeline_events to authenticated;
    grant select, update on public.leads to authenticated;
    insert into public.profiles values ${Object.entries(U).filter(([k]) => k !== 'stranger').map(([k, id]) => `('${id}', '${k}', '${ROLE[k]}', true)`).join(', ')};
  `);
  await db.exec(convert);
  for (const f of files) await db.exec(f);
  return db;
}
const mk = (db) => {
  const as = async (who) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who ? U[who] : '']); if (who) await db.exec('set role authenticated'); };
  const su = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); };
  const run = async (sql, params) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } };
  let n = 0;
  const lead = async (fields = {}) => { await su(); const f = { full_name: `Lead ${++n}`, phone: `69000000${String(n).padStart(2, '0')}`, email: null, attached_files: '[]', ...fields };
    return (await db.query('insert into public.leads (full_name, phone, email, attached_files) values ($1, $2, $3, $4::jsonb) returning id', [f.full_name, f.phone, f.email, f.attached_files])).rows[0].id; };
  const customer = async (phone) => { await su(); return (await db.query("insert into public.customers (full_name, phone) values ('Πελάτης', $1) returning id", [phone])).rows[0].id; };
  const point = async (owner, fields = {}) => { await su();
    const cols = { usage: 'residential', ...fields }; const keys = Object.keys(cols);
    const col = owner.lead ? 'lead_id' : 'customer_id';
    return (await db.query(`insert into public.customer_supply_points (${col}, ${keys.join(', ')}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}) returning *`, [owner.lead ?? owner.customer, ...keys.map((k) => cols[k])])).rows[0]; };
  const convert = async (leadId) => { await as('inside'); const r = await run('select public.convert_lead_to_case($1) id', [leadId]); await su(); return r; };
  const pts = async (where, p = []) => { await su(); return (await db.query(`select * from public.customer_supply_points where ${where} order by created_at, id`, p)).rows; };
  return { as, su, run, lead, customer, point, convert, pts };
};

const db = await mkDb();
const T = mk(db);

test('a connection belongs to exactly one owner: a customer OR a lead; nothing else is mandatory', async () => {
  const l = await T.lead(); const c = await T.customer('6911111111');
  await T.su();
  assert.ok((await T.point({ lead: l })).lead_id === l, 'lead-owned works');
  assert.ok((await T.point({ customer: c })).customer_id === c, 'customer-owned still works');
  const none = await T.run("insert into public.customer_supply_points (usage) values ('residential')");
  const both = await T.run("insert into public.customer_supply_points (customer_id, lead_id, usage) values ($1, $2, 'residential')", [c, l]);
  assert.equal(none.ok, false); assert.equal(both.ok, false);
  const p = await T.point({ lead: l });
  assert.equal(p.supply_number, null); assert.equal(p.supply_number_ok, true); assert.equal(p.property_address, '');
});

test('staff only, as before; a lead-owned connection is audited with the lead id', async () => {
  const l = await T.lead();
  await T.as('inside');
  const r = await T.run("insert into public.customer_supply_points (lead_id, usage, supply_number) values ($1, 'commercial', '12345678901') returning id", [l]);
  assert.equal(r.ok, true, r.err);
  await T.as('stranger'); assert.equal((await T.run("insert into public.customer_supply_points (lead_id, usage) values ($1, 'residential')", [l])).ok, false);
  assert.equal((await T.run('select * from public.customer_supply_points where lead_id = $1', [l])).rows.length, 0, 'an unknown user sees nothing');
  await T.su();
  const log = (await db.query("select details from public.activity_log where entity_id = $1 and action = 'supply_point_created'", [r.rows[0].id])).rows;
  assert.equal(log.length, 1); assert.equal(log[0].details.lead_id, l); assert.equal(log[0].details.customer_id, null);
});

test('the owner can only be changed by the conversion: a signed-in user cannot move a connection, from a lead or between customers', async () => {
  const l = await T.lead(); const c = await T.customer('6922222222'); const c2 = await T.customer('6933333333');
  const fromLead = await T.point({ lead: l }); const fromCust = await T.point({ customer: c });
  await T.as('admin');
  for (const [sql, params] of [['update public.customer_supply_points set customer_id = $2, lead_id = null where id = $1', [fromLead.id, c]],
    ['update public.customer_supply_points set customer_id = $2 where id = $1', [fromCust.id, c2]], ['update public.customer_supply_points set lead_id = $2, customer_id = null where id = $1', [fromCust.id, l]]]) {
    const r = await T.run(sql, params); assert.equal(r.ok, false, sql); assert.match(r.err, /never moves/);
  }
  assert.equal((await T.run("update public.customer_supply_points set property_address = 'Νέα' where id = $1", [fromLead.id])).ok, true, 'ordinary edits still work');
});

test('duplicates: lead-owned connections are listed too (with the lead name), customers as before', async () => {
  const l = await T.lead({ full_name: 'Μαρία Λ.' }); const c = await T.customer('6944444444');
  const a = await T.point({ lead: l }, { supply_number: '44444444444' }); const b = await T.point({ customer: c }, { supply_number: '444 4444 4444' });
  await T.as('inside');
  const r = (await T.run('select * from public.supply_point_duplicates($1, $2)', ['44444444444', b.id])).rows;
  assert.deepEqual(r.map((x) => [x.id, x.customer_id, x.lead_id, x.lead_name]), [[a.id, null, l, 'Μαρία Λ.']]);
  const r2 = (await T.run('select * from public.supply_point_duplicates($1, $2)', ['44444444444', a.id])).rows;
  assert.deepEqual(r2.map((x) => [x.id, x.customer_name, x.lead_id]), [[b.id, 'Πελάτης', null]]);
});

for (const [label, convertSql] of [['the LIVE convert_lead_to_case', liveConvert()], ['the staged phase4/15 convert_lead_to_case', F15]]) {
  test(`conversion with ${label}: two connections move to the customer (same rows), keep their document tags, the case is NOT guessed`, async () => {
    const d = await mkDb({ convert: liveConvert() }); // the staged version is applied on top, as it would be on a real database
    if (convertSql !== liveConvert()) await d.exec(convertSql);
    const t = mk(d);
    const files = JSON.stringify([{ path: 'leads/x/bill.pdf', name: 'bill.pdf', type: 'application/pdf', size: 1 }]);
    const l = await t.lead({ phone: '6955555555', attached_files: files });
    const home = await t.point({ lead: l }, { usage: 'residential', property_address: 'Οδός 1', supply_number: '11111111111' });
    const shop = await t.point({ lead: l }, { usage: 'commercial', property_address: 'Οδός 2', supply_number: '22222222222', tariff_category_code: 'Γ21', tariff_name: 'Επαγγελματικό' });
    await t.su();
    await d.query("update public.leads set attached_files = $2::jsonb where id = $1", [l, JSON.stringify([{ path: 'a/bill.pdf', name: 'bill.pdf', supply_point_id: home.id }, { path: 'a/meter.jpg', name: 'meter.jpg', supply_point_id: shop.id }, { path: 'a/id.pdf', name: 'id.pdf' }])]);
    const r = await t.convert(l);
    assert.equal(r.ok, true, r.err);
    const caseId = r.rows[0].id;
    await t.su();
    const k = (await d.query('select customer_id, supply_point_id from public.cases where id = $1', [caseId])).rows[0];
    const moved = await t.pts('id = any($1::uuid[])', [[home.id, shop.id]]);
    assert.deepEqual(moved.map((x) => [x.id, x.customer_id, x.lead_id]), [[home.id, k.customer_id, null], [shop.id, k.customer_id, null]], 'the SAME rows now belong to the customer');
    assert.equal(moved[1].tariff_category_code, 'Γ21'); assert.equal(moved[1].property_address, 'Οδός 2'); assert.equal(moved[0].supply_number, '11111111111');
    assert.equal(k.supply_point_id, null, 'with two connections the case is not linked to either (which one it is about is for the user to say)');
    const tags = (await d.query('select attached_files from public.leads where id = $1', [l])).rows[0].attached_files;
    assert.deepEqual(tags.map((e) => e.supply_point_id ?? null), [home.id, shop.id, null], 'document tags unchanged');
    const log = (await d.query("select count(*)::int n from public.activity_log where action = 'supply_point_moved_from_lead' and details->>'lead_id' = $1", [l])).rows[0].n;
    assert.equal(log, 2, 'one audit entry per move');
    await d.close();
  });

  test(`conversion with ${label}: exactly ONE connection links the case to it`, async () => {
    const d = await mkDb({ convert: liveConvert() });
    if (convertSql !== liveConvert()) await d.exec(convertSql);
    const t = mk(d);
    const l = await t.lead({ phone: '6966666666' });
    const only = await t.point({ lead: l }, { supply_number: '33333333333' });
    const archived = await t.point({ lead: l }, { supply_number: '55555555555' });
    await t.su(); await d.query('update public.customer_supply_points set archived_at = now() where id = $1', [archived.id]);
    const r = await t.convert(l);
    assert.equal(r.ok, true, r.err);
    await t.su();
    const k = (await d.query('select customer_id, supply_point_id from public.cases where id = $1', [r.rows[0].id])).rows[0];
    assert.equal(k.supply_point_id, only.id, 'the one active connection is the case\'s');
    const arch = (await t.pts('id = $1', [archived.id]))[0];
    assert.equal(arch.customer_id, k.customer_id); assert.ok(arch.archived_at, 'an archived connection moves too and stays archived');
    await d.close();
  });
}

test('conversion, the customer ALREADY has that supply number: nothing is duplicated — the case links to the existing one, tags are re-pointed, the lead\'s row is flagged', async () => {
  const d = await mkDb(); const t = mk(d);
  const c = await t.customer('6977777777');
  const existing = await t.point({ customer: c }, { supply_number: '77777777777', property_address: 'Υπάρχουσα' });
  const l = await t.lead({ phone: '6977777777' });
  const dup = await t.point({ lead: l }, { supply_number: '777 7777 7777', property_address: 'Από το lead' });
  await t.su();
  await d.query('update public.leads set attached_files = $2::jsonb where id = $1', [l, JSON.stringify([{ path: 'a/bill.pdf', name: 'bill.pdf', supply_point_id: dup.id }])]);
  const r = await t.convert(l);
  assert.equal(r.ok, true, r.err);
  await t.su();
  const k = (await d.query('select customer_id, supply_point_id from public.cases where id = $1', [r.rows[0].id])).rows[0];
  assert.equal(k.customer_id, c, 'the existing customer was matched (same phone)');
  assert.equal(k.supply_point_id, existing.id, 'the case is linked to the customer\'s existing connection');
  const mine = await t.pts('customer_id = $1', [c]);
  assert.deepEqual(mine.map((x) => x.id), [existing.id], 'no copy was added to the customer');
  const left = (await t.pts('id = $1', [dup.id]))[0];
  assert.equal(left.lead_id, l); assert.equal(left.customer_id, null); assert.equal(left.needs_review, true); assert.match(left.review_note, /υπάρχει ήδη/);
  const tags = (await d.query('select attached_files from public.leads where id = $1', [l])).rows[0].attached_files;
  assert.equal(tags[0].supply_point_id, existing.id, 'the document now points at the customer\'s connection');
  assert.equal((await d.query("select count(*)::int n from public.activity_log where action = 'supply_point_duplicate_linked' and entity_id = $1", [dup.id])).rows[0].n, 1);
  // the duplicate notice finds both
  await t.as('inside');
  const found = (await t.run('select * from public.supply_point_duplicates($1, $2)', ['77777777777', existing.id])).rows;
  assert.deepEqual(found.map((x) => [x.id, x.lead_id]), [[dup.id, l]]);
  await d.close();
});

test('conversion, one duplicate + one new connection: the new one moves, the case is not guessed; a lead with no connections converts as always', async () => {
  const d = await mkDb(); const t = mk(d);
  const c = await t.customer('6988888888');
  await t.point({ customer: c }, { supply_number: '88888888888' });
  const l = await t.lead({ phone: '6988888888' });
  await t.point({ lead: l }, { supply_number: '88888888888' }); const fresh = await t.point({ lead: l }, { supply_number: '99999999999' });
  const r = await t.convert(l);
  await t.su();
  const k = (await d.query('select supply_point_id from public.cases where id = $1', [r.rows[0].id])).rows[0];
  assert.equal(k.supply_point_id, null, 'two different targets: not guessed');
  assert.equal((await t.pts('id = $1', [fresh.id]))[0].customer_id, c);
  const plain = await t.lead({ phone: '6900001111' });
  const r2 = await t.convert(plain);
  assert.equal(r2.ok, true, r2.err);
  await d.close();
});

test('a lead that is NOT converted keeps its connections where they are; converting twice is refused as before and moves nothing twice', async () => {
  const d = await mkDb(); const t = mk(d);
  const l = await t.lead({ phone: '6900002222' }); const p = await t.point({ lead: l });
  assert.equal((await t.pts('id = $1', [p.id]))[0].lead_id, l);
  const r = await t.convert(l); assert.equal(r.ok, true, r.err);
  const again = await t.convert(l); assert.equal(again.ok, false);
  assert.equal((await d.query("select count(*)::int n from public.activity_log where action = 'supply_point_moved_from_lead' and entity_id = $1", [p.id])).rows[0].n, 1);
  await d.close();
});

test('idempotent: 18 applied twice changes nothing and keeps an admin\'s edits; 17 alone still works (the lead side is simply absent)', async () => {
  const d = await mkDb({ files: [F17] }); const t = mk(d);
  const c = await t.customer('6900003333'); await t.point({ customer: c }, { supply_number: '12312312312' });
  await d.exec(F18); await d.exec(F18);
  assert.equal((await d.query("select count(*)::int n from pg_constraint where conname = 'customer_supply_points_one_owner'")).rows[0].n, 1);
  assert.equal((await d.query('select count(*)::int n from public.customer_supply_points')).rows[0].n, 1, 'existing rows are untouched');
  await d.close();
});

test('rollback A switches the lead side off and keeps the data; rollback B (uncommented) removes lead-owned rows and the column', async () => {
  const a = await mkDb(); const ta = mk(a);
  const l = await ta.lead({ phone: '6900004444' }); const p = await ta.point({ lead: l });
  await a.exec(ROLLBACK.slice(0, ROLLBACK.indexOf('-- OPTION B')));
  const r = await ta.convert(l);
  assert.equal(r.ok, true, 'conversion still works without the trigger');
  assert.equal((await ta.pts('id = $1', [p.id]))[0].lead_id, l, 'the connection was NOT moved (trigger gone) and is kept');
  await ta.as('inside');
  assert.equal((await ta.run('select * from public.supply_point_duplicates($1)', ['11111111111'])).ok, true, 'the 17 function is back');
  await a.close();
  const b = await mkDb(); const tb = mk(b);
  const l2 = await tb.lead(); await tb.point({ lead: l2 }); const c = await tb.customer('6900005555'); await tb.point({ customer: c });
  const optionB = ROLLBACK.slice(ROLLBACK.indexOf('-- OPTION B')).split('\n').filter((x) => /^-- (delete|alter|drop) /.test(x)).map((x) => x.replace(/^-- /, '')).join('\n');
  await b.exec(ROLLBACK.slice(0, ROLLBACK.indexOf('-- OPTION B'))); await b.exec(optionB);
  assert.equal((await b.query("select count(*)::int n from information_schema.columns where table_name = 'customer_supply_points' and column_name = 'lead_id'")).rows[0].n, 0);
  assert.equal((await b.query('select count(*)::int n from public.customer_supply_points')).rows[0].n, 1, 'the customer\'s connection stays');
  await b.close();
});
