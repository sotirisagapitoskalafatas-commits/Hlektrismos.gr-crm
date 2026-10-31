// The real send-offer and accept-offer handlers calling the real phase3/10 SQL on embedded Postgres (PGlite). LOCAL only.
// PGlite has one connection, so overlapping requests run in turn inside the database: this proves logic, rollback and grants, and the unique indexes that hold
// regardless of timing, not row locks under real parallel connections (scripts/qa/rehearsal-concurrency.mjs covers those on a real Postgres).
import test, { before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { loadFunction, createDb } from './helpers/edge-harness.mjs';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const fnDir = fileURLToPath(new URL('../functions/', import.meta.url));
const bundle = (entry) => {
  const out = buildSync({ stdin: { contents: entry, resolveDir: fnDir + '_shared', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
};
const L = await bundle(`export * from './signed-link.ts'; export { phoneKey, emailKey } from './contact-keys.ts';`);

const SECRET = 'link-signing-secret-Q7w2Lm9Zp4VdR1tY8hNc5sGa';
const SITE = 'https://crm.example.test';
const ADMIN = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const AGENT = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const LEAD = 'bbbbbbbb-0000-4000-8000-0000000000a1';
const LEAD2 = 'bbbbbbbb-0000-4000-8000-0000000000a2';
const TARIFF = 'cccccccc-0000-4000-8000-0000000000a1';
const TARIFF2 = 'cccccccc-0000-4000-8000-0000000000a2';
const users = { 'tok-admin': ADMIN, 'tok-agent': AGENT };
const GATE = { OUTREACH_ENABLED: 'on', LEGAL_APPROVAL_RECORDED: 'yes', SITE_URL: SITE, LINK_SIGNING_SECRET: SECRET, UNSUBSCRIBE_SECRET: 'unsubscribe-secret-not-real-000000000000' };

const withSecret = async (fn) => {
  const prev = globalThis.Deno;
  globalThis.Deno = { env: { get: (k) => (k === 'LINK_SIGNING_SECRET' ? SECRET : undefined) } };
  try { return await fn(); } finally { globalThis.Deno = prev; }
};
const sign = (ttl, ...parts) => withSecret(() => L.signExpiringLink('accept-offer-v2', ttl, ...parts));
const signOld = (...a) => withSecret(() => L.signLink(...a));
const signOldExpiring = (...a) => withSecret(() => L.signExpiringLink(...a));

const NOON_ATHENS = Date.parse('2026-10-30T10:00:00Z');
const withClock = async (fn) => {
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [NOON_ATHENS])); }
    static now() { return NOON_ATHENS; }
  };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
};

const pg = new PGlite();
const as = async (r) => { await pg.exec('reset role'); if (r) await pg.exec(`set role ${r}`); };
const one = async (sql, p) => { await as(null); return (await pg.query(sql, p)).rows; };

