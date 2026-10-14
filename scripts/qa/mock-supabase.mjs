#!/usr/bin/env node
// LOCAL UI-TEST MOCK of Supabase (auth + PostgREST + the `chat` function). SYNTHETIC DATA ONLY.
// It is NOT the real backend: it performs NO authorization, so it proves how the UI renders for each role's
// profile, not that a role is blocked from data. Real isolation needs staging/production verification.
//
//   node scripts/qa/mock-supabase.mjs            (listens on :54399)
//   .env:  VITE_SUPABASE_URL=http://127.0.0.1:54399   VITE_SUPABASE_ANON_KEY=mock
//   Sign in as a role by seeding localStorage key `sb-127-auth-token` (see scripts/qa/ui-session.mjs).
import http from 'node:http';

const H = 3_600_000, D = 24 * H;
const now = Date.now();
const iso = (offsetMs) => new Date(now + offsetMs).toISOString();

export const USERS = {
  admin:        { id: '10000000-0000-4000-8000-000000000001', full_name: 'Μαρία Παπαδοπούλου', role: 'admin' },
  manager:      { id: '10000000-0000-4000-8000-000000000002', full_name: 'Νίκος Γεωργίου', role: 'manager' },
  inside_sales: { id: '10000000-0000-4000-8000-000000000003', full_name: 'Ελένη Δημητρίου', role: 'inside_sales' },
  field_sales:  { id: '10000000-0000-4000-8000-000000000004', full_name: 'Γιάννης Αντωνίου', role: 'field_sales' },
  back_office:  { id: '10000000-0000-4000-8000-000000000005', full_name: 'Κατερίνα Λάμπρου', role: 'back_office' },
};
const U = (r) => USERS[r].id;

const customers = [
  ['Αθηνά Κωνσταντίνου', 'Αθήνα'], ['Δημήτρης Βλάχος', 'Πειραιάς'], ['Σοφία Ιωάννου', 'Θεσσαλονίκη'],
  ['Πέτρος Νικολάου', 'Πάτρα'], ['Ειρήνη Μαυρίδου', 'Ηράκλειο'], ['Βασίλης Αναστασίου', 'Λάρισα'],
].map(([full_name, city], i) => ({
  id: `20000000-0000-4000-8000-00000000000${i + 1}`, full_name, city, email: `test${i + 1}@example.invalid`,
  phone: `+30 69000000${10 + i}`, company: null, address: 'Δοκιμαστική οδός 1', postal_code: '10000', lat: null, lng: null,
  notes: '', created_at: iso(-30 * D),
}));
const cust = (i) => customers[i];

const stages = ['new', 'contacted', 'offer', 'application', 'signed', 'document_check', 'submitted', 'activation'];
const caseRows = stages.map((stage, i) => ({
  id: `30000000-0000-4000-8000-00000000000${i + 1}`, case_no: `CS-2026-00${i + 1}`, title: `Ρεύμα — ${cust(i % 6).full_name}`,
  customer_id: cust(i % 6).id, source: 'website', service_type: i % 3 === 0 ? 'energy' : i % 3 === 1 ? 'gas' : 'solar',
  property_type: null, case_type: null, current_stage: stage, priority: i === 2 ? 'high' : 'normal', status: 'open',
  value: i === 5 ? 0 : 400 + i * 120, probability: 20 + i * 10, expected_close_date: null,
  owner_id: U('inside_sales'), lead_id: null, stage_entered_at: iso(-i * D),
  next_action_owner_id: i < 3 ? U('inside_sales') : i < 5 ? U('field_sales') : U('back_office'),
  inside_sales_owner: i < 4 ? U('inside_sales') : null, field_sales_owner: i === 3 || i === 4 ? U('field_sales') : null,
  back_office_owner: i >= 5 ? U('back_office') : null,
  next_action: ['Πρώτη επικοινωνία', 'Αποστολή προσφοράς', 'Συλλογή εγγράφων', 'Υπογραφή συμβολαίου', 'Επίσκεψη & υπογραφή', 'Έλεγχος εγγράφων', 'Καταχώρηση παρόχου', 'Επιβεβαίωση ενεργοποίησης'][i],
  next_follow_up_at: null, location: '', address: '', lat: null, lng: null, provider: null, program: null, provider_id: null,
  product_id: null, application_status: null, activation_status: null, notes: '',
  created_at: iso(-(10 - i) * D), updated_at: iso(-i * D), customer: cust(i % 6),
}));
caseRows.push({ ...caseRows[0], id: '30000000-0000-4000-8000-000000000009', case_no: 'CS-2026-009', current_stage: 'completed',
  title: 'Ολοκληρωμένο case', value: 900, inside_sales_owner: U('inside_sales'), next_action_owner_id: null, next_action: '' });

