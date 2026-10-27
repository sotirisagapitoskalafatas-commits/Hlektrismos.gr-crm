// LOCAL test helper: rebuilds the database by replaying the REAL files in supabase/migrations/ (in filename
// order) on embedded Postgres (PGlite), on top of minimal stand-ins for the Supabase platform schemas
// (auth, storage, cron, net) and the pgvector type. It is NOT staging or production, and it does not know
// about changes made in the Supabase dashboard; use it to test SQL behaviour, not to infer the live state.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS = fileURLToPath(new URL('../../migrations/', import.meta.url));
export const readRepo = (rel) => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// docs/ops/APPLY_ORDER.md, in order (paths under supabase/staged-migrations/, without .sql).
export const STAGE1_FILES = ['phase1/16_storage_docs_lockdown', 'phase1/01_rls_hardening', 'phase1/17_anon_restrictive_lockdown',
  'phase4/19_staff_only_legacy_tables', 'phase1/18_live_api_privilege_hardening', 'phase1/19_stage1_gap_fixes'];
export const LATER_FILES = ['phase2/05_staff_admin_and_role_preview', 'phase4/17_admin_only_staff_provisioning',
  'phase4/20_backoffice_sales_agent_provisioning', 'phase1/03_drop_exec_sql', 'phase1/02_outreach_decisions_audit',
  'phase1/04_cron_secret_and_pause', 'phase4/15_convert_lead_match_phone_only', 'phase2/06_trash_leads_customers',
  'phase2/07a_document_checklist_and_return', 'phase2/07b_case_stage_guard_and_set_stage', 'phase2/07c_reopen_completed_case',
  'phase4/10_field_checkin_manual_flag', 'phase4/11_customer_names', 'phase4/12_default_backoffice_assignee',
  'phase4/13_case_exception_state', 'phase4/14_follow_up_kind', 'phase3/08_b2b_prospects_review_distribution',
  'phase3/09_contact_eligibility', 'phase5/17_customer_supply_points', 'phase5/18_lead_supply_points',
  'phase4/16_import_legacy_leads', 'phase4/18_sales_own_records_scope', 'phase5/19_field_sales_saved_routes'];
export const applyStaged = async (db, files) => {
  for (const f of files) await db.exec(readRepo(`supabase/staged-migrations/${f}.sql`));
};

// Supabase platform stand-ins. Roles and helper functions mirror the hosted platform's names and behaviour
// closely enough for RLS/grant tests: the JWT sub/role/claims come from session settings set by as().
const PLATFORM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to current_user;

  create schema auth;
  create table auth.users (
    id uuid primary key, email text, raw_app_meta_data jsonb default '{}'::jsonb,
    raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable
    as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
  create function auth.jwt() returns jsonb language sql stable
    as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
  create function auth.email() returns text language sql stable as $$ select auth.jwt() ->> 'email' $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean default false, file_size_limit bigint,
    allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null, owner uuid,
    metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create function storage.filename(name text) returns text language sql immutable
    as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select, insert, update, delete on storage.objects, storage.buckets to anon, authenticated, service_role;

  create schema cron;
  create table cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language sql
    as $$ insert into cron.job (jobname, schedule, command) values (n, s, c) returning jobid $$;
  create function cron.schedule(s text, c text) returns bigint language sql
    as $$ insert into cron.job (schedule, command) values (s, c) returning jobid $$;
  create function cron.unschedule(n text) returns boolean language sql
    as $$ with d as (delete from cron.job where jobname = n returning 1) select exists (select 1 from d) $$;
  create function cron.unschedule(i bigint) returns boolean language sql
    as $$ with d as (delete from cron.job where jobid = i returning 1) select exists (select 1 from d) $$;

  create schema net;
  create function net.http_post(url text default null, headers jsonb default null, body jsonb default null,
    params jsonb default null, timeout_milliseconds int default null) returns bigint language sql as $$ select 1::bigint $$;
  create schema extensions;
  create schema vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);

  -- pgvector stand-in: embeddings are stored as real[]; similarity search is not exercised by these tests.
  create domain public.vector as real[];
  create function public.vector_cosine_distance(a real[], b real[]) returns float8 language sql immutable
    as $$ select 0::float8 $$;
  create operator public.<=> (leftarg = real[], rightarg = real[], function = public.vector_cosine_distance);

  -- Supabase grants new objects in public to the API roles by default; RLS is then the barrier.
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

// Platform-only statements PGlite cannot run; everything else in each migration is executed unchanged.
function adapt(sql) {
  return sql
    .replace(/create\s+extension[^;]*;/gi, '')
    .replace(/\bextensions\.vector\b/gi, 'vector')
    .replace(/\bvector\s*\(\s*\d+\s*\)/gi, 'vector')
    .replace(/create\s+(unique\s+)?index[^;]*using\s+(ivfflat|hnsw)[^;]*;/gi, '');
}

/**
 * Replays supabase/migrations/* in order. Returns { db, applied, skipped }.
 * A migration that fails is rolled back and listed in `skipped` with its error, so a test can assert
 * that the files it depends on were applied (see requireApplied).
 */
export async function replayMigrations({ until } = {}) {
  const db = new PGlite();
  await db.exec(PLATFORM);
  const applied = [];
  const skipped = [];
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (until && file > until) break;
    try {
      await db.exec(adapt(readFileSync(MIGRATIONS + file, 'utf8')));
      applied.push(file.replace(/\.sql$/, ''));
    } catch (e) {
      skipped.push({ file, error: e.message });
      try { await db.exec('rollback'); } catch { /* not in a transaction */ }
    }
  }
  return { db, applied, skipped };
}

export function requireApplied(applied, names) {
  const missing = names.filter((n) => !applied.includes(n));
  if (missing.length) throw new Error(`fixture: required migrations did not replay: ${missing.join(', ')}`);
}

/** Switch the session to a Supabase API identity. who: null (owner), 'anon', 'service_role', or a user uuid. */
export function identity(db) {
  return async function as(who, claims = {}) {
    await db.exec('reset role');
    const uid = who && !['anon', 'service_role'].includes(who) ? who : '';
    const role = who === 'anon' ? 'anon' : who === 'service_role' ? 'service_role' : who ? 'authenticated' : '';
    const jwt = role ? { role, ...(uid ? { sub: uid } : {}), ...claims } : {};
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
    await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [role ? JSON.stringify(jwt) : '']);
    if (role) await db.exec(`set role ${role}`);
  };
}

export async function attempt(db, sql, params = []) {
  try {
    const r = await db.query(sql, params);
    return { ok: true, rows: r.rows, n: r.affectedRows ?? 0 };
  } catch (e) {
    return { ok: false, error: e.message, code: e.code };
  }
}
