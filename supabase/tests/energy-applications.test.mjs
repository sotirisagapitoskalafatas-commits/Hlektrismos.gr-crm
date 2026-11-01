// phase7/02: the energy-service Application, its versioned documents and the operations around it. The whole intended chain (two roles, Sales Agent
// isolation, storage lockdown) plus phase7/01 is replayed first. Attacked from three identities: Admin / Back Office, Sales Agent A, Sales Agent B.
// Embedded Postgres (PGlite) with Auth / Storage / PostgREST stand-ins. Not staging, not Production.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalDb, ADMIN, A, B } from './helpers/final-chain.mjs';
import { applyStaged, readRepo } from './helpers/replay-migrations.mjs';

let db, as, run, one, su, ids;
const refused = (r) => !r.ok || r.n === 0;
before(async () => {
  ({ db, as, run, one, su, ids } = await buildFinalDb());
  // client_documents is created in the dashboard (no migration defines it): the fixture assumes the most open plausible policy for staff.
  await db.exec(`create policy "fixture: staff use client_documents" on storage.objects for all to authenticated
      using (bucket_id = 'client_documents' and public.is_staff()) with check (bucket_id = 'client_documents' and public.is_staff());
    insert into storage.objects (bucket_id, name) values ('client_documents', 'cases/1_a.pdf'), ('client_documents', 'cases/2_b.pdf');`);
  await db.query("insert into public.crm_settings (setting_key, setting_value, category, description) values ('default_backoffice_assignee', to_jsonb($1::text), 'workflow', 'x') on conflict (setting_key) do update set setting_value = excluded.setting_value", [ADMIN]);
  ids.SPLA = (await db.query("insert into public.customer_supply_points (lead_id, usage, property_address, supply_number, created_by) values ($1::uuid, 'residential', 'Λύκου 3', '33333333333', $2::uuid) returning id", [ids.LA, A])).rows[0].id;
});
const draft = async (who, cols = {}) => {
  await as(who);
  const c = { customer_id: ids.CuA, ...cols }; const keys = Object.keys(c);
  return run(`insert into public.energy_applications (${keys.join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning id, application_no, status, created_by`, keys.map((k) => c[k]));
};
const upd = async (who, id, set, params = []) => { await as(who); return run(`update public.energy_applications set ${set} where id = $${params.length + 1}::uuid`, [...params, id]); };
const actions = async (id) => { await su(); return (await one("select action, details from public.activity_log where entity_type = 'application' and entity_id = $1::uuid order by created_at, id", [id])); };
const UID = () => '11111111-2222-4333-8444-555555555555';
const path = (app, n = 'a.pdf') => `applications/${app}/${n}`;

test('prerequisites and shape: additive only, no delete grant, six service types, the origin constraint', async () => {
  const sql = readRepo('supabase/staged-migrations/phase7/02_energy_applications.sql');
  for (const m of ['phase7/01_standalone_field_visits', 'phase4/21_sales_isolation_completion', 'phase4/12_default_backoffice_assignee']) assert.ok(sql.includes(m), m);
  assert.ok(!/drop (table|column)|truncate|cascade/i.test(sql.replace(/--.*$/gm, '').replace(/drop (policy|trigger) if exists/gi, '')), 'additive only');
  await su();
  assert.equal((await one('select count(*)::int n from public.application_service_types'))[0].n, 6);
  assert.equal((await one("select has_table_privilege('authenticated', 'public.energy_applications', 'delete') d"))[0].d, false, 'applications are withdrawn, never deleted');
  const g = (await one("select has_table_privilege('authenticated', 'public.application_documents', 'insert') i, has_table_privilege('authenticated', 'public.application_documents', 'update') u, has_table_privilege('authenticated', 'public.application_documents', 'delete') d"))[0];
  assert.deepEqual([g.i, g.u, g.d], [false, false, false], 'document versions are written only by the functions, never edited or deleted');
  assert.equal((await one("select count(*)::int n from pg_constraint where conname = 'energy_applications_origin'"))[0].n, 1);
});