const fu = (n, hours, reason, who, caseIdx, status = 'pending') => ({
  id: `40000000-0000-4000-8000-00000000000${n}`, case_id: caseRows[caseIdx].id, due_at: iso(hours * H), channel: 'phone',
  reason, priority: hours < 0 ? 'high' : 'normal', assignee_id: U(who), status, notes: '', snoozed_until: null,
  completed_at: null, created_at: iso(-3 * D),
  case: { id: caseRows[caseIdx].id, case_no: caseRows[caseIdx].case_no, title: caseRows[caseIdx].title,
          customer: caseRows[caseIdx].customer, current_stage: caseRows[caseIdx].current_stage },
});
const followUps = [
  fu(1, -26, 'Επιβεβαίωση προσφοράς', 'inside_sales', 1), fu(2, -3, 'Υπενθύμιση εγγράφων', 'inside_sales', 2),
  fu(3, 2, 'Κλήση για υπογραφή', 'inside_sales', 3), fu(4, 5, 'Ραντεβού επίσκεψης', 'inside_sales', 0),
  fu(5, 30, 'Δεύτερη επικοινωνία', 'inside_sales', 1), fu(6, -1, 'Επίσκεψη πελάτη', 'field_sales', 4),
  fu(7, 4, 'Έλεγχος εγγράφων', 'back_office', 5),
];

const lead = (n, status, extra = {}) => ({
  id: `50000000-0000-4000-8000-00000000000${n}`, full_name: `Δοκιμαστικό Lead ${n}`, client_name: null, first_name: null, last_name: null,
  phone: `+30 69100000${n}0`, email: `lead${n}@example.invalid`, service_category: 'electricity', property_type: 'apartment', status,
  source: n % 2 ? 'website' : 'contact', lat: null, lng: null, location_source: null, location_confidence: null, address: null,
  company: null, lead_type: null, campaign_id: null, campaign_name: null, source_label: null, created_by_user_id: null,
  assigned_to_user_id: U('inside_sales'), first_contact_user_id: null, referred_by_user_id: null, converted_by_user_id: null,
  converted_at: null, converted_case_id: null, provider: null, program: null, provider_id: null, product_id: null,
  created_at: iso(-n * 2 * H), created_by: null, assigned_to: { full_name: USERS.inside_sales.full_name }, ...extra,
});
const leads = [
  lead(1, 'new'), lead(2, 'new'), lead(3, 'new', { assigned_to_user_id: null, assigned_to: null }),
  lead(4, 'contacted'), lead(5, 'qualified'), lead(6, 'meeting'), lead(7, 'offer'), lead(8, 'converted'),
  lead(9, 'lost'), lead(1 + 9, 'unqualified'), lead(11, 'duplicate'), lead(12, 'legacy_import_status'),
  lead(13, 'new', { assigned_to_user_id: U('field_sales'), assigned_to: { full_name: USERS.field_sales.full_name } }),
];
const notifications = [
  { id: '60000000-0000-4000-8000-000000000001', user_id: U('inside_sales'), case_id: caseRows[1].id, title: 'Νέα προσφορά προς αποστολή',
    body: caseRows[1].title, type: 'followup', link: '', read_at: null, created_at: iso(-2 * H) },
];

const TABLES = { profiles: Object.values(USERS), customers, cases: caseRows, follow_ups: followUps, leads, notifications, case_documents: [], activity_log: [],
  timeline_events: [
    { id: '70000000-0000-4000-8000-000000000001', case_id: caseRows[0].id, role: 'inside_sales', activity_type: 'call', title: 'Τηλεφωνική επικοινωνία', description: 'Ενδιαφέρεται για πρόγραμμα ρεύματος', user_id: U('inside_sales'), occurred_at: iso(-2 * D), location: null, metadata: {}, user: { id: U('inside_sales'), full_name: USERS.inside_sales.full_name, role: 'inside_sales' } },
    { id: '70000000-0000-4000-8000-000000000002', case_id: caseRows[0].id, role: 'inside_sales', activity_type: 'email', title: 'Αποστολή προσφοράς', description: '', user_id: U('inside_sales'), occurred_at: iso(-1 * D), location: null, metadata: {}, user: null },
  ] };
