// Stage 2A: Sales Agent record isolation. LOCAL verification (PGlite); NOT staging or production.
// The database is the REAL migration chain + Stage 1 + every later staged file (APPLY_ORDER steps 1..23), so the
// starting point already includes phase4/18. Then:
//   BEFORE: the gaps phase4/18 leaves open are reproduced (Agent A reaches Agent B's data, rewrites ownership,
//           verifies documents with a forged reviewer, and uses SECURITY DEFINER RPCs on B's ids).
//   APPLY : phase4/21 twice (idempotency).
//   AFTER : each gap is closed for the two sales roles, while Back Office (admin / back_office) keeps every
//           ability, trusted SECURITY DEFINER flows still work, and the service role is unaffected.
// The two application categories are unchanged: «Admin / Back Office» = admin, manager, back_office;
// «Πωλητής» = inside_sales, field_sales. No new role is introduced.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { replayMigrations, applyStaged, STAGE1_FILES, LATER_FILES, identity, attempt, readRepo } from './helpers/replay-migrations.mjs';

const PHASE4_21 = 'supabase/staged-migrations/phase4/21_sales_isolation_completion.sql';
const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const OFFICE = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const A = 'aaaaaaaa-0000-4000-8000-0000000000c1'; // inside_sales
const B = 'aaaaaaaa-0000-4000-8000-0000000000c2'; // field_sales

let db; let as; let run;
const ids = {};
const n = async (sql, params) => { const r = await run(sql, params); return r.ok ? r.rows.length : -1; };
const denied = (r) => !r.ok || r.n === 0;
const names = async (bucket) => { const r = await run('select name from storage.objects where bucket_id = $1 order by name', [bucket]); return r.ok ? r.rows.map((x) => x.name) : []; };

before(async () => {
  ({ db } = await replayMigrations());
  await applyStaged(db, [...STAGE1_FILES, ...LATER_FILES]);
  as = identity(db);
  run = (sql, params) => attempt(db, sql, params);

  await as(null);
  for (const [id, role] of [[ADMIN, 'admin'], [OFFICE, 'back_office'], [A, 'inside_sales'], [B, 'field_sales']]) {
    await db.query('insert into auth.users (id) values ($1::uuid)', [id]);
    await db.query(`insert into public.profiles (id, full_name, role, is_active) values ($1::uuid, 'Test', $2::text, true)
      on conflict (id) do update set role = excluded.role, is_active = true`, [id, role]);
  }
  const one = async (sql, params) => (await db.query(sql, params)).rows[0].id;
  const lead = (owner, file) => one(`insert into public.leads (client_name, client_contact, email, phone, source, status, age_confirmed,
      assigned_to_user_id, created_by_user_id, attached_files) values ('Lead', 'x@example.test', 'x@example.test', '6900000000',
      'inside_sales', 'new', true, $1::uuid, $1::uuid, $2::jsonb) returning id`, [owner, JSON.stringify(file ? [{ path: file, name: 'bill.pdf' }] : [])]);
  ids.LA = await lead(A, 'contact-forms/fa.pdf');
  ids.LA2 = await lead(A, null);
  ids.LB = await lead(B, 'contact-forms/fb.pdf');
  ids.LB2 = await lead(B, null);
  ids.CuA = await one("insert into public.customers (full_name, created_by) values ('Cust A', $1::uuid) returning id", [A]);
  ids.CuB = await one("insert into public.customers (full_name, created_by) values ('Cust B', $1::uuid) returning id", [B]);
  const kase = (owner, cust, lead) => one(`insert into public.cases (title, owner_id, created_by, customer_id, lead_id, current_stage, status)
      values ('Case', $1::uuid, $1::uuid, $2::uuid, $3::uuid, 'document_check', 'open') returning id`, [owner, cust, lead]);
  ids.CA = await kase(A, ids.CuA, ids.LA);
  ids.CB = await kase(B, ids.CuB, ids.LB);
  const doc = (kc, url) => one("insert into public.case_documents (case_id, category, file_url, status) values ($1::uuid, 'energy_bill', $2, 'received') returning id", [kc, url]);
  ids.DA = await doc(ids.CA, 'cases/1_a.pdf');
  ids.DB = await doc(ids.CB, 'cases/2_b.pdf');
  ids.DBW = await doc(ids.CB, 'hlektrismos_docs/contact-forms/fb.pdf');
  ids.OA = await one("insert into public.case_offers (case_id, created_by) values ($1::uuid, $2::uuid) returning id", [ids.CA, A]);
  ids.OB = await one("insert into public.case_offers (case_id, created_by) values ($1::uuid, $2::uuid) returning id", [ids.CB, B]);
  ids.SA = await one('insert into public.case_signatures (case_id) values ($1::uuid) returning id', [ids.CA]);
  ids.SB = await one('insert into public.case_signatures (case_id) values ($1::uuid) returning id', [ids.CB]);
  for (const [c, by] of [[ids.CuA, A], [ids.CuB, B]]) {
    await db.query("insert into public.consent_records (customer_id, channel, status, consent_type, created_by) values ($1::uuid, 'email', 'granted', 'marketing', $2::uuid)", [c, by]);
  }
  for (const who of [A, B]) {
    await db.query("insert into public.work_items (subject, assignee_id, created_by) values ('Task', $1::uuid, $1::uuid)", [who]);
  }
  const legacy = await one("insert into public.hlektrismos_leads (first_name, last_name, phone, email, region, customer_type, provider, consent, age_confirmed) values ('L', 'L', '1', 'l@example.test', 'Attica', 'residential', 'X', true, true) returning id");
  await db.query("insert into public.lead_notes (lead_id, content) values ($1::uuid, 'private legacy note')", [legacy]);
  // client_documents is created in the Supabase dashboard (no migration defines it), so its live policies are unknown.
  // The fixture assumes the most open plausible case: every active staff account may read and upload.
  await db.exec(`
    create policy "fixture: staff use client_documents" on storage.objects for all to authenticated
      using (bucket_id = 'client_documents' and public.is_staff()) with check (bucket_id = 'client_documents' and public.is_staff());
    insert into storage.objects (bucket_id, name) values
      ('hlektrismos_docs', 'leads/${ids.LA}/a.pdf'), ('hlektrismos_docs', 'leads/${ids.LB}/b.pdf'),
      ('hlektrismos_docs', 'contact-forms/fa.pdf'), ('hlektrismos_docs', 'contact-forms/fb.pdf'),
      ('client_documents', 'cases/1_a.pdf'), ('client_documents', 'cases/2_b.pdf'), ('energy-bills', 'old.pdf');
  `);
});

