// phase7/01: field visits that exist before any Case. The whole intended chain (two roles, Sales Agent isolation, storage lockdown) is replayed first, then the
// phase7/01 file is applied, and the visit workflow is attacked from three identities: the Admin / Back Office, Sales Agent A and Sales Agent B.
// Embedded Postgres (PGlite) with Auth / Storage / PostgREST stand-ins. Not staging, not Production.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalDb, ADMIN, A, B } from './helpers/final-chain.mjs';
import { applyStaged, readRepo } from './helpers/replay-migrations.mjs';

let db, as, run, one, su, ids;
before(async () => { ({ db, as, run, one, su, ids } = await buildFinalDb({ phase7: ['phase7/01_standalone_field_visits'] })); });

const prospect = (name = 'Καφέ Άστρο') => JSON.stringify({ name, phone: '2109999999', address: 'Λεωφ. Αθηνών 12' });
const visitAs = async (who, cols) => {
  await as(who);
  const keys = Object.keys(cols);
  return run(`insert into public.case_visits (${keys.join(', ')}) values (${keys.map((k, i) => (k === 'prospect' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ')}) returning id`, keys.map((k) => cols[k]));
};
const log = async (entityId) => { await su(); return one("select action, details from public.activity_log where entity_type = 'visit' and entity_id = $1::uuid order by created_at, id", [entityId]); };

test('prerequisites are enforced with a clear message (phase4/18, phase5/17+18, phase4/10)', () => {
  const sql = readRepo('supabase/staged-migrations/phase7/01_standalone_field_visits.sql');
  for (const m of ['phase4/18_sales_own_records_scope', 'phase5/17 and phase5/18', 'phase4/10_field_checkin_manual_flag']) assert.ok(sql.includes(m), m);
  assert.ok(!/drop (table|column)|truncate/i.test(sql.replace(/--.*$/gm, '')), 'additive only: nothing is dropped or truncated');
});

test('the schema is additive: case_id is nullable, the new columns exist, the new checks are NOT VALID, nothing legacy is rewritten', async () => {
  await su();
  const cols = Object.fromEntries((await one("select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'case_visits'")).map((r) => [r.column_name, r.is_nullable]));
  assert.equal(cols.case_id, 'YES');
  for (const c of ['lead_id', 'customer_id', 'supply_point_id', 'application_id', 'prospect', 'outcome_key', 'outcome_reason', 'status_reason', 'rescheduled_from_id']) assert.ok(c in cols, c);
  const fu = Object.fromEntries((await one("select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'follow_ups'")).map((r) => [r.column_name, r.is_nullable]));
  assert.equal(fu.case_id, 'YES'); for (const c of ['lead_id', 'customer_id', 'visit_id']) assert.ok(c in fu, c);
  const cs = await one("select conname, convalidated from pg_constraint where conrelid = 'public.case_visits'::regclass and conname in ('case_visits_anchor', 'case_visits_prospect_shape')");
  assert.equal(cs.length, 2); assert.ok(cs.every((c) => c.convalidated === false), 'NOT VALID: legacy rows can never block the migration');
  const tl = await one("select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'timeline_events' and column_name = 'case_id'");
  assert.equal(tl[0].is_nullable, 'NO', 'timeline_events stays case-bound: standalone events go to activity_log');
});

test('the file can be applied twice (idempotent) without error', async () => {
  await su();
  await applyStaged(db, ['phase7/01_standalone_field_visits']);
  assert.equal((await one("select count(*)::int n from pg_trigger where tgrelid = 'public.case_visits'::regclass and tgname = 'case_visits_guard_trg'"))[0].n, 1);
});

