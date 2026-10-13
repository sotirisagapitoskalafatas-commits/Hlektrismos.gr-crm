#!/usr/bin/env node
// READ-ONLY exposure check — run it yourself, locally. It uses ONLY the public anon key
// (the same key every website visitor already has) and asks PostgREST for row COUNTS
// (limit=0, so no row data is ever returned). It performs no writes.
//
//   VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<anon key> node scripts/audit-anon-exposure.mjs
//
// A table is EXPOSED if anon can read it: HTTP 200/206 with a Content-Range count.
// 401/403/404 (or a 200 with 0 rows because RLS filtered everything) means anon cannot read data.
const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'); process.exit(2); }
const tables = [
  'crm_emails','crm_integrations','crm_settings','crm_users','profiles','hlektrismos_leads','leads','customers',
  'hlektrismos_customers','lead_notes','crm_tasks','contact_consent','consent_records','email_suppressions',
  'voice_calls','campaigns','campaign_sends','cases','customer_documents','case_documents','calendar_events',
  'sales_agents','customer_commissions_ledger','business_events','timeline_events','notification_log',
  'chat_messages','chat_threads','energy_tariffs','market_tariffs',
];
let exposed = 0;
for (const t of tables) {
  try {
    const r = await fetch(`${url}/rest/v1/${t}?select=id&limit=0`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
    });
    const range = r.headers.get('content-range') || '';
    const n = Number(range.split('/')[1]);
    const readable = r.ok && Number.isFinite(n) && n > 0;
    if (readable) exposed++;
    console.log(`${readable ? 'EXPOSED ' : 'ok      '} ${t.padEnd(30)} HTTP ${r.status} ${range}`);
  } catch (e) { console.log(`error    ${t}: ${e.message}`); }
}
console.log(`\n${exposed} table(s) readable by the anonymous role. Anything EXPOSED that is not public catalogue data needs a fix.`);
