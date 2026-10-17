// LOCAL verification only (PGlite) of supabase/staged-migrations/phase2/07b set_case_stage («Αλλαγή σταδίου από Back Office»),
// the independence of 07a and 07b, and the upgrade from the former single 07. NOT staging or production verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSync } from 'esbuild';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const F07A = '../staged-migrations/phase2/07a_document_checklist_and_return.sql';
const F07B = '../staged-migrations/phase2/07b_case_stage_guard_and_set_stage.sql';
const FORMER = './fixtures/phase2_07_former.sql';

const js = buildSync({
  stdin: { contents: "export { STAGE_TRANSITIONS, STAGES, ROLES, can } from './roles'; export { canSetStage, stageSetTargets } from './stage-jump';", resolveDir: fileURLToPath(new URL('../../src/lib/', import.meta.url)), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const A = await import('data:text/javascript;base64,' + Buffer.from(js.outputFiles[0].text).toString('base64'));

const U = { admin: 'aaaaaaaa-0000-4000-8000-000000000001', manager: 'aaaaaaaa-0000-4000-8000-000000000002', inside_sales: 'aaaaaaaa-0000-4000-8000-000000000003',
  field_sales: 'aaaaaaaa-0000-4000-8000-000000000004', back_office: 'aaaaaaaa-0000-4000-8000-000000000005', inactive_bo: 'aaaaaaaa-0000-4000-8000-000000000006' };
const ROLE_OF = { ...Object.fromEntries(['admin', 'manager', 'inside_sales', 'field_sales', 'back_office'].map((r) => [r, r])), inactive_bo: 'back_office' };
const REASON = 'Ο πάροχος ζήτησε διόρθωση στοιχείων';
const STAGE_IDS = A.STAGES.map((s) => s.id);

async function mkDb(files) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (id uuid primary key, full_name text, role text not null, is_active boolean default true);
    create function public.is_staff() returns boolean language sql stable security definer set search_path to 'public'
      as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_active, true)) $$;
    create function public.is_role(r text) returns boolean language sql stable security definer set search_path = public
      as $$ select (select p.role from public.profiles p where p.id = auth.uid()) = r $$;
    create table public.cases (id uuid primary key, title text not null default '', service_type text not null default 'energy', property_type text, case_type text,
      current_stage text not null default 'new', status text not null default 'open', activation_status text, owner_id uuid,
      inside_sales_owner uuid references public.profiles(id), field_sales_owner uuid references public.profiles(id), back_office_owner uuid references public.profiles(id),
      next_action text not null default '', next_action_owner_id uuid, updated_at timestamptz default now());
    create table public.case_documents (id uuid primary key default gen_random_uuid(), case_id uuid references public.cases(id), category text, status text not null default 'received');
    create table public.timeline_events (id uuid primary key default gen_random_uuid(), case_id uuid, role text, activity_type text, title text, description text, user_id uuid, occurred_at timestamptz default now(), metadata jsonb);
    create table public.app_notifications (id uuid primary key default gen_random_uuid(), user_id uuid, case_id uuid, title text, body text, type text, created_at timestamptz default now());
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text, entity_id uuid, action text, details jsonb, created_at timestamptz default now());
    alter table public.cases enable row level security;
    create policy "staff all cases" on public.cases for all to authenticated using (public.is_staff()) with check (public.is_staff());
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on public.cases, public.case_documents, public.timeline_events, public.app_notifications, public.activity_log to authenticated;
    insert into public.profiles values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}', '${ROLE_OF[k]}', ${k !== 'inactive_bo'})`).join(', ')};
  `);
  for (const f of files) await db.exec(read(f));
  return db;
}
const mk = (db) => {
  let n = 0;
  const as = async (uid) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? '']); if (uid) await db.exec('set role authenticated'); };
  const su = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); };
  const run = async (sql, params) => { try { const r = await db.query(sql, params); return { ok: true, rows: r.rows }; } catch (e) { return { ok: false, err: e.message, hint: e.hint, code: e.code }; } };
  const newCase = async (stage, status = 'open') => { await su(); const id = `cccccccc-0000-4000-8000-${String(++n).padStart(12, '0')}`; await db.query('insert into public.cases (id, title, current_stage, status) values ($1, $2, $3, $4)', [id, 'Ρεύμα', stage, status]); return id; };
  const row = async (id) => { await su(); return (await db.query('select current_stage, status, activation_status from public.cases where id = $1', [id])).rows[0]; };
  const set = async (uid, id, to, reason = REASON) => { await as(uid); return run('select public.set_case_stage($1, $2, $3)', [id, to, reason]); };
  return { as, su, run, newCase, row, set };
};

// Independent statement of the rule (not read from the SQL): who, from, to.
const ALLOWED_ROLES = ['admin', 'manager', 'back_office'];
const oracleSet = (role, from, to) => ALLOWED_ROLES.includes(role) && from !== to && from !== 'completed' && !(to === 'completed' && from !== 'activation');

const main = await mkDb([F07A, F07B]);
const T = mk(main);

test('who may call it: exactly the roles that hold «create_application» in the app, in the SQL and in the test oracle', () => {
  const sql = read(F07B);
  const m = /v_role not in \(([^)]*)\)/.exec(sql.slice(sql.indexOf('function public.set_case_stage')));
  const inSql = m[1].split(',').map((x) => x.trim().replace(/'/g, '')).sort();
  const inApp = A.ROLES.map((r) => r.id).filter((r) => A.can(r, 'create_application')).sort();
  assert.deepEqual(inSql, inApp, 'SQL role list = app create_application holders');
  assert.deepEqual(inApp, [...ALLOWED_ROLES].sort());
});

test('matrix: role × from × to — the database agrees with the rule, for set_case_stage', async () => {
  let checked = 0;
  for (const role of ['admin', 'manager', 'back_office', 'inside_sales', 'field_sales']) {
    for (const from of STAGE_IDS) {
      const id = await T.newCase(from);
      for (const to of STAGE_IDS) {
        await T.su(); await main.query('update public.cases set current_stage = $2, status = $3, activation_status = null where id = $1', [id, from, 'open']);
        const r = await T.set(U[role], id, to);
        assert.equal(r.ok, oracleSet(role, from, to), `${role}: ${from} → ${to}`);
        assert.equal(A.canSetStage(role, from, to), r.ok, `${role}: ${from} → ${to}: the APP rule (canSetStage) = the database`);
        if (!r.ok) assert.equal((await T.row(id)).current_stage, from, 'a refusal changes nothing');
        checked++;
      }
    }
  }
  assert.equal(checked, 5 * 11 * 11);
});

test('the control offers exactly the stages the database accepts, for every role and starting stage', async () => {
  for (const role of ['admin', 'manager', 'back_office', 'inside_sales']) {
    for (const from of STAGE_IDS) {
      const id = await T.newCase(from);
      const accepted = [];
      for (const to of STAGE_IDS) {
        await T.su(); await main.query('update public.cases set current_stage = $2, status = $3 where id = $1', [id, from, 'open']);
        if ((await T.set(U[role], id, to)).ok) accepted.push(to);
      }
      assert.deepEqual(A.stageSetTargets(role, from).sort(), accepted.sort(), `${role} from ${from}`);
    }
  }
});

test('matrix: role × from × to — a DIRECT write follows the list for every role (set_case_stage is the only way beyond it)', async () => {
  const list = new Set(Object.entries(A.STAGE_TRANSITIONS).flatMap(([f, ts]) => ts.map((t) => `${f}>${t}`)));
  for (const role of ['admin', 'back_office', 'inside_sales']) {
    for (const from of STAGE_IDS) {
      const id = await T.newCase(from);
      for (const to of STAGE_IDS) {
        if (from === to) continue;
        await T.su(); await main.query('update public.cases set current_stage = $2 where id = $1', [id, from]);
        await T.as(U[role]);
        const r = await T.run('update public.cases set current_stage = $2 where id = $1', [id, to]);
        assert.equal(r.ok, list.has(`${from}>${to}`), `${role} direct: ${from} → ${to}`);
        if (!r.ok) assert.equal(r.hint, 'transition');
      }
    }
  }
});

test('reason, stage, case and caller are validated', async () => {
  const id = await T.newCase('document_check');
  for (const bad of [null, '', '   ', 'λίγο', 'εννέα χαρ']) assert.equal((await T.set(U.back_office, id, 'application', bad)).ok, false, `reason ${JSON.stringify(bad)}`);
  assert.equal((await T.set(U.back_office, id, 'nonsense')).ok, false, 'unknown stage');
  assert.equal((await T.set(U.back_office, id, null)).ok, false);
  assert.equal((await T.set(U.back_office, 'cccccccc-0000-4000-8000-0000000fffff', 'application')).ok, false, 'unknown case');
  await T.as(null); assert.equal((await T.run('select public.set_case_stage($1, $2, $3)', [id, 'application', REASON])).ok, false, 'no session');
  assert.equal((await T.set(U.inactive_bo, id, 'application')).ok, false, 'a deactivated Back Office user');
  assert.equal((await T.row(id)).current_stage, 'document_check');
  assert.equal((await T.set(U.back_office, id, 'application')).ok, true, 'back one step, with a valid reason');
});

test('the availability probe (empty reason) changes nothing for any caller and is never mistaken for «not installed»', async () => {
  const snap = async () => { await T.su(); const q = async (t) => JSON.stringify((await main.query(`select * from public.${t} order by 1`)).rows); return [await q('cases'), await q('timeline_events'), await q('activity_log'), await q('app_notifications')].join('|'); };
  const id = await T.newCase('document_check');
  const before = await snap();
  for (const who of [U.admin, U.manager, U.back_office, U.inside_sales, U.inactive_bo, null]) {
    await T.as(who);
    // the exact call the app makes: a zero case, any stage, an EMPTY reason
    const r = await T.run('select public.set_case_stage($1, $2, $3)', ['00000000-0000-0000-0000-000000000000', 'new', '']);
    assert.equal(r.ok, false, `probe as ${who}`);
    assert.ok(!/Could not find the function|schema cache/i.test(r.err), `an installed function never reports itself missing: ${r.err}`);
    // the same call on a REAL case and a different stage: still refused, still no write
    assert.equal((await T.run('select public.set_case_stage($1, $2, $3)', [id, 'application', ''])).ok, false, `empty reason as ${who}`);
  }
  assert.equal(await snap(), before, 'no row in cases, timeline_events, activity_log or app_notifications changed');
});

test('side effects match the app\'s changeStage; leaving lost/cancelled reopens the status', async () => {
  const a = await T.newCase('activation');
  assert.equal((await T.set(U.back_office, a, 'completed')).ok, true);
  assert.deepEqual(await T.row(a), { current_stage: 'completed', status: 'completed', activation_status: 'active' });
  const l = await T.newCase('offer');
  assert.equal((await T.set(U.admin, l, 'lost')).ok, true);
  assert.deepEqual(await T.row(l), { current_stage: 'lost', status: 'lost', activation_status: null });
  assert.equal((await T.set(U.admin, l, 'application')).ok, true, 'a lost case can be resumed at the stage where the work really is');
  assert.deepEqual(await T.row(l), { current_stage: 'application', status: 'open', activation_status: null });
  const c = await T.newCase('new');
  assert.equal((await T.set(U.manager, c, 'cancelled')).ok, true);
  assert.equal((await T.row(c)).status, 'lost');
});

test('audited: a timeline entry and an activity_log entry with the actor, the move and the reason; nothing else changes', async () => {
  const id = await T.newCase('new');
  assert.equal((await T.set(U.back_office, id, 'document_check', 'Ήρθε από το Field με πλήρη φάκελο')).ok, true);
  await T.su();
  const ev = (await main.query("select role, title, description, user_id, metadata from public.timeline_events where case_id = $1 and activity_type = 'stage_set'", [id])).rows;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].title, 'Αλλαγή σταδίου από Back Office: new → document_check');
  assert.equal(ev[0].description, 'Ήρθε από το Field με πλήρη φάκελο');
  assert.equal(ev[0].role, 'back_office'); assert.equal(ev[0].user_id, U.back_office);
  assert.deepEqual(ev[0].metadata, { from: 'new', to: 'document_check' });
  const lg = (await main.query("select details from public.activity_log where entity_id = $1 and action = 'stage_set'", [id])).rows;
  assert.equal(lg.length, 1);
  assert.deepEqual(lg[0].details, { actor_id: U.back_office, from: 'new', to: 'document_check', reason: 'Ήρθε από το Field με πλήρη φάκελο' });
  // a refused call writes no history
  await T.set(U.inside_sales, id, 'application');
  await T.su();
  assert.equal((await main.query("select count(*)::int n from public.timeline_events where case_id = $1 and activity_type = 'stage_set'", [id])).rows[0].n, 1);
});

test('independence: 07a alone, 07b alone, either order, and applying a file twice', async () => {
  for (const files of [[F07A], [F07B], [F07A, F07B], [F07B, F07A], [F07A, F07A], [F07B, F07B], [F07A, F07B, F07A, F07B]]) {
    const db = await mkDb(files);
    const t = mk(db);
    const names = (await db.query("select proname from pg_proc where proname in ('set_case_stage', 'return_case_for_correction', 'case_document_blockers', 'cases_stage_guard') order by 1")).rows.map((r) => r.proname);
    const expected = files.some((f) => f === F07B) ? ['cases_stage_guard', 'set_case_stage'] : [];
    const expectedA = files.some((f) => f === F07A) ? ['case_document_blockers', 'return_case_for_correction'] : [];
    assert.deepEqual(names, [...expected, ...expectedA].sort(), files.map((f) => f.split('/').pop()).join(' + '));
    if (files.includes(F07B)) {
      const id = await t.newCase('submitted');
      assert.equal((await t.set(U.back_office, id, 'application')).ok, true, 'set_case_stage works without 07a');
    }
    await db.close();
  }
});

test('upgrade: a database that already had the FORMER single 07 — block gates reset, old functions gone, documents no longer block', async () => {
  const db = await mkDb([FORMER]);
  const t = mk(db);
  await t.as(U.admin);
  assert.equal((await t.run("select public.set_stage_gate_mode('document_check', 'block')")).ok, true, 'the former design could block');
  const id = await t.newCase('signed');
  await t.as(U.inside_sales);
  assert.equal((await t.run("update public.cases set current_stage = 'document_check' where id = $1", [id])).ok, false, 'blocked by the former guard');
  await t.su();
  await db.exec(read(F07A)); await db.exec(read(F07B));
  assert.deepEqual((await db.query("select proname from pg_proc where proname in ('set_stage_gate_mode', 'change_case_stage_override')")).rows, []);
  assert.deepEqual((await db.query("select distinct mode from public.stage_document_gates")).rows, [{ mode: 'warn' }], 'no gate left on block');
  await t.as(U.inside_sales);
  assert.equal((await t.run("update public.cases set current_stage = 'document_check' where id = $1", [id])).ok, true, 'the same move now goes through');
  assert.equal((await t.run("select public.case_document_blockers($1, 'document_check') b", [id])).rows[0].b.length > 0, true, 'and the checklist still reports what is missing');
  await db.close();
});
