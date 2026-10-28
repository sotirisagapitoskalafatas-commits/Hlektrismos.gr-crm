// B2B discovery (SerpApi Google Maps) → b2b_prospects REVIEW QUEUE. Never creates leads and never contacts anyone.
// Requires staged migration phase3/08. Flow: validate → quota → job row → searches → upsert prospects (the database
// screens: keys, duplicates, quality) → job counts. Approval and distribution happen in the CRM (Back Office).
//
// Callers: active staff with role admin / manager / inside_sales / back_office, or the service role (AI orchestrator,
// old {category, region} body still accepted). The SerpApi key stays server-side (crm_settings, never returned).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { missingKeyResponse, presentsSecretKey, secretKey, userBearer } from "../_shared/keys.ts";
import { LIMITS, allowedQueries, planQueries, toProspect, validateSearch } from "../_shared/b2b-search.ts";
import type { PlannedQuery } from "../_shared/b2b-search.ts";

const SEARCH_ROLES = ["admin", "manager", "inside_sales", "back_office"];
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function searchSerpApi(apiKey: string, q: PlannedQuery, num: number): Promise<{ items: Record<string, unknown>[]; error: string | null }> {
  const params = new URLSearchParams({ engine: "google_maps", type: "search", q: q.q, api_key: apiKey, num: String(num), hl: "el", gl: "gr" });
  if (q.ll) params.set("ll", q.ll);
  try {
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return { items: [], error: `SerpApi ${res.status}` }; // never echo the response (may contain the key/query)
    const data = await res.json();
    return { items: Array.isArray(data.local_results) ? data.local_results : [], error: null };
  } catch (e) {
    return { items: [], error: e instanceof Error && e.name === "TimeoutError" ? "SerpApi timeout" : "SerpApi request failed" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
  const admin = createClient(url, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

  // ── who is calling (role from the database, never from the request) ──
  const internal = presentsSecretKey(req); // secret API key in the apikey header (constant-time match)
  const token = userBearer(req);
  if (!internal && !token) return json({ success: false, error: "Απαιτείται σύνδεση." }, 401);
  let actorId: string | null = null;
  if (!internal) {
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return json({ success: false, error: "Μη έγκυρη συνεδρία." }, 401);
    const { data: prof } = await admin.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
    if (!prof || prof.is_active === false || !SEARCH_ROLES.includes(prof.role)) {
      return json({ success: false, error: "Ο ρόλος σας δεν έχει πρόσβαση στην αναζήτηση επιχειρήσεων." }, 403);
    }
    actorId = user.id;
  }

  const body = await req.json().catch(() => ({}));
  const v = validateSearch(body as Record<string, unknown>);
  if (!v.ok) return json({ success: false, error: v.error }, 400);

  // ── key + limits (server-side only) ──
  const { data: rows } = await admin.from("crm_settings").select("setting_key, setting_value").in("setting_key", ["SERPAPI_KEY", "b2b_scraper_config"]);
  const raw = rows?.find((r) => r.setting_key === "SERPAPI_KEY")?.setting_value;
  let apiKey = "";
  try { apiKey = typeof raw === "string" ? JSON.parse(raw) : String(raw ?? ""); } catch { apiKey = String(raw ?? "").replace(/^"|"$/g, ""); }
  if (!apiKey) return json({ success: false, error: "Δεν έχει οριστεί κλειδί SerpApi (Διαχείριση → B2B Scraper)." }, 412);
  const cfg = (rows?.find((r) => r.setting_key === "b2b_scraper_config")?.setting_value ?? {}) as Record<string, unknown>;
  const dailyLimit = Math.max(0, Number(cfg.daily_query_limit ?? 100));
  const perJobCap = Math.min(LIMITS.maxQueriesPerJob, Math.max(1, Number(cfg.rate_limit_per_minute ?? 10)));

  const plan = planQueries(v.params);
  const { data: used, error: usedErr } = await admin.rpc("b2b_queries_today");
  if (usedErr) return json({ success: false, error: "Η ροή B2B απαιτεί τη migration phase3/08 (δεν βρέθηκε)." }, 503);
  const allowed = allowedQueries(plan.queries.length, Number(used ?? 0), dailyLimit, perJobCap);
  if (allowed === 0) return json({ success: false, error: `Εξαντλήθηκε το ημερήσιο όριο αναζητήσεων (${dailyLimit}).`, used, dailyLimit }, 429);
  const queries = plan.queries.slice(0, allowed);

  const { data: job, error: jobErr } = await admin.from("b2b_search_jobs").insert({
    created_by: actorId, params: v.params, queries_planned: queries.length, status: "running",
  }).select("id").single();
  if (jobErr || !job) return json({ success: false, error: "Δεν δημιουργήθηκε η εργασία αναζήτησης." }, 500);

  let done = 0, found = 0, fresh = 0, dup = 0;
  const errors: string[] = [];
  for (const q of queries) {
    const res = await searchSerpApi(apiKey, q, v.params.max_per_query);
    done++;
    if (res.error) { errors.push(`${q.q}: ${res.error}`); continue; }
    const mapped = res.items.map((it) => toProspect(it, q)).filter((x): x is NonNullable<typeof x> => !!x);
    found += mapped.length;
    if (!mapped.length) continue;
    const ids = mapped.map((m) => m.place_id).filter(Boolean) as string[];
    const { data: known } = ids.length
      ? await admin.from("b2b_prospects").select("place_id").in("place_id", ids)
      : { data: [] as { place_id: string }[] };
    const knownSet = new Set((known ?? []).map((k) => k.place_id));
    const newRows = mapped.filter((m) => !m.place_id || !knownSet.has(m.place_id)).map((m) => ({ ...m, first_job_id: job.id }));
    if (knownSet.size) await admin.from("b2b_prospects").update({ last_seen_at: new Date().toISOString() }).in("place_id", [...knownSet]);
    if (newRows.length) {
      const { data: ins, error: insErr } = await admin.from("b2b_prospects").insert(newRows).select("id, duplicate_of");
      if (insErr) { errors.push(`${q.q}: αποθήκευση απέτυχε`); continue; }
      fresh += ins?.length ?? 0;
      dup += (ins ?? []).filter((r) => r.duplicate_of).length;
    }
    await admin.from("b2b_search_jobs").update({ queries_done: done, results_found: found, results_new: fresh, results_duplicate: dup }).eq("id", job.id);
  }

  const status = errors.length === queries.length ? "failed" : "done";
  await admin.from("b2b_search_jobs").update({
    status, queries_done: done, results_found: found, results_new: fresh, results_duplicate: dup,
    error: errors.length ? errors.slice(0, 10).join(" · ") : null, finished_at: new Date().toISOString(),
  }).eq("id", job.id);

  return json({
    success: status === "done", job_id: job.id, planned: plan.queries.length, ran: done, truncated: plan.truncated + (plan.queries.length - queries.length),
    found, new: fresh, duplicates: dup, errors, used_today: Number(used ?? 0) + done, daily_limit: dailyLimit,
    // legacy fields for the AI orchestrator
    count: fresh, leads_found: fresh,
  });
});
