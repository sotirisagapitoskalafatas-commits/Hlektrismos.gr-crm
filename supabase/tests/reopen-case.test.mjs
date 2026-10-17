// LOCAL verification only (PGlite) of supabase/staged-migrations/phase2/07c reopen_completed_case («Επαναφορά ολοκληρωμένου case», admin only),
// its independence of 07a/07b and the app's matching rule. NOT staging or production verification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSync } from 'esbuild';


const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const F07A = '../staged-migrations/phase2/07a_document_checklist_and_return.sql';
const F07B = '../staged-migrations/phase2/07b_case_stage_guard_and_set_stage.sql';
const F07C = '../staged-migrations/phase2/07c_reopen_completed_case.sql';

const js = buildSync({
  stdin: { contents: "export { STAGE_TRANSITIONS, STAGES, ROLES, can } from './roles'; export { canSetStage, stageSetTargets, canReopenCase, reopenTargets } from './stage-jump';", resolveDir: fileURLToPath(new URL('../../src/lib/', import.meta.url)), loader: 'ts' },
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
  const reopen = async (uid, id, to, reason = REASON) => { await as(uid); return run('select public.reopen_completed_case($1, $2, $3)', [id, to, reason]); };
  return { as, su, run, newCase, row, reopen };
};

const main = await mkDb([F07C]);
const T = mk(main);
const WORKING = ['new', 'contacted', 'offer', 'application', 'signed', 'document_check', 'submitted', 'activation'];
const completedCase = async () => { const id = await T.newCase('completed', 'completed'); await T.su(); await main.query("update public.cases set activation_status = 'active' where id = $1", [id]); return id; };
const snap = async () => { await T.su(); const q = async (t) => JSON.stringify((await main.query(`select * from public.${t} order by 1`)).rows); return [await q('cases'), await q('timeline_events'), await q('activity_log'), await q('app_notifications')].join('|'); };

test('who may call it: admin only — in the SQL, in the app and in this test', () => {
  const sql = read(F07C);
  const m = /v_role is distinct from '([a-z_]+)'/.exec(sql);
  assert.equal(m[1], 'admin');
  for (const r of A.ROLES.map((x) => x.id)) assert.equal(A.canReopenCase(r, 'completed'), r === 'admin', r);
  assert.equal(A.canReopenCase('admin', 'activation'), false, 'only a completed case is reopened');
  assert.equal(A.canReopenCase(null, 'completed'), false);
});

test('the app offers exactly the stages the database accepts', () => {
  assert.deepEqual(A.reopenTargets(), WORKING);
  const sql = read(F07C);
  const list = /v_targets constant text\[\] := array\[([^\]]*)\]/.exec(sql)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual(list, A.reopenTargets(), 'SQL list = app list, in journey order');
});

test('every other caller is refused and nothing changes', async () => {
  const id = await completedCase();
  const before = await snap();
  for (const who of [U.manager, U.back_office, U.inside_sales, U.field_sales, U.inactive_bo, null]) {
    const r = await T.reopen(who, id, 'activation');
    assert.equal(r.ok, false, `as ${who}`);
  }
  assert.equal(await snap(), before);
});

test('reason, stage, case and state are validated', async () => {
  const id = await completedCase();
  for (const bad of [null, '', '   ', 'λίγο', 'εννέα χαρ']) assert.equal((await T.reopen(U.admin, id, 'activation', bad)).ok, false, `reason ${JSON.stringify(bad)}`);
  for (const bad of [null, '', 'completed', 'lost', 'cancelled', 'nonsense']) assert.equal((await T.reopen(U.admin, id, bad)).ok, false, `stage ${JSON.stringify(bad)}`);
  assert.equal((await T.reopen(U.admin, 'cccccccc-0000-4000-8000-0000000fffff', 'activation')).ok, false, 'unknown case');
  // a case that is not completed is not touched, whatever its stage
  for (const st of [...WORKING, 'lost', 'cancelled']) {
    const other = await T.newCase(st);
    assert.equal((await T.reopen(U.admin, other, 'activation')).ok, false, `not completed (${st})`);
    assert.equal((await T.row(other)).current_stage, st);
  }
  assert.deepEqual(await T.row(id), { current_stage: 'completed', status: 'completed', activation_status: 'active' });
});

test('what changes: stage, status back to open, activation no longer confirmed — nothing else, no other case', async () => {
  for (const to of WORKING) {
    const id = await completedCase();
    const bystander = await completedCase();
    await T.su();
    const keep = (await main.query('select id, title, service_type, property_type, case_type, owner_id, next_action from public.cases where id = $1', [id])).rows[0];
    const bys = JSON.stringify((await main.query('select * from public.cases where id = $1', [bystander])).rows);
    const r = await T.reopen(U.admin, id, to);
    assert.equal(r.ok, true, `${to}: ${r.err}`);
    assert.deepEqual(await T.row(id), { current_stage: to, status: 'open', activation_status: null }, to);
    await T.su();
    assert.deepEqual((await main.query('select id, title, service_type, property_type, case_type, owner_id, next_action from public.cases where id = $1', [id])).rows[0], keep, 'other columns untouched');
    assert.equal(JSON.stringify((await main.query('select * from public.cases where id = $1', [bystander])).rows), bys, 'another completed case is untouched');
  }
});

