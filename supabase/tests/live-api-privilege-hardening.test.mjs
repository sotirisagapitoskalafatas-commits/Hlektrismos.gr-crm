// LOCAL verification only (PGlite) for phase1/18_live_api_privilege_hardening.sql.
// Reconstructs risky grant/policy/function shapes from the read-only audit.
// This does NOT connect to or verify staging/production.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const SQL = read('../staged-migrations/phase1/18_live_api_privilege_hardening.sql');
const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';
const AGENT = 'aaaaaaaa-0000-4000-8000-000000000002';
const OTHER = 'aaaaaaaa-0000-4000-8000-000000000003';
const LEAD = 'bbbbbbbb-0000-4000-8000-000000000001';
const CUSTOMER = 'bbbbbbbb-0000-4000-8000-000000000002';
const db = new PGlite();

async function as(role, uid = null) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role ?? '']);
  if (role) await db.exec('set role ' + role);
}
async function owner() { await as(null); }
async function run(sql, params = []) {
  try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, error: e.message }; }
}

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
    create function auth.jwt() returns jsonb language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

    create table public.profiles (
      id uuid primary key, full_name text not null default '', role text not null default 'inside_sales',
      is_active boolean not null default true, phone text, avatar_url text, timezone text default 'Europe/Athens',
      language text default 'el', updated_at timestamptz default now()
    );
    create function public.is_staff() returns boolean language sql stable security definer set search_path=public
      as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_active,true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path=public
      as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role=r and coalesce(p.is_active,true)) $$;
    create function public.crm_has_role(r text) returns boolean language sql stable security definer set search_path=public
      as $$ select public.is_role(r) $$;

    create table public.crm_users (
      id uuid primary key, role text not null default 'sales', full_name text, is_active boolean default true
    );
    create table public.customer_documents (
      id uuid primary key default gen_random_uuid(), customer_id uuid,
      document_type text not null, file_path text not null, file_name text not null,
      customer_type text not null default 'customer'
    );
    create table public.sales_agents (id uuid primary key);
    create table public.agent_provider_commissions (id uuid primary key default gen_random_uuid(), note text);
    create table public.customer_agent_attribution (id uuid primary key default gen_random_uuid(), note text);
    create table public.customer_commissions_ledger (id uuid primary key default gen_random_uuid(), note text);
    create table public.supply_points (
      id uuid primary key default gen_random_uuid(), entity_id uuid not null, entity_type text not null,
      supply_number text not null unique, provider_name text, program_name text, sales_agent_id uuid,
      estimated_commission numeric default 0, monthly_cost numeric, updated_at timestamptz default now(),
      check (entity_type in ('lead','customer'))
    );
    create table public.customer_meters (id uuid primary key default gen_random_uuid(), note text);
    create table public.entity_documents (id uuid primary key default gen_random_uuid(), note text);
    create table public.crm_tasks (id uuid primary key default gen_random_uuid(), note text);
    create table public.crm_integrations (id text primary key, name text, connected boolean, config jsonb);
    create table public.crm_settings (setting_key text primary key, setting_value jsonb);
    create table public.crm_emails (id uuid primary key default gen_random_uuid(), body text);
    create table public.lead_notes (id uuid primary key default gen_random_uuid(), note text);
    create table public.campaigns (id uuid primary key default gen_random_uuid(), note text);
    create table public.campaign_sends (id uuid primary key default gen_random_uuid(), note text);
    create table public.voice_calls (id uuid primary key default gen_random_uuid(), note text);
    create table public.contact_consent (id uuid primary key default gen_random_uuid(), note text);
    create table public.consent_records (id uuid primary key default gen_random_uuid(), note text);
    create table public.email_suppressions (id uuid primary key default gen_random_uuid(), note text);
    create table public.leads (
      id uuid primary key default gen_random_uuid(), age_confirmed boolean not null default false,
      gdpr_consent boolean default false, source text default 'website', client_name text
    );
    create table public.hlektrismos_leads (
      id uuid primary key default gen_random_uuid(), first_name text, last_name text, phone text, email text,
      consent boolean not null default false, age_confirmed boolean not null default false,
      assigned_to uuid, assigned_at timestamptz, assigned_by uuid
    );
    create table public.customers (id uuid primary key default gen_random_uuid(), note text);
    create table public.cases (id uuid primary key default gen_random_uuid(), note text);
    create table public.customer_supply_points (id uuid primary key default gen_random_uuid(), note text);
    create table public.case_documents (id uuid primary key default gen_random_uuid(), note text);
    create table public.case_visits (id uuid primary key default gen_random_uuid(), note text);
    create table public.case_signatures (id uuid primary key default gen_random_uuid(), note text);
    create table public.case_offers (id uuid primary key default gen_random_uuid(), note text);
    create table public.follow_ups (id uuid primary key default gen_random_uuid(), note text);
    create table public.timeline_events (id uuid primary key default gen_random_uuid(), note text);
    create table public.app_notifications (id uuid primary key default gen_random_uuid(), note text);
    create table public.calendar_events (id uuid primary key default gen_random_uuid(), note text);
    create table public.chat_messages (id uuid primary key default gen_random_uuid(), note text);
    create table public.chat_threads (id uuid primary key default gen_random_uuid(), note text);
    create table public.agent_conversations (id uuid primary key default gen_random_uuid(), note text);
    create table public.agent_memory (id uuid primary key default gen_random_uuid(), note text);
    create table public.agent_reports (id uuid primary key default gen_random_uuid(), note text);
    create table public.ai_agents (id uuid primary key default gen_random_uuid(), note text);
    create table public.powerfor_leads (id uuid primary key default gen_random_uuid(), note text);
    create table public.notification_log (id uuid primary key default gen_random_uuid(), note text);
    create table public.business_events (id uuid primary key default gen_random_uuid(), note text);
    create table public.work_items (id uuid primary key default gen_random_uuid(), note text);
    create table public.assignments (id uuid primary key default gen_random_uuid(), note text);

    create table public.energy_tariffs (id uuid primary key, provider_name text, program_name text, is_active boolean);
    create table public.energy_tariff_prices (id uuid primary key default gen_random_uuid(), tariff_id uuid, unit_rate_kwh numeric);
    insert into public.energy_tariffs values ('bbbbbbbb-0000-4000-8000-000000000099', 'ΔΕΗ', 'Οικιακό', true);
    insert into public.energy_tariff_prices (tariff_id, unit_rate_kwh) values ('bbbbbbbb-0000-4000-8000-000000000099', 0.12);
    create view public.market_tariffs_view as
      select et.id, et.provider_name, et.program_name, et.is_active, etp.unit_rate_kwh
      from public.energy_tariffs et left join public.energy_tariff_prices etp on etp.tariff_id=et.id
      where et.is_active is true;

    create function public.reassign_lead(lead_id uuid, new_agent_id uuid) returns void
      language plpgsql security definer as $$ begin
        update public.hlektrismos_leads set assigned_to=new_agent_id where id=lead_id;
      end $$;
    create function public.upsert_supply_point(
      p_entity_id uuid, p_entity_type text, p_supply_number text, p_provider_name text default null,
      p_program_name text default null, p_sales_agent_id uuid default null, p_estimated_commission numeric default 0,
      p_monthly_cost numeric default null
    ) returns uuid language plpgsql security definer as $$ begin return null; end $$;

    create function public.crm_grant_role(p_user_id uuid, p_role_key text, p_is_primary boolean default null)
      returns void language plpgsql security definer as $$ begin return; end $$;
    create function public.crm_revoke_role(p_user_id uuid, p_role_key text)
      returns void language plpgsql security definer as $$ begin return; end $$;
    create function public.crm_set_primary_role(p_user_id uuid, p_role_key text)
      returns void language plpgsql security definer as $$ begin return; end $$;
    create function public.set_user_role(target_user_id uuid, new_role text)
      returns void language plpgsql security definer as $$ begin return; end $$;
    create function public.convert_lead_to_customer(p_lead_id uuid)
      returns uuid language plpgsql security definer as $$ begin return p_lead_id; end $$;
    create function public.upsert_scraped_b2b_leads(p_leads jsonb)
      returns table(inserted_count integer, duplicate_count integer)
      language sql security definer as $$ select 0,0 $$;

    create function public.convert_lead_to_case(p_lead_id uuid)
      returns uuid language plpgsql security definer set search_path=public as $$
      begin if not public.is_staff() then raise exception 'staff only'; end if; return p_lead_id; end $$;
    create function public.check_dnc_status(p_phone text)
      returns boolean language sql security definer as $$ select false $$;
    create function public.get_agent_lead_counts()
      returns table(agent_id uuid, agent_name text, lead_count bigint)
      language sql security definer as $$ select null::uuid, null::text, 0::bigint where false $$;
    create function public.insert_website_lead(p_source text, p_payload jsonb)
      returns uuid language plpgsql security definer set search_path=public as $
      declare v_id uuid; v_age boolean := coalesce((p_payload->>'age_confirmed')::boolean, false);
        v_consent boolean := coalesce((p_payload->>'gdpr_consent')::boolean, false);
      begin
        if v_age is not true then raise exception 'age confirmation required'; end if;
        if p_source = 'website' and v_consent is not true then raise exception 'consent required'; end if;
        insert into public.leads (client_name, age_confirmed, gdpr_consent, source)
          values (coalesce(p_payload->>'client_name','Website test'), v_age, v_consent, p_source)
          returning id into v_id;
        return v_id;
      end $;
    create function public.get_active_tariff_prices(p_month text)
      returns table(provider_name text, program_name text, unit_rate_kwh numeric)
      language sql security definer as $
        select provider_name, program_name, unit_rate_kwh from public.market_tariffs_view
      $;
    create function public.test_mutable_definer() returns integer language sql security definer as $ select 1 $;

    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to public, anon, authenticated, service_role;

    alter table public.profiles enable row level security;
    create policy "profiles update own" on public.profiles for update to authenticated
      using (auth.uid()=id) with check (auth.uid()=id);
    create policy "profiles read own or staff" on public.profiles for select to authenticated
      using (auth.uid()=id or public.is_staff());

    insert into public.profiles (id, role, is_active, full_name) values
      ('${ADMIN}', 'admin', true, 'Office'),
      ('${AGENT}', 'field_sales', true, 'Sales A'),
      ('${OTHER}', 'inside_sales', true, 'Sales B');
    insert into public.crm_users (id, role, full_name, is_active) values ('${AGENT}', 'sales', 'Sales A', true);
    insert into public.hlektrismos_leads (id, first_name, last_name, phone, email, consent, age_confirmed)
      values ('${LEAD}', 'Test', 'Lead', '6900000000', 'test@example.invalid', true, true);
    insert into public.leads (id, client_name, age_confirmed, gdpr_consent, source)
      values ('${CUSTOMER}', 'Website test', true, true, 'website');

    create policy "Allow all crm_users" on public.crm_users for all to public using (true) with check (true);
    create policy "Allow all customer_documents" on public.customer_documents for all to public using (true) with check (true);
    create policy "Allow all crm_integrations" on public.crm_integrations for all to public using (true) with check (true);
    create policy "Allow all crm_settings" on public.crm_settings for all to public using (true) with check (true);
    create policy "Allow all leads" on public.leads for all to public using (true) with check (true);
    create policy "Allow all hlektrismos_leads" on public.hlektrismos_leads for all to public using (true) with check (true);
    create policy "Anon tariff select" on public.energy_tariffs for select to public using (true);
    create policy "Anon tariff prices select" on public.energy_tariff_prices for select to public using (true);

    insert into public.crm_integrations values ('secret', 'Secret integration', true, '{"token":"not-a-real-secret"}');
    insert into public.crm_settings values ('scraper', '{"api_key":"not-a-real-secret"}');
  `);
});

test('anonymous callers lose direct read access to private CRM tables and settings', async () => {
  await as('anon');
  for (const table of ['profiles', 'crm_users', 'customer_documents', 'crm_integrations', 'crm_settings', 'customers', 'cases']) {
    const r = await run('select * from public.' + table);
    assert.equal(r.ok, false, 'anon SELECT should be denied on ' + table);
  }
});

test('website public intake remains available but requires the existing consent/age gates', async () => {
  await as('anon');
  assert.equal((await run("insert into public.leads (client_name, age_confirmed, gdpr_consent, source) values ('Allowed', true, true, 'website')")).ok, true);
  assert.equal((await run("insert into public.leads (client_name, age_confirmed, gdpr_consent, source) values ('No age', false, true, 'website')")).ok, false);
  assert.equal((await run("insert into public.leads (client_name, age_confirmed, gdpr_consent, source) values ('No consent', true, false, 'website')")).ok, false);
  assert.equal((await run("insert into public.hlektrismos_leads (first_name,last_name,phone,email,consent,age_confirmed) values ('No','Consent','6900000001','no@example.invalid',false,true)")).ok, false);
  assert.equal((await run("insert into public.hlektrismos_leads (first_name,last_name,phone,email,consent,age_confirmed) values ('Allowed','Lead','6900000002','yes@example.invalid',true,true)")).ok, true);
  assert.equal((await run('select * from public.leads')).ok, false);
});

test('public website intake and tariff reads remain while sensitive anonymous RPCs are denied', async () => {
  await as('anon');
  const website = await run("select public.insert_website_lead('website', '{\"client_name\":\"Via RPC\",\"age_confirmed\":true,\"gdpr_consent\":true}'::jsonb)");
  assert.equal(website.ok, true, website.error);
  assert.equal((await run("select public.insert_website_lead('website', '{\"client_name\":\"No consent\",\"age_confirmed\":true,\"gdpr_consent\":false}'::jsonb)")).ok, false);
  assert.equal((await run("select public.insert_website_lead('website', '{\"client_name\":\"No age\",\"age_confirmed\":false,\"gdpr_consent\":true}'::jsonb)")).ok, false);
  const prices = await run("select * from public.get_active_tariff_prices('2026-10')");
  assert.equal(prices.ok, true, prices.error);
  assert.equal(prices.rows.length, 1);
  assert.equal((await run("select public.check_dnc_status('6900000000')")).ok, false);
  assert.equal((await run("select public.crm_grant_role('" + AGENT + "','field_sales',true)")).ok, false);
  assert.equal((await run("select public.convert_lead_to_customer('" + LEAD + "')")).ok, false);
});

test('profile self-promotion is denied while safe self-profile edits remain possible', async () => {
  await as('authenticated', AGENT);
  assert.equal((await run("update public.profiles set role='admin' where id=$1", [AGENT])).ok, false);
  assert.equal((await run("update public.profiles set is_active=false where id=$1", [AGENT])).ok, false);
  assert.equal((await run("update public.profiles set full_name='Renamed' where id=$1", [AGENT])).ok, true);
  await owner();
  assert.equal((await db.query('select role from public.profiles where id=$1', [AGENT])).rows[0].role, 'field_sales');
});

test('reassignment RPC is not executable by anon or Sales and works for the office role', async () => {
  await as('anon');
  assert.equal((await run("select public.reassign_lead('" + LEAD + "','" + AGENT + "')")).ok, false);
  await as('authenticated', AGENT);
  assert.equal((await run("select public.reassign_lead('" + LEAD + "','" + OTHER + "')")).ok, false);
  await as('authenticated', ADMIN);
  assert.equal((await run("select public.reassign_lead('" + LEAD + "','" + AGENT + "')")).ok, true);
  await owner();
  assert.equal((await db.query('select assigned_to from public.hlektrismos_leads where id=$1', [LEAD])).rows[0].assigned_to, AGENT);
});

test('legacy supply-point upsert is office-only and cannot hijack a different entity', async () => {
  await as('authenticated', AGENT);
  assert.equal((await run("select public.upsert_supply_point('" + CUSTOMER + "','customer','11111111111',null,null,'" + AGENT + "',0,null)")).ok, false);
  await as('authenticated', ADMIN);
  const first = await run("select public.upsert_supply_point('" + CUSTOMER + "','customer','11111111111',null,null,'" + AGENT + "',0,null)");
  assert.equal(first.ok, true, first.error);
  const id = first.rows[0].upsert_supply_point;
  assert.ok(id);
  const conflict = await run("select public.upsert_supply_point('" + OTHER + "','lead','11111111111',null,null,'" + AGENT + "',0,null)");
  assert.equal(conflict.ok, false, 'cannot move a supply number between entities');
});

test('direct generic role administration RPCs are service-role only', async () => {
  await as('authenticated', ADMIN);
  for (const call of [
    "select public.crm_grant_role('" + AGENT + "','field_sales',true)",
    "select public.crm_revoke_role('" + AGENT + "','field_sales')",
    "select public.crm_set_primary_role('" + AGENT + "','field_sales')",
    "select public.set_user_role('" + AGENT + "','admin')",
    "select public.convert_lead_to_customer('" + LEAD + "')",
    "select * from public.upsert_scraped_b2b_leads('[]'::jsonb)"
  ]) assert.equal((await run(call)).ok, false, 'authenticated must not call ' + call);
  await as('service_role');
  assert.equal((await run("select public.crm_set_primary_role('" + AGENT + "','field_sales')")).ok, true);
});

test('authenticated role can still use the guarded case-conversion RPC, not anonymous callers', async () => {
  await as('anon');
  assert.equal((await run("select public.convert_lead_to_case('" + LEAD + "')")).ok, false);
  await as('authenticated', AGENT);
  assert.equal((await run("select public.convert_lead_to_case('" + LEAD + "')")).ok, true);
});

test('public tariff catalogue remains readable with a security-invoker view', async () => {
  await as('anon');
  const r = await run('select provider_name, unit_rate_kwh from public.market_tariffs_view');
  assert.equal(r.ok, true, r.error);
  assert.equal(r.rows.length, 1);
  await owner();
  const options = (await db.query("select reloptions from pg_class where oid='public.market_tariffs_view'::regclass")).rows[0].reloptions;
  assert.ok((options ?? []).includes('security_invoker=true'));
});

test('SECURITY DEFINER functions with mutable defaults get a pinned search_path; migration is idempotent', async () => {
  await owner();
  await db.exec(SQL);
  const config = (await db.query("select proconfig from pg_proc where oid='public.test_mutable_definer()'::regprocedure")).rows[0].proconfig;
  assert.ok((config ?? []).some((entry) => entry === 'search_path=pg_catalog, public, pg_temp'));
});

test('role helper is not an anonymous information endpoint', async () => {
  await as('anon');
  assert.equal((await run("select public.is_role('admin')")).ok, false);
  await as('authenticated', ADMIN);
  assert.equal((await run("select public.is_role('admin')")).rows[0].is_role, true);
});