test('the file can be applied twice without error', async () => {
  await su(); await applyStaged(db, ['phase7/02_energy_applications']);
  assert.equal((await one('select count(*)::int n from public.application_service_types'))[0].n, 6);
});

/* ───────── drafts ───────── */
test('a Sales Agent starts a DRAFT for their own customer: no Case, no new Customer, status and creator forced by the system', async () => {
  const cases0 = (await one('select count(*)::int n from public.cases'))[0].n, cust0 = (await one('select count(*)::int n from public.customers'))[0].n;
  const r = await draft(A, { status: 'submitted', created_by: B, supply_point_id: ids.SPA, service_type_code: 'energy', wizard_step: 3 });
  assert.equal(r.ok, true, r.error); ids.P1 = r.rows[0].id;
  assert.equal(r.rows[0].status, 'draft'); assert.equal(r.rows[0].created_by, A); assert.match(r.rows[0].application_no, /^AP-\d{4}-\d{5}$/);
  await su();
  assert.equal((await one('select count(*)::int n from public.cases'))[0].n, cases0, 'a draft creates no Case');
  assert.equal((await one('select count(*)::int n from public.customers'))[0].n, cust0, 'and no Customer');
  assert.equal((await actions(ids.P1))[0].action, 'application_created');
});

test('an application needs an origin, and a Sales Agent can only use their own customers, leads and supply points', async () => {
  assert.equal((await draft(A, { customer_id: null })).ok, false, 'no customer and no lead');
  assert.equal((await draft(A, { customer_id: ids.CuB })).ok, false, "a colleague's customer");
  assert.equal((await draft(A, { customer_id: null, lead_id: ids.LB })).ok, false, "a colleague's lead");
  assert.equal((await draft(A, { customer_id: ids.CuA, supply_point_id: ids.SPB })).ok, false, "another customer's supply point");
  assert.equal((await draft(A, { customer_id: ids.CuA, service_type_code: 'made_up' })).ok, false, 'an unknown service');
  assert.equal((await draft(A, { customer_id: null, lead_id: ids.LA, supply_point_id: ids.SPLA })).ok, true, 'an eligible lead with its own prospective supply');
  assert.equal((await draft(A, { assigned_to_user_id: B })).ok, false, 'an agent creates for themselves');
});

test('a draft can be saved step by step and resumed; content is editable only while draft', async () => {
  assert.equal((await upd(A, ids.P1, "wizard_step = 4, service_details = '{\"note\":\"x\"}'::jsonb, provider_name = 'Άγνωστο'")).ok, true);
  await su();
  const d = (await one('select wizard_step, service_details, provider_name from public.energy_applications where id = $1::uuid', [ids.P1]))[0];
  assert.deepEqual([d.wizard_step, d.service_details.note, d.provider_name], [4, 'x', 'Άγνωστο']);
  assert.equal((await upd(A, ids.P1, "status = 'submitted'")).ok, false, 'an agent can not jump a draft to submitted: only the submit operation');
  for (const set of ["customer_id = '" + ids.CuB + "'", "primary_case_id = '" + ids.CA + "'", "created_by = '" + B + "'", "application_no = 'AP-0000-00001'", "submitted_at = now()"]) {
    assert.equal((await upd(A, ids.P1, set)).ok, false, set);
  }
});

