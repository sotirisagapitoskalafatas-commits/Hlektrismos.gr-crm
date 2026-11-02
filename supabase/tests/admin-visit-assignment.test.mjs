// Production-equivalent PGlite contract for Admin-only field visit assignment.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalDb, ADMIN, A, B, NEWBIE } from './helpers/final-chain.mjs';
import { applyStaged, readRepo } from './helpers/replay-migrations.mjs';

let db, as, run, one, su;
before(async () => {
  ({ db, as, run, one, su } = await buildFinalDb());
  await su();
  await applyStaged(db, ['phase7/03_admin_visit_assignment', 'phase7/05_admin_visit_assignment_invoker', 'phase7/06_sales_agent_only_field_visit_checkin']);
});

const makeVisit = async (actor, name, status = 'planned') => {
  await as(actor);
  const r = await run(
    "insert into public.case_visits (prospect, purpose, status) values ($1::jsonb, 'Συνάντηση', $2) returning id",
    [JSON.stringify({ name }), status],
  );
  assert.equal(r.ok, true, r.error);
  return r.rows[0].id;
};

test('migration is additive and exposes only the authenticated RPC', async () => {
  const sql = readRepo('supabase/staged-migrations/phase7/03_admin_visit_assignment.sql');
  assert.ok(!/drop\s+(table|column|policy|trigger)|truncate/i.test(sql.replace(/--.*$/gm, '')));
  await su();
  const grants = await one(`select
    has_function_privilege('anon', 'public.assign_field_visit(uuid,uuid)', 'EXECUTE') as anon_exec,
    has_function_privilege('authenticated', 'public.assign_field_visit(uuid,uuid)', 'EXECUTE') as auth_exec,
    has_function_privilege('service_role', 'public.assign_field_visit(uuid,uuid)', 'EXECUTE') as service_exec`);
  assert.deepEqual(grants[0], { anon_exec: false, auth_exec: true, service_exec: false });
  const definer = await one(`select prosecdef from pg_proc where oid = 'public.assign_field_visit(uuid,uuid)'::regprocedure`);
  assert.equal(definer[0].prosecdef, false, 'reassignment must preserve caller rights and table RLS');
});

test('only Admin may assign an open visit to an active Sales Agent; change is audited', async () => {
  const visit = await makeVisit(A, 'Ανάθεση ομάδας');
  await as(A);
  const denied = await run('select public.assign_field_visit($1::uuid, $2::uuid)', [visit, B]);
  assert.equal(denied.ok, false, 'Sales Agent cannot use the assignment RPC');

  await as(ADMIN);
  const assigned = await run('select public.assign_field_visit($1::uuid, $2::uuid) as ok', [visit, B]);
  assert.equal(assigned.ok, true, assigned.error);
  assert.equal(assigned.rows[0].ok, true);

  await su();
  const row = (await one('select user_id from public.case_visits where id = $1::uuid', [visit]))[0];
  assert.equal(row.user_id, B);
  const audit = (await one(`select details from public.activity_log
    where entity_type='visit' and entity_id=$1::uuid and action='visit_reassigned'`, [visit]))[0];
  assert.equal(audit.details.actor_id, ADMIN, 'shared office account is shown honestly as actor');
  assert.equal(audit.details.from_user_id, A);
  assert.equal(audit.details.to_user_id, B);
});

test('inactive Sales Agent, Admin target and unknown target are rejected', async () => {
  const visit = await makeVisit(A, 'Μη έγκυρη ανάθεση');
  await as(ADMIN);
  assert.equal((await run('select public.assign_field_visit($1::uuid, $2::uuid)', [visit, NEWBIE])).ok, false, 'inactive account');
  assert.equal((await run('select public.assign_field_visit($1::uuid, $2::uuid)', [visit, ADMIN])).ok, false, 'cannot assign a field visit to Admin');
  assert.equal((await run('select public.assign_field_visit($1::uuid, $2::uuid)', [visit, 'dddddddd-0000-4000-8000-000000000001'])).ok, false, 'unknown account');
});

