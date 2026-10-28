// LOCAL test harness for Supabase Edge Functions: loads a function's REAL index.ts (bundled with esbuild) with
// in-memory stand-ins for the Supabase client, Deno.env/serve/DNS and outbound fetch. It runs the function's own
// request handler, so tests exercise the actual authentication, authorization and validation code paths.
// It is NOT a Supabase runtime: the fake client implements only the query features the functions use, and
// unsupported chains fail loudly so a test cannot pass by accident.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FUNCTIONS = fileURLToPath(new URL('../../functions/', import.meta.url));
// The platform's NEW keys (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS are JSON dictionaries) and a stand-in
// for the EXPOSED legacy service-role JWT. The legacy variables and the custom SERVICE_ROLE_KEY carry that JWT,
// so a test can prove it is never used to build a client or accepted as a caller.
export const SERVICE_KEY = 'sb_secret_test_not_real_00000000000000';
export const PUBLISHABLE_KEY = 'sb_publishable_test_not_real_0000000000';
export const LEGACY_SERVICE_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.legacy-leaked-not-real';
export const SUPABASE_URL = 'https://project.supabase.test';

// ───────────────────────────── in-memory database ─────────────────────────────
export function createDb(seed = {}) {
  const tables = structuredClone(seed);
  const log = { inserts: [], updates: [], deletes: [], rpc: [], storage: [], invokes: [] };
  const rows = (t) => (tables[t] ??= []);
  return { tables, log, rows };
}