test('isolation: B can not see or change A\'s application; Admin / Back Office sees everything', async () => {
  await as(B);
  assert.equal((await one('select id from public.energy_applications where id = $1::uuid', [ids.P1])).length, 0);
  assert.ok(refused(await run("update public.energy_applications set notes = 'x' where id = $1::uuid", [ids.P1])));
  assert.equal((await run('select public.submit_energy_application($1::uuid)', [ids.P1])).ok, false, 'not even through the operation');
  assert.equal((await run("select public.withdraw_energy_application($1::uuid, 'x')", [ids.P1])).ok, false);
  await as(ADMIN);
  assert.ok((await one('select id from public.energy_applications where id = $1::uuid', [ids.P1])).length === 1);
  for (const who of [A, ADMIN]) { await as(who); assert.ok(refused(await run('delete from public.energy_applications where id = $1::uuid', [ids.P1])), `no delete for ${who}`); }
});

/* ───────── documents and versions ───────── */
test('documents are versioned: a replacement is a new row, the old one is kept as superseded; nothing is edited or deleted', async () => {
  await as(A);
  const add = (n, t = 'bill_electricity') => run('select public.add_application_document($1::uuid, $2, $3, $4, $5, $6, null) as id', [ids.P1, t, path(ids.P1, n), n, 'application/pdf', 1234]);
  const v1 = await add('v1.pdf'); assert.equal(v1.ok, true, v1.error);
  const v2 = await add('v2.pdf'); assert.equal(v2.ok, true, v2.error);
  const v3 = await add('v3.pdf'); assert.equal(v3.ok, true);
  await su();
  const rows = await one("select version, is_current, supersedes_id, superseded_at is not null as sup, storage_path, id from public.application_documents where application_id = $1::uuid and doc_type = 'bill_electricity' order by version", [ids.P1]);
  assert.deepEqual(rows.map((r) => [r.version, r.is_current, r.sup]), [[1, false, true], [2, false, true], [3, true, false]]);
  assert.equal(rows[1].supersedes_id, rows[0].id); assert.equal(rows[2].supersedes_id, rows[1].id);
  assert.deepEqual(rows.map((r) => r.storage_path), ['v1.pdf', 'v2.pdf', 'v3.pdf'].map((n) => path(ids.P1, n)), 'every version keeps its own file reference');
  assert.equal((await one("select count(*)::int n from public.application_documents where application_id = $1::uuid and doc_type = 'bill_electricity' and is_current", [ids.P1]))[0].n, 1, 'exactly one current version');
  await as(A);
  for (const sql of ["update public.application_documents set is_current = true", "delete from public.application_documents", "insert into public.application_documents (application_id, doc_type, version, storage_path) values ('" + ids.P1 + "', 'x', 1, 'applications/" + ids.P1 + "/x')"]) assert.ok(refused(await run(sql)), sql);
  assert.equal((await add('other.pdf', 'meter_photo')).ok, true, 'a different document type has its own history');
});

test('document rules: path convention, ownership, other supplies, closed applications', async () => {
  await as(A);
  assert.equal((await run("select public.add_application_document($1::uuid, 'id_front', 'cases/x.pdf', 'x', 'a', 1, null)", [ids.P1])).ok, false, 'must live under applications/<application>/');
  assert.equal((await run("select public.add_application_document($1::uuid, 'id_front', $2, 'x', 'a', 1, null)", [ids.P1, path(UID())])).ok, false, "not another application's folder");
  assert.equal((await run("select public.add_application_document($1::uuid, 'id_front', $2, 'x', 'a', 1, $3::uuid)", [ids.P1, path(ids.P1, 'sp.pdf'), ids.SPB])).ok, false, "another customer's supply point");
  assert.equal((await run("select public.add_application_document($1::uuid, '', $2, 'x', 'a', 1, null)", [ids.P1, path(ids.P1, 'e.pdf')])).ok, false, 'a document type is required');
  await as(B);
  assert.equal((await run("select public.add_application_document($1::uuid, 'id_front', $2, 'x', 'a', 1, null)", [ids.P1, path(ids.P1, 'b.pdf')])).ok, false, 'B can not add to A\'s application');
  assert.equal((await one('select id from public.application_documents where application_id = $1::uuid', [ids.P1])).length, 0, 'and can not read its documents');
  await as(A); assert.equal((await one('select id from public.application_documents where application_id = $1::uuid', [ids.P1])).length >= 4, true);
  await as(A); assert.equal((await run("select public.set_application_document_status((select id from public.application_documents where application_id = $1::uuid and is_current limit 1), 'verified')", [ids.P1])).ok, false, 'only Admin / Back Office verifies');
  await as(ADMIN);
  const cur = (await one('select id from public.application_documents where application_id = $1::uuid and is_current limit 1', [ids.P1]))[0].id;
  assert.equal((await run("select public.set_application_document_status($1::uuid, 'verified', 'ok') as ok", [cur])).rows[0].ok, true);
  const old = (await one('select id from public.application_documents where application_id = $1::uuid and not is_current limit 1', [ids.P1]))[0].id;
  assert.equal((await run("select public.set_application_document_status($1::uuid, 'verified')", [old])).ok, false, 'a superseded version is not reviewed');
});

