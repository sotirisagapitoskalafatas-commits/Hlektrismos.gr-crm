// The screens offer Back Office the transitions listed in src/lib/applications.ts. The DATABASE decides. This test replays every (from, to) pair against the real guard
// trigger and requires the two to agree, in both directions, so a button is never offered that the database refuses, and nothing the database allows is missing.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { buildFinalDb, ADMIN, A } from './helpers/final-chain.mjs';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url)).replace(/[\/]$/, '');
const out = await build({ stdin: { contents: "export * from '@/lib/applications';", resolveDir: SRC, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error', alias: { '@': SRC } });
const App = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

let db, as, run, one, su, ids;
before(async () => { ({ db, as, run, one, su, ids } = await buildFinalDb()); });

test('every (from, to) pair: the screen offers it if and only if the database allows it for Back Office', async () => {
  const disagreements = [];
  for (const from of App.APPLICATION_STATUSES) {
    for (const to of App.APPLICATION_STATUSES) {
      if (from === to) continue;
      await su();
      const id = (await db.query("insert into public.energy_applications (customer_id, created_by, assigned_to_user_id, service_type_code) values ($1::uuid, $2::uuid, $2::uuid, 'energy') returning id", [ids.CuA, A])).rows[0].id;
      await db.query('update public.energy_applications set status = $1 where id = $2::uuid', [from, id]);   // the service role / owner sets the starting state
      await as(ADMIN);
      const r = await run('update public.energy_applications set status = $1, status_reason = $2 where id = $3::uuid', [to, 'λόγος', id]);
      const dbAllows = r.ok && r.n === 1;
      const screenOffers = App.nextStatuses('admin', from).includes(to);
      if (dbAllows !== screenOffers) disagreements.push(`${from} -> ${to}: database ${dbAllows ? 'allows' : 'refuses'}, screen ${screenOffers ? 'offers' : 'does not offer'}`);
    }
  }
  assert.deepEqual(disagreements, []);
});

test('a Sales Agent is offered no status change, and the database refuses them all', async () => {
  const refusals = [];
  for (const from of ['draft', 'submitted', 'needs_documents']) {
    for (const to of App.APPLICATION_STATUSES) {
      if (from === to) continue;
      await su();
      const id = (await db.query("insert into public.energy_applications (customer_id, created_by, assigned_to_user_id) values ($1::uuid, $2::uuid, $2::uuid) returning id", [ids.CuA, A])).rows[0].id;
      await db.query('update public.energy_applications set status = $1 where id = $2::uuid', [from, id]);
      await as(A);
      const r = await run('update public.energy_applications set status = $1, status_reason = $2 where id = $3::uuid', [to, 'λόγος', id]);
      if (r.ok && r.n === 1) refusals.push(`${from} -> ${to} was allowed for a Sales Agent`);
      assert.deepEqual(App.nextStatuses('sales_agent', from), []);
    }
  }
  assert.deepEqual(refusals, []);
});

test('the reasons the screen asks for are exactly the ones the database requires', async () => {
  for (const to of App.APPLICATION_STATUSES) {
    if (['draft', 'submitted'].includes(to)) continue;
    await su();
    const from = to === 'completed' ? 'approved' : to === 'approved' ? 'processing' : to === 'processing' ? 'in_review' : to === 'in_review' ? 'submitted' : 'submitted';
    const id = (await db.query("insert into public.energy_applications (customer_id, created_by, assigned_to_user_id) values ($1::uuid, $2::uuid, $2::uuid) returning id", [ids.CuA, A])).rows[0].id;
    await db.query('update public.energy_applications set status = $1 where id = $2::uuid', [from, id]);
    await as(ADMIN);
    const noReason = await run('update public.energy_applications set status = $1 where id = $2::uuid', [to, id]);
    assert.equal(noReason.ok && noReason.n === 1, !App.REASON_REQUIRED.includes(to), `${to}: reason ${App.REASON_REQUIRED.includes(to) ? 'required' : 'not required'}`);
  }
});
