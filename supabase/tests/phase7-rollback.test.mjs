// The rollbacks of phase7 (docs/ops/rollback_phase7_*.sql) keep data, restore the previous functions and can be re-applied. PGlite; not staging, not Production.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalDb, A } from './helpers/final-chain.mjs';
import { applyStaged, readRepo } from './helpers/replay-migrations.mjs';

let db, as, run, one, su, ids;
before(async () => { ({ db, as, run, one, su, ids } = await buildFinalDb()); });

test('rollback 02 then 01: the data stays, the new objects go, the previous check-in works for a case-bound visit', async () => {
  await as(A);
  const app = (await run("insert into public.energy_applications (customer_id, service_type_code) values ($1::uuid, 'energy') returning id", [ids.CuA])).rows[0].id;
  const visit = (await run("insert into public.case_visits (prospect) values ('{\"name\":\"Χωρίς Case\"}'::jsonb) returning id")).rows[0].id;
  await su();
  await db.exec(readRepo('docs/ops/rollback_phase7_02_energy_applications.sql'));
  await db.exec(readRepo('docs/ops/rollback_phase7_01_standalone_field_visits.sql'));
  assert.equal((await one('select count(*)::int n from public.energy_applications where id = $1::uuid', [app]))[0].n, 1, 'the application survives');
  assert.equal((await one('select count(*)::int n from public.case_visits where id = $1::uuid', [visit]))[0].n, 1, 'the visit without a Case survives');
  const gone = await one(`select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('submit_energy_application', 'withdraw_energy_application', 'request_application_documents',
    'add_application_document', 'field_checkout_with_outcome', 'reschedule_field_visit', 'cancel_field_visit', 'mark_visit_no_show', 'field_prospect_matches', 'request_lead_ownership', 'decide_ownership_request', 'case_visits_guard')`);
  assert.deepEqual(gone, [], 'every phase7 function was dropped');
  assert.equal((await one("select count(*)::int n from pg_trigger where not tgisinternal and tgname in ('case_visits_guard_trg', 'energy_applications_guard_trg', 'follow_ups_link_guard_trg')"))[0].n, 0);
  await as(A);
  const v = (await run("insert into public.case_visits (case_id, scheduled_at) values ($1::uuid, now()) returning id", [ids.CA])).rows[0].id;
  const ci = (await run('select public.field_checkin($1::uuid, 37.9838, 23.7275, 10, null, $2) as r', [v, ''])).rows[0].r;
  assert.equal(ci.code, 'INSIDE_RADIUS', 'the phase4/10 check-in is back');
  assert.equal((await run("select public.sales_can_read_object('client_documents', 'cases/1_a.pdf') as o")).ok, true, 'the phase4/21 storage helper is back');
  assert.equal((await run("select public.sales_owns_entity('lead', $1::uuid) as o", [ids.LA])).rows[0].o, true, 'and the phase4/18 ownership helper');
});

test('after a rollback the files apply again without error (reversible)', async () => {
  await su();
  await applyStaged(db, ['phase7/01_standalone_field_visits', 'phase7/02_energy_applications']);
  assert.equal((await one("select count(*)::int n from pg_trigger where not tgisinternal and tgname = 'energy_applications_guard_trg'"))[0].n, 1);
  assert.equal((await one('select count(*)::int n from public.energy_applications'))[0].n, 1, 'and the application is still there');
});