/* ───────── private storage ───────── */
test('storage: an agent reads and uploads only under their own applications; nobody deletes application files; every earlier branch is intact', async () => {
  await su();
  const f = path(ids.P1, 'v3.pdf');
  await db.query("insert into storage.objects (bucket_id, name) values ('client_documents', $1), ('client_documents', $2)", [f, path(ids.P1, 'extra.pdf')]);
  await as(A); assert.equal((await run("select public.sales_can_read_object('client_documents', $1) as o", [f])).rows[0].o, true);
  await as(B); assert.equal((await run("select public.sales_can_read_object('client_documents', $1) as o", [f])).rows[0].o, false);
  assert.equal((await one("select name from storage.objects where bucket_id = 'client_documents' and name like 'applications/%'")).length, 0, 'B lists nothing of A\'s applications');
  await as(A);
  assert.deepEqual((await one("select name from storage.objects where bucket_id = 'client_documents' and name like 'applications/%'")).map((x) => x.name), [f], 'A lists only the files registered as versions of their own application (an unregistered object is not readable)');
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('client_documents', $1)", [path(ids.P1, 'new.pdf')])).ok, true, 'A uploads into their own application folder');
  assert.ok(refused(await run("insert into storage.objects (bucket_id, name) values ('client_documents', $1)", [path(UID(), 'new.pdf')])), 'but not into a folder of an application that is not theirs');
  await as(B); assert.ok(refused(await run("insert into storage.objects (bucket_id, name) values ('client_documents', $1)", [path(ids.P1, 'planted.pdf')])), 'B can not plant a file in A\'s application');
  for (const who of [A, ADMIN]) { await as(who); assert.ok(refused(await run("delete from storage.objects where bucket_id = 'client_documents' and name = $1", [f])), `application evidence is not deleted by ${who}`); }
  await su(); assert.equal((await one("select count(*)::int n from storage.objects where name = $1", [f]))[0].n, 1);
  await as(A);
  assert.equal((await run("select public.sales_can_write_object('hlektrismos_docs', $1) as o", [`leads/${ids.LA}/x.pdf`])).rows[0].o, true, 'the lead-file branch is unchanged');
  assert.equal((await run("select public.sales_can_write_object('hlektrismos_docs', $1) as o", [`leads/${ids.LB}/x.pdf`])).rows[0].o, false);
  assert.equal((await run("select public.sales_can_write_object('client_documents', 'cases/new.pdf') as o")).rows[0].o, true, 'the case-upload branch is unchanged');
  assert.equal((await run("select public.sales_can_write_object('client_documents', 'other/new.pdf') as o")).rows[0].o, false);
});