/* ───────── a visit without a Case ───────── */
test('a Sales Agent schedules a visit for a new prospect with NO Case, NO Lead and NO Customer; the visit is theirs even if they say otherwise', async () => {
  const r = await visitAs(A, { prospect: prospect(), user_id: B, purpose: 'Γνωριμία', scheduled_at: '2026-11-10T08:30:00Z', location: '{"lat":37.98,"lng":23.72}' });
  assert.equal(r.ok, true, r.error);
  ids.V1 = r.rows[0].id;
  await su();
  const v = (await one('select user_id, case_id, lead_id, customer_id, status from public.case_visits where id = $1::uuid', [ids.V1]))[0];
  assert.deepEqual([v.user_id, v.case_id, v.lead_id, v.customer_id, v.status], [A, null, null, null, 'planned'], 'user_id forced to the agent; no artificial records');
  assert.equal((await one('select count(*)::int n from public.cases'))[0].n, 2, 'no Case was created');
  assert.equal((await log(ids.V1))[0].action, 'visit_scheduled');
});

test('a visit must be about something: no case / lead / customer and no prospect is refused; so is a prospect without a name', async () => {
  assert.equal((await visitAs(A, { purpose: 'x' })).ok, false);
  assert.equal((await visitAs(A, { prospect: JSON.stringify({ phone: '1' }) })).ok, false);
  assert.equal((await visitAs(A, { prospect: JSON.stringify({ name: '   ' }) })).ok, false);
});

test('a Sales Agent can link a visit only to records that are theirs', async () => {
  assert.equal((await visitAs(A, { lead_id: ids.LA })).ok, true, 'own lead');
  assert.equal((await visitAs(A, { customer_id: ids.CuA, supply_point_id: ids.SPA })).ok, true, 'own customer + own supply point');
  assert.equal((await visitAs(A, { case_id: ids.CA })).ok, true, 'own case (the historical shape still works)');
  for (const [label, cols] of [['a colleague lead', { lead_id: ids.LB }], ['a colleague customer', { customer_id: ids.CuB }], ['a colleague case', { case_id: ids.CB }], ['a colleague supply point', { customer_id: ids.CuA, supply_point_id: ids.SPB }]]) {
    assert.equal((await visitAs(A, cols)).ok, false, label);
  }
  assert.equal((await visitAs(B, { lead_id: ids.LA })).ok, false, 'and the other way round');
});

test("a supply point of one customer can not be attached to a visit about another customer", async () => {
  assert.equal((await visitAs(ADMIN, { customer_id: ids.CuA, supply_point_id: ids.SPB })).ok, false, 'even the Admin cannot mix two customers\' supplies');
  assert.equal((await visitAs(ADMIN, { customer_id: ids.CuB, supply_point_id: ids.SPB })).ok, true);
});

test('a link is never re-pointed; the only change allowed is null -> owned (prospect -> Lead, Lead -> Case), and the prospect history stays', async () => {
  await as(A);
  assert.equal((await run('update public.case_visits set lead_id = $1::uuid where id = $2::uuid', [ids.LA, ids.V1])).ok, true, 'prospect converted to my Lead');
  await su();
  const v = (await one('select lead_id, prospect from public.case_visits where id = $1::uuid', [ids.V1]))[0];
  assert.equal(v.lead_id, ids.LA); assert.equal(v.prospect.name, 'Καφέ Άστρο', 'the prospect capture is kept as history');
  await as(A);
  assert.equal((await run('update public.case_visits set lead_id = $1::uuid where id = $2::uuid', [ids.LB, ids.V1])).ok, false, 'not re-pointed to a colleague lead');
  assert.equal((await run('update public.case_visits set case_id = $1::uuid where id = $2::uuid', [ids.CB, ids.V1])).ok, false, 'not linked to a colleague case');
  assert.equal((await run('update public.case_visits set user_id = $1::uuid where id = $2::uuid', [B, ids.V1])).ok, false, 'an agent cannot hand the visit to someone else');
  assert.ok((await log(ids.V1)).some((l) => l.action === 'visit_linked'));
});

