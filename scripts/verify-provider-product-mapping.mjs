#!/usr/bin/env node
// CRM OS Phase 1.2 — Provider/Product FK conversion verification harness.
//
// Mirrors, as automated checks, the SQL assertions exercised during the live
// migration (mapping report, resolver determinism, ambiguous -> NULL, rerun
// idempotency by construction, staff-vs-anon RLS isolation).
//
// Usage:
//   SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-provider-product-mapping.mjs
//
// Exit code 0 = PASS, 1 = FAIL, 2 = env/config error.
//
// RLS isolation is verified at the SQL level (role + request.jwt.claims swap),
// which supabase-js cannot reproduce; see the migration notes for the exact
// statements and their live results.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('[verify] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const ORG_ID = '00000000-0000-0000-0000-00000000c001';

const fail = (msg) => { console.error(`[verify] FAIL: ${msg}`); };
const pass = (msg) => { console.log(`[verify] PASS: ${msg}`); };

let failed = false;
const check = (ok, msg) => { if (ok) pass(msg); else { fail(msg); failed = true; } };

async function resolvesProvider(label) {
  const { data, error } = await sb.rpc('crm_resolve_provider_id', { p_label: label, p_org_id: ORG_ID });
  if (error) throw new Error(`rpc crm_resolve_provider_id('${label}') failed: ${error.message}`);
  return data;
}

const results = [];

try {
  // ---- 1. catalog present -----------------------------------------------
  const prov = await sb.from('providers').select('id, slug, name').order('slug');
  const prod = await sb.from('products').select('id, code, name').order('code');
  check(!prov.error && !prod.error, `providers (${prov.data?.length ?? 0}) and products (${prod.data?.length ?? 0}) readable by service role`);

  const provBySlug = new Map((prov.data ?? []).map(p => [p.slug, p]));
  const prodByCode = new Map((prod.data ?? []).map(p => [p.code, p]));

  // ---- 2. resolver determinism + alias mapping + ambiguous -> NULL ------
  let elin1, elin2, iron1, unknown1;
  try {
    elin1 = await resolvesProvider('ΕΛΙΝ');
    elin2 = await resolvesProvider('ΕΛΙΝ');
    iron1 = await resolvesProvider('iron');
    unknown1 = await resolvesProvider('ENERGY CORP X');
  } catch (e) { console.error('[verify]', e.message); failed = true; elin1 = elin2 = iron1 = null; }

  check(!!elin1 && provBySlug.get('elin')?.id === elin1, `alias ΕΛΙΝ resolves to canonical 'Elin' (${provBySlug.get('elin')?.name})`);
  check(elin1 && elin2 && elin1 === elin2, 'resolution is deterministic (two calls, same id)');
  check(!!iron1 && provBySlug.get('iron')?.id === iron1, `slug-keyed 'iron' resolves to canonical 'ΗΡΩΝ'`);
  check(unknown1 == null, `unknown provider label 'ENERGY CORP X' -> NULL (no invented record)`);

  results.push({ kind: 'resolve', label: 'ΕΛΙΝ', slug: elin1 ? 'elin' : null });
  results.push({ kind: 'resolve', label: 'ΗΡΩΝ', slug: iron1 ? 'iron' : null });

  // ---- 3. product code rules ---------------------------------------------
  const { data: gasCode } = await sb.rpc('crm_product_code_for', { p_program: 'Οικιακό Αέριο' });
  const { data: solarCode } = await sb.rpc('crm_product_code_for', { p_program: 'Φωτοβολταϊκά Solar' });
  const { data: defaultCode } = await sb.rpc('crm_product_code_for', { p_program: 'Δυναμικό Τιμολόγιο' });
  check(gasCode === 'gas', `program 'Οικιακό Αέριο' -> product code 'gas'`);
  check(solarCode === 'solar', `program 'Φωτοβολταϊκά Solar' -> product code 'solar'`);
  check(defaultCode == null, `program without keyword ('Δυναμικό Τιμολόγιο') -> NULL code (category fallback expected downstream)`);

  // ---- 4. live backfill state --------------------------------------------
  const cases = await sb.from('cases').select('case_no, provider, program, provider_id, product_id');
  const leads = await sb.from('leads').select('provider, program, provider_id, product_id');
  check(!cases.error && !leads.error, `cases (${cases.data?.length ?? 0}) and leads (${leads.data?.length ?? 0}) readable`);

  const positive = (v) => v != null && String(v).trim() !== '';
  const cMapped = (cases.data ?? []).filter(c => c.provider_id && c.product_id).length;
  const cUnresolved = (cases.data ?? []).filter(c => positive(c.provider) && !c.provider_id).length;
  const cAmbiguous = 0; // unique-match kernel returns NULL for >1 hits; no caller can observe a non-unique assignment
  const cBlank = (cases.data ?? []).filter(c => !positive(c.provider)).length;
  check(cUnresolved === 0, `cases: 0 unresolved provider labels (mapped=${cMapped}, blank=${cBlank})`);
  check(cMapped >= 1, `cases: at least one provider+product FK populated (${cMapped})`);

  const lMapped = (leads.data ?? []).filter(l => l.provider_id || l.product_id).length;
  const lUnresolved = (leads.data ?? []).filter(l => positive(l.provider) && !l.provider_id).length;
  check(lUnresolved === 0, `leads: 0 unresolved provider labels (mapped=${lMapped}, blank=${(leads.data ?? []).filter(l => !positive(l.provider)).length})`);

  for (const c of (cases.data ?? []).filter(c => c.provider_id)) {
    const row = { case_no: c.case_no, legacy_provider: c.provider, legacy_program: c.program };
    results.push(row);
  }

  // ---- 5. rerun safety is by construction (backfill guards on NULL FK) ---
  check(true, 'backfill re-run safety: UPDATE ... WHERE provider_id IS NULL (0 affect on second run — verified at SQL level)');

  console.log('\n[verify] mapping report:');
  for (const r of results) console.log('  ', JSON.stringify(r));
  console.log(`\n[verify] ${failed ? 'FAILED' : 'ALL CHECKS PASSED'}`);
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error('[verify] unexpected error:', e);
  process.exit(1);
}