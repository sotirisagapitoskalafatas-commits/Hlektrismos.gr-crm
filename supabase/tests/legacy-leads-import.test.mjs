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
const block = (s) => between(s, '-- >>> CLASSIFY', '-- <<< CLASSIFY');

async function mkDb() {
  const db = new PGlite();
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

const dryCounts = async () => { await db.exec('begin read only'); try { return Object.fromEntries((await db.query(DRY.slice(DRY.indexOf('-- ───────────── 2)')))).rows.map((r) => [r.item, Number(r.n)])); } finally { await db.exec('rollback'); } };

test('the import and the dry run use the SAME classification (text and result)', async () => {
  assert.equal(block(IMPORT), block(DRY));
  assert.ok(!/\b(insert|update|delete|drop|alter|create|truncate)\b/i.test(DRY.replace(/--[^\n]*/g, '').replace(/'[^']*'/g, '')), 'the dry run contains no write statement');
});

test('dry run: counts only, exactly the expected numbers, and it changes nothing', async () => {
  const before = [await snapshot(db, 'leads'), await snapshot(db, 'hlektrismos_leads'), await snapshot(db, 'activity_log')];
  const c = await dryCounts();
  assert.deepEqual(c, {
    'legacy rows in total': 14, 'would be COPIED': 7, 'skipped: already imported': 0, 'skipped: soft-deleted in the old table': 1, 'skipped: no name': 1,
    'skipped: no phone and no e-mail': 1, 'skipped: status cannot be mapped': 1, 'skipped: already in public.leads': 2, 'skipped: repeated inside the old table': 1,
    'of the COPIED: without recorded consent': 1, 'of the COPIED: old status beyond «lead»': 1, 'of the COPIED: no e-mail': 2, 'of the COPIED: no phone': 0,
    'check: the numbers add up': 0, 'old statuses in use (all rows)': 5,
  });
  assert.deepEqual([await snapshot(db, 'leads'), await snapshot(db, 'hlektrismos_leads'), await snapshot(db, 'activity_log')], before);
  // counts only: the output has three columns and no value from the data
  const r = await db.query(DRY.slice(DRY.indexOf('-- ───────────── 2)')));
  assert.deepEqual(Object.keys(r.rows[0]), ['item', 'n', 'meaning']);
  const text = JSON.stringify(r.rows);
  for (const secret of ['Άννα', 'anna@example.com', '6972222222', 'AB123456', 'Παπαδόπουλος']) assert.ok(!text.includes(secret), secret);
  // part 1 (columns present) says present for every one in this database
  const cols = (await db.query(DRY.slice(DRY.indexOf('select c.col'), DRY.indexOf('-- ───────────── 2)')))).rows;
  assert.equal(cols.length, 16); assert.ok(cols.every((x) => x.state === 'present'));
});

test('import: copies exactly the rows the dry run promised, mapped to allowed values, marked, and leaves the old table untouched', async () => {
  const oldBefore = await snapshot(db, 'hlektrismos_leads');
  const leadsBefore = (await db.query('select count(*)::int n from public.leads')).rows[0].n;
  await db.exec(IMPORT);
  assert.equal(await snapshot(db, 'hlektrismos_leads'), oldBefore, 'the old table is not changed');
  const got = (await db.query("select * from public.leads where source = 'import'")).rows;
  assert.equal((await db.query('select count(*)::int n from public.leads')).rows[0].n, leadsBefore + 7);
  const byOld = Object.fromEntries(got.map((r) => [r.tags.find((t) => t.startsWith('legacy_import:')).slice('legacy_import:'.length), r]));
  assert.deepEqual(Object.keys(byOld).sort(), [ids.plain, ids.twinOld, ids.beyond, ids.rejected, ids.shortA, ids.shortB, ids.proposal].sort());
  for (const skipped of [ids.deleted, ids.noName, ids.noContact, ids.badStatus, ids.dupPhone, ids.dupEmail, ids.twinNew]) assert.ok(!(skipped in byOld), `skipped ${skipped}`);
  // field mapping
  const p = byOld[ids.plain];
  assert.equal(p.client_name, 'Άννα Παπαδόπουλος'); assert.equal(p.full_name, 'Άννα Παπαδόπουλος'); assert.equal(p.first_name, 'Άννα');
  assert.equal(p.client_contact, '6972222222'); assert.equal(p.email, 'anna@example.com'); assert.equal(p.phone, '6972222222');
  assert.equal(p.status, 'new'); assert.equal(p.source, 'import'); assert.equal(p.source_label, 'Παλιά βάση');
  assert.equal(p.service_category, 'Φυσικό Αέριο'); assert.equal(p.property_type, 'Διαμέρισμα'); assert.equal(p.comments, 'ζήτησε τιμή'); assert.equal(p.lead_type, 'Οικιακός');
  assert.equal(new Date(p.created_at).toISOString(), '2026-06-01T10:00:00.000Z', 'the original date is kept');
  assert.deepEqual([...p.tags].sort(), ['import', 'legacy_import:' + ids.plain, 'legacy_source:website'].sort());
  assert.equal(p.gdpr_consent, true); assert.equal(p.consent_version, 'legacy'); assert.equal(p.consent_source, 'legacy_import'); assert.equal(new Date(p.consent_granted_at).toISOString(), '2026-06-01T10:00:00.000Z');
  assert.equal(p.created_by_user_id, null); assert.equal(p.assigned_to_user_id, null); assert.equal(p.id_number, null, 'government_id is not copied');
  assert.ok(!JSON.stringify(got).includes('AB123456'), 'no ID number anywhere in the copied rows');
  // statuses: only allowed values; "beyond lead" statuses are qualified + a tag, never «converted»
  assert.equal(byOld[ids.beyond].status, 'qualified'); assert.ok(byOld[ids.beyond].tags.includes('legacy_status:converted'));
  assert.equal(byOld[ids.beyond].gdpr_consent, false); assert.equal(byOld[ids.beyond].consent_granted_at, null);
  assert.ok(byOld[ids.beyond].tags.includes('legacy_source:facebook'));
  assert.equal(byOld[ids.rejected].status, 'lost'); assert.equal(byOld[ids.proposal].status, 'offer');
  assert.equal(byOld[ids.shortA].client_contact, '12345'); assert.equal(byOld[ids.shortA].email, null);
  assert.equal(got.filter((r) => r.converted_case_id).length, 0);
  // the existing lead is untouched
  const ex = (await db.query("select client_name, phone, email, source from public.leads where id = 'eeeeeeee-0000-4000-8000-000000000001'")).rows[0];
  assert.deepEqual(ex, { client_name: 'Υπάρχων', phone: '+30 697 111 1111', email: 'Exists@Example.com', source: 'website' });
});

test('one audit entry with counts only; the import is idempotent (a second run changes nothing) and the dry run then says so', async () => {
  const log = (await db.query("select details from public.activity_log where action = 'legacy_import'")).rows;
  assert.equal(log.length, 1);
  assert.equal(log[0].details.copied, 7);
  assert.deepEqual(log[0].details.skipped, { soft_deleted: 1, no_name: 1, no_contact: 1, unmappable_status: 1, duplicate_existing: 2, duplicate_in_legacy: 1 });
  assert.ok(!JSON.stringify(log).includes('@'), 'no personal data in the audit entry');
  const before = await snapshot(db, 'leads');
  await db.exec(IMPORT);
  assert.equal(await snapshot(db, 'leads'), before, 'nothing is copied twice');
  const c = await dryCounts();
  assert.equal(c['would be COPIED'], 0); assert.equal(c['skipped: already imported'], 7); assert.equal(c['check: the numbers add up'], 0);
  // the repeated old-table row is still recognised as a repeat (not "new") after its twin was imported
  assert.equal(c['skipped: repeated inside the old table'], 1);
  const log2 = (await db.query("select details from public.activity_log where action = 'legacy_import' order by created_at")).rows;
  assert.equal(log2.length, 2); assert.equal(log2[1].details.copied, 0);
});

test('rollback: removes the imported leads nobody built on, keeps converted ones and everything else', async () => {
  const keepConverted = (await db.query("select id from public.leads where tags @> array['legacy_import:' || $1::text]", [ids.plain])).rows[0].id;
  await db.query('insert into public.cases (id, lead_id) values (gen_random_uuid(), $1)', [keepConverted]);
  const keepCase = (await db.query("select id from public.leads where tags @> array['legacy_import:' || $1::text]", [ids.rejected])).rows[0].id;
  await db.query("update public.leads set converted_case_id = (select id from public.cases limit 1) where id = $1", [keepCase]);
  const review = (await db.query(ROLLBACK.slice(ROLLBACK.indexOf('select count(*)'), ROLLBACK.indexOf('-- 2) DELETE')))).rows[0];
  assert.deepEqual({ ...review }, { imported_leads: 7, already_converted: 1, with_a_case: 1 });
  await db.exec(ROLLBACK.slice(ROLLBACK.indexOf('delete from')));
  const left = (await db.query("select count(*)::int n from public.leads where source = 'import'")).rows[0].n;
  assert.equal(left, 2, 'the converted lead and the one with a case stay');
  assert.equal((await db.query("select count(*)::int n from public.leads where id = 'eeeeeeee-0000-4000-8000-000000000001'")).rows[0].n, 1, 'the pre-existing lead stays');
  assert.equal((await db.query('select count(*)::int n from public.hlektrismos_leads')).rows[0].n, 14, 'the old table is intact');
});
