// B2B discovery: search planning, validation, quota and result mapping (pure, unit-tested).
// Used by the scrape-b2b edge function and by the CRM page (to preview how many searches a configuration costs).

export const CATEGORY_QUERIES: Record<string, string> = {
  energy: "Εταιρείες Ενέργειας", solar: "Φωτοβολταϊκά Εταιρείες", ev_charging: "Σταθμοί Φόρτισης Ηλεκτροκίνητων",
  real_estate: "Μεσιτικά Γραφεία Ακίνητα", construction: "Κατασκευαστικές Εταιρείες", restaurant: "Εστιατόρια Ταβέρνες",
  hotel: "Ξενοδοχεία", retail: "Καταστήματα Λιανικού Εμπορίου", technology: "Software Εταιρείες IT",
  healthcare: "Ιατρεία Κλινικές", automotive: "Αυτοκίνητο Service Επισκευές", professional: "Δικηγορικά Γραφεία Λογιστικά",
  education: "Φροντιστήρια Σχολές", fitness: "Γυμναστήρια Fitness", beauty: "Κομμωτήρια Αισθητική",
  logistics: "Μεταφορικές Εταιρείες", bakery: "Αρτοποιεία Φούρνοι", manufacturing: "Βιομηχανίες Εργοστάσια",
  agriculture: "Αγροκτήματα Γεωργία", other: "Επιχειρήσεις",
};

export const REGION_LL: Record<string, string> = {
  "Αττική": "@37.9838,23.7275,12z", "Θεσσαλονίκη": "@40.6401,22.9444,12z", "Κεντρική Ελλάδα": "@38.2466,23.6647,12z",
  "Πελοπόννησος": "@37.5000,22.5000,12z", "Κρήτη": "@35.2401,24.4691,12z", "Ιόνια Νησιά": "@39.6243,19.9217,12z",
  "Θεσσαλία": "@39.6000,22.0000,12z", "Ήπειρος": "@39.6000,20.8000,12z", "Δυτική Ελλάδα": "@38.2000,21.7000,12z",
  "Στερεά Ελλάδα": "@38.6000,22.7000,12z", "Νησιά Αιγαίου": "@37.5000,25.5000,12z", "Δυτική Μακεδονία": "@40.3000,21.8000,12z",
  "Ανατολική Μακεδονία & Θράκη": "@41.1000,24.8000,12z", "Βόρειο Αιγαίο": "@39.0000,26.0000,12z",
};

export interface SearchParams { categories: string[]; regions: string[]; cities: string[]; keywords: string[]; max_per_query: number }
export interface PlannedQuery { q: string; ll: string | null; category: string | null; region: string | null; city: string | null }

export const LIMITS = { categories: 10, regions: 14, cities: 20, keywords: 5, text: 60, maxQueriesPerJob: 24 };

const clean = (v: unknown, max: number): string[] => {
  const arr = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [];
  const out: string[] = [];
  for (const x of arr) {
    const s = String(x ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.text);
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
};

/** Normalises a request body. Accepts the old single `category`/`region` form (AI orchestrator) too. */
export function validateSearch(body: Record<string, unknown>): { ok: true; params: SearchParams } | { ok: false; error: string } {
  const categories = clean(body.categories ?? body.category, LIMITS.categories).filter((c) => c in CATEGORY_QUERIES);
  const regions = clean(body.regions ?? body.region, LIMITS.regions).filter((r) => r in REGION_LL);
  const cities = clean(body.cities, LIMITS.cities);
  const keywords = clean(body.keywords, LIMITS.keywords);
  const max = Number(body.max_per_query ?? body.maxResults ?? 20);
  if (categories.length === 0 && keywords.length === 0) return { ok: false, error: "Επιλέξτε τουλάχιστον μία κατηγορία ή λέξη-κλειδί." };
  if (regions.length === 0 && cities.length === 0) return { ok: false, error: "Επιλέξτε τουλάχιστον μία περιοχή ή πόλη." };
  return { ok: true, params: { categories, regions, cities, keywords, max_per_query: Math.min(20, Math.max(5, Number.isFinite(max) ? Math.round(max) : 20)) } };
}

/** Every (search term × place) pair; cities are searched by name (inside the first region's map area when given). */
export function planQueries(p: SearchParams, cap = LIMITS.maxQueriesPerJob): { queries: PlannedQuery[]; truncated: number } {
  const terms = [
    ...p.categories.map((c) => ({ text: CATEGORY_QUERIES[c], category: c })),
    ...p.keywords.map((k) => ({ text: k, category: null as string | null })),
  ];
  const places = p.cities.length
    ? p.cities.map((city) => ({ city, region: p.regions[0] ?? null }))
    : p.regions.map((region) => ({ city: null as string | null, region }));
  const all: PlannedQuery[] = [];
  for (const t of terms) for (const pl of places) {
    all.push({ q: pl.city ? `${t.text} ${pl.city}` : t.text, ll: pl.region ? REGION_LL[pl.region] ?? null : null, category: t.category, region: pl.region, city: pl.city });
  }
  return { queries: all.slice(0, cap), truncated: Math.max(0, all.length - cap) };
}

/** How many of the planned searches may run now (daily quota per workspace and per-job rate cap). */
export function allowedQueries(planned: number, usedToday: number, dailyLimit: number, perJobCap: number): number {
  return Math.max(0, Math.min(planned, dailyLimit - usedToday, perJobCap));
}

export interface ProspectRow {
  place_id: string | null; company_name: string; phone: string | null; website: string | null; address: string | null;
  city: string | null; region: string | null; category: string | null; source_query: string; lat: number | null; lng: number | null;
  rating: number | null; reviews: number | null;
}

/** SerpApi google_maps local_result → b2b_prospects row (screening keys/duplicates are computed by the database). */
export function toProspect(item: Record<string, unknown>, q: PlannedQuery): ProspectRow | null {
  const name = String(item.title ?? "").trim();
  if (!name) return null;
  const gps = (item.gps_coordinates ?? {}) as { latitude?: number; longitude?: number };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    place_id: str(item.place_id), company_name: name.slice(0, 200), phone: str(item.phone), website: str(item.website),
    address: str(item.address), city: q.city, region: q.region, category: q.category, source_query: q.q,
    lat: typeof gps.latitude === "number" ? gps.latitude : null, lng: typeof gps.longitude === "number" ? gps.longitude : null,
    rating: typeof item.rating === "number" ? item.rating : null, reviews: typeof item.reviews === "number" ? item.reviews : null,
  };
}
