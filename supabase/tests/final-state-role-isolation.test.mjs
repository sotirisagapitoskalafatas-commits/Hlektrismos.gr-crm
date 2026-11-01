// RELEASE GATE (local): the WHOLE intended chain in its FINAL state (two roles: Admin / Back Office and Sales Agent), exercised from four separate sessions:
// the Admin, Sales Agent A, Sales Agent B and an anonymous visitor. Anonymous denial alone proves nothing about isolation between authenticated users,
// so every check below runs as a different signed-in identity against the same database.
//
// What this is NOT: staging or production. It replays the repository's own migrations plus the STAGED files on embedded Postgres (PGlite). Whether the live
// database already has these files is a separate fact (docs/ops/pending_migrations_check.sql, run by the owner). Real Supabase Auth/PostgREST are not involved.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { replayMigrations, applyStaged, STAGE1_FILES, identity, attempt, readRepo } from './helpers/replay-migrations.mjs';

// Production BEFORE the rollout: docs/ops/APPLY_ORDER.md, «Corrections found on 30 Oct 2026», says these are already live (phase1/20 applied on 30 Oct).
const ALREADY_LIVE = ['phase1/20_crm_integrations_emergency_hotfix', 'phase1/03_drop_exec_sql', 'phase5/17_customer_supply_points', 'phase5/18_lead_supply_points'];
// The rollout, in the order of docs/ops/APPLY_ORDER.md (steps 0b, 0c, 1, 2, 2b, 2c, 2d, 2e, 3, 25, 5, 8, 9, 10, 16, 17, 18, 18b, 18c, 22, 22b, 27, 28, 29).
// Files the document lists but this gate does not need (cron, import, saved routes, preferences …) are left out; a test below proves the order is the document's.
const ROLLOUT = ['phase1/21b_function_rate_limits', 'phase1/21c_lead_webhook_idempotency', ...STAGE1_FILES, 'phase2/05_staff_admin_and_role_preview', 'phase6/21_two_role_model',
  'phase1/02_outreach_decisions_audit', 'phase2/06_trash_leads_customers', 'phase2/07a_document_checklist_and_return', 'phase2/07b_case_stage_guard_and_set_stage', 'phase4/10_field_checkin_manual_flag', 'phase4/12_default_backoffice_assignee', 'phase4/14_follow_up_kind',
  'phase3/08_b2b_prospects_review_distribution', 'phase3/09_contact_eligibility', 'phase3/10_offer_lifecycle', 'phase3/11_contact_service_requests', 'phase4/18_sales_own_records_scope', 'phase4/21_sales_isolation_completion'];
const BEFORE_ROLES = [...ALREADY_LIVE, ...ROLLOUT];
const FINAL = ['phase6/25_exact_two_roles', 'phase6/26_single_active_admin', 'phase6/27_credentials_write_only', // steps 27, 28, 29
  'phase7/01_standalone_field_visits', 'phase7/02_energy_applications']; // steps 30, 31: Field Visits and Energy Applications (docs/product/FIELD_VISITS_AND_APPLICATIONS.md)

const U = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = U(1), A = U(2), B = U(3), NEWBIE = U(9);
let db, as, run; const ids = {};
const one = async (sql, p) => (await db.query(sql, p)).rows;
const su = () => as(null);
/** The profile table as the service role sees it: id -> [role, is_active]. */
const roster = async () => { await su(); return Object.fromEntries((await one('select id, role, is_active from public.profiles')).map((r) => [r.id, `${r.role}/${r.is_active}`])); };
/** A write counts as REFUSED when it errors or touches no row. `select`-style calls count as refused only when they raise. */
const refused = (r) => !r.ok || r.n === 0;