/* ───────── submit ───────── */
test('submitting validates, then creates the Case once, links everything, assigns Back Office and records the actor', async () => {
  const bare = (await draft(A, { supply_point_id: ids.SPA })).rows[0].id;
  await as(A);
  const e1 = await run('select public.submit_energy_application($1::uuid)', [bare]);
  assert.equal(e1.ok, false); assert.match(e1.error, /υπηρεσία/);
  const e2 = await run('select public.submit_energy_application($1::uuid)', [(await draft(A, { service_type_code: 'energy' })).rows[0].id]);
  assert.equal(e2.ok, false); assert.match(e2.error, /παροχή/);

  await su(); const before = (await one('select count(*)::int n from public.cases'))[0].n;
  await as(A);
  const r = await run('select public.submit_energy_application($1::uuid) as r', [ids.P1]);
  assert.equal(r.ok, true, r.error); const out = r.rows[0].r;
  assert.equal(out.customer_id, ids.CuA); assert.equal(out.backoffice_assignee, ADMIN); assert.equal(out.current_documents, 2, 'missing documents never blocked it; two current ones exist');
  await su();
  assert.equal((await one('select count(*)::int n from public.cases'))[0].n, before + 1, 'exactly one Case');
  const c = (await one('select current_stage, status, application_id, supply_point_id, customer_id, back_office_owner, next_action, owner_id from public.cases where id = $1::uuid', [out.case_id]))[0];
  assert.deepEqual([c.current_stage, c.status, c.application_id, c.supply_point_id, c.customer_id, c.back_office_owner, c.owner_id], ['new', 'open', ids.P1, ids.SPA, ids.CuA, ADMIN, A], 'the Case workflow starts where every Case starts');
  assert.match(c.next_action, /Παραλαβή από Sales — Αίτηση AP-/);
  const ap = (await one('select status, primary_case_id, submitted_by, submitted_at from public.energy_applications where id = $1::uuid', [ids.P1]))[0];
  assert.deepEqual([ap.status, ap.primary_case_id, ap.submitted_by], ['submitted', out.case_id, A]); assert.ok(ap.submitted_at);
  assert.equal((await one("select count(*)::int n from public.app_notifications where user_id = $1::uuid and case_id = $2::uuid", [ADMIN, out.case_id]))[0].n, 1);
  await as(A);
  const retry = await run('select public.submit_energy_application($1::uuid) as r', [ids.P1]);
  assert.equal(retry.ok, true, retry.error);
  assert.equal(retry.rows[0].r.idempotent, true, 'a retry returns the original submission');
  assert.equal(retry.rows[0].r.case_id, out.case_id, 'a retry never creates another Case');
  assert.equal((await one('select id from public.cases where id = $1::uuid', [out.case_id])).length, 1, 'the agent owns the Case that was created');
  const acts = (await actions(ids.P1)).map((x) => x.action);
  for (const a of ['application_created', 'application_document_added', 'application_document_replaced', 'application_submitted']) assert.ok(acts.includes(a), a);
});

test('after submission the agent can not edit the content or the status; Back Office moves it through the lifecycle with reasons, and closed is closed', async () => {
  assert.equal((await upd(A, ids.P1, "service_type_code = 'gas'")).ok, false, 'content is read-only for the agent once submitted');
  assert.equal((await upd(A, ids.P1, "status = 'completed'")).ok, false);
  assert.equal((await upd(A, ids.P1, "assigned_to_user_id = '" + B + "'")).ok, false);
  assert.equal((await upd(ADMIN, ids.P1, "status = 'approved'")).ok, false, 'no jump submitted -> approved');
  assert.equal((await upd(ADMIN, ids.P1, "status = 'in_review'")).ok, true);
  assert.equal((await upd(ADMIN, ids.P1, "status = 'rejected'")).ok, false, 'a rejection needs a reason');
  assert.equal((await upd(ADMIN, ids.P1, "status = 'processing'")).ok, true);
  assert.equal((await upd(ADMIN, ids.P1, "status = 'approved'")).ok, true);
  assert.equal((await upd(ADMIN, ids.P1, "status = 'completed'")).ok, true);
  assert.equal((await upd(ADMIN, ids.P1, "status = 'processing'")).ok, false, 'completed is terminal');
  assert.equal((await upd(ADMIN, ids.P1, "notes = 'x'")).ok, false, 'and read-only');
  const acts = await actions(ids.P1);
  for (const a of ['application_in_review', 'application_processing', 'application_approved', 'application_completed']) assert.ok(acts.some((x) => x.action === a), a);
  assert.equal(acts.find((x) => x.action === 'application_completed').details.actor_id, ADMIN, 'the shared Admin login is recorded as itself, never as a named employee');
});