// ───────────────────────────────────────────── BEFORE ─────────────────────────────────────────────
test('BEFORE (phase4/18 applied): Agent A reads Agent B\'s offers, signatures, consents, work items, legacy notes and files', async () => {
  await as(A);
  assert.equal(await n('select id from public.case_offers where case_id = $1', [ids.CB]), 1, 'B\'s offer');
  assert.equal(await n('select id from public.case_signatures where case_id = $1', [ids.CB]), 1, 'B\'s signature');
  assert.equal(await n('select id from public.consent_records where customer_id = $1', [ids.CuB]), 1, 'B\'s customer consent');
  assert.equal(await n('select id from public.work_items where assignee_id = $1', [B]), 1, 'B\'s work item');
  assert.ok((await n('select id from public.lead_notes')) > 0, 'legacy private notes');
  const docs = await names('hlektrismos_docs');
  assert.ok(docs.includes(`leads/${ids.LB}/b.pdf`) && docs.includes('contact-forms/fb.pdf'), 'B\'s lead files');
  assert.ok((await names('client_documents')).includes('cases/2_b.pdf'), 'B\'s case file');
});

test('BEFORE: Agent A can hand their lead to B, and can verify a document naming someone else as reviewer', async () => {
  await as(A);
  assert.equal((await run('update public.leads set assigned_to_user_id = $1 where id = $2', [B, ids.LA])).n, 1, 'reassigned own lead');
  assert.equal((await run("update public.case_documents set status = 'verified', verified_by = $1 where id = $2", [ADMIN, ids.DA])).n, 1, 'forged verification');
  await as(null);
  await db.query("update public.leads set assigned_to_user_id = $1 where id = $2", [A, ids.LA]);
  await db.query("update public.case_documents set status = 'received', verified_by = null, verified_at = null where id = $1", [ids.DA]);
});

