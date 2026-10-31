// The real receive-lead-webhook handler calling the real phase1/21c SQL on embedded Postgres (PGlite). LOCAL only.
// PGlite has one connection, so overlapping requests here run one after another inside the database: this proves the logic, the rollback and the grants,
// not the lock under real parallel connections. scripts/qa/rehearsal-concurrency.mjs runs that part on a real Postgres (staging) when one exists.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { loadFunction, createDb } from './helpers/edge-harness.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const SECRET = 'lead-webhook-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa';
const h = { 'x-webhook-secret': SECRET };
const pg = new PGlite();
const count = async (t) => Number((await pg.query(`select count(*) n from public.${t}`)).rows[0].n);
const as = async (r) => { await pg.exec('reset role'); if (r) await pg.exec(`set role ${r}`); };

before(async () => {
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create table public.leads (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), client_name text not null, client_contact text not null,
      status text, first_name text not null, last_name text, email text, phone text, region text, comments text, gdpr_consent boolean, full_name text, company text, source text,
      lead_type text, consent_version text not null default 'v1', consent_granted_at timestamptz, consent_source text, campaign_id text, campaign_name text, source_label text, age_confirmed boolean not null default false);
    create table public.activity_log (id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid, action text not null, details jsonb, created_at timestamptz not null default now());
    grant all on public.leads, public.activity_log to service_role;`);
  for (let i = 0; i < 2; i++) await pg.exec(read('../staged-migrations/phase1/21c_lead_webhook_idempotency.sql'));
});

const handler = async (extraRpc) => {
  const db = createDb({});
  db.rpc = {
    ingest_webhook_lead: extraRpc ?? (async (a) => {
      try {
        await as('service_role');
        const { rows } = await pg.query('select public.ingest_webhook_lead($1,$2,$3,$4::jsonb) r', [a.p_source, a.p_event_id, a.p_contact_hash, JSON.stringify(a.p_lead)]);
        return { data: rows[0].r, error: null };
      } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    }),
  };
  return loadFunction('receive-lead-webhook', { db, env: { LEAD_WEBHOOK_SECRET: SECRET } });
};
const body = (over = {}) => ({ first_name: 'Δοκιμή', email: 'one@example.gr', age_confirmed: true, consent: true, ...over });

test('the same event id is one lead, however many times it arrives and however the contact is spelled', async () => {
  const f = await handler();
  const before = await count('leads');
  const a = await f.call({ body: body({ event_id: 'evt-1' }), headers: h });
  const b = await f.call({ body: body({ event_id: 'evt-1' }), headers: h });
  const c = await f.call({ body: body({ event_id: 'evt-1', email: 'changed@example.gr' }), headers: h });
  assert.equal(a.status, 200);
  assert.equal(b.json.duplicate, true);
  assert.equal(c.json.duplicate, true, 'the event id decides, not the content');
  assert.equal(b.json.lead_id, a.json.lead_id);
  assert.equal(await count('leads'), before + 1);
  f.restore();
});

test('overlapping deliveries of one event create one lead and one audit row', async () => {
  const f = await handler();
  const leads = await count('leads'), audit = await count('activity_log');
  const r = await Promise.all(Array.from({ length: 8 }, () => f.call({ body: body({ event_id: 'evt-burst', email: 'burst@example.gr' }), headers: h })));
  assert.equal(new Set(r.map((x) => x.json.lead_id)).size, 1);
  assert.equal(r.filter((x) => !x.json.duplicate).length, 1);
  assert.equal(await count('leads'), leads + 1);
  assert.equal(await count('activity_log'), audit + 1);
  f.restore();
});

test('the id may come from a header or from the sender\'s own field; two different events are two leads', async () => {
  const f = await handler();
  const a = await f.call({ body: body({ email: 'h@example.gr' }), headers: { ...h, 'x-event-id': 'hdr-1' } });
  const b = await f.call({ body: body({ email: 'h@example.gr' }), headers: { ...h, 'idempotency-key': 'hdr-1' } });
  assert.equal(b.json.lead_id, a.json.lead_id);
  const c = await f.call({ body: body({ email: 'lg@example.gr', leadgen_id: 8675309 }), headers: h });
  const d = await f.call({ body: body({ email: 'lg@example.gr', leadgen_id: 8675309 }), headers: h });
  assert.equal(d.json.lead_id, c.json.lead_id);
  const e = await f.call({ body: body({ email: 'lg@example.gr', leadgen_id: 8675310 }), headers: h });
  assert.notEqual(e.json.lead_id, c.json.lead_id);
  f.restore();
});

test('a generic body.id is not an event id: a constant form id must not swallow later leads', async () => {
  const f = await handler();
  const a = await f.call({ body: body({ id: 'form-7', email: 'g1@example.gr' }), headers: h });
  const b = await f.call({ body: body({ id: 'form-7', email: 'g2@example.gr' }), headers: h });
  assert.notEqual(b.json.lead_id, a.json.lead_id);
  f.restore();
});

test('a long source label from the sender is stored, not refused forever', async () => {
  const f = await handler();
  const r = await f.call({ body: body({ source_label: 'x'.repeat(300), email: 'label@example.gr' }), headers: h });
  assert.equal(r.status, 200);
  f.restore();
});

test('the same event id from another source is another event', async () => {
  const f = await handler();
  const a = await f.call({ body: body({ event_id: 'shared', email: 's1@example.gr' }), headers: { ...h, 'x-source': 'facebook' } });
  const b = await f.call({ body: body({ event_id: 'shared', email: 's2@example.gr' }), headers: { ...h, 'x-source': 'google' } });
  assert.notEqual(b.json.lead_id, a.json.lead_id);
  f.restore();
});

test('without an id: the same contact inside ten minutes is one lead (spelling does not matter); after the window it is new', async () => {
  const f = await handler();
  const a = await f.call({ body: body({ email: 'Window@Example.gr' }), headers: h });
  const b = await f.call({ body: body({ email: 'window@example.gr ' }), headers: h });
  assert.equal(b.json.duplicate, true);
  assert.equal(b.json.lead_id, a.json.lead_id);
  await as(null);
  await pg.exec(`update public.lead_webhook_events set created_at = now() - interval '11 minutes' where event_key like 'contact:%'`);
  const c = await f.call({ body: body({ email: 'window@example.gr' }), headers: h });
  assert.equal(c.json.duplicate, undefined);
  assert.notEqual(c.json.lead_id, a.json.lead_id);
  f.restore();
});

test('a failure rolls everything back, so the sender\'s retry creates the lead (safe retry)', async () => {
  const f = await handler();
  await as(null);
  await pg.exec(`create function public.fail_audit() returns trigger language plpgsql as $$ begin raise exception 'audit down'; end $$;
    create trigger fail_audit before insert on public.activity_log for each row execute function public.fail_audit();`);
  const leads = await count('leads');
  const first = await f.call({ body: body({ event_id: 'evt-retry', email: 'retry@example.gr' }), headers: h });
  assert.equal(first.status, 500);
  assert.ok(!JSON.stringify(first.json).includes('retry@example.gr'));
  assert.equal(await count('leads'), leads, 'no lead without its audit row');
  assert.equal(Number((await pg.query(`select count(*) n from public.lead_webhook_events where event_key = 'event:evt-retry'`)).rows[0].n), 0, 'the event is not claimed');
  await as(null);
  await pg.exec('drop trigger fail_audit on public.activity_log; drop function public.fail_audit();');
  const second = await f.call({ body: body({ event_id: 'evt-retry', email: 'retry@example.gr' }), headers: h });
  assert.equal(second.status, 200);
  assert.equal(second.json.duplicate, undefined);
  assert.equal(await count('leads'), leads + 1);
  f.restore();
});

test('an unavailable function answers 500 and reports no lead', async () => {
  const f = await handler(async () => ({ data: null, error: { code: '42883', message: 'function does not exist' } }));
  assert.equal((await f.call({ body: body(), headers: h })).status, 500);
  f.restore();
  const g = await handler(async () => ({ data: null, error: null }));
  assert.equal((await g.call({ body: body(), headers: h })).status, 500, 'an empty answer is not success');
  g.restore();
  const k = await handler(async () => ({ data: {}, error: null }));
  const r = await k.call({ body: body(), headers: h });
  assert.equal(r.status, 500, 'an answer naming no lead is not success');
  assert.equal(r.json.success, undefined);
  k.restore();
});

test('input validation: bad email or phone, overlong and hostile fields, odd custom_questions, unusable event ids', async () => {
  const f = await handler();
  assert.equal((await f.call({ body: body({ email: 'not-an-email' }), headers: h })).status, 400);
  assert.equal((await f.call({ body: body({ email: '', phone: 'call me maybe' }), headers: h })).status, 400);
  const long = await f.call({ body: body({ email: 'long@example.gr', first_name: 'x'.repeat(5000), comments: 'y'.repeat(50_000), custom_questions: 'not an object' }), headers: h });
  assert.equal(long.status, 200);
  await as(null);
  const { rows } = await pg.query('select first_name, comments from public.leads where id = $1', [long.json.lead_id]);
  assert.equal(rows[0].first_name.length, 100);
  assert.equal(rows[0].comments.length, 4000);
  const bad = await f.call({ body: body({ email: 'evt@example.gr', event_id: 'has spaces\nand newline' }), headers: h });
  assert.equal(bad.status, 200, 'an unusable id falls back to the contact window');
  await as(null);
  assert.equal(Number((await pg.query(`select count(*) n from public.lead_webhook_events where event_key like '%newline%'`)).rows[0].n), 0);
  f.restore();
});

test('only service_role reaches the table and the function', async () => {
  for (const role of ['anon', 'authenticated']) {
    await as(role);
    await assert.rejects(() => pg.query(`select public.ingest_webhook_lead('a','b',null,'{}'::jsonb)`), /permission denied/, role);
    await assert.rejects(() => pg.query('select * from public.lead_webhook_events'), /permission denied/, role);
  }
  await as(null);
});

test('rollback removes both objects and leaves the leads', async () => {
  await as(null);
  const leads = await count('leads');
  await pg.exec(read('../../docs/ops/rollback_phase1_21c_lead_webhook_idempotency.sql'));
  assert.equal((await pg.query(`select to_regclass('public.lead_webhook_events') t, to_regprocedure('public.ingest_webhook_lead(text,text,text,jsonb)') f`)).rows[0].t, null);
  assert.equal(await count('leads'), leads);
});
