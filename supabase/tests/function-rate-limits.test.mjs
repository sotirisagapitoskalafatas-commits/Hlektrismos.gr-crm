// LOCAL verification only (embedded Postgres via PGlite) of the durable rate limit in phase1/21b. NOT staging or production evidence.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const db = new PGlite();
const hit = async (b, limit = 3, win = 3600) => (await db.query('select public.consume_rate_limit($1,$2,$3) ok', [b, limit, win])).rows[0].ok;
const as = async (r) => { await db.exec('reset role'); if (r) await db.exec(`set role ${r}`); };

before(async () => {
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role;
    create table public.campaign_sends (id serial primary key, campaign_id uuid, lead_id uuid, status text);`);
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
  const cost = async (n) => (await db.query('select public.consume_rate_limit($1,$2,$3,$4) ok', ['batch', 150, 3600, n])).rows[0].ok;
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