test('BEFORE: SECURITY DEFINER RPCs act on another agent\'s ids', async () => {
  await as(A);
  assert.equal((await run("select public.set_case_exception($1::uuid, 'no_response', 'probe note')", [ids.CB])).ok, true, 'exception on B\'s case');
  assert.equal((await run("select public.case_document_blockers($1::uuid, 'application')", [ids.CB])).ok, true, 'B\'s checklist');
  assert.equal((await run('select public.field_sales_metrics($1::uuid, 30)', [B])).ok, true, 'B\'s metrics');
  const conv = await run('select public.convert_lead_to_case($1::uuid) as id', [ids.LB2]);
  assert.equal(conv.ok, true, conv.error);
  await as(null);
  assert.equal((await db.query('select status from public.leads where id = $1', [ids.LB2])).rows[0].status, 'converted', 'A converted B\'s lead');
  // reset for the AFTER checks
  await db.query("update public.cases set exception_state = null, exception_note = null where id = $1", [ids.CB]);
  await db.query('delete from public.timeline_events where case_id = (select converted_case_id from public.leads where id = $1)', [ids.LB2]);
  const conv2 = (await db.query('select converted_case_id from public.leads where id = $1', [ids.LB2])).rows[0].converted_case_id;
  await db.query("update public.leads set status = 'new', converted_case_id = null, converted_at = null, converted_by_user_id = null where id = $1", [ids.LB2]);
  await db.query('delete from public.cases where id = $1', [conv2]);
});

// ───────────────────────────────────────────── APPLY ─────────────────────────────────────────────
test('APPLY: phase4/21 applies cleanly and is idempotent (second run)', async () => {
  for (const pass of [1, 2]) {
    await as(null);
    let error = null;
    try { await db.exec(readRepo(PHASE4_21)); } catch (e) { error = e.message; }
    assert.equal(error, null, `pass ${pass}`);
  }
  const moved = (await db.query("select count(*)::int c from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'")).rows[0].c;
  assert.equal(moved, 5, 'the five originals live in private exactly once');
});

// ───────────────────────────────────────────── AFTER ─────────────────────────────────────────────
test('AFTER: Agent A sees only their own records in every table and bucket', async () => {
  await as(A);
  assert.deepEqual((await run('select id from public.case_offers')).rows.map((r) => r.id), [ids.OA]);
  assert.deepEqual((await run('select id from public.case_signatures')).rows.map((r) => r.id), [ids.SA]);
  assert.equal(await n('select id from public.consent_records'), 1);
  assert.equal(await n('select id from public.consent_records where customer_id = $1', [ids.CuB]), 0);
  assert.equal(await n('select id from public.work_items'), 1);
  assert.equal(await n('select id from public.lead_notes'), 0, 'legacy notes are Back Office only');
  assert.equal(await n('select id from public.leads where id = $1', [ids.LB]), 0);
  assert.equal(await n('select id from public.cases where id = $1', [ids.CB]), 0);
  assert.equal(await n('select id from public.case_documents where case_id = $1', [ids.CB]), 0);
  assert.deepEqual(await names('hlektrismos_docs'), ['contact-forms/fa.pdf', `leads/${ids.LA}/a.pdf`]);
  assert.deepEqual(await names('client_documents'), ['cases/1_a.pdf']);
  assert.deepEqual(await names('energy-bills'), []);
});

test('AFTER: Agent A cannot change or add to Agent B\'s records by id, payload or folder', async () => {
  await as(A);
  assert.ok(denied(await run("update public.case_offers set status = 'sent' where id = $1", [ids.OB])));
  assert.ok(denied(await run("update public.case_signatures set status = 'signed' where id = $1", [ids.SB])));
  assert.ok(denied(await run("insert into public.case_offers (case_id, created_by) values ($1::uuid, $2::uuid)", [ids.CB, A])), 'offer on B\'s case');
  assert.ok(denied(await run("insert into public.consent_records (customer_id, channel, status, consent_type, created_by) values ($1::uuid, 'sms', 'granted', 'marketing', $2::uuid)", [ids.CuB, B])));
  assert.ok(denied(await run("update public.leads set comments = 'x' where id = $1", [ids.LB])));
  assert.ok(denied(await run("insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', $1)", [`leads/${ids.LB}/planted.pdf`])), 'B\'s lead folder');
  assert.ok(denied(await run("insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', 'contact-forms/x.pdf')")), 'contact-forms (website only)');
  assert.ok(denied(await run("delete from storage.objects where bucket_id = 'client_documents' and name = 'cases/2_b.pdf'")));
  assert.ok(denied(await run("insert into storage.objects (bucket_id, name) values ('energy-bills', 'x.pdf')")));
});