before(async () => {
  ({ db } = await replayMigrations());
  as = identity(db); run = (sql, p) => attempt(db, sql, p);
  await db.exec(`alter table auth.users add column if not exists last_sign_in_at timestamptz, add column if not exists email_confirmed_at timestamptz, add column if not exists invited_at timestamptz,
    add column if not exists banned_until timestamptz, add column if not exists is_sso_user boolean, add column if not exists deleted_at timestamptz, add column if not exists updated_at timestamptz;
    create table if not exists auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid);`);
  await applyStaged(db, BEFORE_ROLES);

  await su();
  for (const [id, role, email] of [[ADMIN, 'admin', 'office@example.invalid'], [A, 'inside_sales', 'agent.a@example.invalid'], [B, 'field_sales', 'agent.b@example.invalid'], [NEWBIE, 'inside_sales', 'newbie@example.invalid']]) {
    await db.query('insert into auth.users (id, email, email_confirmed_at, last_sign_in_at) values ($1::uuid, $2, now(), now())', [id, email]);
    await db.query(`insert into public.profiles (id, full_name, role, is_active) values ($1::uuid, $2, $3, $4)
      on conflict (id) do update set role = excluded.role, is_active = excluded.is_active, full_name = excluded.full_name`, [id, email.split('@')[0], role, id !== NEWBIE]);
  }
  await db.query('insert into auth.identities (user_id) values ($1::uuid)', [ADMIN]); // phase6/26 refuses to lock in an Admin who cannot sign in
  const ins = async (sql, p) => (await db.query(sql, p)).rows[0].id;
  const lead = (owner) => ins(`insert into public.leads (client_name, client_contact, email, phone, source, status, age_confirmed, assigned_to_user_id, created_by_user_id)
    values ('Lead', 'x@example.test', 'x@example.test', '6900000000', 'inside_sales', 'new', true, $1::uuid, $1::uuid) returning id`, [owner]);
  ids.LA = await lead(A); ids.LB = await lead(B);
  ids.CuA = await ins("insert into public.customers (full_name, created_by) values ('Cust A', $1::uuid) returning id", [A]);
  ids.CuB = await ins("insert into public.customers (full_name, created_by) values ('Cust B', $1::uuid) returning id", [B]);
  const kase = (owner, cust, lead) => ins(`insert into public.cases (title, owner_id, created_by, customer_id, lead_id, current_stage, status)
    values ('Case', $1::uuid, $1::uuid, $2::uuid, $3::uuid, 'document_check', 'open') returning id`, [owner, cust, lead]);
  ids.CA = await kase(A, ids.CuA, ids.LA); ids.CB = await kase(B, ids.CuB, ids.LB);
  for (const [c, who] of [[ids.CA, A], [ids.CB, B]]) await db.query("insert into public.follow_ups (case_id, due_at, assignee_id, created_by, status) values ($1::uuid, now() + interval '1 day', $2::uuid, $2::uuid, 'open')", [c, who]);
  await db.query("insert into public.case_documents (case_id, category, file_url, status) values ($1::uuid, 'energy_bill', 'cases/a.pdf', 'received'), ($2::uuid, 'energy_bill', 'cases/b.pdf', 'received')", [ids.CA, ids.CB]);
  for (const [c, who] of [[ids.CA, A], [ids.CB, B]]) {
    await db.query('insert into public.case_offers (case_id, created_by) values ($1::uuid, $2::uuid)', [c, who]);
    await db.query('insert into public.case_signatures (case_id) values ($1::uuid)', [c]);
    await db.query("insert into public.work_items (subject, assignee_id, created_by) values ('Task', $1::uuid, $1::uuid)", [who]);
  }
  for (const [c, who] of [[ids.CuA, A], [ids.CuB, B]]) await db.query("insert into public.consent_records (customer_id, channel, status, consent_type, created_by) values ($1::uuid, 'email', 'granted', 'marketing', $2::uuid)", [c, who]);
  const legacy = (await db.query("insert into public.hlektrismos_leads (first_name, last_name, phone, email, region, customer_type, provider, consent, age_confirmed) values ('L', 'L', '1', 'l@example.test', 'Attica', 'residential', 'X', true, true) returning id")).rows[0].id;
  await db.query("insert into public.lead_notes (lead_id, content) values ($1::uuid, 'private legacy note')", [legacy]);
  await db.query(`insert into public.crm_settings (setting_key, setting_value) values ('SERPAPI_API_KEY', '"serp-SECRET-VALUE"'), ('RESEND_API_KEY', '"re_SECRET"'), ('IMAP_PASSWORD', '"imap-SECRET"'),
    ('role_permissions', '{}'), ('theme', '"navy"') on conflict (setting_key) do update set setting_value = excluded.setting_value`);
  await db.query("insert into public.crm_integrations (id, name, connected, config) values ('serpapi', 'SerpApi', true, '{\"api_key\":\"cfg-SECRET\"}') on conflict (id) do update set config = excluded.config");
  for (const f of FINAL) await applyStaged(db, [f]);
});