test('audited: a timeline entry and an activity_log entry with the actor, the move, the reason and what it replaced; a refused call writes none', async () => {
  const id = await completedCase();
  await T.reopen(U.manager, id, 'activation'); await T.reopen(U.admin, id, 'activation', 'λίγο');
  await T.su();
  assert.equal((await main.query('select count(*)::int n from public.timeline_events where case_id = $1', [id])).rows[0].n, 0, 'refused calls leave no history');
  assert.equal((await main.query("select count(*)::int n from public.activity_log where entity_id = $1", [id])).rows[0].n, 0);
  assert.equal((await T.reopen(U.admin, id, 'document_check', 'Ο πάροχος απέρριψε την ενεργοποίηση')).ok, true);
  await T.su();
  const ev = (await main.query("select role, activity_type, title, description, user_id, metadata from public.timeline_events where case_id = $1", [id])).rows;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].activity_type, 'stage_set', 'the stepper and the history already read this type');
  assert.equal(ev[0].title, 'Επαναφορά ολοκληρωμένου case από διαχειριστή: completed → document_check');
  assert.equal(ev[0].description, 'Ο πάροχος απέρριψε την ενεργοποίηση');
  assert.equal(ev[0].role, 'admin'); assert.equal(ev[0].user_id, U.admin);
  assert.deepEqual(ev[0].metadata, { from: 'completed', to: 'document_check', reopened: true });
  const lg = (await main.query("select action, details from public.activity_log where entity_id = $1", [id])).rows;
  assert.equal(lg.length, 1);
  assert.equal(lg[0].action, 'case_reopened');
  assert.deepEqual(lg[0].details, { actor_id: U.admin, from: 'completed', to: 'document_check', reason: 'Ο πάροχος απέρριψε την ενεργοποίηση', previous_status: 'completed', previous_activation_status: 'active' });
  // a second call is refused: the case is no longer completed (no double entries)
  assert.equal((await T.reopen(U.admin, id, 'activation')).ok, false);
  await T.su();
  assert.equal((await main.query('select count(*)::int n from public.timeline_events where case_id = $1', [id])).rows[0].n, 1);
});

test('the availability probe (empty reason) changes nothing for any caller and is never mistaken for «not installed»', async () => {
  const id = await completedCase();
  const before = await snap();
  for (const who of [U.admin, U.manager, U.back_office, U.inside_sales, U.inactive_bo, null]) {
    await T.as(who);
    const r = await T.run('select public.reopen_completed_case($1, $2, $3)', ['00000000-0000-0000-0000-000000000000', 'activation', '']);
    assert.equal(r.ok, false, `probe as ${who}`);
    assert.ok(!/Could not find the function|schema cache/i.test(r.err), r.err);
    assert.equal((await T.run('select public.reopen_completed_case($1, $2, $3)', [id, 'activation', ''])).ok, false, `empty reason as ${who}`);
  }
  assert.equal(await snap(), before);
});

test('independence: alone, with 07a, with 07b, either order, twice — and the 07b guard does not stand in its way', async () => {
  const combos = [[F07C], [F07C, F07C], [F07A, F07C], [F07B, F07C], [F07C, F07B], [F07A, F07B, F07C], [F07C, F07B, F07A, F07C]];
  for (const files of combos) {
    const db = await mkDb(files);
    const t = mk(db);
    await t.su();
    const id = `cccccccc-0000-4000-8000-${String(900 + files.length).padStart(12, '0')}`;
    await db.query("insert into public.cases (id, title, current_stage, status, activation_status) values ($1, 'x', 'completed', 'completed', 'active')", [id]);
    const r = await t.reopen(U.admin, id, 'activation');
    assert.equal(r.ok, true, `${files.map((f) => f.slice(-30, -4)).join(' + ')}: ${r.err}`);
    assert.deepEqual(await t.row(id), { current_stage: 'activation', status: 'open', activation_status: null });
    if (files.includes(F07B)) {
      // the guard still refuses a DIRECT write from completed for a signed-in user; only this function reopens
      const db2 = await mkDb(files);
      const t2 = mk(db2);
      await t2.su();
      await db2.query("insert into public.cases (id, title, current_stage, status) values ($1, 'x', 'completed', 'completed')", [id]);
      await t2.as(U.admin);
      assert.equal((await t2.run('update public.cases set current_stage = $2 where id = $1', [id, 'activation'])).ok, false, 'a direct write is still refused');
      await db2.close();
    }
    await db.close();
  }
});

test('after a reopening the ordinary rules apply again (07b: completed only from activation)', async () => {
  const db = await mkDb([F07B, F07C]);
  const t = mk(db);
  await t.su();
  const id = 'cccccccc-0000-4000-8000-000000000777';
  await db.query("insert into public.cases (id, title, current_stage, status, activation_status) values ($1, 'x', 'completed', 'completed', 'active')", [id]);
  await t.as(U.back_office);
  assert.equal((await t.run('select public.set_case_stage($1, $2, $3)', [id, 'activation', REASON])).ok, false, 'Back Office cannot reopen: a completed case is final for them');
  assert.equal((await t.reopen(U.admin, id, 'submitted')).ok, true);
  await t.as(U.back_office);
  assert.equal((await t.run('select public.set_case_stage($1, $2, $3)', [id, 'completed', REASON])).ok, false, 'completed only from activation');
  assert.equal((await t.run('select public.set_case_stage($1, $2, $3)', [id, 'activation', REASON])).ok, true);
  assert.equal((await t.run('select public.set_case_stage($1, $2, $3)', [id, 'completed', REASON])).ok, true);
  assert.deepEqual(await t.row(id), { current_stage: 'completed', status: 'completed', activation_status: 'active' });
  await db.close();
});