test('AFTER: Agent A works normally on their own records and uploads to their own folder', async () => {
  await as(A);
  assert.equal((await run("update public.leads set comments = 'called' where id = $1", [ids.LA])).n, 1);
  assert.equal((await run("update public.case_offers set status = 'sent' where id = $1", [ids.OA])).n, 1);
  assert.equal((await run("insert into public.case_offers (case_id, created_by) values ($1::uuid, $2::uuid)", [ids.CA, A])).ok, true);
  const mine = await run(`insert into public.leads (client_name, client_contact, source, status, age_confirmed, assigned_to_user_id, created_by_user_id)
    values ('New', 'n@example.test', 'inside_sales', 'new', true, $1::uuid, $1::uuid) returning id`, [A]);
  assert.equal(mine.ok, true, mine.error);
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('hlektrismos_docs', $1)", [`leads/${ids.LA}/new.pdf`])).ok, true);
  assert.equal((await run("insert into storage.objects (bucket_id, name) values ('client_documents', 'cases/3_new.pdf')")).ok, true, 'case upload (no case id in path)');
  const d = await run("insert into public.case_documents (case_id, category, file_url, status) values ($1::uuid, 'gov_id', 'cases/3_new.pdf', 'received') returning verified_by", [ids.CA]);
  assert.equal(d.ok, true, d.error);
  assert.equal(d.rows[0].verified_by, null);
});

test('AFTER: a Sales Agent cannot reassign records or rewrite ownership fields', async () => {
  await as(A);
  for (const [sql, params] of [
    ['update public.leads set assigned_to_user_id = $1 where id = $2', [B, ids.LA]],
    ['update public.leads set created_by_user_id = $1 where id = $2', [B, ids.LA]],
    ['update public.cases set owner_id = $1 where id = $2', [B, ids.CA]],
    ['update public.cases set back_office_owner = $1 where id = $2', [OFFICE, ids.CA]],
    ['update public.cases set customer_id = $1 where id = $2', [ids.CuB, ids.CA]],
    ['update public.cases set lead_id = $1 where id = $2', [ids.LA2, ids.CA]],
    ['update public.customers set created_by = $1 where id = $2', [B, ids.CuA]],
    [`insert into public.leads (client_name, client_contact, source, status, age_confirmed, assigned_to_user_id, created_by_user_id)
       values ('Planted', 'p@example.test', 'inside_sales', 'new', true, $1::uuid, $2::uuid)`, [B, A]],
  ]) {
    const r = await run(sql, params);
    assert.ok(denied(r), sql);
  }
  await as(null);
  const lead = (await db.query('select assigned_to_user_id a, created_by_user_id c from public.leads where id = $1', [ids.LA])).rows[0];
  assert.deepEqual(lead, { a: A, c: A });
  assert.equal((await db.query('select owner_id from public.cases where id = $1', [ids.CA])).rows[0].owner_id, A);
});

test('AFTER: document verification is Back Office only, and the reviewer is set by the database', async () => {
  await as(A);
  assert.ok(denied(await run("update public.case_documents set status = 'verified' where id = $1", [ids.DA])), 'sales cannot verify');
  assert.ok(denied(await run('update public.case_documents set verified_by = $1 where id = $2', [ADMIN, ids.DA])), 'sales cannot forge');
  assert.ok(denied(await run("insert into public.case_documents (case_id, category, status) values ($1::uuid, 'gov_id', 'verified')", [ids.CA])));
  await as(OFFICE);
  const v = await run("update public.case_documents set status = 'verified', verified_by = $1 where id = $2 returning verified_by, verified_at", [ADMIN, ids.DA]);
  assert.equal(v.ok, true, v.error);
  assert.equal(v.rows[0].verified_by, OFFICE, 'reviewer = the signed-in Back Office user, not the payload');
  assert.ok(v.rows[0].verified_at, 'timestamp set by the database');
  const back = await run("update public.case_documents set status = 'received' where id = $1 returning verified_at", [ids.DA]);
  assert.equal(back.rows[0].verified_at, null);
});

