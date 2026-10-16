// LOCAL verification only (PGlite): after staged phase1/01 the anonymous visitor can no longer read or change the
// integration settings, while the website lead form (the REAL insert_website_lead from migration 20261001000100,
// SECURITY DEFINER) still works. NOT staging or production.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const db = new PGlite();
async function anon() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); await db.exec('set role anon'); }
async function su() { await db.exec('reset role'); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }
const websiteLead = () => run("select public.insert_website_lead('website', $1::jsonb) id", [JSON.stringify({ full_name: 'Δοκιμή Φόρμας', phone: '6900000000', gdpr_consent: true, age_confirmed: true, service_category: 'Ρεύμα' })]);

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    -- the leads columns insert_website_lead writes (the real table has more)
    create table public.leads (id uuid primary key default gen_random_uuid(), client_name text not null, client_contact text not null, first_name text not null,
      last_name text, full_name text, email text, phone text, region text, property_type text, service_category text, source text, status text,
      comments text, gdpr_consent boolean, consent_version text, consent_granted_at timestamptz, consent_source text, attached_files jsonb,
      campaign_name text, campaign_id text, age_confirmed boolean);
    alter table public.leads enable row level security;
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on public.leads to anon, authenticated;
  `);
  await db.exec(read('../migrations/20260818160000_create_integrations_table.sql'));
  await db.exec('grant select, insert, update, delete on public.crm_integrations to anon, authenticated');
  const m = read('../migrations/20261001000100_age_gate_public_leads.sql');
  const a = m.indexOf('create or replace function public.insert_website_lead');
  const end = 'grant execute on function public.insert_website_lead(text, jsonb) to anon, authenticated;';
  await db.exec(m.slice(a, m.indexOf(end, a) + end.length));
});

test('BEFORE (reproduces the live finding): the anonymous visitor reads and rewrites crm_integrations', async () => {
  await anon();
  assert.ok((await run('select id, config from public.crm_integrations')).rows.length > 0);
  assert.equal((await run("update public.crm_integrations set connected = true where id = 'sms'")).ok, true);
  assert.equal((await websiteLead()).ok, true, 'the website form works today');
});

test('AFTER phase1/01: anonymous read/write of crm_integrations is denied; the website lead form still works', async () => {
  await su(); await db.exec(read('../staged-migrations/phase1/01_rls_hardening.sql'));
  await anon();
  const r = await run('select id, config from public.crm_integrations');
  assert.ok(!r.ok || r.rows.length === 0, 'no rows for the anonymous visitor');
  const w = await run("update public.crm_integrations set connected = false where id = 'sms' returning id");
  assert.ok(!w.ok || w.rows.length === 0, 'no write');
  const status = await run('select * from public.crm_integrations_status');
  assert.equal(status.ok, false, 'the safe status view is for signed-in users only');
  const lead = await websiteLead();
  assert.equal(lead.ok, true, lead.err);
  assert.equal((await run('select * from public.leads')).ok, false, 'and the visitor cannot read leads back');
  await su();
  assert.equal((await db.query("select count(*)::int n from public.leads where full_name = 'Δοκιμή Φόρμας'")).rows[0].n, 2);
});
