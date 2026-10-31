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

// Large enough that only a test which sets its own value ever meets a limit. Not a proposal: the real figures are the owner's (OUTREACH_LIMITS.md).
const wide = { requestsPerHour: 100000, messagesPerHour: 100000, messagesPerDay: 100000, orgMessagesPerDay: 100000, maxRecipients: 100 };
export const TEST_OUTREACH_LIMITS = JSON.stringify({
  actions: { sms: wide, viber: wide, whatsapp: wide, voice: wide, email_campaign: wide, email_direct: wide, email_confirmation: wide, offer: wide },
  contact: { phone: { perHour: 100000, perDay: 100000 }, email: { perHour: 100000, perDay: 100000 } },
  voiceMaxCallSeconds: 300,
});

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
      if (db.failInsert?.includes(table)) return { data: null, error: { message: `insert into ${table} failed` } };
      const keys = st.conflict?.onConflict?.split(',') ?? null;
      const fresh = (Array.isArray(st.payload) ? st.payload : [st.payload]).filter((r) => !(keys && st.conflict.ignoreDuplicates && all.some((x) => keys.every((k) => x[k] === r[k]))));
      const list = fresh.map((r) => ({ id: r.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
      all.push(...list);
      db.log.inserts.push({ table, rows: list });
      return finish(list);
    }
    if (st.op === 'select' && db.failSelect?.includes(table)) return { data: null, error: { message: `select from ${table} failed` } };
    let hit = all.filter((r) => match(r, st.filters));
    if (st.orFilter) hit = hit.filter(st.orFilter);
    if (st.op === 'update') {
      if (db.failUpdate?.includes(table)) return { data: null, error: { message: `update of ${table} failed` } };
      hit.forEach((r) => Object.assign(r, st.payload));
      db.log.updates.push({ table, filters: st.filters, payload: st.payload, count: hit.length });
      return finish(hit);
    }
    if (st.op === 'select') db.afterSelect?.(table);
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
    upsert(p, o) { st.op = 'upsert'; st.payload = p; st.conflict = o ?? null; return b; },
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

// In-memory twin of public.ingest_webhook_lead for handler tests; the real SQL is run by lead-webhook-idempotency.test.mjs.
function ingestLead(db, { p_source, p_event_id, p_contact_hash, p_lead }) {
  db.leadEvents ??= new Map();
  const key = `${p_source}|${p_event_id ? `event:${p_event_id}` : `contact:${p_contact_hash}`}`;
  const seen = db.leadEvents.get(key);
  if (seen) return { data: { lead_id: seen, duplicate: true }, error: null };
  const row = { id: crypto.randomUUID(), ...p_lead };
  db.rows('leads').push(row);
  db.rows('activity_log').push({ entity_type: 'lead', entity_id: row.id, action: 'created' });
  db.leadEvents.set(key, row.id);
  return { data: { lead_id: row.id, duplicate: false }, error: null };
}

function fakeClient(db, users) {
  return {
    from: (t) => query(db, t),
    rpc: async (name, args) => { db.log.rpc.push({ name, args }); const fn = db.rpc?.[name]; if (fn) return fn(args); if (name === 'claim_once') { db.once ??= new Set(); if (db.once.has(args.p_key)) return { data: false, error: null }; db.once.add(args.p_key); return { data: true, error: null }; } if (name === 'release_once') { db.once?.delete(args.p_key); return { data: null, error: null }; } if (name === 'consume_rate_limits') { db.counters ??= {}; for (const i of args.p_items) if ((db.counters[i.bucket] ?? 0) + (i.cost ?? 1) > i.limit) return { data: { ok: false, bucket: i.bucket }, error: null }; for (const i of args.p_items) db.counters[i.bucket] = (db.counters[i.bucket] ?? 0) + (i.cost ?? 1); return { data: { ok: true }, error: null }; } if (name === 'ingest_webhook_lead') return ingestLead(db, args); return { data: null, error: null }; },
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
// Answers a scripted SMTP dialogue over conn.read/conn.write and records each session:
// { commands[], plainCommands[], tls, mailFrom, rcptTo[], data }. plainCommands holds what crossed the wire BEFORE TLS, so a test can prove
// that no password or message was written in plain text. mode: 'starttls' (default), 'no-starttls' (not advertised), 'refuse-starttls' (454),
// 'upgrade-fails' (Deno.startTls throws), 'inject' (a reply is smuggled in behind the 220).
function fakeSmtp(sessions, { mode = 'starttls', tls = false } = {}) {
  const session = { commands: [], plainCommands: [], tls, mailFrom: null, rcptTo: [], data: null, mode };
  sessions.push(session);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const CRLF = String.fromCharCode(13, 10);
  const pending = [];
  let wake = null;
  let inData = false;
  let buffer = '';
  const say = (line) => { pending.push(enc.encode(line + CRLF)); wake?.(); };
  say('220 fake.smtp.test ESMTP');
  const onLine = (line) => {
    session.commands.push(line);
    if (!session.tls) session.plainCommands.push(line);
    const verb = line.split(/[ :]/)[0].toUpperCase();
    if (verb === 'EHLO') { say('250-fake.smtp.test'); if (mode !== 'no-starttls' && !session.tls) say('250-STARTTLS'); say('250 8BITMIME'); }
    else if (verb === 'MAIL') { session.mailFrom = line.replace(/^MAIL FROM:/i, ''); say('250 ok'); }
    else if (verb === 'RCPT') { session.rcptTo.push(line.replace(/^RCPT TO:/i, '')); say('250 ok'); }
    else if (verb === 'DATA') { inData = true; say(mode === 'reject-data' ? '554 transaction failed' : '354 go ahead'); }
    else if (verb === 'STARTTLS') { if (mode === 'refuse-starttls') say('454 TLS not available'); else say(mode === 'inject' ? `220 ready${CRLF}250 injected` : '220 ready'); }
    else if (verb === 'AUTH') say('235 authenticated');
    else if (verb === 'QUIT') say('221 bye');
    else say('250 ok');
  };
  return {
    session,
    async read(into) {
      while (pending.length === 0) await new Promise((r) => { wake = r; });
      const next = pending.shift();
      into.set(next.subarray(0, Math.min(next.length, into.length)));
      if (next.length > into.length) pending.unshift(next.subarray(into.length));
      return Math.min(next.length, into.length);
    },
    async write(bytes) {
      buffer += dec.decode(bytes);
      if (inData) {
        if (buffer.endsWith(CRLF + '.' + CRLF)) { session.data = buffer.slice(0, -5); buffer = ''; inData = false; say('250 queued'); }
        return bytes.length;
      }
      let i;
      while ((i = buffer.indexOf(CRLF)) >= 0) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 2); onLine(line); }
      return bytes.length;
    },
    close() {},
  };
}

// ───────────────────────────── loading a function ─────────────────────────────
/**
 * Bundles supabase/functions/<name>/index.ts and returns { call(req), db, outbound }.
 * env: extra Deno.env values. users: { token: userId }. dns: { host: [addresses] }. fetchHandler(url, init) -> Response.
 */
export async function loadFunction(name, { db, users = {}, env = {}, dns = {}, fetchHandler, smtpMode, entry } = {}) {
  const out = await build({
    entryPoints: [entry ?? join(FUNCTIONS, name, 'index.ts')], bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
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
    OUTREACH_LIMITS: TEST_OUTREACH_LIMITS,
    ...env,
  };
  for (const [k, v] of Object.entries(environment)) if (v === undefined) delete environment[k];
  const clientKeys = []; // every key a function passed to createClient()
  // Like the real supabase-js: an empty key throws. Record every key a function builds a client with.
  globalThis.__edge = { handler: null, createClient: (_url, key) => { if (!key) throw new Error('supabaseKey is required.'); clientKeys.push(key); return fakeClient(db, users); } };
  globalThis.Deno = {
    env: { get: (k) => environment[k], toObject: () => ({ ...environment }) },
    serve: (a, b) => { globalThis.__edge.handler = typeof a === 'function' ? a : b; },
    resolveDns: async (host, type) => { const all = dns[host]; if (!all) throw new Error('NXDOMAIN'); return all.filter((ip) => (type === 'AAAA') === ip.includes(':')); },
    connect: async () => fakeSmtp(smtp, { mode: smtpMode }),
    connectTls: async () => fakeSmtp(smtp, { mode: smtpMode, tls: true }),
    startTls: async (conn) => { if (smtpMode === 'upgrade-fails') throw new Error('handshake failed'); conn.session.tls = true; return conn; },
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
    /** The Response itself, for tests that read headers. */
    raw({ method = 'GET', query = '', headers = {} } = {}) { return handler(new Request(`${SUPABASE_URL}/functions/v1/${name}${query}`, { method, headers })); },
    async call({ token, body, method = 'POST', headers = {}, query = '', raw } = {}) {
      const res = await handler(new Request(`${SUPABASE_URL}/functions/v1/${name}${query}`, {
        method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
        body: method === 'GET' ? undefined : raw ?? JSON.stringify(body ?? {}),
      }));
      let json = null;
      const text = await res.text();
      try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, json };
    },
  };
}