before(async () => {
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create function public.is_role(r text) returns boolean language sql as 'select false';
    create table public.hlektrismos_leads (id uuid primary key, status text default 'new', deleted_at timestamptz, converted_at timestamptz, last_contact_at timestamptz, first_name text, last_name text, email text, phone text, assigned_to uuid);
    create table public.energy_tariffs (id uuid primary key, provider_name text not null, program_name text not null);
    create table public.crm_tasks (id uuid primary key default gen_random_uuid(), lead_id uuid references public.hlektrismos_leads(id) on delete cascade, tariff_id uuid, title text not null, description text, status text, priority text, due_date timestamptz, completed_at timestamptz, created_at timestamptz default now());
    create table public.lead_notes (id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.hlektrismos_leads(id) on delete cascade, content text not null, author text not null, note_type text not null, created_at timestamptz default now());
    grant all on public.hlektrismos_leads, public.energy_tariffs, public.crm_tasks, public.lead_notes to service_role;`);
  for (let i = 0; i < 2; i++) await pg.exec(read('../staged-migrations/phase3/10_offer_lifecycle.sql'));
});

beforeEach(async () => {
  await as(null);
  await pg.exec(`set session_replication_role = replica; truncate public.offer_events, public.offer_legacy_link_reviews, public.offers, public.crm_tasks, public.lead_notes, public.hlektrismos_leads, public.energy_tariffs cascade; set session_replication_role = default;
    insert into public.hlektrismos_leads (id, assigned_to, first_name, email, phone) values ('${LEAD}', '${AGENT}', 'Α', 'a@example.gr', '6900000001'), ('${LEAD2}', '${AGENT}', 'Β', 'b@example.gr', '6900000002');
    insert into public.energy_tariffs values ('${TARIFF}', 'Πάροχος', 'Πρόγραμμα'), ('${TARIFF2}', 'Άλλος', 'Άλλο');`);
});

// Real SQL behind the fake client: every rpc of phase3/10 runs on PGlite as service_role.
function realRpc(db) {
  const call = (name) => async (args) => {
    try {
      await as('service_role');
      const names = Object.keys(args);
      const { rows } = await pg.query(`select public.${name}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) r`, names.map((n) => args[n]));
      return { data: rows[0].r, error: null };
    } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; } finally { await as(null); }
  };
  db.rpc = Object.fromEntries(['offer_create', 'offer_record_delivery', 'offer_mark_sent', 'offer_mark_failed', 'offer_accept', 'offer_note_legacy_link'].map((n) => [n, call(n)]));
  return db;
}

function senderDb(channels = ['email']) {
  const consent = (channel) => (channel === 'email'
    ? { address_kind: 'email', address_key: L.emailKey('a@example.gr'), channel, status: 'granted', basis: 'consent', evidence_ref: 'form-1', evidence_at: '2026-01-01T00:00:00Z' }
    : { address_kind: 'phone', address_key: L.phoneKey('6900000001'), channel, status: 'granted', basis: 'consent', evidence_ref: 'form-1', evidence_at: '2026-01-01T00:00:00Z' });
  return realRpc(createDb({
    profiles: [{ id: ADMIN, role: 'admin', is_active: true }, { id: AGENT, role: 'inside_sales', is_active: true }],
    hlektrismos_leads: [{ id: LEAD, assigned_to: AGENT, first_name: 'Α', email: 'a@example.gr', phone: '6900000001', status: 'new' }],
    energy_tariffs: [{ id: TARIFF, provider_name: 'Πάροχος', program_name: 'Πρόγραμμα' }],
    contact_consents: channels.map(consent), contact_objections: [], email_suppressions: [], outreach_decisions: [],
    crm_settings: [{ setting_key: 'RESEND_API_KEY', setting_value: 'resend-key-not-real' }, { setting_key: 'INFOBIP_API_KEY', setting_value: 'infobip-key-not-real' }, { setting_key: 'INFOBIP_BASE_URL', setting_value: 'https://infobip.example.test' }],
  }));
}
const ok = async () => new Response(JSON.stringify({ id: 'p-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
const sender = (db = senderDb(), env = {}, fetchHandler = ok) => loadFunction('send-offer', { db, users, env: { ...GATE, ...env }, fetchHandler });
const offerBody = { token: 'tok-admin', body: { lead_id: LEAD, tariff_id: TARIFF, estimated_cost: 42, savings: 7.5 } };
const acceptor = (env = {}) => loadFunction('accept-offer', { db: realRpc(createDb({})), env: { LINK_SIGNING_SECRET: SECRET, SITE_URL: SITE, ...env } });

const sendOne = async (env) => withClock(async () => {
  const f = await sender(undefined, env);
  const r = await f.call(offerBody);
  f.restore();
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const mail = JSON.parse(f.outbound.find((o) => /resend/.test(o.url)).body);
  const link = new URL(mail.text.match(/https:\/\/\S+/)[0].replace('/#/offer', '/offer'));
  return { id: r.json.offer_id, t: link.searchParams.get('t'), link, mail };
});
const status = async (id) => (await one('select status from public.offers where id = $1', [id]))[0]?.status;
const leadStatus = async (id = LEAD) => (await one('select status from public.hlektrismos_leads where id = $1', [id]))[0].status;
const events = async (id) => (await one('select event from public.offer_events where offer_id = $1 order by id', [id])).map((r) => r.event);
const seeded = async ({ lead = LEAD, tariff = TARIFF, expires = "now() + interval '1 day'", state = 'sent' } = {}) =>
  (await one(`insert into public.offers (lead_id, tariff_id, status, purpose, provider_name, program_name, expires_at) values ($1, $2, $3, 'promotional', 'Πάροχος', 'Πρόγραμμα', ${expires}) returning id`, [lead, tariff, state]))[0].id;
const noteCount = async () => Number((await one('select count(*) n from public.lead_notes'))[0].n);
const taskCount = async () => Number((await one('select count(*) n from public.crm_tasks'))[0].n);

// ─── send-offer ───
test('send-offer: one record, a link bound to it on the CRM site, delivery and sent history, and the lead moved on as one step', async () => {
  const { id, t, link } = await sendOne();
  assert.equal(link.origin, SITE);
  assert.equal(link.searchParams.get('offer_id'), id);
  assert.equal(link.searchParams.get('lead_id'), LEAD);
  assert.equal(link.searchParams.get('tariff_id'), null, 'the tariff comes from the offer record');
  assert.equal(await withSecret(() => L.verifyExpiringLink(t, 'accept-offer-v2', id, LEAD)), 'ok');
  assert.equal(await status(id), 'sent');
  assert.deepEqual(await events(id), ['created', 'delivery_sent', 'sent']);
  assert.equal(await leadStatus(), 'follow_up');
  assert.equal(await taskCount(), 1);
  assert.equal(await noteCount(), 1);
  const [o] = await one('select * from public.offers where id = $1', [id]);
  assert.equal(o.created_by, ADMIN);
  assert.equal(o.purpose, 'promotional');
  assert.equal(o.provider_name, 'Πάροχος');
  assert.equal(Number(o.estimated_cost), 42);
});

test('send-offer: the link is never returned to staff', async () => {
  await withClock(async () => {
    const f = await sender();
    const r = await f.call(offerBody);
    assert.ok(!JSON.stringify(r.json).includes('/#/offer'));
    assert.equal(r.json.accept_url, undefined);
    f.restore();
  });
});

test('send-offer: a double click sends one offer; overlapping requests send one offer', async () => {
  await withClock(async () => {
    const f = await sender();
    const [a, b] = await Promise.all([f.call(offerBody), f.call(offerBody)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal(f.outbound.filter((o) => /resend/.test(o.url)).length, 1);
    assert.equal(Number((await one('select count(*) n from public.offers'))[0].n), 1);
    f.restore();
  });
});

test('send-offer: an older open offer is replaced, and its link then says closed', async () => {
  const { id, t } = await sendOne();
  await one(`update public.offers set created_at = '2026-10-30T09:00:00Z' where id = $1`, [id]); // the handlers below run on the pinned clock
  await one(`update public.hlektrismos_leads set status = 'new'`);
  const second = await sendOne();
  assert.notEqual(second.id, id);
  assert.equal(await status(id), 'superseded');
  const a = await acceptor();
  assert.equal((await a.call({ body: { offer_id: id, lead_id: LEAD, t } })).json.state, 'closed');
  assert.equal(await leadStatus(), 'follow_up');
  a.restore();
});

test('send-offer: nothing delivered marks the offer failed, records nothing on the lead, and a retry works at once', async () => {
  await withClock(async () => {
    const f = await sender(undefined, {}, async () => new Response('{"to":"detail"}', { status: 500 }));
    assert.equal((await f.call(offerBody)).status, 502);
    f.restore();
    const [o] = await one('select id, status from public.offers');
    assert.equal(o.status, 'failed');
    assert.deepEqual(await events(o.id), ['created', 'delivery_failed', 'failed']);
    assert.equal(await leadStatus(), 'new');
    assert.equal(await taskCount(), 0);
    const g = await sender();
    assert.equal((await g.call(offerBody)).status, 200);
    g.restore();
  });
});

test('send-offer: without the migration nothing is sent; a closed, deleted or unknown record creates nothing', async () => {
  await withClock(async () => {
    const db = senderDb(); db.rpc.offer_create = async () => ({ data: null, error: { message: 'function does not exist' } });
    const f = await sender(db);
    assert.equal((await f.call(offerBody)).status, 503);
    assert.equal(f.outbound.length, 0);
    f.restore();
    for (const [change, code] of [[`status = 'customer'`, 409], [`status = 'lost'`, 409], [`deleted_at = now()`, 404]]) {
      await one(`update public.hlektrismos_leads set ${change} where id = $1`, [LEAD]);
      const g = await sender();
      assert.equal((await g.call(offerBody)).status, code, change);
      assert.equal(g.outbound.length, 0, change);
      g.restore();
      await one(`update public.hlektrismos_leads set status = 'new', deleted_at = null where id = $1`, [LEAD]);
    }
  });
});

test('send-offer: no consent on any channel means no offer record and nothing sent; each permitted channel is delivered and logged', async () => {
  await withClock(async () => {
    const f = await sender(senderDb([]));
    assert.equal((await f.call(offerBody)).status, 403);
    assert.equal(f.outbound.length, 0);
    assert.equal(Number((await one('select count(*) n from public.offers'))[0].n), 0);
    f.restore();
    const g = await sender(senderDb(['email', 'viber']));
    await g.call(offerBody);
    assert.deepEqual((await one(`select channel from public.offer_events where event = 'delivery_sent' order by channel`)).map((r) => r.channel), ['email', 'viber']);
    g.restore();
  });
});

test('promotional and requested are kept apart: a recorded request changes nothing until the owner approves, and never for another channel', async () => {
  await withClock(async () => {
    const withRequest = (channels = ['email'], extra = {}) => { const db = senderDb([]); db.rows('contact_service_requests').push({ lead_id: LEAD, request_type: 'quote', channels, withdrawn_at: null, expires_at: '2027-01-01T00:00:00Z', ...extra }); return db; };
    const run = async (db, env) => { const f = await sender(db, { OUTREACH_ENABLED: undefined, LEGAL_APPROVAL_RECORDED: undefined, ...env }); const r = await f.call(offerBody); f.restore(); return r.status; };
    assert.equal(await run(withRequest(), {}), 403, 'no consent, no approval: refused');
    assert.equal(await run(withRequest(), { SERVICE_COMMS_APPROVED: 'on' }), 403, 'only the exact value counts');
    assert.equal(await run(withRequest(['sms']), { SERVICE_COMMS_APPROVED: 'yes' }), 403, 'a request on another channel');
    assert.equal(await run(withRequest(['email'], { request_type: 'callback' }), { SERVICE_COMMS_APPROVED: 'yes' }), 403, 'a callback is not a quote request');
    assert.equal(await run(withRequest(['email'], { withdrawn_at: '2026-10-01T00:00:00Z' }), { SERVICE_COMMS_APPROVED: 'yes' }), 403, 'withdrawn');
    assert.equal(await run(withRequest(['email'], { expires_at: '2026-10-01T00:00:00Z' }), { SERVICE_COMMS_APPROVED: 'yes' }), 403, 'expired');
    assert.equal(await run(withRequest(), { SERVICE_COMMS_APPROVED: 'yes' }), 200, 'approved, live, evidenced, this channel');
    assert.equal((await one('select purpose from public.offers'))[0].purpose, 'requested_service');
  });
});

test('a stop-all objection still stops a requested quote', async () => {
  await withClock(async () => {
    const db = senderDb([]);
    db.rows('contact_service_requests').push({ lead_id: LEAD, request_type: 'quote', channels: ['email'], withdrawn_at: null, expires_at: '2027-01-01T00:00:00Z' });
    db.rows('contact_objections').push({ address_kind: 'email', address_key: 'a@example.gr', scope: 'all', channels: null, lifted_at: null });
    const f = await sender(db, { SERVICE_COMMS_APPROVED: 'yes' });
    assert.equal((await f.call(offerBody)).status, 403);
    f.restore();
  });
});

test('capability and ownership: another agent\'s lead is refused before any record exists', async () => {
  await withClock(async () => {
    const db = senderDb(); db.rows('hlektrismos_leads')[0].assigned_to = ADMIN;
    const f = await sender(db);
    assert.equal((await f.call({ ...offerBody, token: 'tok-agent' })).status, 403);
    assert.equal(Number((await one('select count(*) n from public.offers'))[0].n), 0);
    f.restore();
  });
});

// ─── accept-offer ───
test('acceptance: offer, lead, task, note and history change together, once', async () => {
  const { id, t } = await sendOne();
  const a = await acceptor();
  const r = await a.call({ body: { offer_id: id, lead_id: LEAD, t } });
  assert.equal(r.status, 200);
  assert.equal(r.json.state, 'accepted');
  assert.equal(await status(id), 'accepted');
  assert.equal(await leadStatus(), 'customer');
  assert.deepEqual((await events(id)).slice(-1), ['accepted']);
  assert.equal(await taskCount(), 2);
  assert.equal(await noteCount(), 2);
  const again = await a.call({ body: { offer_id: id, lead_id: LEAD, t } });
  assert.equal(again.json.state, 'already_accepted');
  assert.equal(await taskCount(), 2, 'a replay writes nothing');
  a.restore();
});

test('overlapping acceptances convert once', async () => {
  const { id, t } = await sendOne();
  const a = await acceptor();
  const r = await Promise.all(Array.from({ length: 6 }, () => a.call({ body: { offer_id: id, lead_id: LEAD, t } })));
  assert.equal(r.filter((x) => x.json.state === 'accepted').length, 1);
  assert.equal(r.filter((x) => x.json.state === 'already_accepted').length, 5);
  assert.equal(await noteCount(), 2);
  a.restore();
});

test('atomic: if the audit step fails nothing changes, and a retry completes', async () => {
  const { id, t } = await sendOne();
  await one(`create function public.fail_note() returns trigger language plpgsql as $$ begin raise exception 'notes down'; end $$`);
  await one(`create trigger fail_note before insert on public.lead_notes for each row execute function public.fail_note()`);
  const a = await acceptor();
  assert.equal((await a.call({ body: { offer_id: id, lead_id: LEAD, t } })).status, 500);
  assert.equal(await status(id), 'sent');
  assert.equal(await leadStatus(), 'follow_up', 'no conversion without its record');
  assert.equal(await taskCount(), 1);
  await one('drop trigger fail_note on public.lead_notes');
  await one('drop function public.fail_note()');
  assert.equal((await a.call({ body: { offer_id: id, lead_id: LEAD, t } })).json.state, 'accepted');
  a.restore();
});

test('binding: a token for one offer cannot accept another, for another lead, or with anything edited', async () => {
  const first = await seeded();
  const second = await seeded({ tariff: TARIFF2 });
  const other = await seeded({ lead: LEAD2 });
  const t = await sign(3600, first, LEAD);
  const a = await acceptor();
  const refused = async (body) => { const r = await a.call({ body }); assert.equal(r.status, 403, JSON.stringify(body).slice(0, 80)); assert.equal(r.json.state, 'invalid'); };
  await refused({ offer_id: second, lead_id: LEAD, t });
  await refused({ offer_id: other, lead_id: LEAD2, t });
  await refused({ offer_id: first, lead_id: LEAD2, t });
  await refused({ offer_id: first, lead_id: LEAD, t: `${t}x` });
  await refused({ offer_id: first, lead_id: LEAD, t: await signOldExpiring('accept-offer', 3600, first, LEAD) });
  const [exp, sig] = t.split('.');
  await refused({ offer_id: first, lead_id: LEAD, t: `${Number(exp) + 86400}.${sig}` });
  for (const id of [first, second, other]) assert.equal(await status(id), 'sent');
  assert.equal(await leadStatus(), 'new');
  a.restore();
});

test('binding in the database too: a genuine signature on an offer and lead that do not belong together finds nothing', async () => {
  const offer = await seeded();
  const a = await acceptor();
  const r = await a.call({ body: { offer_id: offer, lead_id: LEAD2, t: await sign(3600, offer, LEAD2) } });
  assert.equal(r.json.state, 'not_found');
  assert.equal(await status(offer), 'sent');
  a.restore();
});

test('eligibility: expired, withdrawn, superseded, failed, closed lead and deleted lead are refused and convert nothing', async () => {
  const a = await acceptor();
  for (const [name, setup, state, code] of [
    ['past the database expiry', { expires: "now() - interval '1 minute'" }, 'expired', 410],
    ['withdrawn', { state: 'withdrawn' }, 'closed', 409], ['superseded', { state: 'superseded' }, 'closed', 409], ['failed', { state: 'failed' }, 'closed', 409],
  ]) {
    const id = await seeded(setup);
    const r = await a.call({ body: { offer_id: id, lead_id: LEAD, t: await sign(3600, id, LEAD) } });
    assert.equal(r.json.state, state, name);
    assert.equal(r.status, code, name);
    assert.equal(await leadStatus(), 'new', name);
    await one('update public.offers set status = $1 where lead_id = $2', ['failed', LEAD]);
  }
  for (const [change, state] of [[`status = 'lost'`, 'closed'], [`status = 'unsubscribed'`, 'closed'], [`status = 'do_not_contact'`, 'closed'], [`status = 'customer'`, 'closed'], [`deleted_at = now()`, 'not_found']]) {
    const id = await seeded({ tariff: TARIFF2 });
    await one(`update public.hlektrismos_leads set ${change} where id = $1`, [LEAD]);
    assert.equal((await a.call({ body: { offer_id: id, lead_id: LEAD, t: await sign(3600, id, LEAD) } })).json.state, state, change);
    assert.equal(await status(id), 'sent', change);
    await one(`update public.hlektrismos_leads set status = 'new', deleted_at = null where id = $1`, [LEAD]);
    await one('update public.offers set status = $1 where id = $2', ['failed', id]);
  }
  a.restore();
});

test('an expired token is refused before the database; a refused attempt on a live offer leaves history', async () => {
  const id = await seeded();
  const past = Math.floor(Date.now() / 1000) - 10;
  const t = `${past}.${await withSecret(() => L.signLink('accept-offer-v2', String(past), id, LEAD))}`;
  const a = await acceptor();
  assert.equal((await a.call({ body: { offer_id: id, lead_id: LEAD, t } })).status, 410);
  assert.deepEqual(await events(id), []);
  await one(`update public.hlektrismos_leads set status = 'lost' where id = $1`, [LEAD]);
  await a.call({ body: { offer_id: id, lead_id: LEAD, t: await sign(3600, id, LEAD) } });
  assert.deepEqual(await events(id), ['accept_refused']);
  a.restore();
});

test('accepting one offer closes the lead\'s other open offers; a second can never be accepted', async () => {
  const first = await seeded();
  const second = await seeded({ tariff: TARIFF2 });
  const a = await acceptor();
  await a.call({ body: { offer_id: first, lead_id: LEAD, t: await sign(3600, first, LEAD) } });
  assert.equal(await status(second), 'superseded');
  assert.equal((await a.call({ body: { offer_id: second, lead_id: LEAD, t: await sign(3600, second, LEAD) } })).json.state, 'closed');
  a.restore();
});

test('the database itself refuses a second open or second accepted offer, whatever the code does', async () => {
  await seeded();
  await assert.rejects(() => seeded(), /offers_one_open/);
  const a = await seeded({ tariff: TARIFF2, state: 'expired' });
  await one(`update public.offers set status = 'accepted', accepted_at = now() where id = $1`, [a]);
  await one(`update public.offers set status = 'failed' where tariff_id = $1`, [TARIFF]);
  const b = await seeded({});
  await assert.rejects(() => one(`update public.offers set status = 'accepted', accepted_at = now() where id = $1`, [b]), /offers_one_accepted/);
  await assert.rejects(() => one(`update public.offers set status = 'accepted' where id = $1`, [b]), /offers_accepted_dated|offers_one_accepted/);
});

test('a GET changes nothing and redirects to the page with only the known fields; bad input and a missing secret are refused', async () => {
  const id = await seeded();
  const a = await acceptor();
  const r = await a.call({ method: 'GET', query: `?offer_id=${id}&lead_id=${LEAD}&t=abc&evil=https://x.test` });
  assert.equal(r.status, 303);
  assert.equal(await status(id), 'sent');
  assert.equal(await leadStatus(), 'new');
  for (const body of [{}, { offer_id: 'nope', lead_id: LEAD, t: 'x' }, { offer_id: id, lead_id: 'nope', t: 'x' }, { offer_id: id, lead_id: LEAD }, { offer_id: id, lead_id: LEAD, t: 5 }]) {
    assert.equal((await a.call({ body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await a.call({ method: 'PUT', body: {} })).status, 405);
  a.restore();
  const n = await acceptor({ LINK_SIGNING_SECRET: undefined });
  assert.equal((await n.call({ body: { offer_id: id, lead_id: LEAD, t: await sign(3600, id, LEAD) } })).status, 403);
  n.restore();
});

test('the redirect target is configuration and carries no other parameter', async () => {
  const f = await acceptor();
  const r = await f.raw({ method: 'GET', query: `?lead_id=${LEAD}&tariff_id=${TARIFF}&next=https://evil.test` });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), `${SITE}/#/offer?lead_id=${LEAD}&tariff_id=${TARIFF}`);
  f.restore();
  const none = await acceptor({ SITE_URL: undefined });
  assert.equal((await none.call({ method: 'GET', query: `?lead_id=${LEAD}&tariff_id=${TARIFF}` })).status, 405);
  none.restore();
});

