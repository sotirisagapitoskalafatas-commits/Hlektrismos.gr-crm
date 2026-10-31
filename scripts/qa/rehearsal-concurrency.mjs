// Real-connection concurrency check for the atomic database steps, for a CRM-only staging project or a local Postgres.
// PGlite (the local tests) has one connection, so overlapping calls run one after another there: only this script shows the locks working across
// connections, which is what several Edge Function instances are.
//
//   node scripts/qa/rehearsal-concurrency.mjs --plan                 prints what would run; touches nothing
//   CONCURRENCY_DB_URL=... node scripts/qa/rehearsal-concurrency.mjs --target-ref <ref>
//
// Refuses the production project and the shared hotel project by reference. Uses a bucket and event prefix unique to the run, and removes what it wrote
// from function_rate_limits and lead_webhook_events. Leads it creates are synthetic and are removed too. Requires the `pg` package, which is not a project
// dependency: run it from a folder that has it.
const REFUSED = ['nonaymiwdayfuulccxrl', 'jiencxiapucrexpmzxbo'];
const PARALLEL = 16;
const LIMIT = 5;

export const plan = () => [
  `${PARALLEL} connections call consume_rate_limits on one bucket with limit ${LIMIT}: exactly ${LIMIT} must pass and the counter must read ${LIMIT}`,
  `${PARALLEL} connections call consume_rate_limits on two shared buckets in opposite order: no deadlock, and both counters stay equal`,
  `${PARALLEL} connections call ingest_webhook_lead with one event id: exactly one creates a lead`,
  `${PARALLEL} connections call ingest_webhook_lead with no event id and one contact: exactly one creates a lead`,
];

export function refuse(ref, url) {
  if (!ref) return 'pass --target-ref';
  if (REFUSED.includes(ref)) return `refusing ${ref}: this script never runs on production or the shared hotel project`;
  if (!url) return 'CONCURRENCY_DB_URL is not set';
  if (REFUSED.some((r) => url.includes(r))) return 'refusing: the connection string names a protected project';
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--plan')) { for (const line of plan()) console.log(`- ${line}`); return; }
  const ref = args[args.indexOf('--target-ref') + 1];
  const url = process.env.CONCURRENCY_DB_URL;
  const stop = refuse(args.includes('--target-ref') ? ref : null, url);
  if (stop) { console.error(stop); process.exit(2); }

  const { default: pg } = await import('pg');
  const run = `conc-${Date.now()}`;
  const pool = new pg.Pool({ connectionString: url, max: PARALLEL });
  const many = (fn) => Promise.all(Array.from({ length: PARALLEL }, (_, i) => fn(i)));
  const item = (bucket, limit) => ({ bucket, limit, window_seconds: 3600 });
  const consume = async (items) => (await pool.query('select public.consume_rate_limits($1::jsonb) r', [JSON.stringify(items)])).rows[0].r;
  const ingest = async (event, hash) => (await pool.query('select public.ingest_webhook_lead($1,$2,$3,$4::jsonb) r', [run, event, hash, JSON.stringify({
    full_name: 'Concurrency Test', first_name: 'Concurrency', client_name: 'Concurrency Test', client_contact: `${run}@example.invalid`, status: 'new', source: 'campaign', source_label: run, age_confirmed: true,
  })])).rows[0].r;
  const failures = [];
  const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures.push(what); };
  try {
    const one = await many(() => consume([item(`${run}:a`, LIMIT)]));
    check(one.filter((r) => r.ok).length === LIMIT, 'one bucket: exactly the limit passes');
    const hits = (await pool.query('select sum(hits)::int n from public.function_rate_limits where bucket = $1', [`${run}:a`])).rows[0].n;
    check(hits === LIMIT, 'one bucket: the counter equals the limit');

    await many((i) => consume(i % 2 ? [item(`${run}:x`, 1000), item(`${run}:y`, 1000)] : [item(`${run}:y`, 1000), item(`${run}:x`, 1000)]));
    const pair = (await pool.query('select bucket, hits from public.function_rate_limits where bucket in ($1, $2)', [`${run}:x`, `${run}:y`])).rows;
    check(pair.length === 2 && pair.every((r) => r.hits === PARALLEL), 'two buckets in opposite order: no deadlock, both counted');

    const byEvent = await many(() => ingest('evt-1', null));
    check(byEvent.filter((r) => !r.duplicate).length === 1 && new Set(byEvent.map((r) => r.lead_id)).size === 1, 'one event id: one lead');
    const byContact = await many(() => ingest(null, run));
    check(byContact.filter((r) => !r.duplicate).length === 1 && new Set(byContact.map((r) => r.lead_id)).size === 1, 'one contact without an id: one lead');
  } finally {
    await pool.query('delete from public.function_rate_limits where bucket like $1', [`${run}:%`]);
    await pool.query('delete from public.lead_webhook_events where source = $1', [run]);
    await pool.query('delete from public.activity_log where details ->> $1 = $2', ['source', run]);
    await pool.query('delete from public.leads where source_label = $1', [run]);
    await pool.end();
  }
  process.exit(failures.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('rehearsal-concurrency.mjs')) main();