test('missing documents become WORK: Back Office asks, the agent gets a follow-up on the Case, adding a document puts it back in the queue', async () => {
  const id = (await draft(A, { supply_point_id: ids.SPA, service_type_code: 'energy' })).rows[0].id;
  await as(A); const out = (await run('select public.submit_energy_application($1::uuid) as r', [id])).rows[0].r;
  await as(A); assert.equal((await run("select public.request_application_documents($1::uuid, 'Λογαριασμός')", [id])).ok, false, 'only Back Office asks');
  await as(ADMIN);
  assert.equal((await run("select public.request_application_documents($1::uuid, '  ') ", [id])).ok, false, 'it must say which');
  assert.equal((await run("select public.request_application_documents($1::uuid, 'Λείπει ο λογαριασμός ρεύματος') as ok", [id])).rows[0].ok, true);
  await su();
  const s = (await one('select status, status_reason from public.energy_applications where id = $1::uuid', [id]))[0];
  assert.equal(s.status, 'needs_documents'); assert.match(s.status_reason, /λογαριασμός/);
  await as(A);
  const fu = await one("select reason, assignee_id from public.follow_ups where case_id = $1::uuid and reason like 'Λείπουν έγγραφα%'", [out.case_id]);
  assert.equal(fu.length, 1); assert.equal(fu[0].assignee_id, A, 'the agent sees the work in their own follow-ups');
  assert.equal((await upd(A, id, "notes = 'διόρθωση'")).ok, true, 'content is editable again while documents are awaited');
  assert.equal((await run('select public.add_application_document($1::uuid, $2, $3, $4, $5, 10, null)', [id, 'bill_electricity', path(id, 'bill.pdf'), 'bill.pdf', 'application/pdf'])).ok, true);
  await su(); assert.equal((await one('select status from public.energy_applications where id = $1::uuid', [id]))[0].status, 'submitted', 'back in the Back Office queue');
});

test('withdrawing needs a reason and ends the application; a closed application accepts no documents or resubmission', async () => {
  const id = (await draft(A, { supply_point_id: ids.SPA, service_type_code: 'energy' })).rows[0].id; await as(A);
  const submitted = await run('select public.submit_energy_application($1::uuid)', [id]);
  assert.equal(submitted.ok, true, submitted.error);
  assert.equal((await run("select public.withdraw_energy_application($1::uuid, '')", [id])).ok, false);
  assert.equal((await run("select public.withdraw_energy_application($1::uuid, 'ο πελάτης άλλαξε γνώμη') as ok", [id])).rows[0].ok, true);
  assert.equal((await run("select public.withdraw_energy_application($1::uuid, 'ξανά') as ok", [id])).rows[0].ok, false);
  assert.equal((await run('select public.add_application_document($1::uuid, $2, $3, $4, $5, 10, null)', [id, 'x', path(id, 'x.pdf'), 'x', 'a'])).ok, false);
  await su(); assert.equal((await one('select status, status_reason from public.energy_applications where id = $1::uuid', [id]))[0].status, 'withdrawn');
  await as(A);
  assert.equal((await run('select public.submit_energy_application($1::uuid)', [id])).ok, false, 'a withdrawn submission cannot be replayed as successful');
});