/* ───────── check-in / check-out ───────── */
test('check-in and check-out work for a visit with no Case; the events go to activity_log, never to a fake Case timeline', async () => {
  await as(A);
  const tl0 = (await one('select count(*)::int n from public.timeline_events'))[0].n;
  const ci = (await run('select public.field_checkin($1::uuid, 37.9801, 23.7201, 20, null, $2) as r', [ids.V1, 'στο μαγαζί'])).rows[0].r;
  assert.equal(ci.accepted, true); assert.equal(ci.code, 'INSIDE_RADIUS', 'the visit\'s own stored point is the target when there is no Case');
  const again = (await run('select public.field_checkin($1::uuid, 37.9801, 23.7201, 20, null, $2) as r', [ids.V1, ''])).rows[0].r;
  assert.equal(again.code, 'IDEMPOTENT', 'a replayed offline request never checks in twice');
  const co = (await run('select public.field_checkout($1::uuid, 37.9801, 23.7201, 20, $2) as r', [ids.V1, 'συζήτηση ok'])).rows[0].r;
  assert.equal(co.accepted, true);
  assert.equal((await run('select public.field_checkout($1::uuid, null, null, null, $2) as r', [ids.V1, ''])).rows[0].r.code, 'IDEMPOTENT');
  await su();
  assert.equal((await one('select count(*)::int n from public.timeline_events'))[0].n, tl0, 'no timeline_events row (it would need a Case)');
  const actions = (await log(ids.V1)).map((l) => l.action);
  for (const a of ['visit_check_in', 'visit_in_progress', 'visit_check_out', 'visit_completed']) assert.ok(actions.includes(a), a);
  assert.equal(actions.filter((a) => a === 'visit_in_progress').length, 1, 'exactly one in-progress transition despite the replay');
  assert.equal((await one("select count(*)::int n from public.field_checkins where visit_id = $1::uuid and result <> 'IDEMPOTENT' and result <> 'CHECKOUT'", [ids.V1]))[0].n, 1);
});

test('standalone check-out stores completion and structured outcome atomically; retry is idempotent and conflict cannot overwrite', async () => {
  const v = (await visitAs(A, { prospect: prospect('Ατομικό αποτέλεσμα') })).rows[0].id;
  await as(A);
  const args = [v, 37.9801, 23.7201, 20, 'Αποτέλεσμα: Χωρίς πώληση — Τιμή / κόστος\\nΣημειώσεις', 'no_sale', 'Τιμή / κόστος', 'Χωρίς πώληση — Τιμή / κόστος'];
  const sql = 'select public.field_checkout_with_outcome($1::uuid, $2::double precision, $3::double precision, $4::integer, $5, $6, $7, $8) as r';
  const first = await run(sql, args);
  assert.equal(first.ok, true, first.error);
  assert.equal(first.rows[0].r.accepted, true);
  assert.equal(first.rows[0].r.code, 'CHECKOUT');
  await su();
  const saved = (await one('select status, outcome_key, outcome_reason, result from public.case_visits where id = $1::uuid', [v]))[0];
  assert.deepEqual([saved.status, saved.outcome_key, saved.outcome_reason, saved.result], ['completed', 'no_sale', 'Τιμή / κόστος', 'Χωρίς πώληση — Τιμή / κόστος']);
  await as(A);
  const retry = await run(sql, args);
  assert.equal(retry.ok, true, retry.error);
  assert.equal(retry.rows[0].r.code, 'IDEMPOTENT');
  const conflict = await run(sql, [v, null, null, null, '', 'not_interested', 'Δεν θέλει αλλαγή τώρα', 'Δεν ενδιαφέρεται']);
  assert.equal(conflict.ok, true, conflict.error);
  assert.equal(conflict.rows[0].r.accepted, false);
  assert.equal(conflict.rows[0].r.code, 'OUTCOME_CONFLICT');
  await su();
  const after = (await one('select status, outcome_key, outcome_reason from public.case_visits where id = $1::uuid', [v]))[0];
  assert.deepEqual([after.status, after.outcome_key, after.outcome_reason], ['completed', 'no_sale', 'Τιμή / κόστος']);
  assert.equal((await one("select count(*)::int n from public.field_checkins where visit_id = $1::uuid and result = 'CHECKOUT'", [v]))[0].n, 1);
});

