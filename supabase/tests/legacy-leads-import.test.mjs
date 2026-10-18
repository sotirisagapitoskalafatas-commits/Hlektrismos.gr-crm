// LOCAL verification only (PGlite) of the staged legacy-leads import (supabase/staged-migrations/phase4/16_import_legacy_leads.sql),
// its read-only dry run (docs/ops/LEGACY_LEADS_IMPORT_DRYRUN.sql) and the rollback. The target is the REAL public.leads definition
// and its real status/source constraints; the old table is rebuilt from the migrations that created it. NOT staging or production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const IMPORT = read('../staged-migrations/phase4/16_import_legacy_leads.sql');
const DRY = read('../../docs/ops/LEGACY_LEADS_IMPORT_DRYRUN.sql');
const ROLLBACK = read('../../docs/ops/rollback_phase4_16_legacy_leads_import.sql');
const between = (src, start, end) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf(end, i) + end.length); };
// the classification text between the two marker lines (the marker lines themselves differ in their wording)
const block = (s) => { const a = s.indexOf('\n', s.indexOf('-- >>> CLASSIFY')) + 1; return s.slice(a, s.indexOf('-- <<< CLASSIFY')); };

async function mkDb() {
  const db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin;');
  await db.exec('create table public.profiles (id uuid primary key);');
  const m1 = read('../migrations/20260908180001_crm_leads_activity_log.sql');
  await db.exec('create table public.cases (id uuid primary key);');
  await db.exec(between(m1, 'create table if not exists public.leads', ');'));
  await db.exec(between(m1, 'create table if not exists public.activity_log', ');'));
  await db.exec('alter table public.cases add column lead_id uuid references public.leads(id);');
  const m2 = read('../migrations/20260909200000_p1_lead_foundation.sql');
  await db.exec(between(m2, 'alter table public.leads\n  add constraint leads_status_check', ');'));
  await db.exec(between(m2, 'alter table public.leads\n  add constraint leads_source_check', ');'));
  // the old table: the original columns plus the ones later migrations added (only what the import reads, plus government_id which it must NOT copy)
  await db.exec(`create table public.hlektrismos_leads (
    id uuid primary key, first_name text not null, last_name text not null, phone text not null, email text not null, region text not null,
    customer_type text not null, provider text not null, consent boolean not null default false, status text not null default 'new',
    created_at timestamptz not null default now(), property_type text, comments text, deleted_at timestamptz, source text, service_type text, government_id text);`);
  return db;
}

