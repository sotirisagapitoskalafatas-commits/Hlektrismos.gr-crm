// LOCAL verification only (embedded Postgres via PGlite) of the durable rate limit in phase1/21b. NOT staging or production evidence.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const hit = async (b, limit = 3, win = 3600) => (await db.query('select public.consume_rate_limits($1::jsonb) r', [JSON.stringify([{ bucket: b, limit, window_seconds: win }])])).rows[0].r.ok;
const as = async (r) => { await db.exec('reset role'); if (r) await db.exec(`set role ${r}`); };

before(async () => {
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role;
    create table public.campaign_sends (id serial primary key, campaign_id uuid, lead_id uuid, status text);
    create function public.is_role(r text) returns boolean language sql as 'select false';`);
  for (let i = 0; i < 2; i++) await db.exec(read('../staged-migrations/phase1/21b_function_rate_limits.sql'));
});

test('applies twice; allows up to the limit, then refuses; buckets are independent', async () => {
  await as('service_role');
  assert.deepEqual([await hit('a'), await hit('a'), await hit('a'), await hit('a')], [true, true, true, false]);
  assert.equal(await hit('b'), true);
});

test('concurrent attempts share one counter: exactly the limit succeed', async () => {
  await as('service_role');
  const r = await Promise.all(Array.from({ length: 20 }, () => hit('burst', 5)));
  assert.equal(r.filter(Boolean).length, 5);
});

test('cost counts recipients: a batch uses up the limit by its size', async () => {
  await as('service_role');
  const cost = async (n) => (await db.query('select public.consume_rate_limits($1::jsonb) r', [JSON.stringify([{ bucket: 'batch', limit: 150, window_seconds: 3600, cost: n }])])).rows[0].r.ok;
  assert.deepEqual([await cost(100), await cost(50), await cost(1)], [true, true, false]);
  await assert.rejects(() => cost(0));
});

test('the unique index makes the send claim atomic: a second claim of the same campaign and lead inserts nothing', async () => {
  await as(null);
  const claim = "insert into public.campaign_sends (campaign_id, lead_id, status) values ('aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','queued') on conflict (campaign_id, lead_id) do nothing returning id";
  assert.equal((await db.query(claim)).rows.length, 1);
  assert.equal((await db.query(claim)).rows.length, 0);
});

test('a new window starts a new count; old windows are separate rows', async () => {
  await as(null);
  await db.exec("insert into public.function_rate_limits values ('w', now() - interval '3 hours', 999)");
  await as('service_role');
  assert.equal(await hit('w', 3), true);
});

test('invalid arguments raise (the caller then fails closed)', async () => {
  await as('service_role');
  await assert.rejects(() => hit('', 3));
  await assert.rejects(() => hit('x', 0));
  await assert.rejects(() => hit('x'.repeat(201), 3));
});

const items = (...x) => JSON.stringify(x.map(([bucket, limit, cost]) => ({ bucket, limit, window_seconds: 3600, ...(cost ? { cost } : {}) })));
const many = async (json) => (await db.query('select public.consume_rate_limits($1::jsonb) r', [json])).rows[0].r;
const hits = async (b) => Number((await db.query('select coalesce(sum(hits), 0) n from public.function_rate_limits where bucket = $1', [b])).rows[0].n);

test('several limits move together: a refusal by any one of them advances none', async () => {
  await as('service_role');
  assert.deepEqual(await many(items(['m1', 2], ['m2', 1])), { ok: true });
  assert.deepEqual(await many(items(['m1', 2], ['m2', 1])), { ok: false, bucket: 'm2' }, 'the bucket that refused is named');
  assert.equal(await hits('m1'), 1, 'm1 was not advanced by the refused call');
  assert.deepEqual(await many(items(['m1', 2], ['m3', 5])), { ok: true }, 'the unused unit is still there');
  assert.equal(await hits('m1'), 2);
});

test('a refused attempt does not raise the count, and exactly the limit passes under a burst of calls', async () => {
  await as('service_role');
  const r = await Promise.all(Array.from({ length: 20 }, () => many(items(['burst-many', 5]))));
  assert.equal(r.filter((x) => x.ok).length, 5);
  assert.equal(await hits('burst-many'), 5);
});

test('once-locks: one caller takes the key, the expiry is per key, release gives it back, and only service_role reaches them', async () => {
  await as('service_role');
  const claim = async (k, s = 600) => (await db.query('select public.claim_once($1, $2) r', [k, s])).rows[0].r;
  const results = await Promise.all(Array.from({ length: 8 }, () => claim('o1')));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await claim('o2'), true, 'another key is free');
  await db.query('select public.release_once($1)', ['o1']);
  assert.equal(await claim('o1'), true, 'released');
  await as(null);
  await db.exec("update public.function_once_locks set expires_at = now() - interval '1 second' where key = 'o2'");
  await as('service_role');
  assert.equal(await claim('o2'), true, 'expired: free again, whatever the clock boundary');
  assert.equal(await claim('o2'), false, 'and held again');
  await assert.rejects(() => claim(''));
  await assert.rejects(() => claim('x', 0));
  await assert.rejects(() => claim('x', 90000));
  for (const r of ['anon', 'authenticated']) {
    await as(r);
    await assert.rejects(() => db.query("select public.claim_once('a', 1)"), /permission denied/);
    await assert.rejects(() => db.query("select public.release_once('a')"), /permission denied/);
    await assert.rejects(() => db.query('select * from public.function_once_locks'), /permission denied/);
  }
  await as(null);
});

test('cost, duplicates and bad input: a cost above the limit is refused, the same bucket twice raises, bad input raises', async () => {
  await as('service_role');
  assert.deepEqual(await many(items(['c1', 3, 4])), { ok: false, bucket: 'c1' });
  assert.deepEqual(await many(items(['c2', 3, 3])), { ok: true });
  await assert.rejects(() => many(items(['d1', 3, 2], ['d1', 3, 2])), /appears twice/);
  assert.equal(await hits('d1'), 0);
  for (const bad of ['[]', '{}', 'null', items(['x', 0]), JSON.stringify([{ bucket: '', limit: 1, window_seconds: 1 }]), JSON.stringify([{ bucket: 'x', limit: 1 }])]) {
    await assert.rejects(() => many(bad), undefined, bad);
  }
  await assert.rejects(() => many(JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ bucket: `b${i}`, limit: 1, window_seconds: 60 })))));
});

test('communication_log: service_role inserts and reads, nobody can change or delete a row, anon and a non-admin see nothing', async () => {
  await as('service_role');
  const ins = "insert into public.communication_log (action, result, actor_kind) values ('sms', 'attempt', 'service')";
  await db.exec(ins);
  await assert.rejects(() => db.exec('update public.communication_log set result = \'sent\''), /permission denied|append-only/);
  await assert.rejects(() => db.exec('delete from public.communication_log'), /permission denied|append-only/);
  await assert.rejects(() => db.exec("insert into public.communication_log (action, result, actor_kind) values ('sms', 'attempt', 'user')"), /communication_log_user_named/, 'a user send must name the user');
  await as(null);
  await assert.rejects(() => db.exec('update public.communication_log set result = \'sent\''), /append-only/, 'not even the table owner');
  await as('anon');
  await assert.rejects(() => db.query('select * from public.communication_log'), /permission denied/);
  await as('authenticated');
  assert.equal((await db.query('select * from public.communication_log')).rows.length, 0, 'is_role is false here: RLS hides every row');
  await assert.rejects(() => db.exec(ins), /permission denied/);
  await as(null);
});

test('anon and authenticated can neither call it nor touch the table', async () => {
  for (const r of ['anon', 'authenticated']) {
    await as(r);
    await assert.rejects(() => hit('z'), /permission denied/);
    await assert.rejects(() => db.query('select * from public.function_rate_limits'), /permission denied/);
    await assert.rejects(() => db.query("delete from public.function_rate_limits"), /permission denied/);
  }
  await as(null);
});

test('rollback removes both objects', async () => {
  await as(null);
  await db.exec(read('../../docs/ops/rollback_phase1_21b_function_rate_limits.sql'));
  assert.equal((await db.query("select to_regclass('public.function_rate_limits') t")).rows[0].t, null);
});