test('authenticated users cannot bypass atomic check-out by writing structured outcomes directly', async () => {
  const directInsert = await visitAs(A, {
    prospect: prospect('Αποτέλεσμα απευθείας insert'),
    outcome_key: 'no_sale',
    outcome_reason: 'Τιμή / κόστος',
  });
  assert.equal(directInsert.ok, false, 'a visit insert cannot carry a pre-set outcome');

  const v = (await visitAs(A, { prospect: prospect('Αποτέλεσμα απευθείας update') })).rows[0].id;
  await as(A);
  const directUpdate = await run(
    "update public.case_visits set outcome_key = 'no_sale', outcome_reason = 'Τιμή / κόστος' where id = $1::uuid",
    [v],
  );
  assert.equal(directUpdate.ok, false, 'structured outcomes are only persisted by the SECURITY DEFINER checkout operation');
  await su();
  const saved = (await one('select outcome_key, outcome_reason, status from public.case_visits where id = $1::uuid', [v]))[0];
  assert.deepEqual([saved.outcome_key, saved.outcome_reason, saved.status], [null, null, 'planned']);
});

test('invalid structured outcome reason is rejected before the visit is completed', async () => {
  const v = (await visitAs(A, { prospect: prospect('Μη έγκυρη αιτία') })).rows[0].id;
  await as(A);
  const r = await run("select public.field_checkout_with_outcome($1::uuid, null, null, null, '', 'no_sale', 'άγνωστη αιτία', 'Χωρίς πώληση')", [v]);
  assert.equal(r.ok, false);
  await su();
  assert.equal((await one('select status from public.case_visits where id = $1::uuid', [v]))[0].status, 'planned');
});

test('no GPS is allowed (flagged for review, not refused); a visit with no stored point says so', async () => {
  const v = (await visitAs(A, { prospect: prospect('Χωρίς σημείο') })).rows[0].id;
  await as(A);
  const ci = (await run('select public.field_checkin($1::uuid, null, null, null, null, $2) as r', [v, ''])).rows[0].r;
  assert.equal(ci.accepted, true); assert.equal(ci.code, 'NO_GPS'); assert.equal(ci.flag, 'no_gps');
  const w = (await visitAs(A, { prospect: prospect('Με GPS αλλά χωρίς σημείο') })).rows[0].id;
  await as(A);
  const c2 = (await run('select public.field_checkin($1::uuid, 37.9, 23.7, 15, null, $2) as r', [w, ''])).rows[0].r;
  assert.equal(c2.code, 'NO_TARGET'); assert.match(c2.message, /η επίσκεψη δεν έχει αποθηκευμένο σημείο/);
});

test('the historical case-bound visit behaves exactly as before: the Case timeline gets the events', async () => {
  const v = (await visitAs(A, { case_id: ids.CA, scheduled_at: '2026-11-10T09:00:00Z' })).rows[0].id;
  await as(A);
  const ci = (await run('select public.field_checkin($1::uuid, 37.9838, 23.7275, 10, null, $2) as r', [v, ''])).rows[0].r;
  assert.equal(ci.code, 'INSIDE_RADIUS');
  const far = (await visitAs(A, { case_id: ids.CA })).rows[0].id; await as(A);
  assert.equal((await run('select public.field_checkin($1::uuid, 38.5, 24.5, 10, null, $2) as r', [far, ''])).rows[0].r.code, 'FAR_FROM_ADDRESS', 'accepted but flagged: the phase4/10 rule');
  await su();
  assert.ok((await one("select count(*)::int n from public.timeline_events where case_id = $1::uuid and activity_type = 'check_in'", [ids.CA]))[0].n >= 2);
});

