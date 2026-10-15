// Regression test for «the lead was not created» (LOCAL, PGlite). Uses the REAL leads table definition from
// supabase/migrations/20260908180001_crm_leads_activity_log.sql and the status/source constraints from
// 20260909200000_p1_lead_foundation.sql, and the exact identity columns the CRM now sends (src/lib/lead-payload.ts).
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { buildSync } from 'esbuild';

// Migrations may be checked out with CRLF line endings on Windows.
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const js = buildSync({ entryPoints: [fileURLToPath(new URL('../../src/lib/lead-payload.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const P = await import('data:text/javascript;base64,' + Buffer.from(js.outputFiles[0].text).toString('base64'));
const db = new PGlite();

const between = (src, start, end) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf(end, i) + end.length); };

before(async () => {
  await db.exec(`create table public.profiles (id uuid primary key); create table public.cases (id uuid primary key);`);
  const m1 = read('../migrations/20260908180001_crm_leads_activity_log.sql');
  await db.exec(between(m1, 'create table if not exists public.leads', ');'));
  const m2 = read('../migrations/20260909200000_p1_lead_foundation.sql');
  await db.exec(between(m2, 'alter table public.leads\n  add constraint leads_status_check', ');'));
  await db.exec(between(m2, 'alter table public.leads\n  add constraint leads_source_check', ');'));
});

const insert = async (row) => {
  const cols = Object.keys(row);
  try {
    const r = await db.query(`insert into public.leads (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`, cols.map((c) => row[c]));
    return { ok: true, row: r.rows[0] };
  } catch (e) { return { ok: false, code: e.code, message: e.message }; }
};

test('root cause reproduced: the payload the CRM used to send is rejected by the real table', async () => {
  // createLead() before the fix: first_name = input.first_name ?? null (the form never sends it); client_contact = email ?? phone ?? null
  const withPhone = await insert({ full_name: 'Γιάννης Π.', first_name: null, last_name: null, client_name: 'Γιάννης Π.', client_contact: '6900000000', phone: '6900000000', source: 'inside_sales', status: 'new' });
  assert.equal(withPhone.ok, false); assert.equal(withPhone.code, '23502'); assert.match(withPhone.message, /first_name/);
  const nameOnly = await insert({ full_name: 'Καφέ Αθηνά', first_name: 'Καφέ', last_name: '', client_name: 'Καφέ Αθηνά', client_contact: null, source: 'inside_sales', status: 'new' });
  assert.equal(nameOnly.ok, false); assert.match(nameOnly.message, /client_contact/);
  assert.match(P.leadWriteErrorText({ code: nameOnly.code, message: nameOnly.message }), /στοιχεία επικοινωνίας/);
});

test('fixed payload: quick lead (name only), with phone, with email, with a company name — all saved', async () => {
  const cases = [
    { full_name: 'Καφέ Αθηνά' },
    { full_name: '  Γιάννης   Παπαδόπουλος ', phone: '+30 690 000 0000' },
    { full_name: 'Μαρία Κ.', email: 'maria@example.gr' },
    { full_name: 'Ξενοδοχείο Ακτή Α.Ε.', phone: '2101234567', email: '' },
  ];
  for (const c of cases) {
    const r = await insert({ ...P.leadIdentityColumns(c), source: 'inside_sales', status: 'new' });
    assert.equal(r.ok, true, `${c.full_name}: ${r.message}`);
  }
  const quick = (await db.query("select * from public.leads where full_name = 'Καφέ Αθηνά' and client_contact = ''")).rows[0];
  assert.equal(quick.first_name, 'Καφέ'); assert.equal(quick.last_name, 'Αθηνά'); assert.equal(quick.phone, null);
  const g = (await db.query("select * from public.leads where full_name = 'Γιάννης Παπαδόπουλος'")).rows[0];
  assert.equal(g.first_name, 'Γιάννης'); assert.equal(g.client_contact, '+30 690 000 0000', 'spaces collapsed in the name, phone kept');
  const biz = (await db.query("select * from public.leads where full_name like 'Ξενοδοχείο%'")).rows[0];
  assert.equal(biz.email, null, 'an empty email is stored as null, not ""');
});

test('editing only the phone or the address no longer writes nulls into the name columns', async () => {
  const id = (await db.query("select id from public.leads where full_name = 'Μαρία Κ.'")).rows[0].id;
  // what updateLead used to send for an edit that did not touch the name
  const old = await db.query("update public.leads set first_name = null, last_name = null, client_name = null, address = 'Ερμού 10' where id = $1", [id]).then(() => 'ok', (e) => e.code);
  assert.equal(old, '23502', 'the old edit payload is rejected');
  await db.query("update public.leads set address = 'Ερμού 10' where id = $1", [id]); // the fixed patch sends only the edited fields
  const patch = P.leadNamePatch('  Μαρία   Κωνσταντίνου ');
  await db.query('update public.leads set full_name = $2, first_name = $3, last_name = $4, client_name = $5 where id = $1', [id, patch.full_name, patch.first_name, patch.last_name, patch.client_name]);
  const r = (await db.query('select full_name, first_name, last_name, address from public.leads where id = $1', [id])).rows[0];
  assert.deepEqual([r.full_name, r.first_name, r.last_name, r.address], ['Μαρία Κωνσταντίνου', 'Μαρία', 'Κωνσταντίνου', 'Ερμού 10']);
});

test('errors: specific Greek messages; diagnostics never include the row (PostgreSQL details)', () => {
  assert.match(P.leadWriteErrorText({ code: '42501', message: 'new row violates row-level security policy for table "leads"' }), /δικαίωμα/);
  assert.match(P.leadWriteErrorText({ message: 'TypeError: Failed to fetch' }), /σύνδεση/);
  assert.match(P.leadWriteErrorText({ code: '23514', message: 'new row for relation "leads" violates check constraint "leads_source_check"' }), /πηγή/);
  assert.match(P.leadWriteErrorText({ code: 'XX000', message: 'boom' }), /κωδικός XX000/);
  const d = P.safeDiagnostics('createLead', { code: '23502', message: 'null value in column "client_contact" of relation "leads" violates not-null constraint', details: 'Failing row contains (Μαρία, 6900000000, maria@example.gr)' });
  assert.deepEqual(d, { op: 'createLead', code: '23502', column: 'client_contact', constraint: null, hint: null });
  assert.ok(!JSON.stringify(d).includes('6900000000'));
});