/* ───────── 0. the state under test ───────── */
test('the chain ends in exactly two roles, one active Admin, and the guard in place', async () => {
  await su();
  const r = Object.fromEntries((await one('select role, count(*)::int n from public.profiles group by role')).map((x) => [x.role, x.n]));
  assert.deepEqual(Object.keys(r).sort(), ['admin', 'sales_agent'], 'no manager, back_office, inside_sales or field_sales is left');
  assert.equal(r.admin, 1);
  assert.equal((await one("select count(*)::int n from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_guard_privileged' and not tgisinternal"))[0].n, 1);
});

test('the chain is the order of docs/ops/APPLY_ORDER.md, not an improvised one', () => {
  const doc = readRepo('docs/ops/APPLY_ORDER.md');
  const order = [...doc.matchAll(/^## [0-9a-z]+\. `((?:phase\d)\/[a-z0-9_]+)\.sql`/gm)].map((m) => m[1]);
  assert.ok(order.length >= 28, `parsed ${order.length} steps from the document`);
  // The document's own correction (30 Oct): phase6/21 is applied immediately after phase2/05 (step 3), not at its numbered place.
  const pos = (f) => (f === 'phase6/21_two_role_model' ? order.indexOf('phase2/05_staff_admin_and_role_preview') + 0.5 : order.indexOf(f));
  const chain = [...ROLLOUT, ...FINAL];
  assert.deepEqual(chain.filter((f) => pos(f) < 0), [], 'every file of the chain is a step of the document');
  const positions = chain.map(pos);
  assert.deepEqual(positions, [...positions].sort((x, y) => x - y), 'the files are applied in the document order');
  assert.match(doc, /Apply 25 \*\*immediately after step 3\*\*/, 'the correction the order relies on is still in the document');
  for (const f of ['phase1/03_drop_exec_sql', 'phase5/17_customer_supply_points', 'phase5/18_lead_supply_points']) assert.ok(doc.includes('`' + f + '`') && /Already live on production/.test(doc), `${f} is documented as already live`);
  assert.match(doc, /phase1\/20_crm_integrations_emergency_hotfix.sql`[^\n]*APPLIED to production 30 Oct 2026/);
});

/* ───────── 1. nobody promotes themselves, or anyone, by any route ───────── */
const PROMOTION = (me, other) => [
  ['own role by UPDATE', `update public.profiles set role = 'admin' where id = '${me}'`],
  ['own role and status together', `update public.profiles set role = 'admin', is_active = true where id = '${me}'`],
  ['every profile at once', "update public.profiles set role = 'admin'"],
  ["a colleague's role", `update public.profiles set role = 'admin' where id = '${other}'`],
  ["a colleague's status", `update public.profiles set is_active = false where id = '${other}'`],
  ['own primary key', `update public.profiles set id = '${NEWBIE}' where id = '${me}'`],
  ['upsert of own row', `insert into public.profiles (id, full_name, role, is_active) values ('${me}', 'x', 'admin', true) on conflict (id) do update set role = excluded.role, is_active = excluded.is_active`],
  ['a new admin profile', `insert into public.profiles (id, full_name, role, is_active) values ('${NEWBIE}', 'x', 'admin', true) on conflict (id) do update set role = excluded.role`],
  ['own user_roles row', `update public.user_roles set role_id = (select id from public.roles where key = 'admin') where user_id = '${me}'`],
  ['a new user_roles grant', `insert into public.user_roles (user_id, role_id, is_primary) select '${me}', id, true from public.roles where key = 'admin'`],
];
for (const [who, name, other] of [[A, 'Sales Agent A', B], [B, 'Sales Agent B', A]]) {
  test(`${name} cannot become Admin or change anyone's role or status, by any direct write`, async () => {
    const before = await roster();
    for (const [label, sql] of PROMOTION(who, other)) {
      await as(who);
      const r = await run(sql);
      assert.ok(refused(r), `${label} must be refused (it touched ${r.n} row(s))`);
    }
    assert.deepEqual(await roster(), before, 'no role, status or key changed');
    await su();
    assert.equal((await one("select count(*)::int n from public.user_roles ur join public.roles r on r.id = ur.role_id where r.key = 'admin' and ur.user_id = $1::uuid", [who]))[0].n, 0, 'no admin grant appeared');
  });
}

test('the privileged functions refuse a Sales Agent, and the grant functions are not even callable from the browser', async () => {
  const before = await roster();
  for (const [label, sql] of [
    ['staff_update to admin', `select public.staff_update('${A}', 'x', null, 'admin')`],
    ['staff_update of a colleague', `select public.staff_update('${B}', 'x', null, 'sales_agent')`],
    ['staff_set_active on the Admin', `select public.staff_set_active('${ADMIN}', false)`],
    ['staff_set_active on a colleague', `select public.staff_set_active('${B}', false)`],
    ['staff_list', 'select * from public.staff_list()'],
    ['crm_grant_role', `select public.crm_grant_role('${A}', 'admin', true)`],
    ['crm_set_primary_role', `select public.crm_set_primary_role('${A}', 'admin')`],
    ['crm_revoke_role', `select public.crm_revoke_role('${ADMIN}', 'admin')`],
    ['trash_list', 'select * from public.trash_list()'],
    ['trash_record on a colleague', `select public.trash_record('lead', '${ids.LB}', 'because of reasons')`],
    ['purge_record', `select public.purge_record('lead', '${ids.LB}')`],
    ['reassign_lead to myself', `select public.reassign_lead('${ids.LB}', '${A}')`],
  ]) {
    await as(A);
    const r = await run(sql);
    assert.equal(r.ok, false, `${label} must raise for a Sales Agent`);
  }
  assert.deepEqual(await roster(), before);
  await su();
  assert.equal((await one('select deleted_at from public.leads where id = $1::uuid', [ids.LB]))[0].deleted_at, null, "the colleague's lead was not trashed");
});

test('the Admin cannot change their own role or status, cannot create a second Admin, and role changes only go through the protected operation', async () => {
  const before = await roster();
  await as(ADMIN);
  for (const [label, sql] of [
    ['own role by UPDATE', `update public.profiles set role = 'sales_agent' where id = '${ADMIN}'`],
    ['own status by UPDATE', `update public.profiles set is_active = false where id = '${ADMIN}'`],
    ["a colleague's role by UPDATE (not the protected operation)", `update public.profiles set role = 'admin' where id = '${A}'`],
    ['staff_update: demote self', `select public.staff_update('${ADMIN}', 'x', null, 'sales_agent')`],
    ['staff_set_active: deactivate self', `select public.staff_set_active('${ADMIN}', false)`],
    ['staff_update: a second Admin', `select public.staff_update('${A}', 'x', null, 'admin')`],
  ]) { const r = await run(sql); assert.ok(refused(r), `${label} must be refused`); }
  assert.deepEqual(await roster(), before);
  await as(ADMIN); // roster() read as the service role; go back to the Admin session
  const ok = await run(`select public.staff_update('${A}', 'Agent A renamed', '6911111111', 'sales_agent') as r`);
  assert.equal(ok.ok, true, `the protected operation still works for ordinary edits: ${ok.error ?? ''}`);
  assert.equal((await run(`select public.staff_set_active('${B}', true)`)).ok, true);
  await su();
  assert.equal((await one("select full_name from public.profiles where id = $1::uuid", [A]))[0].full_name, 'Agent A renamed');
});

test('ordinary profile edits still work for the owner of the row (name, phone), so the fix does not break the account page', async () => {
  await as(A);
  const r = await run("update public.profiles set full_name = 'Agent A', phone = '6922222222' where id = $1::uuid returning 1", [A]);
  assert.equal(r.ok && r.rows.length, 1);
  await as(B);
  assert.equal((await run("update public.profiles set full_name = 'Hacked' where id = $1::uuid returning 1", [A])).rows?.length ?? 0, 0, "but never a colleague's row");
});

test('defence in depth: the privilege, the trigger, the policy and the single-Admin rule each stand on their own', async () => {
  await su();
  // Layer 1 - the browser role has no UPDATE privilege on the privileged columns at all.
  for (const col of ['role', 'is_active', 'id', 'organization_id']) {
    assert.equal((await one("select has_column_privilege('authenticated', 'public.profiles', $1, 'UPDATE') p", [col]))[0].p, false, `authenticated may not UPDATE profiles.${col}`);
  }
  assert.equal((await one("select has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE') p"))[0].p, true, 'but it may still edit its own name');
  // Layer 2 - the trigger refuses even when someone re-grants the privilege by mistake (done inside a transaction that is rolled back).
  for (const sql of [`update public.profiles set role = 'admin' where id = '${A}'`, `update public.profiles set is_active = false where id = '${A}'`]) {
    await su(); await db.exec('begin'); await db.exec('grant update (role, is_active) on public.profiles to authenticated');
    await as(A); const r = await run(sql);
    await db.exec('rollback'); await su(); // roll back FIRST: a failed statement leaves the transaction aborted
    assert.equal(r.ok, false, sql);
    assert.match(r.error, /role\/status can only be changed through the staff administration/, `profiles_guard_privileged must refuse on its own: ${sql} (got: ${r.error})`);
  }
  // Layer 3 - the own-row policy cannot be used to change the role either (privilege re-granted AND trigger removed, again rolled back).
  await su(); await db.exec('begin'); await db.exec('grant update (role) on public.profiles to authenticated'); await db.exec('alter table public.profiles disable trigger profiles_guard_privileged');
  await as(A); const own = await run(`update public.profiles set role = 'admin' where id = '${A}' returning role`);
  await db.exec('rollback'); await su();
  assert.ok(refused(own), 'the hardened own-row policy refuses a role change by itself');
  // Layer 4 - a second active Admin cannot exist, whatever else fails (privilege, trigger and policy all out of the way, as the service role does it).
  await su(); await db.exec('begin');
  const second = await run(`update public.profiles set role = 'admin' where id = '${A}'`);
  await db.exec('rollback'); await su();
  assert.equal(second.ok, false, 'phase6/26 refuses a second active Admin');
  assert.deepEqual((await roster())[A], 'sales_agent/true');
});
test('a deactivated account cannot reactivate itself, change its role, or edit its own profile', async () => {
  const before = await roster();
  for (const sql of [`update public.profiles set is_active = true where id = '${NEWBIE}'`, `update public.profiles set is_active = true, role = 'sales_agent' where id = '${NEWBIE}'`,
    `update public.profiles set full_name = 'back in' where id = '${NEWBIE}'`]) {
    await as(NEWBIE);
    assert.ok(refused(await run(sql)), sql);
  }
  assert.deepEqual(await roster(), before, 'the account is still inactive');
});

/* ───────── 2. credentials, permission model and integrations stay server-side ───────── */
test('credentials and integration tokens are readable by no browser session, not even the Admin; ordinary settings still are', async () => {
  const seen = async (who) => { await as(who); const r = await run('select setting_key from public.crm_settings order by 1'); return r.ok ? r.rows.map((x) => x.setting_key) : 'denied'; };
  for (const who of [ADMIN, A, B]) {
    const keys = await seen(who);
    for (const k of ['SERPAPI_API_KEY', 'RESEND_API_KEY', 'IMAP_PASSWORD']) assert.ok(keys === 'denied' || !keys.includes(k), `${k} must not be readable`);
  }
  assert.ok((await seen(ADMIN)).includes('theme'), 'the Admin still reads ordinary settings');
  for (const who of [A, B]) assert.deepEqual(await seen(who), [], 'a Sales Agent reads no setting');
  for (const who of [A, B, ADMIN]) { await as(who); const r = await run('select config::text from public.crm_integrations'); assert.ok(!r.ok || r.rows.every((x) => !String(x.config).includes('cfg-SECRET')) || who === ADMIN, 'integration config is Admin-only'); }
  for (const who of [A, B]) { await as(who); const r = await run('select config from public.crm_integrations'); assert.ok(!r.ok || r.rows.length === 0, 'a Sales Agent reads no integration row'); }
  await su(); assert.ok((await one("select setting_value::text v from public.crm_settings where setting_key = 'SERPAPI_API_KEY'"))[0].v.includes('serp-SECRET-VALUE'), 'the server side still has the value');
});

test('nobody changes a credential or the permission model through the table; a Sales Agent cannot even try', async () => {
  for (const who of [A, B, ADMIN]) {
    await as(who);
    for (const sql of [
      "update public.crm_settings set setting_value = '\"pwned\"' where setting_key = 'RESEND_API_KEY'",
      "update public.crm_settings set setting_value = '{\"sales_agent\":[\"pii.export\"]}' where setting_key = 'role_permissions'",
      "delete from public.crm_settings where setting_key in ('SERPAPI_API_KEY', 'role_permissions')",
      "insert into public.crm_settings (setting_key, setting_value) values ('role_permissions', '{}') on conflict (setting_key) do update set setting_value = excluded.setting_value",
    ]) assert.ok(refused(await run(sql)), `${who === ADMIN ? 'the Admin' : 'a Sales Agent'}: ${sql.slice(0, 60)}…`);
  }
  for (const who of [A, B]) { await as(who); assert.equal((await run("select public.crm_set_credential('RESEND_API_KEY', 'x')")).ok, false); assert.equal((await run("select public.crm_set_role_permissions('{}'::jsonb)")).ok, false); }
  await su();
  const v = (await one("select setting_value::text v from public.crm_settings where setting_key = 'RESEND_API_KEY'"))[0].v;
  assert.ok(v.includes('re_SECRET') && !v.includes('pwned'));
});

/* ───────── 3. Sales Agent A and B are isolated from each other; the Admin sees everything ───────── */
const visible = async (who, table) => { await as(who); const r = await run(`select id from public.${table} order by id`); return r.ok ? r.rows.map((x) => x.id) : 'denied'; };
const TABLES = [['leads', 'LA', 'LB'], ['customers', 'CuA', 'CuB'], ['cases', 'CA', 'CB']];
test('each Sales Agent sees only their own leads, customers and cases; the Admin sees both', async () => {
  for (const [t, mine, theirs] of TABLES) {
    assert.deepEqual(await visible(A, t), [ids[mine]], `A sees only A's ${t}`);
    assert.deepEqual(await visible(B, t), [ids[theirs]], `B sees only B's ${t}`);
    assert.deepEqual((await visible(ADMIN, t)).sort(), [ids[mine], ids[theirs]].sort(), `the Admin sees both ${t}`);
  }
});
test('follow-ups and documents follow the case: A never reads B\'s, and the Admin reads all', async () => {
  for (const t of ['follow_ups', 'case_documents']) {
    const a = await visible(A, t); const b = await visible(B, t); const all = await visible(ADMIN, t);
    assert.equal(a.length, 1, `A sees one ${t} row`); assert.equal(b.length, 1); assert.equal(all.length, 2);
    assert.ok(!a.some((x) => b.includes(x)), `no ${t} row is visible to both agents`);
  }
});
test('offers, signatures, consents and tasks are the owner only; legacy lead notes are staff-only (an agent reads none)', async () => {
  for (const t of ['case_offers', 'case_signatures', 'work_items', 'consent_records']) {
    const a = await visible(A, t); const b = await visible(B, t); const all = await visible(ADMIN, t);
    assert.equal(a.length, 1, `A sees exactly one ${t} row`); assert.equal(b.length, 1, `B sees exactly one ${t} row`); assert.equal(all.length, 2, `the Admin sees both`);
    assert.ok(!a.some((x) => b.includes(x)), `${t}: no row is visible to both agents`);
  }
  for (const who of [A, B]) assert.deepEqual(await visible(who, 'lead_notes'), [], 'legacy lead notes are not for Sales Agents');
  assert.equal((await visible(ADMIN, 'lead_notes')).length, 1);
});
test("a Sales Agent cannot change, reassign or attach to a colleague's records", async () => {
  await as(A);
  for (const sql of [
    `update public.leads set status = 'lost' where id = '${ids.LB}'`,
    `update public.cases set current_stage = 'lost' where id = '${ids.CB}'`,
    `update public.customers set full_name = 'x' where id = '${ids.CuB}'`,
    `update public.follow_ups set status = 'done' where case_id = '${ids.CB}'`,
    `update public.leads set assigned_to_user_id = '${A}' where id = '${ids.LB}'`,
    `update public.leads set assigned_to_user_id = '${B}' where id = '${ids.LA}'`,
    `update public.cases set owner_id = '${B}' where id = '${ids.CA}'`,
    `insert into public.case_documents (case_id, category, file_url, status) values ('${ids.CB}', 'energy_bill', 'cases/evil.pdf', 'received')`,
    `delete from public.cases where id = '${ids.CB}'`,
    `delete from public.leads where id = '${ids.LB}'`,
  ]) assert.ok(refused(await run(sql)), sql.slice(0, 90));
  await su();
  assert.equal((await one('select status from public.leads where id = $1::uuid', [ids.LB]))[0].status, 'new');
  assert.equal((await one('select owner_id from public.cases where id = $1::uuid', [ids.CA]))[0].owner_id, A);
});
test('a deactivated Sales Agent sees nothing', async () => {
  for (const t of ['leads', 'customers', 'cases', 'follow_ups']) assert.deepEqual(await visible(NEWBIE, t), [], t);
});

/* ───────── 4. missing documents are warnings, never blockers ───────── */
test('a case with NO documents still moves along an allowed route and can be handed over: the checklist only warns', async () => {
  await su();
  const bare = (await one(`insert into public.cases (title, owner_id, created_by, customer_id, current_stage, status) values ('No docs', $1::uuid, $1::uuid, $2::uuid, 'document_check', 'open') returning id`, [A, ids.CuA]))[0].id;
  assert.equal((await one('select count(*)::int n from public.case_documents where case_id = $1::uuid', [bare]))[0].n, 0, 'the case has no documents at all');
  const next = (await one("select to_stage from public.case_stage_transitions where from_stage = 'document_check' order by to_stage limit 1"))[0]?.to_stage;
  assert.ok(next, 'the stage matrix has a route out of document_check');
  await as(A);
  const moved = await run(`update public.cases set current_stage = '${next}' where id = '${bare}' returning current_stage`);
  assert.equal(moved.ok && moved.rows[0]?.current_stage, next, `the stage change is not blocked by missing documents (${moved.error ?? ''})`);
  const info = await run('select * from public.case_document_blockers($1::uuid, $2)', [bare, next]);
  assert.equal(info.ok, true, 'the checklist function still answers (informational)');
  await su();
  assert.equal((await one("select count(*)::int n from pg_proc where proname in ('set_stage_gate_mode', 'change_case_stage_override')"))[0].n, 0, 'there is no blocking mode and no override to configure');
});

/* ───────── 5. anonymous ───────── */
test('an anonymous visitor reads and writes none of it', async () => {
  for (const t of ['profiles', 'leads', 'customers', 'cases', 'follow_ups', 'case_documents', 'crm_settings', 'crm_integrations', 'user_roles']) {
    await as('anon'); const r = await run(`select 1 from public.${t} limit 1`);
    assert.ok(!r.ok || r.rows.length === 0, `anon reads ${t}`);
  }
  await as('anon');
  for (const sql of ["update public.profiles set role = 'admin'", "insert into public.crm_settings (setting_key, setting_value) values ('x', '1')", "update public.leads set status = 'lost'"]) assert.ok(refused(await run(sql)), sql);
  for (const sql of ['select * from public.staff_list()', "select public.staff_update(gen_random_uuid(), 'x', null, 'admin')", "select public.crm_set_credential('RESEND_API_KEY', 'x')", 'select * from public.trash_list()']) assert.equal((await run(sql)).ok, false, sql);
});

/* ───────── 6. tripwire: no new SECURITY DEFINER function is reachable without an identity or role check ───────── */
// Every SECURITY DEFINER function a browser session can execute must say who is asking. The ones below were READ and judged safe (reason beside each);
// a new function that is not on this list and carries no identity/role token fails the build until someone reviews it.
const REVIEWED = {
  ai_is_killed: 'returns the AI kill-switch flag; no record data',
  b2b_queries_today: 'a counter of today\'s scraper queries; no record data',
  insert_website_lead: 'the public website form: anonymous BY DESIGN; validated, age-gated and rate-limited inside (20261001000100_age_gate_public_leads.sql)',
  check_dnc_status: 'boolean: is this phone on the Article 11 blacklist; staff need it before calling; authenticated only',
  contact_facts: 'guarded by contact_role() inside the body',
  trash_list: 'guarded by trash_actor_role() inside the body',
  sales_can_read_object: 'storage policy helper; answers for the caller only',
  sales_can_write_object: 'storage policy helper; answers for the caller only',
  sales_owns_entity: 'answers whether the CALLER owns the record (helpers read auth.uid())',
  sales_scope_status: 'reports which tables are scoped; no record data',
};
test('tripwire: every SECURITY DEFINER function a browser can run checks who is asking, or has been reviewed', async () => {
  await su();
  const guard = /auth\.uid\(\)|is_role|is_staff|crm_has_role|staff_admin_can|current_user|auth\.role\(\)|auth\.jwt\(\)|session_user|crm_can_view|crm_current|can_(view|edit|access)|trash_actor_role|contact_role|_role\(\)/i;
  const rows = await one(`select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosrc, has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1`);
  const unreviewed = rows.filter((r) => !guard.test(r.prosrc) && !(r.proname in REVIEWED)).map((r) => `${r.proname}(${r.args})`);
  assert.deepEqual(unreviewed, [], 'SECURITY DEFINER functions with no identity/role check and no review note');
  const anon = rows.filter((r) => r.anon_exec).map((r) => r.proname);
  assert.deepEqual(anon, ['insert_website_lead'], 'the only SECURITY DEFINER function anonymous visitors may run is the public website form');
  const stale = Object.keys(REVIEWED).filter((k) => !rows.some((r) => r.proname === k));
  assert.deepEqual(stale, [], 'a reviewed function that no longer exists must be removed from the list');
});

/* ───────── 7. NEGATIVE CONTROL: the same attacks against what the repository auto-applies today (supabase/migrations only) ─────────
   Without this the gate above could pass for the wrong reason. These tests are EXPECTED to show the exposure; they document why the staged chain is needed. When the
   staged files are applied to the live database these results stop describing production, and the owner's pending_migrations_check.sql says which state it is in. */
const ctl = {};
const U2 = (n) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('control setup: only supabase/migrations, two agents and an admin, with the same kind of data', async () => {
  const { db: d2 } = await replayMigrations(); ctl.db = d2; ctl.as = identity(d2); ctl.run = (s, p) => attempt(d2, s, p);
  await d2.exec(`alter table auth.users add column if not exists last_sign_in_at timestamptz;`);
  for (const [id, role] of [[U2(1), 'admin'], [U2(2), 'inside_sales'], [U2(3), 'field_sales']]) {
    await d2.query('insert into auth.users (id, email) values ($1::uuid, $2)', [id, `${id.slice(-1)}@x.invalid`]);
    await d2.query('insert into public.profiles (id, full_name, role, is_active) values ($1::uuid, $2, $3, true) on conflict (id) do update set role = excluded.role, is_active = true', [id, 'n', role]);
  }
  await d2.query(`insert into public.leads (client_name, client_contact, email, phone, source, status, age_confirmed, assigned_to_user_id, created_by_user_id)
    values ('LA', 'x@example.test', 'x@example.test', '6900000000', 'inside_sales', 'new', true, $1::uuid, $1::uuid), ('LB', 'y@example.test', 'y@example.test', '6900000001', 'field_sales', 'new', true, $2::uuid, $2::uuid)`, [U2(2), U2(3)]);
  await d2.query(`insert into public.crm_settings (setting_key, setting_value) values ('SERPAPI_API_KEY', '"ctl-SECRET"') on conflict (setting_key) do update set setting_value = excluded.setting_value`);
});
test('control: WITHOUT the staged files a signed-in Sales Agent really can read colleagues\' leads', async () => {
  await ctl.as(U2(2)); const r = await ctl.run('select client_name from public.leads order by 1');
  assert.ok(r.ok && r.rows.length === 2, `the isolation checks above are not vacuous: here an agent sees ${r.ok ? r.rows.length : 'nothing'} of 2 leads`);
});
test('control: WITHOUT the staged files the Admin session can read the raw credential value', async () => {
  await ctl.as(U2(1)); const r = await ctl.run("select setting_value::text v from public.crm_settings where setting_key = 'SERPAPI_API_KEY'");
  assert.ok(r.ok && r.rows.length === 1 && r.rows[0].v.includes('ctl-SECRET'), 'the credential finding is reproducible, so the write-only check above is meaningful');
});
test('control: the self-promotion finding itself (migration 20260910103000, line 586) is reproducible, so the guard test is meaningful', async () => {
  await ctl.as(U2(2));
  const r = await ctl.run(`update public.profiles set role = 'admin' where id = '${U2(2)}' returning role`);
  assert.ok(r.ok && r.rows[0]?.role === 'admin', 'an inside_sales user made themselves admin with one UPDATE: this is what phase1/18 + phase2/05 close');
});