/* ───────── cancel, no-show, reschedule ───────── */
test('cancel and no-show need a reason; a cancelled visit can not be checked in; terminal states stay terminal', async () => {
  const v = (await visitAs(A, { prospect: prospect('Ακύρωση'), scheduled_at: '2026-11-11T10:00:00Z' })).rows[0].id;
  await as(A);
  assert.equal((await run("select public.cancel_field_visit($1::uuid, '   ')", [v])).ok, false, 'a blank reason is refused');
  assert.equal((await run("update public.case_visits set status = 'cancelled' where id = $1::uuid", [v])).ok, false, 'and so is a direct update without a reason');
  assert.equal((await run("select public.cancel_field_visit($1::uuid, 'ο πελάτης έλειπε')", [v])).rows[0].cancel_field_visit, true);
  assert.equal((await run('select public.field_checkin($1::uuid, 37.9, 23.7, 10, null, $2) as r', [v, ''])).rows[0].r.accepted, false, 'NOT_OPEN');
  assert.equal((await run("update public.case_visits set status = 'planned' where id = $1::uuid", [v])).ok, false, 'a cancelled visit does not come back');
  const n = (await visitAs(A, { prospect: prospect('Δεν εμφανίστηκε') })).rows[0].id; await as(A);
  assert.equal((await run("select public.mark_visit_no_show($1::uuid, '')", [n])).ok, false);
  assert.equal((await run("select public.mark_visit_no_show($1::uuid, 'δεν άνοιξε κανείς')", [n])).rows[0].mark_visit_no_show, true);
  const acts = (await log(n)).map((l) => l.action); assert.ok(acts.includes('visit_no_show'));
  assert.equal((await one("select status, status_reason from public.case_visits where id = $1::uuid", [n]))[0].status, 'no_show');
});

test('rescheduling keeps both rows: the old one cancelled with its reason, the new one linked to it; the links and owner are copied', async () => {
  const v = (await visitAs(A, { lead_id: ids.LA, supply_point_id: null, scheduled_at: '2026-11-12T10:00:00Z', purpose: 'Προσφορά' })).rows[0].id;
  await as(A);
  assert.equal((await run("select public.reschedule_field_visit($1::uuid, null, 'x')", [v])).ok, false, 'a new date is required');
  assert.equal((await run("select public.reschedule_field_visit($1::uuid, '2026-11-14T10:00:00Z', '')", [v])).ok, false, 'a reason is required');
  const r = await run("select public.reschedule_field_visit($1::uuid, '2026-11-14T10:00:00Z', 'ζήτησε Παρασκευή') as id", [v]);
  assert.equal(r.ok, true, r.error);
  const nid = r.rows[0].id;
  await su();
  const old = (await one('select status, status_reason from public.case_visits where id = $1::uuid', [v]))[0];
  assert.equal(old.status, 'cancelled'); assert.match(old.status_reason, /^rescheduled: ζήτησε Παρασκευή/);
  const nu = (await one('select status, lead_id, user_id, rescheduled_from_id, scheduled_at from public.case_visits where id = $1::uuid', [nid]))[0];
  assert.deepEqual([nu.status, nu.lead_id, nu.user_id, nu.rescheduled_from_id], ['planned', ids.LA, A, v]);
  assert.equal(new Date(nu.scheduled_at).toISOString(), '2026-11-14T10:00:00.000Z');
  await as(A);
  assert.equal((await run("select public.reschedule_field_visit($1::uuid, '2026-11-20T10:00:00Z', 'ξανά')", [v])).ok, false, 'a cancelled visit can not be rescheduled again');
  assert.ok((await log(nid)).some((l) => l.action === 'visit_rescheduled_created'));
});

test('a visit is never deleted, by anyone signed in, so the check-in audit can not be erased', async () => {
  for (const who of [A, ADMIN]) { await as(who); const r = await run('delete from public.case_visits where id = $1::uuid', [ids.V1]); assert.ok(!r.ok || r.n === 0, `delete by ${who} must be refused (it touched ${r.n} row(s))`); }
  await su();
  assert.equal((await one('select count(*)::int n from public.case_visits where id = $1::uuid', [ids.V1]))[0].n, 1);
});