test('completed visits remain immutable to the assignment operation and missing visit is a no-op', async () => {
  const visit = await makeVisit(A, 'Ολοκληρωμένη επίσκεψη');
  await su();
  await db.query("update public.case_visits set status='completed' where id=$1::uuid", [visit]);
  await as(ADMIN);
  assert.equal((await run('select public.assign_field_visit($1::uuid, $2::uuid)', [visit, B])).ok, false);
  const missing = await run('select public.assign_field_visit($1::uuid, $2::uuid) as ok', ['dddddddd-0000-4000-8000-000000000002', B]);
  assert.equal(missing.ok, true);
  assert.equal(missing.rows[0].ok, false);
});


test('Admin cannot claim GPS check-in or check-out through direct authenticated RPC calls', async () => {
  const checkinVisit = await makeVisit(A, 'Έλεγχος Admin check-in');
  const checkoutVisit = await makeVisit(A, 'Έλεγχος Admin check-out');
  const idempotentVisit = await makeVisit(A, 'Έλεγχος Admin idempotent check-in');

  await su();
  await db.query("update public.case_visits set status='in_progress', started_at=now() where id=$1::uuid", [checkoutVisit]);
  await db.query("update public.case_visits set status='completed', started_at=now(), ended_at=now() where id=$1::uuid", [idempotentVisit]);

  await as(ADMIN);
  const checkin = await run(
    "select public.field_checkin($1::uuid, null, null, null, null, '') as result",
    [checkinVisit],
  );
  assert.equal(checkin.ok, false, 'Admin cannot physically check in an agent visit');

  const checkout = await run(
    "select public.field_checkout($1::uuid, null, null, null, '') as result",
    [checkoutVisit],
  );
  assert.equal(checkout.ok, false, 'Admin cannot physically check out an agent visit');

  const checkoutOutcome = await run(
    "select public.field_checkout_with_outcome($1::uuid, null, null, null, '', 'interested', null, 'Interested') as result",
    [checkoutVisit],
  );
  assert.equal(checkoutOutcome.ok, false, 'the atomic outcome RPC cannot bypass the physical check-out guard');

  const duplicateCheckin = await run(
    "select public.field_checkin($1::uuid, null, null, null, null, '') as result",
    [idempotentVisit],
  );
  assert.equal(duplicateCheckin.ok, false, 'even the idempotent branch cannot create a field-check-in record as Admin');

  await su();
  const visits = await one(
    "select id, status, check_in, check_out, ended_at from public.case_visits where id = any($1::uuid[])",
    [[checkinVisit, checkoutVisit, idempotentVisit]],
  );
  const byId = Object.fromEntries(visits.map(row => [row.id, row]));
  assert.equal(byId[checkinVisit].status, 'planned');
  assert.equal(byId[checkinVisit].check_in, null);
  assert.equal(byId[checkoutVisit].status, 'in_progress');
  assert.equal(byId[checkoutVisit].check_out, null);
  assert.equal(byId[checkoutVisit].ended_at, null);
  assert.equal(byId[idempotentVisit].status, 'completed');
  assert.equal((await one(
    "select count(*)::int n from public.field_checkins where visit_id = any($1::uuid[])",
    [[checkinVisit, checkoutVisit, idempotentVisit]],
  ))[0].n, 0, 'failed Admin actions leave no physical check-in rows');
});

test('Sales Agents can still check in and complete their own visit with a structured outcome', async () => {
  const visit = await makeVisit(A, 'Έλεγχος Sales Agent check-in / check-out');
  await as(A);
  const checkin = await run(
    "select public.field_checkin($1::uuid, null, null, null, null, '') as result",
    [visit],
  );
  assert.equal(checkin.ok, true, checkin.error);
  assert.equal(checkin.rows[0].result.accepted, true);
  assert.equal(checkin.rows[0].result.code, 'NO_GPS');

  const checkout = await run(
    "select public.field_checkout_with_outcome($1::uuid, null, null, null, 'Επικοινωνία ολοκληρώθηκε', 'interested', null, 'Interested') as result",
    [visit],
  );
  assert.equal(checkout.ok, true, checkout.error);
  assert.equal(checkout.rows[0].result.accepted, true);

  await su();
  const saved = (await one(
    "select status, outcome_key, outcome_reason from public.case_visits where id=$1::uuid",
    [visit],
  ))[0];
  assert.deepEqual(saved, { status: 'completed', outcome_key: 'interested', outcome_reason: null });
});