let n = 0;
const id = () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const old = (db, o) => {
  const r = { first_name: 'Νίκος', last_name: 'Παπαδόπουλος', phone: '6970000000', email: 'x@example.com', region: 'Αττική', customer_type: 'Οικιακός', provider: 'ΔΕΗ',
    consent: true, status: 'new', created_at: '2026-06-01T10:00:00Z', property_type: null, comments: null, deleted_at: null, source: 'website', service_type: null, government_id: 'AB123456', ...o };
  r.id = r.id ?? id();
  return db.query(`insert into public.hlektrismos_leads (id, first_name, last_name, phone, email, region, customer_type, provider, consent, status, created_at, property_type, comments, deleted_at, source, service_type, government_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [r.id, r.first_name, r.last_name, r.phone, r.email, r.region, r.customer_type, r.provider, r.consent, r.status, r.created_at, r.property_type, r.comments, r.deleted_at, r.source, r.service_type, r.government_id]).then(() => r.id);
};
const snapshot = async (db, t) => JSON.stringify((await db.query(`select * from public.${t} order by 1`)).rows);

const db = await mkDb();
// one existing CRM lead the old rows can collide with
await db.query("insert into public.leads (id, client_name, full_name, phone, email, source) values ('eeeeeeee-0000-4000-8000-000000000001', 'Υπάρχων', 'Υπάρχων', '+30 697 111 1111', 'Exists@Example.com', 'website')");
const ids = {};
ids.plain = await old(db, { first_name: 'Άννα', phone: '6972222222', email: 'anna@example.com', comments: 'ζήτησε τιμή', service_type: 'Φυσικό Αέριο', property_type: 'Διαμέρισμα' });
ids.deleted = await old(db, { phone: '6973333333', email: 'd@example.com', deleted_at: '2026-07-01T00:00:00Z' });
ids.noName = await old(db, { first_name: ' ', last_name: '', phone: '6974444444', email: 'nn@example.com' });
ids.noContact = await old(db, { phone: '', email: 'not-provided@hlektrismos.local' });
ids.badStatus = await old(db, { status: 'weird', phone: '6975555555', email: 'b@example.com' });
ids.dupPhone = await old(db, { phone: '697-111-1111', email: 'other@example.com' });                // = the existing lead, other format
ids.dupEmail = await old(db, { phone: '6976666666', email: ' EXISTS@example.com ' });               // = the existing lead, case and spaces
ids.twinOld = await old(db, { phone: '6977777777', email: 't1@example.com', created_at: '2026-03-01T00:00:00Z' });
ids.twinNew = await old(db, { phone: '(697) 777-7777', email: 't2@example.com', created_at: '2026-04-01T00:00:00Z' });
ids.beyond = await old(db, { status: 'converted', consent: false, phone: '6978888888', email: 'c@example.com', source: 'facebook' });
ids.rejected = await old(db, { status: 'rejected', phone: '6979999999', email: 'r@example.com' });
ids.shortA = await old(db, { phone: '12345', email: 'not-provided@hlektrismos.local' });
ids.shortB = await old(db, { phone: '12345', email: 'not-provided@hlektrismos.local' });             // too short to be a match key: both are copied
ids.proposal = await old(db, { status: ' Proposal ', phone: '6970101010', email: 'p@example.com' });

const DRY2 = DRY.slice(DRY.indexOf('-- ───────────── 2)'));
const asMap = (rows) => Object.fromEntries(rows.map((r) => [r.item, Number(r.n)]));
const docsCounts = async () => { await db.exec('begin read only'); try { return asMap((await db.query(DRY2)).rows); } finally { await db.exec('rollback'); } };
const EXPECT = {
  'legacy rows in total': 14, 'already imported by an earlier run (skipped)': 0, 'skipped_deleted: soft-deleted in the old table (they stay there)': 1, 'TO COPY in this run': 13,
  'of those: without recorded consent → «not for marketing»': 1,
  'of those: possible duplicates (tagged, not merged)': 3, 'of those: no name (named «Χωρίς όνομα»)': 1, 'of those: no phone and no e-mail': 1,
  'statuses: mapped directly': 11, 'statuses: «beyond lead» → qualified': 1, 'statuses: unknown or empty → new': 1, 'distinct old statuses in use': 5,
};
const withoutMode = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith('MODE')));

test('the file is applied (a view and a function only — nothing is copied), and the dry run in the docs uses the SAME classification', async () => {
  const [a0, b0] = [await snapshot(db, 'leads'), await snapshot(db, 'hlektrismos_leads')];
  await db.exec(IMPORT);
  assert.deepEqual([await snapshot(db, 'leads'), await snapshot(db, 'hlektrismos_leads')], [a0, b0], 'applying the file writes no lead');
  assert.equal(block(IMPORT), block(DRY));
  assert.ok(!/\b(insert|update|delete|drop|alter|create|truncate)\b/i.test(DRY.replace(/--[^\n]*/g, '').replace(/'[^']*'/g, '')), 'the docs dry run contains no write statement');
  await db.exec(IMPORT); // idempotent: create or replace
});

test('DRY RUN is the default: counts only, exactly the expected numbers, the docs dry run says the same, and nothing is written', async () => {
  const before = [await snapshot(db, 'leads'), await snapshot(db, 'hlektrismos_leads'), await snapshot(db, 'activity_log')];
  const rows = (await db.query('select * from public.import_legacy_leads()')).rows;
  assert.ok(rows[0].item.startsWith('MODE: DRY RUN'));
  assert.deepEqual(withoutMode(asMap(rows)), EXPECT);
  assert.ok(!rows.some((r) => r.item.startsWith('COPIED')), 'a dry run never reports a write');
  assert.deepEqual(withoutMode(await docsCounts()), EXPECT, 'the read-only file before anything is created gives the same numbers');
  assert.deepEqual((await db.query('select * from public.import_legacy_leads(true)')).rows.map((r) => r.n.toString()), rows.map((r) => r.n.toString()), 'explicit true = the default');
  assert.deepEqual([await snapshot(db, 'leads'), await snapshot(db, 'hlektrismos_leads'), await snapshot(db, 'activity_log')], before, 'no write at all');
  assert.deepEqual(Object.keys(rows[0]), ['item', 'n']);
  const text = JSON.stringify(rows) + JSON.stringify(await docsCounts());
  for (const secret of ['Άννα', 'anna@example.com', '6972222222', 'AB123456', 'Παπαδόπουλος']) assert.ok(!text.includes(secret), secret);
  const cols = (await db.query(DRY.slice(DRY.indexOf('select c.col'), DRY.indexOf('-- ───────────── 2)')))).rows;
  assert.equal(cols.length, 16); assert.ok(cols.every((x) => x.state === 'present'));
});

test('app users cannot run the function or read the plan view (owner only)', async () => {
  await db.exec('grant usage on schema public to authenticated');
  await db.exec('set role authenticated');
  let r1 = null, r2 = null;
  try { await db.query('select * from public.import_legacy_leads()'); } catch (e) { r1 = e.message; }
  try { await db.query('select * from public.legacy_leads_import_plan'); } catch (e) { r2 = e.message; }
  await db.exec('reset role');
  assert.match(r1 ?? '', /permission denied/); assert.match(r2 ?? '', /permission denied/);
});

test('the real import (false) copies the 13 rows that are not soft-deleted (the deleted one is skipped and stays in the old table), marked, unassigned, statuses mapped, original status kept', async () => {
  const oldBefore = await snapshot(db, 'hlektrismos_leads');
  const leadsBefore = (await db.query('select count(*)::int n from public.leads')).rows[0].n;
  const rows = (await db.query('select * from public.import_legacy_leads(false)')).rows;
  assert.ok(rows[0].item.startsWith('MODE: IMPORT'));
  assert.deepEqual(withoutMode(Object.fromEntries(Object.entries(asMap(rows)).filter(([k]) => k !== 'COPIED (written)'))), EXPECT, 'the counts are taken before the write');
  assert.equal(asMap(rows)['COPIED (written)'], 13);
  assert.equal(await snapshot(db, 'hlektrismos_leads'), oldBefore, 'the old table is not changed');
  const got = (await db.query("select * from public.leads where source = 'import'")).rows;
  assert.equal((await db.query('select count(*)::int n from public.leads')).rows[0].n, leadsBefore + 13);
  const by = Object.fromEntries(got.map((r) => [r.tags.find((t) => t.startsWith('legacy_import:')).slice('legacy_import:'.length), r]));
  assert.deepEqual(Object.keys(by).sort(), Object.values(ids).filter((x) => x !== ids.deleted).sort(), 'every old row except the soft-deleted one');
  assert.ok(!(ids.deleted in by), 'the soft-deleted row is NOT imported (it stays in the old table)');
  for (const r of got) {
    assert.equal(r.assigned_to_user_id, null); assert.equal(r.created_by_user_id, null); assert.equal(r.source_label, 'Παλιά βάση');
    assert.ok(r.tags.includes('import') && r.tags.some((t) => t.startsWith('legacy_status:'))); assert.match(r.notes, /Αρχική κατάσταση:/);
    assert.equal(r.id_number, null);
  }
  assert.ok(!JSON.stringify(got).includes('AB123456'), 'government_id is not copied');
  const p = by[ids.plain];
  assert.equal(p.client_name, 'Άννα Παπαδόπουλος'); assert.equal(p.client_contact, '6972222222'); assert.equal(p.status, 'new'); assert.equal(p.service_category, 'Φυσικό Αέριο');
  assert.equal(new Date(p.created_at).toISOString(), '2026-06-01T10:00:00.000Z'); assert.equal(p.gdpr_consent, true); assert.ok(!p.tags.includes('not_for_marketing'));
  assert.deepEqual([...p.tags].sort(), ['import', 'legacy_import:' + ids.plain, 'legacy_source:website', 'legacy_status:new'].sort());
  assert.match(p.notes, /Αρχική κατάσταση: new\./);
  assert.equal(by[ids.rejected].status, 'lost'); assert.equal(by[ids.proposal].status, 'offer'); assert.ok(by[ids.proposal].tags.includes('legacy_status:proposal'));
  const b = by[ids.beyond];
  assert.equal(b.status, 'qualified'); assert.ok(b.tags.includes('legacy_status:converted')); assert.match(b.notes, /αντιστοιχίστηκε σε «qualified»/);
  assert.equal(b.gdpr_consent, false); assert.equal(b.consent_granted_at, null); assert.ok(b.tags.includes('not_for_marketing')); assert.match(b.notes, /ΟΧΙ για marketing/);
  assert.equal(by[ids.badStatus].status, 'new'); assert.ok(by[ids.badStatus].tags.includes('legacy_status:weird')); assert.match(by[ids.badStatus].notes, /άγνωστη/);
  assert.equal(by[ids.noName].client_name, 'Χωρίς όνομα (παλιά βάση)'); assert.equal(by[ids.noName].first_name, '');
  assert.equal(by[ids.noContact].client_contact, ''); assert.equal(by[ids.noContact].phone, null); assert.equal(by[ids.noContact].email, null);
  for (const k of ['dupPhone', 'dupEmail', 'twinNew']) { assert.ok(by[ids[k]].tags.includes('possible_duplicate'), k); assert.match(by[ids[k]].notes, /Πιθανό διπλότυπο/); }
  for (const k of ['plain', 'twinOld', 'shortA', 'shortB']) assert.ok(!by[ids[k]].tags.includes('possible_duplicate'), k);
  const nfm = got.filter((r) => r.tags.includes('not_for_marketing')).map((r) => r.tags.find((t) => t.startsWith('legacy_import:')).slice('legacy_import:'.length)).sort();
  assert.deepEqual(nfm, [ids.beyond], 'only rows without consent are marked; consenting rows are open for normal contact');
  const ex = (await db.query("select client_name, phone, email, source from public.leads where id = 'eeeeeeee-0000-4000-8000-000000000001'")).rows[0];
  assert.deepEqual(ex, { client_name: 'Υπάρχων', phone: '+30 697 111 1111', email: 'Exists@Example.com', source: 'website' });
});

test('one audit entry with the count only; the import is idempotent — a second real run copies nothing', async () => {
  const log = (await db.query("select details from public.activity_log where action = 'legacy_import'")).rows;
  assert.equal(log.length, 1); assert.deepEqual(log[0].details, { copied: 13 }); assert.ok(!JSON.stringify(log).includes('@'));
  const before = await snapshot(db, 'leads');
  const rows = asMap((await db.query('select * from public.import_legacy_leads(false)')).rows);
  assert.equal(await snapshot(db, 'leads'), before, 'nothing is copied twice');
  assert.equal(rows['already imported by an earlier run (skipped)'], 13); assert.equal(rows['skipped_deleted: soft-deleted in the old table (they stay there)'], 1); assert.equal(rows['TO COPY in this run'], 0); assert.equal(rows['COPIED (written)'], 0);
  assert.equal((await docsCounts())['TO COPY in this run'], 0);
});

test('rollback: removes the imported leads nobody built on (and the helper objects), keeps converted ones and everything else', async () => {
  const keepConverted = (await db.query("select id from public.leads where tags @> array['legacy_import:' || $1::text]", [ids.plain])).rows[0].id;
  await db.query('insert into public.cases (id, lead_id) values (gen_random_uuid(), $1)', [keepConverted]);
  const keepCase = (await db.query("select id from public.leads where tags @> array['legacy_import:' || $1::text]", [ids.rejected])).rows[0].id;
  await db.query("update public.leads set converted_case_id = (select id from public.cases limit 1) where id = $1", [keepCase]);
  const review = (await db.query(ROLLBACK.slice(ROLLBACK.indexOf('select count(*)'), ROLLBACK.indexOf('-- 2) DELETE')))).rows[0];
  assert.deepEqual({ ...review }, { imported_leads: 13, already_converted: 1, with_a_case: 1, assigned_since: 0 });
  await db.exec(ROLLBACK.slice(ROLLBACK.indexOf('delete from')));
  assert.equal((await db.query("select count(*)::int n from public.leads where source = 'import'")).rows[0].n, 2, 'the converted lead and the one with a case stay');
  assert.equal((await db.query("select count(*)::int n from public.leads where id = 'eeeeeeee-0000-4000-8000-000000000001'")).rows[0].n, 1, 'the pre-existing lead stays');
  assert.equal((await db.query('select count(*)::int n from public.hlektrismos_leads')).rows[0].n, 14, 'the old table is intact');
  const gone = (await db.query("select to_regclass('public.legacy_leads_import_plan') v, to_regprocedure('public.import_legacy_leads(boolean)') f")).rows[0];
  assert.equal(gone.v, null); assert.equal(gone.f, null);
});