/* ───────── isolation and ownership ───────── */
test('Sales Agent B can not see, change, check in or follow up on Sales Agent A\'s standalone visit', async () => {
  await as(B);
  assert.equal((await one('select id from public.case_visits where id = $1::uuid', [ids.V1])).length, 0, 'not visible');
  assert.ok((await run("update public.case_visits set notes = 'x' where id = $1::uuid", [ids.V1])).n === 0);
  const r = await run('select public.field_checkin($1::uuid, 37.9, 23.7, 10, null, $2) as r', [ids.V1, '']);
  assert.equal(r.ok, false, 'the RPC refuses a check-in on someone else\'s visit');
  assert.match(r.error, /not your visit/);
  const c = await run("select public.cancel_field_visit($1::uuid, 'x') as ok", [ids.V1]);
  assert.ok(!c.ok || c.rows[0].ok === false, 'nor can B cancel it');
});

test('the ownership helper knows the visit entity type: the agent who owns the visit owns its audit rows; nobody else does', async () => {
  await as(A); assert.equal((await run("select public.sales_owns_entity('visit', $1::uuid) as o", [ids.V1])).rows[0].o, true);
  await as(B); assert.equal((await run("select public.sales_owns_entity('visit', $1::uuid) as o", [ids.V1])).rows[0].o, false);
  await as(A);
  for (const [t, id, want] of [['lead', ids.LA, true], ['lead', ids.LB, false], ['case', ids.CA, true], ['case', ids.CB, false], ['customer', ids.CuA, true], ['customer', ids.CuB, false], ['supply_point', ids.SPA, true], ['supply_point', ids.SPB, false], ['nonsense', ids.LA, false]]) {
    assert.equal((await run('select public.sales_owns_entity($1, $2::uuid) as o', [t, id])).rows[0].o, want, `${t}: the phase4/18 branches are intact`);
  }
  await su();
  assert.ok((await one("select 1 from public.activity_log where entity_type = 'visit'")).length > 4, 'the service role (Admin tooling) sees every audit row');
});

test('only Admin / Back Office reassigns a visit, and it is audited', async () => {
  const v = (await visitAs(A, { prospect: prospect('Για ανάθεση') })).rows[0].id;
  await as(A); assert.equal((await run('update public.case_visits set user_id = $1::uuid where id = $2::uuid', [B, v])).ok, false);
  await as(ADMIN); assert.equal((await run('update public.case_visits set user_id = $1::uuid where id = $2::uuid', [B, v])).ok, true);
  const l = (await log(v)).find((x) => x.action === 'visit_reassigned');
  assert.ok(l); assert.equal(l.details.from_user_id, A); assert.equal(l.details.to_user_id, B); assert.equal(l.details.actor_id, ADMIN, 'the shared login is recorded as itself: it does not claim to be a named employee');
});

/* ───────── follow-ups without a case ───────── */
test('a follow-up can hang on a lead or a visit with no Case; an agent can only create them for their own records; B can not see A\'s', async () => {
  await as(A);
  const ok = await run("insert into public.follow_ups (lead_id, visit_id, due_at, reason, assignee_id) values ($1::uuid, $2::uuid, now() + interval '1 day', 'Να καλέσω', $3::uuid) returning id, created_by", [ids.LA, ids.V1, A]);
  assert.equal(ok.ok, true, ok.error); assert.equal(ok.rows[0].created_by, A, 'created_by is the signed-in agent');
  assert.equal((await run("insert into public.follow_ups (lead_id, due_at) values ($1::uuid, now())", [ids.LB])).ok, false, 'not for a colleague lead');
  assert.equal((await run("insert into public.follow_ups (due_at, reason) values (now(), 'orphan')")).ok, false, 'no orphan follow-up');
  await as(B);
  assert.equal((await one('select id from public.follow_ups where id = $1::uuid', [ok.rows[0].id])).length, 0);
  await as(ADMIN);
  assert.equal((await one('select id from public.follow_ups where id = $1::uuid', [ok.rows[0].id])).length, 1);
});

