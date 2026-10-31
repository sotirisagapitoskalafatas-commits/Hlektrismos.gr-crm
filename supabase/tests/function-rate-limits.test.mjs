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
  await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role;');
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