const log = [];

function applyFilters(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(eq|neq|in|is|gt|gte|lt|lte|not)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, op, raw] = m;
    out = out.filter((r) => {
      const val = r[k];
      switch (op) {
        case 'eq': return String(val) === raw;
        case 'neq': return String(val) !== raw;
        case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(val));
        case 'is': return raw === 'null' ? val == null : String(val) === raw;
        case 'gt': return val > raw; case 'gte': return val >= raw; case 'lt': return val < raw; case 'lte': return val <= raw;
        default: return true;
      }
    });
  }
  const order = params.get('order');
  if (order) {
    const [col, dir] = order.split('.');
    out = [...out].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
  }
  const limit = Number(params.get('limit'));
  return limit ? out.slice(0, limit) : out;
}

const cors = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*',
  'Access-Control-Expose-Headers': 'Content-Range', 'Content-Type': 'application/json',
};
const userForToken = (auth) => {
  const role = String(auth ?? '').replace(/^Bearer\s+/i, '').replace(/^mock-/, '');
  return USERS[role] ?? null;
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const send = (code, obj, extra = {}) => { res.writeHead(code, { ...cors, ...extra }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    let json = {}; try { json = body ? JSON.parse(body) : {}; } catch { /* ignore */ }
    if (url.pathname === '/__log') return send(200, log);

    if (url.pathname.startsWith('/auth/v1/')) {
      const u = userForToken(req.headers.authorization);
      if (url.pathname.endsWith('/user')) {
        return u ? send(200, { id: u.id, aud: 'authenticated', role: 'authenticated', email: `${u.role}@example.invalid`, app_metadata: {}, user_metadata: {}, created_at: iso(-90 * D) }) : send(401, { msg: 'no session' });
      }
      return send(200, {});
    }
    if (url.pathname.startsWith('/functions/v1/chat')) {
      const last = (json.messages || []).at(-1)?.content || '';
      return setTimeout(() => send(200, { reply: `Mock απάντηση για: «${last}»` }), 300);
    }
    if (url.pathname === '/rest/v1/rpc/convert_lead_to_case') {
      log.push({ method: 'RPC', table: 'convert_lead_to_case', body: json });
      const l = TABLES.leads.find((x) => x.id === json.p_lead_id);
      if (!l) return send(400, { message: 'lead not found' });
      l.status = 'converted'; l.converted_case_id = caseRows[0].id; l.converted_at = new Date().toISOString();
      return send(200, caseRows[0].id);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) return send(200, null);
    if (url.pathname.startsWith('/storage/v1/object/')) {
      log.push({ method: req.method, table: 'storage', query: url.pathname });
      if (url.pathname.startsWith('/storage/v1/object/sign/')) return send(200, { signedURL: '/mock-file' });
      return send(200, { Key: url.pathname.replace('/storage/v1/object/', ''), Id: 'mock' });
    }

    const m = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
    if (!m) return send(404, {});
    const table = m[1];
    if (req.method === 'GET' || req.method === 'HEAD') {
      const rows = applyFilters(TABLES[table] ?? [], url.searchParams);
      const range = `0-${Math.max(rows.length - 1, 0)}/${rows.length}`;
      if ((req.headers.accept || '').includes('vnd.pgrst.object')) {
        return rows.length ? send(200, rows[0]) : send(406, { code: 'PGRST116', message: 'no rows', details: '', hint: null });
      }
      return send(200, rows, { 'Content-Range': range });
    }
    // writes: applied IN MEMORY so UI flows can be verified end-to-end (reset by restarting the mock)
    log.push({ method: req.method, table, query: url.search, body: json });
    const tbl = (TABLES[table] ??= []);
    if (req.method === 'PATCH') {
      const hit = applyFilters(tbl, url.searchParams);
      for (const r of hit) Object.assign(r, json);
      return send(200, hit);
    }
    if (req.method === 'DELETE') {
      const hit = new Set(applyFilters(tbl, url.searchParams));
      TABLES[table] = tbl.filter((r) => !hit.has(r));
      return send(204);
    }
    const rowsIn = (Array.isArray(json) ? json : [json]).map((r) => ({ id: r.id ?? crypto.randomUUID(), ...r }));
    tbl.push(...rowsIn);
    return send(201, rowsIn);
  });
}).listen(54399, '127.0.0.1', () => console.log('mock supabase on 54399'));