test('AFTER: SECURITY DEFINER RPCs refuse another agent\'s ids but keep working on your own', async () => {
  await as(A);
  for (const [sql, p] of [
    ['select public.convert_lead_to_case($1::uuid)', [ids.LB2]],
    ['select public.route_lead_to_backoffice($1::uuid)', [ids.LB]],
    ["select public.set_case_exception($1::uuid, 'no_response', 'probe note')", [ids.CB]],
    ["select public.case_document_blockers($1::uuid, 'application')", [ids.CB]],
    ['select public.field_sales_metrics($1::uuid, 30)', [B]],
  ]) {
    const r = await run(sql, p);
    assert.equal(r.ok, false, sql);
    assert.match(r.error, /Not your/);
  }
  await as(null);
  assert.equal((await db.query('select status from public.leads where id = $1', [ids.LB2])).rows[0].status, 'new', 'B\'s lead untouched');

  await as(A);
  assert.equal((await run("select public.case_document_blockers($1::uuid, 'application')", [ids.CA])).ok, true, 'own case');
  assert.equal((await run('select public.field_sales_metrics(null, 30)')).ok, true, 'own metrics');
  const conv = await run('select public.convert_lead_to_case($1::uuid) as id', [ids.LA2]);
  assert.equal(conv.ok, true, conv.error);
  const routed = await run('select public.route_lead_to_backoffice($1::uuid)', [ids.LA]);
  assert.equal(routed.ok, true, routed.error);
  // The originals are not reachable directly through the API schema.
  assert.equal((await run("select count(*)::int c from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'convert_lead_to_case' and p.prosecdef")).rows[0].c, 0);
});

test('AFTER: Back Office keeps full access and can reassign; the service role is unaffected', async () => {
  for (const who of [ADMIN, OFFICE]) {
    await as(who);
    assert.ok((await n('select id from public.case_offers')) >= 3, `${who}: all offers`);
    assert.ok((await n('select id from public.lead_notes')) >= 1, `${who}: legacy notes`);
    assert.ok((await names('hlektrismos_docs')).includes(`leads/${ids.LB}/b.pdf`), `${who}: all lead files`);
    assert.ok((await names('client_documents')).includes('cases/2_b.pdf'), `${who}: all case files`);
  }
  await as(ADMIN);
  assert.equal((await run('update public.leads set assigned_to_user_id = $1 where id = $2', [B, ids.LA2])).n, 1, 'office reassigns');
  assert.equal((await run("select public.set_case_exception($1::uuid, 'no_response', 'office note')", [ids.CB])).ok, true, 'office on any case');
  await as('service_role');
  assert.ok((await n('select id from public.case_signatures')) >= 2);
});

test('AFTER: the scope status reported to the app lists the new tables', async () => {
  await as(A);
  const s = (await run('select public.sales_scope_status() as s')).rows[0].s;
  assert.equal(s.enabled, true);
  for (const t of ['case_offers', 'case_signatures', 'consent_records', 'lead_notes', 'leads']) assert.ok(s.tables.includes(t), t);
});

test('ROLLBACK: the rollback script restores the previous behaviour, and phase4/21 can then be re-applied', async () => {
  await as(null);
  await db.exec(readRepo('docs/ops/rollback_phase4_21_sales_isolation_completion.sql'));
  assert.equal((await db.query("select count(*)::int c from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private'")).rows[0].c, 0);
  assert.equal((await db.query("select prosecdef from pg_proc where oid = to_regprocedure('public.convert_lead_to_case(uuid)')")).rows[0].prosecdef, true);
  await as(A);
  assert.equal(await n('select id from public.case_offers where case_id = $1', [ids.CB]), 1, 'rolled back: B\'s offer visible again');
  await as(null);
  await db.exec(readRepo(PHASE4_21));
  await as(A);
  assert.equal(await n('select id from public.case_offers where case_id = $1', [ids.CB]), 0, 're-applied');
  assert.equal((await run('select public.convert_lead_to_case($1::uuid)', [ids.LB2])).ok, false);
});
