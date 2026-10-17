// LOCAL verification only (PGlite) of supabase/staged-migrations/phase5/17_customer_supply_points.sql («Παροχές»: several independent
// connections per customer), its rollback, and its match with src/lib/supply-points.ts. NOT staging or production verification.
// The surrounding tables (customers, cases, case_documents, activity_log, profiles) are small stubs with the columns the file uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSync } from 'esbuild';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const SQL = read('../staged-migrations/phase5/17_customer_supply_points.sql');
const ROLLBACK = read('../../docs/ops/rollback_phase5_17_supply_points.sql');
const js = buildSync({ entryPoints: [fileURLToPath(new URL('../../src/lib/supply-points.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const L = await import('data:text/javascript;base64,' + Buffer.from(js.outputFiles[0].text).toString('base64'));

const U = { admin: 'aaaaaaaa-0000-4000-8000-000000000001', manager: 'aaaaaaaa-0000-4000-8000-000000000002', inside: 'aaaaaaaa-0000-4000-8000-000000000003',
  bo: 'aaaaaaaa-0000-4000-8000-000000000004', inactive: 'aaaaaaaa-0000-4000-8000-000000000005', stranger: 'aaaaaaaa-0000-4000-8000-000000000006' };
const ROLE = { admin: 'admin', manager: 'manager', inside: 'inside_sales', bo: 'back_office', inactive: 'inside_sales' };
const CUST = { a: 'cccccccc-0000-4000-8000-00000000000a', b: 'cccccccc-0000-4000-8000-00000000000b' };

async function mkDb(apply = [SQL]) {
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
    create table public.customers (id uuid primary key, full_name text not null default '');
    create table public.cases (id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id), title text not null default '');
    create table public.case_documents (id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id), category text not null default 'other');
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid, action text not null, details jsonb default '{}'::jsonb, created_at timestamptz not null default now());
    -- the legacy tables must stay exactly as they are
    create table public.supply_points (id uuid primary key default gen_random_uuid(), entity_id uuid, entity_type text, supply_number text not null unique, provider_name text);
    create table public.customer_meters (id uuid primary key default gen_random_uuid(), customer_id uuid, supply_number text not null, meter_type text, property_address text);
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;  -- as on Supabase
    grant usage on schema public to authenticated;
    grant select, insert, update on public.customers, public.cases, public.case_documents, public.activity_log to authenticated;
    insert into public.profiles values ${Object.entries(U).filter(([k]) => k !== 'stranger').map(([k, id]) => `('${id}', '${k}', '${ROLE[k]}', ${k !== 'inactive'})`).join(', ')};
    insert into public.customers values ('${CUST.a}', 'Πελάτης Α'), ('${CUST.b}', 'Πελάτης Β');
    insert into public.supply_points (entity_id, entity_type, supply_number, provider_name) values ('${CUST.a}', 'customer', '123456789', 'ΔΕΗ');
    insert into public.customer_meters (customer_id, supply_number, meter_type, property_address) values ('${CUST.a}', '123456789', 'single_phase', 'Παλιά διεύθυνση');
  `);
  for (const f of apply) await db.exec(f);
  return db;
}
const mk = (db) => {
  const as = async (who) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who ? U[who] : '']); if (who) await db.exec('set role authenticated'); };
  const su = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); };
  const run = async (sql, params) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message, code: e.code }; } };
  const add = async (who, customer, fields = {}) => {
    await as(who);
    const cols = { usage: 'residential', ...fields };
    const keys = Object.keys(cols);
    return run(`insert into public.customer_supply_points (customer_id, ${keys.join(', ')}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}) returning *`, [customer, ...keys.map((k) => cols[k])]);
  };
  return { as, su, run, add };
};
const snap = async (db, t) => { await db.exec('reset role'); return JSON.stringify((await db.query(`select * from public.${t} order by 1`)).rows); };

const db = await mkDb();
const T = mk(db);

test('nothing is mandatory: a connection needs only a customer and a usage; the optional fields are really optional', async () => {
  const r = await T.add('inside', CUST.a);
  assert.equal(r.ok, true, r.err);
  const p = r.rows[0];
  assert.equal(p.supply_number, null); assert.equal(p.supply_number_ok, true); assert.equal(p.tariff_category_code, null); assert.equal(p.application_date, null); assert.equal(p.archived_at, null);
  assert.equal(p.property_address, ''); assert.equal(p.needs_review, false); assert.equal(p.created_by, U.inside);
  assert.equal((await T.add('inside', CUST.a, { usage: 'industrial' })).ok, false, 'usage is residential or commercial');
});

test('two connections of one customer are independent: saving, archiving or flagging one never changes the other', async () => {
  const a = (await T.add('inside', CUST.b, { usage: 'residential', property_address: 'Οδός 1', supply_number: '11111111111', tariff_category_code: 'Γ1', tariff_name: 'Πράσινο' })).rows[0];
  const b = (await T.add('inside', CUST.b, { usage: 'commercial', property_address: 'Οδός 2', supply_number: '22222222222', tariff_category_code: 'Γ21', tariff_name: 'Επαγγελματικό', contract_months: 24 })).rows[0];
  const before = JSON.stringify((await T.run('select * from public.customer_supply_points where id = $1', [b.id])).rows);
  await T.as('inside');
  assert.equal((await T.run("update public.customer_supply_points set property_address = 'Νέα οδός', tariff_name = 'Άλλο', supply_number = '33333333333' where id = $1", [a.id])).ok, true);
  assert.equal((await T.run('update public.customer_supply_points set archived_at = now() where id = $1', [a.id])).ok, true);
  assert.equal((await T.run("select public.flag_supply_point_review($1, 'έλεγχος')", [a.id])).ok, true);
  assert.equal(JSON.stringify((await T.run('select * from public.customer_supply_points where id = $1', [b.id])).rows), before, 'the other connection is byte-for-byte the same');
  const mine = (await T.run('select usage, property_address, supply_number, tariff_category_code, contract_months from public.customer_supply_points where id = $1', [b.id])).rows[0];
  assert.deepEqual(mine, { usage: 'commercial', property_address: 'Οδός 2', supply_number: '22222222222', tariff_category_code: 'Γ21', contract_months: 24 });
});

test('a connection never moves to another customer', async () => {
  const p = (await T.add('inside', CUST.a, { supply_number: '44444444444' })).rows[0];
  await T.as('admin');
  const r = await T.run('update public.customer_supply_points set customer_id = $2 where id = $1', [p.id, CUST.b]);
  assert.equal(r.ok, false); assert.match(r.err, /never moves to another customer/);
  await T.su();
  assert.equal((await db.query('select customer_id from public.customer_supply_points where id = $1', [p.id])).rows[0].customer_id, CUST.a);
});

test('the 11-digit rule: the SQL flag equals the app rule for every kind of input; the number is kept as typed', async () => {
  const inputs = [null, '', '   ', '12345678901', '123 4567 8901', '123-456-789-01', ' 12345678901 ', '1234567890', '123456789012', '123456789', 'ABC12345678', '1234567890a', '12345678901x', 'α1234567890', '123.456.789.01', '+3012345678901', '１２３４５６７８９０１'];
  for (const v of inputs) {
    const r = await T.add('inside', CUST.a, { supply_number: v });
    assert.equal(r.ok, true, `${v}: a given number never blocks the save in the database`);
    assert.equal(r.rows[0].supply_number_ok, L.supplyNumberOk(v), `flag for ${JSON.stringify(v)}`);
    assert.equal(r.rows[0].supply_number_key, L.supplyNumberKey(v), `key for ${JSON.stringify(v)}`);
    assert.equal(r.rows[0].supply_number, v, 'stored as typed');
  }
  assert.equal(L.supplyNumberError('123'), 'Ο Αριθμός Παροχής έχει 11 ψηφία (μόνο αριθμοί).');
  assert.equal(L.supplyNumberError(''), null); assert.equal(L.supplyNumberError('12345678901'), null);
});

test('a duplicate number is a SIGNAL: never rejected, never merged, never moved; found across customers; archived and self ignored', async () => {
  const x = (await T.add('inside', CUST.a, { supply_number: '55555555555', property_address: 'Α' })).rows[0];
  const y = await T.add('inside', CUST.b, { supply_number: '555 5555 5555', property_address: 'Β' });
  assert.equal(y.ok, true, 'the same number on another customer is accepted');
  const yId = y.rows[0].id;
  await T.as('inside');
  const d = (await T.run('select * from public.supply_point_duplicates($1, $2)', ['55555555555', yId])).rows;
  assert.deepEqual(d.map((r) => [r.id, r.customer_id, r.customer_name]), [[x.id, CUST.a, 'Πελάτης Α']]);
  assert.equal((await T.run('select * from public.supply_point_duplicates($1)', ['555-5555-5555'])).rows.length, 2, 'normalised: spaces and dashes do not matter');
  assert.equal((await T.run('select * from public.supply_point_duplicates($1)', [''])).rows.length, 0); assert.equal((await T.run('select * from public.supply_point_duplicates(null)')).rows.length, 0);
  assert.equal((await T.run("select public.flag_supply_point_review($1, 'ίδιος αριθμός με τον Πελάτη Α')", [yId])).ok, true);
  const flagged = (await T.run('select customer_id, needs_review, review_note, supply_number from public.customer_supply_points where id = $1', [yId])).rows[0];
  assert.deepEqual(flagged, { customer_id: CUST.b, needs_review: true, review_note: 'ίδιος αριθμός με τον Πελάτη Α', supply_number: '555 5555 5555' });
  assert.equal((await T.run('select customer_id, needs_review from public.customer_supply_points where id = $1', [x.id])).rows[0].needs_review, false, 'the other connection is not flagged');
  // archiving removes it from the signal
  await T.run('update public.customer_supply_points set archived_at = now() where id = $1', [x.id]);
  assert.equal((await T.run('select * from public.supply_point_duplicates($1)', ['55555555555'])).rows.length, 1);
  // resolving: reviewers only
  await T.as('inside'); assert.equal((await T.run('select public.resolve_supply_point_review($1)', [yId])).ok, false, 'a sales user cannot close a review');
  await T.as('bo'); const rv = await T.run("select public.resolve_supply_point_review($1, 'διαφορετικό ακίνητο')", [yId]); assert.equal(rv.ok, true, rv.err);
  const done = (await T.run('select needs_review, reviewed_by, review_note from public.customer_supply_points where id = $1', [yId])).rows[0];
  assert.deepEqual(done, { needs_review: false, reviewed_by: U.bo, review_note: 'διαφορετικό ακίνητο' });
  assert.equal((await T.run('select public.flag_supply_point_review($1)', ['00000000-0000-0000-0000-000000000000'])).ok, false, 'unknown id');
});

test('row security: staff only; no delete; anonymous and inactive users see and write nothing', async () => {
  const p = (await T.add('inside', CUST.a, { supply_number: '66666666666' })).rows[0];
  for (const who of ['stranger', 'inactive', null]) {
    await T.as(who);
    if (who === null) { await db.exec('reset role'); await db.exec('set role anon'); }
    const r = await T.run('select * from public.customer_supply_points');
    assert.ok(!r.ok || r.rows.length === 0, `${who} reads nothing`);
    assert.equal((await T.run("insert into public.customer_supply_points (customer_id, usage) values ($1, 'residential')", [CUST.a])).ok, false, `${who} cannot insert`);
  }
  await T.as('admin');
  assert.equal((await T.run('delete from public.customer_supply_points where id = $1', [p.id])).ok, false, 'there is no delete, not even for an admin');
  await T.su();
  assert.equal((await db.query('select count(*)::int n from public.customer_supply_points where id = $1', [p.id])).rows[0].n, 1);
});

test('the tariff list: everyone on staff reads it, only an admin edits it, and editing it never rewrites a connection', async () => {
  await T.as('inside');
  const list = (await T.run('select code, usage, active from public.tariff_categories order by sort')).rows;
  assert.deepEqual(list.map((r) => r.code), ['Γ1', 'Γ1Ν', 'Γ21', 'Γ22', 'Γ23']);
  assert.deepEqual(list.map((r) => r.usage), ['residential', 'residential', 'commercial', 'commercial', 'commercial']);
  assert.equal((await T.run("update public.tariff_categories set label = 'x' where code = 'Γ1'")).rows?.length ?? 0, 0);
  await T.su();
  assert.equal((await db.query("select label from public.tariff_categories where code = 'Γ1'")).rows[0].label, 'Γ1', 'a sales user changed nothing (RLS filters the row)');
  await T.as('inside');
  assert.equal((await T.run("insert into public.tariff_categories (code) values ('Γ99')")).ok, false);
  const p = (await T.add('inside', CUST.a, { tariff_category_code: 'Γ22', tariff_name: 'Μπλε' })).rows[0];
  await T.as('manager'); assert.equal((await T.run("insert into public.tariff_categories (code) values ('Γ99')")).ok, false, 'a manager is not an admin');
  await T.as('admin');
  assert.equal((await T.run("insert into public.tariff_categories (code, label, usage, sort) values ('Δ1', 'Νέα', 'commercial', 60)")).ok, true);
  assert.equal((await T.run("update public.tariff_categories set active = false, label = 'Γ22 (παλιό)' where code = 'Γ22'")).ok, true);
  assert.equal((await T.run("delete from public.tariff_categories where code = 'Γ22'")).ok, true);
  await T.su();
  const after = (await db.query('select tariff_category_code, tariff_name from public.customer_supply_points where id = $1', [p.id])).rows[0];
  assert.deepEqual(after, { tariff_category_code: 'Γ22', tariff_name: 'Μπλε' }, 'the connection keeps its code text even after the option was archived and deleted');
  assert.deepEqual(L.tariffOptions([{ code: 'Γ1', label: 'Γ1', usage: 'residential', active: true, sort: 1 }, { code: 'Γ22', label: 'Γ22', usage: 'commercial', active: false, sort: 2 }], 'commercial', 'Γ22').map((o) => [o.code, o.archived]), [['Γ22', true]]);
  assert.deepEqual(L.tariffOptions([{ code: 'Γ1', label: 'Γ1', usage: 'residential', active: true, sort: 1 }, { code: 'Γ21', label: 'Γ21', usage: 'commercial', active: true, sort: 2 }], 'residential', null).map((o) => o.code), ['Γ1']);
});

test('audit: who created, changed and archived a connection, the field names, and the history of the number — never the address or the notes', async () => {
  const p = (await T.add('inside', CUST.b, { supply_number: '77777777777', property_address: 'Μυστική οδός 7', notes: 'ιδιωτική σημείωση' })).rows[0];
  await T.as('bo');
  await T.run("update public.customer_supply_points set supply_number = '88888888888', tariff_name = 'Νέο' where id = $1", [p.id]);
  await T.run('update public.customer_supply_points set archived_at = now() where id = $1', [p.id]);
  await T.run('update public.customer_supply_points set archived_at = null where id = $1', [p.id]);
  await T.run('update public.customer_supply_points set property_address = property_address where id = $1', [p.id]); // no real change: no entry
  await T.su();
  const log = (await db.query("select action, details from public.activity_log where entity_id = $1 order by created_at, action", [p.id])).rows;
  const byAction = (a) => log.filter((l) => l.action === a);
  assert.equal(byAction('supply_point_created').length, 1);
  assert.equal(byAction('supply_point_created')[0].details.actor_id, U.inside);
  assert.equal(byAction('supply_point_updated').length, 1);
  assert.deepEqual(byAction('supply_point_updated')[0].details, { actor_id: U.bo, customer_id: CUST.b, fields: ['supply_number', 'tariff_name'], supply_number_from: '77777777777', supply_number_to: '88888888888' });
  assert.equal(byAction('supply_point_archived').length, 1); assert.equal(byAction('supply_point_restored').length, 1);
  assert.equal(log.length, 4);
  assert.ok(!JSON.stringify(log).includes('Μυστική') && !JSON.stringify(log).includes('ιδιωτική'), 'no address or notes in the audit');
});

test('documents and cases link to a specific connection of the SAME customer only', async () => {
  const pa = (await T.add('inside', CUST.a, {})).rows[0];
  const pb = (await T.add('inside', CUST.b, {})).rows[0];
  await T.su();
  const caseA = (await db.query("insert into public.cases (customer_id) values ($1) returning id", [CUST.a])).rows[0].id;
  const docA = (await db.query('insert into public.case_documents (case_id) values ($1) returning id', [caseA])).rows[0].id;
  await T.as('inside');
  assert.equal((await T.run('update public.cases set supply_point_id = $2 where id = $1', [caseA, pa.id])).ok, true, 'own customer');
  assert.equal((await T.run('update public.case_documents set supply_point_id = $2 where id = $1', [docA, pa.id])).ok, true);
  const bad1 = await T.run('update public.cases set supply_point_id = $2 where id = $1', [caseA, pb.id]);
  assert.equal(bad1.ok, false); assert.match(bad1.err, /belongs to another customer/);
  assert.equal((await T.run('update public.case_documents set supply_point_id = $2 where id = $1', [docA, pb.id])).ok, false);
  assert.equal((await T.run('insert into public.cases (customer_id, supply_point_id) values ($1, $2)', [CUST.b, pa.id])).ok, false, 'a new case of B cannot point at A\'s connection');
  assert.equal((await T.run('update public.cases set supply_point_id = null where id = $1', [caseA])).ok, true, 'unlinking is always fine');
  assert.equal((await T.run('update public.cases set title = $2 where id = $1', [caseA, 'x'])).ok, true, 'nothing else about a case or a document is affected');
});

test('legacy tables are untouched, and the file is idempotent (applied twice, same objects, same seeds)', async () => {
  const fresh = await mkDb([]);
  const before = [await snap(fresh, 'supply_points'), await snap(fresh, 'customer_meters')];
  await fresh.exec(SQL);
  assert.deepEqual([await snap(fresh, 'supply_points'), await snap(fresh, 'customer_meters')], before, 'supply_points and customer_meters are exactly as they were');
  await fresh.exec(SQL);
  assert.equal((await fresh.query('select count(*)::int n from public.tariff_categories')).rows[0].n, 5, 'seeds are not duplicated');
  await fresh.query("update public.tariff_categories set label = 'Γ1 (προσαρμοσμένο)', active = false where code = 'Γ1'");
  await fresh.exec(SQL);
  assert.deepEqual((await fresh.query("select label, active from public.tariff_categories where code = 'Γ1'")).rows[0], { label: 'Γ1 (προσαρμοσμένο)', active: false }, 'reapplying never overwrites an admin\'s edit');
  assert.ok(!/(alter|drop|delete|update|insert into)[^;]*\b(public\.)?(supply_points|customer_meters)\b/i.test(SQL.replace(/--[^\n]*/g, '')), 'the SQL never touches the legacy tables');
  await fresh.close();
});

test('rollback A switches the feature off and keeps the data; rollback B (uncommented) removes everything', async () => {
  const a = await mkDb();
  const ta = mk(a);
  const p = (await ta.add('inside', CUST.a, { supply_number: '99999999999' })).rows[0];
  await ta.su();
  await a.exec(ROLLBACK.slice(0, ROLLBACK.indexOf('-- OPTION B')));
  await ta.as('inside');
  assert.equal((await ta.run('select * from public.supply_point_duplicates($1)', ['99999999999'])).ok, false, 'the functions are gone (the app says «δεν είναι ακόμη διαθέσιμη»)');
  await ta.su();
  assert.equal((await a.query('select count(*)::int n from public.customer_supply_points where id = $1', [p.id])).rows[0].n, 1, 'the data stays');
  await a.close();
  const b = await mkDb();
  const tb = mk(b);
  await tb.add('inside', CUST.a, {});
  const optionB = ROLLBACK.slice(ROLLBACK.indexOf('-- OPTION B')).split('\n').filter((l) => /^-- (alter|drop) /.test(l)).map((l) => l.replace(/^-- /, '')).join('\n');
  await tb.su();
  await b.exec(ROLLBACK.slice(0, ROLLBACK.indexOf('-- OPTION B')));
  await b.exec(optionB);
  assert.equal((await b.query("select to_regclass('public.customer_supply_points') t, to_regclass('public.tariff_categories') u")).rows[0].t, null);
  assert.equal((await b.query("select count(*)::int n from information_schema.columns where table_name in ('cases','case_documents') and column_name = 'supply_point_id'")).rows[0].n, 0);
  assert.equal((await b.query('select count(*)::int n from public.supply_points')).rows[0].n, 1, 'the legacy table is still there');
  await b.close();
});