function match(row, filters) {
  return filters.every(([op, col, val]) => {
    const v = row[col];
    switch (op) {
      case 'eq': return v === val;
      case 'neq': return v !== val;
      case 'in': return val.includes(v);
      case 'is': return val === null ? v === null || v === undefined : v === val;
      case 'gte': return v >= val;
      case 'lte': return v <= val;
      case 'gt': return v > val;
      case 'lt': return v < val;
      case 'ilike': return typeof v === 'string' && new RegExp('^' + String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i').test(v);
      case 'not.is': return !(v === null || v === undefined);
      default: throw new Error(`fake db: filter ${op} not supported`);
    }
  });
}

function query(db, table) {
  const st = { op: 'select', filters: [], payload: null, single: null, limit: null, order: null, returning: false, orFilter: null };
  const exec = () => {
    const all = db.rows(table);
    if (st.op === 'insert' || st.op === 'upsert') {
      const list = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((r) => ({ id: r.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
      all.push(...list);
      db.log.inserts.push({ table, rows: list });
      return finish(list);
    }
    let hit = all.filter((r) => match(r, st.filters));
    if (st.orFilter) hit = hit.filter(st.orFilter);
    if (st.op === 'update') {
      hit.forEach((r) => Object.assign(r, st.payload));
      db.log.updates.push({ table, filters: st.filters, payload: st.payload, count: hit.length });
      return finish(hit);
    }
    if (st.op === 'delete') {
      db.tables[table] = all.filter((r) => !hit.includes(r));
      db.log.deletes.push({ table, filters: st.filters, count: hit.length });
      return finish(hit);
    }
    if (st.order) hit = [...hit].sort((a, b) => (a[st.order.col] > b[st.order.col] ? 1 : -1) * (st.order.asc ? 1 : -1));
    if (st.limit !== null) hit = hit.slice(0, st.limit);
    return finish(hit);
  };
  const finish = (list) => {
    const data = list.map((r) => ({ ...r }));
    if (st.single === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: 'not single' } };
    if (st.single === 'maybe') return { data: data[0] ?? null, error: null };
    return { data: st.op === 'select' || st.returning ? data : null, error: null, count: data.length };
  };
  const b = {
    select() { if (st.op !== 'select') st.returning = true; return b; },
    insert(p) { st.op = 'insert'; st.payload = p; return b; },
    upsert(p) { st.op = 'upsert'; st.payload = p; return b; },
    update(p) { st.op = 'update'; st.payload = p; return b; },
    delete() { st.op = 'delete'; return b; },
    eq(c, v) { st.filters.push(['eq', c, v]); return b; },
    neq(c, v) { st.filters.push(['neq', c, v]); return b; },
    in(c, v) { st.filters.push(['in', c, v]); return b; },
    is(c, v) { st.filters.push(['is', c, v]); return b; },
    gte(c, v) { st.filters.push(['gte', c, v]); return b; },
    lte(c, v) { st.filters.push(['lte', c, v]); return b; },
    gt(c, v) { st.filters.push(['gt', c, v]); return b; },
    lt(c, v) { st.filters.push(['lt', c, v]); return b; },
    ilike(c, v) { st.filters.push(['ilike', c, v]); return b; },
    not(c, op, v) { if (op === 'is' && v === null) st.filters.push(['not.is', c, v]); else throw new Error(`fake db: not ${op} unsupported`); return b; },
    or(expr) { db.log.or = [...(db.log.or ?? []), { table, expr }]; st.orFilter = () => true; return b; },
    order(col, o = {}) { st.order = { col, asc: o.ascending !== false }; return b; },
    limit(n) { st.limit = n; return b; },
    range(a, z) { st.limit = z - a + 1; return b; },
    single() { st.single = 'single'; return b; },
    maybeSingle() { st.single = 'maybe'; return b; },
    then(res, rej) { try { return Promise.resolve(exec()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } },
  };
  return b;
}

function fakeClient(db, users) {
  return {
    from: (t) => query(db, t),
    rpc: async (name, args) => { db.log.rpc.push({ name, args }); const fn = db.rpc?.[name]; return fn ? fn(args) : { data: null, error: null }; },
    auth: {
      getUser: async (token) => (users[token] ? { data: { user: { id: users[token] } }, error: null } : { data: { user: null }, error: { message: 'invalid' } }),
      admin: { getUserById: async (id) => ({ data: { user: { id, email: `${id}@example.test` } }, error: null }) },
    },
    storage: {
      from: (bucket) => ({
        download: async (path) => { db.log.storage.push({ bucket, path, op: 'download' }); const f = db.files?.[`${bucket}/${path}`]; return f ? { data: new Blob([f]), error: null } : { data: null, error: { message: 'not found' } }; },
        createSignedUrl: async (path) => ({ data: { signedUrl: `${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}?token=t` }, error: null }),
        upload: async (path) => { db.log.storage.push({ bucket, path, op: 'upload' }); return { data: { path }, error: null }; },
      }),
    },
    functions: { invoke: async (name, opts) => { db.log.invokes.push({ name, opts }); return { data: { ok: true }, error: null }; } },
  };
}

// ───────────────────────────── fake SMTP server ─────────────────────────────
// Answers a scripted SMTP dialogue and records each session: { commands[], mailFrom, rcptTo[], data }.
// STARTTLS is refused (454) so clients continue in plain text, which keeps the transcript readable.
function fakeSmtp(sessions) {
  const session = { commands: [], mailFrom: null, rcptTo: [], data: null };
  sessions.push(session);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let ctrl;
  let inData = false;
  let buffer = '';
  const CRLF = String.fromCharCode(13, 10);
  const say = (line) => ctrl.enqueue(enc.encode(line + CRLF));
  const readable = new ReadableStream({ start(c) { ctrl = c; say('220 fake.smtp.test ESMTP'); } });
  const writable = new WritableStream({
    write(chunk) {
      buffer += dec.decode(chunk);
      if (inData) {
        if (!buffer.endsWith(CRLF + '.' + CRLF)) return;
        session.data = buffer.slice(0, -5);
        buffer = '';
        inData = false;
        say('250 queued');
        return;
      }
      let i;
      while ((i = buffer.indexOf(CRLF)) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        session.commands.push(line);
        const verb = line.split(/[ :]/)[0].toUpperCase();
        if (verb === 'MAIL') { session.mailFrom = line.replace(/^MAIL FROM:/i, ''); say('250 ok'); }
        else if (verb === 'RCPT') { session.rcptTo.push(line.replace(/^RCPT TO:/i, '')); say('250 ok'); }
        else if (verb === 'DATA') { inData = true; say('354 go ahead'); }
        else if (verb === 'STARTTLS') say('454 TLS not available');
        else if (verb === 'AUTH') say('235 authenticated');
        else if (verb === 'QUIT') { say('221 bye'); try { ctrl.close(); } catch { /* closed */ } }
        else say('250 ok');
      }
    },
  });
  return { readable, writable, rid: 0, close() {} };
}

// ───────────────────────────── loading a function ─────────────────────────────
/**
 * Bundles supabase/functions/<name>/index.ts and returns { call(req), db, outbound }.
 * env: extra Deno.env values. users: { token: userId }. dns: { host: [addresses] }. fetchHandler(url, init) -> Response.
 */
export async function loadFunction(name, { db, users = {}, env = {}, dns = {}, fetchHandler } = {}) {
  const out = await build({
    entryPoints: [join(FUNCTIONS, name, 'index.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    plugins: [{
      name: 'edge-stubs',
      setup(b) {
        b.onResolve({ filter: /^https:\/\/deno\.land\/std@[^/]+\/http\/server\.ts$/ }, () => ({ path: 'serve', namespace: 'stub' }));
        b.onResolve({ filter: /^https:\/\/esm\.sh\/@supabase\/supabase-js@2/ }, () => ({ path: 'supabase', namespace: 'stub' }));
        // Type-only side-effect imports such as "jsr:@supabase/functions-js/edge-runtime.d.ts".
        b.onResolve({ filter: /^(jsr|npm):.*\.d\.ts$/ }, () => ({ path: 'types', namespace: 'empty' }));
        b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
        b.onResolve({ filter: /^(https?|jsr|npm):/ }, (a) => ({ path: a.path, namespace: 'unsupported' }));
        b.onLoad({ filter: /^serve$/, namespace: 'stub' }, () => ({ contents: 'export function serve(h) { globalThis.__edge.handler = h; }', loader: 'js' }));
        b.onLoad({ filter: /^supabase$/, namespace: 'stub' }, () => ({ contents: 'export const createClient = (...a) => globalThis.__edge.createClient(...a);', loader: 'js' }));
        b.onLoad({ filter: /.*/, namespace: 'unsupported' }, (a) => ({ contents: `throw new Error('harness: unsupported import ${a.path}');`, loader: 'js' }));
      },
    }],
  });
  const file = join(mkdtempSync(join(tmpdir(), `edge-${name}-`)), 'index.mjs');
  writeFileSync(file, out.outputFiles[0].text);

  const outbound = [];
  const smtp = [];
  const environment = {
    SUPABASE_URL,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SERVICE_KEY }),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_KEY }),
    SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_JWT, SERVICE_ROLE_KEY: LEGACY_SERVICE_JWT, SUPABASE_ANON_KEY: 'eyJ.legacy-anon.not-real',
    ...env,
  };
  for (const [k, v] of Object.entries(environment)) if (v === undefined) delete environment[k];
  const clientKeys = []; // every key a function passed to createClient()
  globalThis.__edge = { handler: null, createClient: (_url, key) => { clientKeys.push(key); return fakeClient(db, users); } };
  globalThis.Deno = {
    env: { get: (k) => environment[k], toObject: () => ({ ...environment }) },
    serve: (a, b) => { globalThis.__edge.handler = typeof a === 'function' ? a : b; },
    resolveDns: async (host, type) => { const all = dns[host]; if (!all) throw new Error('NXDOMAIN'); return all.filter((ip) => (type === 'AAAA') === ip.includes(':')); },
    connect: async () => fakeSmtp(smtp),
    connectTls: async () => fakeSmtp(smtp),
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    outbound.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers, body: init.body });
    if (fetchHandler) return fetchHandler(String(url), init);
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await import('file:///' + file.replace(/\\/g, '/') + `?v=${Date.now()}`);
  const handler = globalThis.__edge.handler;
  if (!handler) throw new Error(`harness: ${name} registered no handler`);
  return {
    db, outbound, smtp, clientKeys, restore: () => { globalThis.fetch = realFetch; },
    async call({ token, body, method = 'POST', headers = {} } = {}) {
      const res = await handler(new Request(`${SUPABASE_URL}/functions/v1/${name}`, {
        method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      }));
      let json = null;
      const text = await res.text();
      try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, json };
    },
  };
}
