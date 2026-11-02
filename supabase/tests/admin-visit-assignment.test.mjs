// Production-equivalent PGlite contract for Admin-only field visit assignment.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalDb, ADMIN, A, B, NEWBIE } from './helpers/final-chain.mjs';
import { applyStaged, readRepo } from './helpers/replay-migrations.mjs';

let db, as, run, one, su;
before(async () => {
  ({ db, as, run, one, su } = await buildFinalDb());
  await su();
  await applyStaged(db, ['phase7/03_admin_visit_assignment']);
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