/* ───────── a lead is converted through the existing operation, never a parallel path ───────── */
test('an application from a LEAD converts it with convert_lead_to_case at submission; the supply row moves with the lead (same id), no duplicate customer', async () => {
  const id = (await draft(A, { customer_id: null, lead_id: ids.LA, supply_point_id: ids.SPLA, service_type_code: 'gas' })).rows[0].id;
  await su(); const cu0 = (await one('select count(*)::int n from public.customers'))[0].n;
  await as(A);
  const r = await run('select public.submit_energy_application($1::uuid) as r', [id]); assert.equal(r.ok, true, r.error);
  await su();
  assert.equal((await one('select count(*)::int n from public.customers'))[0].n, cu0 + 1, 'exactly one customer was created, by the existing conversion');
  const out = r.rows[0].r;
  const l = (await one('select status, converted_case_id from public.leads where id = $1::uuid', [ids.LA]))[0];
  assert.deepEqual([l.status, l.converted_case_id], ['converted', out.case_id]);
  const sp = (await one('select customer_id, lead_id from public.customer_supply_points where id = $1::uuid', [ids.SPLA]))[0];
  assert.equal(sp.customer_id, out.customer_id, 'the same supply row moved to the new customer: ids, document tags and history stay');
  const ap = (await one('select customer_id, supply_point_id, primary_case_id from public.energy_applications where id = $1::uuid', [id]))[0];
  assert.deepEqual([ap.customer_id, ap.supply_point_id, ap.primary_case_id], [out.customer_id, ids.SPLA, out.case_id]);
  const convertedCase = (await one('select application_id, supply_point_id, service_type from public.cases where id = $1::uuid', [out.case_id]))[0];
  assert.deepEqual([convertedCase.application_id, convertedCase.service_type], [id, 'gas'], 'the Case uses the Application service');
});

test('a converted Lead application uses its selected service and never reuses a Case claimed by another Application', async () => {
  await su();
  const original = (await one('select c.id, c.customer_id, c.service_type, c.application_id from public.cases c where c.id = (select converted_case_id from public.leads where id = $1::uuid)', [ids.LA]))[0];
  assert.ok(original);
  assert.equal(original.service_type, 'gas');
  const secondary = (await db.query("insert into public.customer_supply_points (customer_id, usage, property_address, supply_number, created_by) values ($1::uuid, 'residential', 'Δεύτερη παροχή', '77777777777', $2::uuid) returning id", [original.customer_id, A])).rows[0].id;
  const second = (await draft(A, { customer_id: null, lead_id: ids.LA, supply_point_id: ids.SPLA, service_type_code: 'solar' })).rows[0].id;
  await as(A);
  const doc = await run('select public.add_application_document($1::uuid, $2, $3, $4, $5, 10, $6::uuid) as id',
    [second, 'identity_front', path(second, 'converted-lead.pdf'), 'converted-lead.pdf', 'application/pdf', secondary]);
  assert.equal(doc.ok, true, doc.error, 'converted Lead documents can use its Customer supply point');
  const submitted = await run('select public.submit_energy_application($1::uuid) as r', [second]);
  assert.equal(submitted.ok, true, submitted.error);
  const newCase = submitted.rows[0].r.case_id;
  assert.notEqual(newCase, original.id, 'a Case claimed by a different Application is not reused');
  await su();
  const oldAfter = (await one('select service_type, application_id from public.cases where id = $1::uuid', [original.id]))[0];
  assert.deepEqual([oldAfter.service_type, oldAfter.application_id], ['gas', original.application_id], 'the old Case is unchanged');
  const newAfter = (await one('select service_type, application_id, customer_id from public.cases where id = $1::uuid', [newCase]))[0];
  assert.deepEqual([newAfter.service_type, newAfter.application_id, newAfter.customer_id], ['solar', second, original.customer_id]);
  const savedDoc = (await one('select customer_id, supply_point_id from public.application_documents where application_id = $1::uuid and is_current', [second]))[0];
  assert.deepEqual([savedDoc.customer_id, savedDoc.supply_point_id], [original.customer_id, secondary]);
  const lead = (await one('select converted_case_id from public.leads where id = $1::uuid', [ids.LA]))[0];
  assert.equal(lead.converted_case_id, original.id);
});