// ─── old links ───
const legacyTask = () => one(`insert into public.crm_tasks (lead_id, tariff_id, title) values ($1, $2, 'Προσφορά στάλθηκε: Π - Π')`, [LEAD, TARIFF]);
const reviews = () => one('select * from public.offer_legacy_link_reviews');

test('old links never convert: each format with a recorded offer goes to a person and the customer record is untouched', async () => {
  const a = await acceptor();
  await legacyTask();
  for (const [format, t] of [['unsigned', undefined], ['signed_no_expiry', await signOld('accept-offer', LEAD, TARIFF)], ['signed_expiring', await signOldExpiring('accept-offer', 3600, LEAD, TARIFF)]]) {
    await one('delete from public.offer_legacy_link_reviews');
    const r = await a.call({ body: { lead_id: LEAD, tariff_id: TARIFF, ...(t ? { t } : {}) } });
    assert.equal(r.status, 202, format);
    assert.equal(r.json.state, 'needs_review', format);
    const [row] = await reviews();
    assert.equal(row.link_format, format);
    assert.equal(row.signature_valid, format !== 'unsigned');
    assert.equal(await leadStatus(), 'new', format);
  }
  await a.call({ body: { lead_id: LEAD, tariff_id: TARIFF } });
  assert.equal((await reviews())[0].hits, 2, 'pressing again adds to the same row');
  a.restore();
});

