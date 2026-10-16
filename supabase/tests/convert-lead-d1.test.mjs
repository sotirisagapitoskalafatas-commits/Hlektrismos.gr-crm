// LOCAL verification only (PGlite) of supabase/staged-migrations/phase4/15_convert_lead_match_phone_only.sql (finding D1),
// the read-only count / review queries in docs/ops/d1_placeholder_*.sql and the rollback. NOT staging or production.
// The starting state is the REAL convert_lead_to_case() from migration 20260909200000.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const db = new PGlite();
const STAFF = 'aaaaaaaa-0000-4000-8000-000000000003';
const PLACEHOLDER = 'not-provided@hlektrismos.local';
let n = 0;

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
const lead = async (name, phone, email = PLACEHOLDER) => {
  await su();
  const id = `bbbbbbbb-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  await db.query('insert into public.leads (id, full_name, phone, email) values ($1, $2, $3, $4)', [id, name, phone, email]);
  return id;
};
const convert = async (leadId) => {
  await as(STAFF);
  const caseId = (await db.query('select public.convert_lead_to_case($1) id', [leadId])).rows[0].id;
  await su();
  return (await db.query('select k.customer_id, c.full_name, c.email from public.cases k join public.customers c on c.id = k.customer_id where k.id = $1', [caseId])).rows[0];
};
const originalFunction = () => {
  const src = read('../migrations/20260909200000_p1_lead_foundation.sql');
  const a = src.indexOf('create or replace function public.convert_lead_to_case(p_lead_id uuid)');
  const end = 'grant execute on function public.convert_lead_to_case(uuid) to authenticated;';
  return src.slice(a, src.indexOf(end, a) + end.length);
};

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create table public.leads (id uuid primary key, full_name text, first_name text, last_name text, client_name text, phone text, email text,
      status text default 'new', converted_case_id uuid, converted_by_user_id uuid, converted_at timestamptz, first_contact_user_id uuid,
      assigned_to_user_id uuid, service_category text, source text default 'website', property_type text, comments text, notes text,
      campaign_name text, created_at timestamptz default clock_timestamp());
    create table public.customers (id uuid primary key default gen_random_uuid(), full_name text not null default '', email text, phone text,
      created_at timestamptz default clock_timestamp());
    create sequence case_no_seq;
    create table public.cases (id uuid primary key default gen_random_uuid(), case_no text default 'CS-' || nextval('case_no_seq'), title text,
      customer_id uuid references public.customers(id), source text, service_type text, property_type text, current_stage text, status text,
      lead_id uuid, owner_id uuid, inside_sales_owner uuid, created_by uuid, stage_entered_at timestamptz, notes text);
    create table public.timeline_events (id uuid primary key default gen_random_uuid(), case_id uuid, role text, activity_type text, title text,
      description text, user_id uuid, metadata jsonb);
    grant usage on schema public to authenticated;
    insert into public.profiles values ('${STAFF}', 'Ελένη', 'inside_sales', true);
  `);
  await db.exec(originalFunction());
});

test('BEFORE (reproduces D1 with the live function): two people without email are joined to one customer', async () => {
  const a = await convert(await lead('Μαρία Α.', '6911111111'));
  const b = await convert(await lead('Γιώργος Β.', '6922222222'));
  assert.equal(a.customer_id, b.customer_id, 'different phones, same customer');
  assert.equal(b.full_name, 'Μαρία Α.', 'the second person shows under the first person’s name');
  assert.equal(a.email, PLACEHOLDER, 'the placeholder is stored as the customer email');
});

test('count query (docs/ops/d1_placeholder_count.sql) sees the merged record; numbers only', async () => {
  await su();
  const r = (await db.query(read('../../docs/ops/d1_placeholder_count.sql'))).rows[0];
  assert.deepEqual(Object.keys(r), ['customers_with_placeholder', 'placeholder_customers_multi_lead', 'likely_two_people']);
  assert.deepEqual(Object.values(r).map(Number), [1, 1, 1]);
});

test('review query lists each lead of the suspect customer for manual review (nothing is changed)', async () => {
  await su();
  const before = (await db.query('select count(*)::int n from public.customers')).rows[0].n;
  const rows = (await db.query(read('../../docs/ops/d1_placeholder_review.sql'))).rows;
  assert.deepEqual(rows.map((r) => r.lead_name), ['Μαρία Α.', 'Γιώργος Β.']);
  assert.equal((await db.query('select count(*)::int n from public.customers')).rows[0].n, before, 'read-only');
});

test('apply 15 (twice: idempotent): match on phone only, never on the placeholder; placeholder not stored', async () => {
  const sql = read('../staged-migrations/phase4/15_convert_lead_match_phone_only.sql');
  await su(); await db.exec(sql); await db.exec(sql);
  const c = await convert(await lead('Νίκος Γ.', '6933333333'));
  const d = await convert(await lead('Ελένη Δ.', '6944444444'));
  assert.notEqual(c.customer_id, d.customer_id, 'two people without email → two customers');
  assert.equal(c.email, null, 'the placeholder is not stored');
  assert.equal(c.full_name, 'Νίκος Γ.');
});

test('same phone in another format → same customer; a real email alone no longer joins two people', async () => {
  const first = await convert(await lead('Άννα Ε.', '6955555555', 'anna@example.gr'));
  const again = await convert(await lead('Άννα Ε.', '+30 695 555 5555'));
  assert.equal(first.customer_id, again.customer_id, '+30 and spaces are ignored (last 10 digits)');
  assert.equal(first.email, 'anna@example.gr', 'a real email is kept');
  const otherPhone = await convert(await lead('Κώστας Ζ.', '6966666666', 'anna@example.gr'));
  assert.notEqual(otherPhone.customer_id, first.customer_id, 'email is never used for matching');
  const shortPhone1 = await convert(await lead('Χ', '123'));
  const shortPhone2 = await convert(await lead('Ψ', '123'));
  assert.notEqual(shortPhone1.customer_id, shortPhone2.customer_id, 'fewer than 10 digits never matches');
});

test('a customer in the Κάδος (phase2/06 deleted_at) is never reused; the timeline records reuse', async () => {
  await su();
  await db.exec('alter table public.customers add column if not exists deleted_at timestamptz');
  const kept = await convert(await lead('Ρένα Η.', '6977777777'));
  await su(); await db.query('update public.customers set deleted_at = now() where id = $1', [kept.customer_id]);
  const fresh = await convert(await lead('Ρένα Η.', '6977777777'));
  assert.notEqual(fresh.customer_id, kept.customer_id);
  const reuse = await convert(await lead('Ρένα Η.', '697 777 7777'));
  assert.equal(reuse.customer_id, fresh.customer_id);
  await su();
  const flags = (await db.query("select metadata->>'customer_reused' f from public.timeline_events order by ctid desc limit 2")).rows.map((r) => r.f);
  assert.deepEqual(flags, ['true', 'false']);
});

test('existing records are not changed by 15; the rollback restores the original function', async () => {
  await su();
  assert.equal((await db.query('select count(*)::int n from public.customers where email = $1', [PLACEHOLDER])).rows[0].n, 1, 'the old merged row is untouched');
  await db.exec(read('../../docs/ops/rollback_phase4_15_convert_lead.sql'));
  const x = await convert(await lead('Π', '6900000001'));
  const y = await convert(await lead('Σ', '6900000002'));
  assert.equal(x.customer_id, y.customer_id, 'D1 behaviour is back after rollback (proves the rollback is the original)');
  assert.equal((await db.query("select count(*)::int n from pg_proc where proname = 'customer_match_phone'")).rows[0].n, 0);
});