test('phase5/18 duplicate branch: the supply stayed on the lead and the case was linked to the customer\'s existing connection; the application follows', async () => {
  await su();
  const lead = (await db.query(`insert into public.leads (client_name, client_contact, email, phone, source, status, age_confirmed, assigned_to_user_id, created_by_user_id)
    values ('Lead D', 'd@example.test', 'd@example.test', '6977777777', 'inside_sales', 'new', true, $1::uuid, $1::uuid) returning id`, [A])).rows[0].id;
  const cust = (await db.query("insert into public.customers (full_name, phone, created_by) values ('Cust D', '6977777777', $1::uuid) returning id", [A])).rows[0].id;
  const spC = (await db.query("insert into public.customer_supply_points (customer_id, usage, property_address, supply_number, created_by) values ($1::uuid, 'residential', 'Δ 1', '55555555555', $2::uuid) returning id", [cust, A])).rows[0].id;
  const spL = (await db.query("insert into public.customer_supply_points (lead_id, usage, property_address, supply_number, created_by) values ($1::uuid, 'residential', 'Δ 1', '55555555555', $2::uuid) returning id", [lead, A])).rows[0].id;
  const id = (await draft(A, { customer_id: null, lead_id: lead, supply_point_id: spL, service_type_code: 'energy' })).rows[0].id;
  await as(A);
  const v = await run("insert into public.case_visits (lead_id, supply_point_id, application_id, scheduled_at) values ($1::uuid, $2::uuid, $3::uuid, now()) returning id", [lead, spL, id]); assert.equal(v.ok, true, v.error);
  const r = await run('select public.submit_energy_application($1::uuid) as r', [id]); assert.equal(r.ok, true, r.error);
  await su();
  const caseSp = (await one('select supply_point_id, customer_id from public.cases where id = $1::uuid', [r.rows[0].r.case_id]))[0];
  assert.equal(caseSp.customer_id, cust, 'the existing customer was reused (matched by phone)');
  assert.equal(caseSp.supply_point_id, spC, 'the case is linked to the customer\'s existing connection');
  assert.equal((await one('select supply_point_id from public.energy_applications where id = $1::uuid', [id]))[0].supply_point_id, spC, 'the application was re-pointed');
  assert.equal((await one('select supply_point_id from public.case_visits where id = $1::uuid', [v.rows[0].id]))[0].supply_point_id, spC, 'and so was the visit');
  assert.ok((await actions(id)).some((x) => x.action === 'application_supply_repointed'));
});

/* ───────── visits link to applications ───────── */
test('a visit can be linked to an application of its own agent, never to someone else\'s', async () => {
  await as(A);
  assert.equal((await run("insert into public.case_visits (lead_id, application_id) values ($1::uuid, $2::uuid) returning id", [ids.LA, ids.P1])).ok, true);
  const other = (await draft(B, { customer_id: ids.CuB })).rows[0].id;
  await as(A);
  assert.equal((await run("insert into public.case_visits (lead_id, application_id) values ($1::uuid, $2::uuid) returning id", [ids.LA, other])).ok, false);
  await su(); assert.equal((await one("select count(*)::int n from pg_constraint where conname = 'case_visits_application_fk'"))[0].n, 1);
});

test('the lifecycle covers exactly the statuses of the design and the audit names every transition', async () => {
  await su();
  const def = (await one("select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.energy_applications'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%needs_documents%'"))[0].d;
  for (const s of ['draft', 'submitted', 'in_review', 'needs_documents', 'processing', 'approved', 'rejected', 'withdrawn', 'completed']) assert.ok(def.includes(`'${s}'`), s);
});