test('an old link with no recorded offer stores nothing; a forged signature stores nothing', async () => {
  const a = await acceptor();
  assert.equal((await a.call({ body: { lead_id: LEAD, tariff_id: TARIFF } })).status, 404);
  assert.equal((await reviews()).length, 0);
  await legacyTask();
  assert.equal((await a.call({ body: { lead_id: LEAD, tariff_id: TARIFF, t: 'forged' } })).status, 403);
  assert.equal((await a.call({ body: { lead_id: LEAD, tariff_id: TARIFF, t: 42 } })).status, 403);
  assert.equal((await a.call({ body: { lead_id: 'x', tariff_id: TARIFF } })).status, 400);
  assert.equal((await reviews()).length, 0);
  a.restore();
});

test('an old link opened in a browser reaches the page and changes nothing', async () => {
  const a = await acceptor();
  await legacyTask();
  assert.equal((await a.call({ method: 'GET', query: `?lead_id=${LEAD}&tariff_id=${TARIFF}` })).status, 303);
  assert.equal(await leadStatus(), 'new');
  assert.equal((await reviews()).length, 0);
  a.restore();
});

// ─── grants and history ───
test('only service_role reaches the functions; anon and a non-admin read nothing; history cannot be rewritten; rollback leaves leads', async () => {
  const id = await seeded();
  await one(`insert into public.offer_events (offer_id, event) values ($1, 'created')`, [id]);
  for (const role of ['anon', 'authenticated']) {
    await as(role);
    await assert.rejects(() => pg.query('select public.offer_accept($1, $2)', [id, LEAD]), /permission denied/, role);
    await assert.rejects(() => pg.query(`select public.offer_note_legacy_link($1, $2, 'unsigned', false)`, [LEAD, TARIFF]), /permission denied/, role);
    await assert.rejects(() => pg.query('insert into public.offers (lead_id, tariff_id, purpose, provider_name, program_name, expires_at) values ($1, $2, $3, $4, $5, now())', [LEAD, TARIFF, 'promotional', 'a', 'b']), /permission denied/, role);
  }
  await as('anon');
  await assert.rejects(() => pg.query('select * from public.offers'), /permission denied/);
  await as('authenticated');
  assert.equal((await pg.query('select * from public.offers')).rows.length, 0);
  await as(null);
  await assert.rejects(() => pg.exec(`update public.offer_events set event = 'accepted'`), /append-only/);
  await assert.rejects(() => pg.exec('delete from public.offer_events'), /append-only/);
  await as('service_role');
  await assert.rejects(() => pg.exec('delete from public.offer_events'), /permission denied|append-only/);
  await as(null);
  await pg.exec(`delete from public.hlektrismos_leads where id = '${LEAD}'`);
  assert.equal(Number((await one('select count(*) n from public.offer_events'))[0].n), 0, 'erasing a lead still works and takes its offers with it');
  await pg.exec(read('../../docs/ops/rollback_phase3_10_offer_lifecycle.sql'));
  assert.equal((await one(`select to_regclass('public.offers') t`))[0].t, null);
  assert.equal(Number((await one('select count(*) n from public.hlektrismos_leads'))[0].n), 1);
  for (let i = 0; i < 1; i++) await pg.exec(read('../staged-migrations/phase3/10_offer_lifecycle.sql'));
});
