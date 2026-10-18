// LOCAL verification only (PGlite) of supabase/staged-migrations/phase4/19_staff_only_legacy_tables.sql (security audit F-08).
// Legacy tables are reconstructed with the policy style the audit found (`auth.role() = 'authenticated'`).
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const ACTIVE = 'ffffffff-0000-4000-8000-000000000001', GONE = 'ffffffff-0000-4000-8000-000000000002', STRANGER = 'ffffffff-0000-4000-8000-000000000003';
const TABLES = ['campaigns', 'calendar_events', 'lead_notes', 'voice_calls', 'crm_tasks'];

async function as(uid) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']);
  if (uid) await db.exec('set role authenticated');
}
async function su() { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
async function run(sql, params) { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message }; } }

before(async () => {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select case when nullif(current_setting('request.jwt.claim.sub', true), '') is null then 'anon' else 'authenticated' end $$;
    create table public.profiles (id uuid primary key, role text not null default 'inside_sales', is_active boolean not null default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path = public
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    insert into public.profiles values ('${ACTIVE}','inside_sales',true),('${GONE}','inside_sales',false);
    grant usage on schema public to anon, authenticated;
    ${TABLES.map((t) => `create table public.${t} (id serial primary key, note text);
      alter table public.${t} enable row level security;
      create policy "legacy authenticated all" on public.${t} for all using (auth.role() = 'authenticated');
      grant all on public.${t} to authenticated; grant usage on all sequences in schema public to authenticated;
      insert into public.${t} (note) values ('row');`).join('\n')}
  `);
});

test('BEFORE (audit finding F-08): a deactivated account and a user with no profile still read and write the legacy tables', async () => {
  for (const who of [GONE, STRANGER]) {
    await as(who);
    for (const t of TABLES) {
      assert.ok((await run(`select count(*)::int n from public.${t}`)).rows[0].n >= 1, `${who} reads ${t}`);
      assert.equal((await run(`insert into public.${t} (note) values ('x')`)).ok, true, `${who} writes ${t}`);
    }
  }
  await su();
  for (const t of TABLES) await db.exec(`delete from public.${t} where note = 'x'`);
  await db.exec(read('../staged-migrations/phase4/19_staff_only_legacy_tables.sql'));
});

test('AFTER: active staff are unaffected; deactivated and profile-less accounts are refused', async () => {
  await as(ACTIVE);
  for (const t of TABLES) {
    assert.equal((await run(`select count(*)::int n from public.${t}`)).rows[0].n, 1);
    assert.equal((await run(`insert into public.${t} (note) values ('ok')`)).ok, true);
  }
  for (const who of [GONE, STRANGER]) {
    await as(who);
    for (const t of TABLES) {
      assert.equal((await run(`select count(*)::int n from public.${t}`)).rows[0].n, 0, `${who} reads nothing from ${t}`);
      assert.equal((await run(`insert into public.${t} (note) values ('x')`)).ok, false, `${who} cannot write ${t}`);
    }
  }
  await su();
});

test('tables that do not exist are skipped; re-apply is idempotent; rollback removes only its own policies', async () => {
  await db.exec(read('../staged-migrations/phase4/19_staff_only_legacy_tables.sql'));
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname = 'staff only (restrictive)'")).rows[0].n, TABLES.length);
  await db.exec(read('../../docs/ops/rollback_phase4_19_staff_only_legacy_tables.sql'));
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname = 'staff only (restrictive)'")).rows[0].n, 0);
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname = 'legacy authenticated all'")).rows[0].n, TABLES.length, 'the legacy policies are untouched');
});