/* ───────── duplicates and ownership requests ───────── */
test('the duplicate signal tells an agent that a record exists without revealing another agent\'s data', async () => {
  await as(A);
  const mine = (await run("select * from public.field_prospect_matches('Lead A', '6911111111', null)")).rows;
  assert.ok(mine.some((m) => m.kind === 'lead' && m.id === ids.LA && m.owned_by_other === false && m.label === 'Lead A'));
  const theirs = (await run("select * from public.field_prospect_matches('Άγνωστο', '6922222222', null)")).rows;
  assert.ok(theirs.some((m) => m.id === ids.LB && m.owned_by_other === true && m.label === null && m.detail === null), 'only kind + id + owned_by_other');
  const addr = (await run("select * from public.field_prospect_matches('x', null, 'ερμού   9, αθήνα')")).rows;
  assert.ok(addr.some((m) => m.kind === 'supply_point' && m.id === ids.SPB && m.owned_by_other === true && m.label === null));
  assert.equal((await run("select * from public.field_prospect_matches('Τίποτα', '6900000000', 'Πουθενά 1')")).rows.length, 0);
  await as(ADMIN);
  assert.ok((await run("select * from public.field_prospect_matches('x', '6922222222', null)")).rows.some((m) => m.id === ids.LB && m.label === 'Lead B'), 'the Admin sees the details');
});

test('taking over another agent\'s lead goes through a recorded request that only Admin / Back Office decides', async () => {
  await as(A);
  assert.equal((await run("select public.request_lead_ownership($1::uuid, '')", [ids.LB])).ok, false, 'a reason is required');
  assert.equal((await run("select public.request_lead_ownership($1::uuid, 'ήταν ο πελάτης μου')", [ids.LA])).ok, false, 'not for a lead that is already mine');
  const req = await run("select public.request_lead_ownership($1::uuid, 'ο πελάτης με κάλεσε') as id", [ids.LB]);
  assert.equal(req.ok, true, req.error); const rid = req.rows[0].id;
  assert.equal((await run("select public.request_lead_ownership($1::uuid, 'ξανά')", [ids.LB])).ok, false, 'one pending request per lead and agent');
  assert.equal((await run('select public.decide_ownership_request($1::uuid, true, null)', [rid])).ok, false, 'an agent can not approve their own request');
  assert.equal((await run("insert into public.ownership_requests (entity_id, requested_by, reason, status) values ($1::uuid, $2::uuid, 'x', 'approved')", [ids.LB, A])).ok, false, 'and can not write the table directly');
  await su();
  assert.equal((await one('select assigned_to_user_id from public.leads where id = $1::uuid', [ids.LB]))[0].assigned_to_user_id, B, 'still B\'s: asking changed nothing');
  await as(B); assert.equal((await one('select id from public.ownership_requests where id = $1::uuid', [rid])).length, 0, 'B can not read A\'s request');
  await as(ADMIN);
  assert.equal((await run('select public.decide_ownership_request($1::uuid, true, $2) as ok', [rid, 'εγκρίθηκε'])).rows[0].ok, true);
  assert.equal((await run('select public.decide_ownership_request($1::uuid, false, null) as ok', [rid])).rows[0].ok, false, 'a decision is final');
  await su();
  assert.equal((await one('select assigned_to_user_id from public.leads where id = $1::uuid', [ids.LB]))[0].assigned_to_user_id, A);
  const a = await one("select action, details from public.activity_log where entity_type = 'lead' and entity_id = $1::uuid and action like 'ownership_%' order by created_at", [ids.LB]);
  assert.deepEqual(a.map((x) => x.action), ['ownership_requested', 'ownership_approved']);
  assert.equal(a[1].details.actor_id, ADMIN);
  await as(A); assert.equal((await run('select public.sales_owns_lead($1::uuid) as o', [ids.LB])).rows[0].o, true, 'now A owns it');
});
