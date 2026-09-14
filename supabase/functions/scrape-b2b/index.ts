import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Coordinate Dictionary: 14 Greek Regions ───────────────────────────────
const regionCoordinates: Record<string, string> = {
  "Αττική": "@37.9838,23.7275,12z",
  "Θεσσαλονίκη": "@40.6401,22.9444,12z",
  "Κεντρική Ελλάδα": "@38.2466,23.6647,12z",
  "Πελοπόννησος": "@37.5000,22.5000,12z",
  "Κρήτη": "@35.2401,24.4691,12z",
  "Ιόνια Νησιά": "@39.6243,19.9217,12z",
  "Θεσσαλία": "@39.6000,22.0000,12z",
  "Ήπειρος": "@39.6000,20.8000,12z",
  "Δυτική Ελλάδα": "@38.2000,21.7000,12z",
  "Στερεά Ελλάδα": "@38.6000,22.7000,12z",
  "Νησιά Αιγαίου": "@37.5000,25.5000,12z",
  "Δυτική Μακεδονία": "@40.3000,21.8000,12z",
  "Ανατολική Μακεδονία & Θράκη": "@41.1000,24.8000,12z",
  "Βόρειο Αιγαίο": "@39.0000,26.0000,12z",
};

// ─── Category → Search Query Mapping ────────────────────────────────────────
const categoryQueries: Record<string, string> = {
  energy: "Εταιρείες Ενέργειας",
  solar: "Φωτοβολταϊκά Εταιρείες",
  ev_charging: "Σταθμοί Φόρτισης Ηλεκτροκίνητων",
  real_estate: "Μεσιτικά Γραφεία Ακίνητα",
  construction: "Κατασκευαστικές Εταιρείες",
  restaurant: "Εστιατόρια Ταβέρνες",
  hotel: "Ξενοδοχεία",
  retail: "Καταστήματα Λιανικού Εμπορίου",
  technology: "Software Εταιρείες IT",
  healthcare: "Ιατρεία Κλινικές",
  automotive: "Αυτοκίνητο Service Επισκευές",
  professional: "Δικηγορικά Γραφεία Λογιστικά",
  education: "Φροντιστήρια Σχολές",
  fitness: "Γυμναστήρια Fitness",
  beauty: "Κομμωτήρια Αισθητική",
  logistics: "Μεταφορικές Εταιρείες",
  bakery: "Αρτοποιεία Φούρνοι",
  manufacturing: "Βιομηχανίες Εργοστάσια",
  agriculture: "Αγροκτήματα Γεωργία",
  other: "Επιχειρήσεις",
};

// ─── SerpApi Google Maps Search ─────────────────────────────────────────────
async function searchSerpApi(
  apiKey: string,
  query: string,
  ll: string,
  maxResults: number
): Promise<any[]> {
  const params = new URLSearchParams({
    engine: "google_maps",
    type: "search",
    q: query,
    ll: ll,
    api_key: apiKey,
    num: String(Math.min(maxResults, 20)),
  });

  const url = `https://serpapi.com/search.json?${params.toString()}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("SerpApi error:", response.status, errText);
      return [];
    }

    const data = await response.json();
    const results = data.local_results || [];

    return results.map((item: any) => ({
      full_name: item.title || "",
      company_name: item.title || "",
      phone: item.phone || "",
      address: item.address || "",
      website: item.website || "",
      type: item.type || "",
      rating: item.rating,
      reviews: item.reviews,
      place_id: item.place_id || "",
      gps_coordinates: item.gps_coordinates || null,
      operational_hours: item.operational_hours || null,
      thumbnail: item.thumbnail || "",
      service_options: item.service_options || null,
    }));
  } catch (err) {
    console.error("SerpApi fetch error:", err);
    return [];
  }
}

// ─── MAIN HANDLER ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
        Deno.env.get("SERVICE_ROLE_KEY") ??
        ""
    );

    const body = await req.json().catch(() => ({}));
    const {
      category = "other",
      region = "Αττική",
      maxResults = 20,
      importToDb = false,
    } = body;

    // ── Fetch SerpApi key from crm_settings ──
    const { data: settingRow, error: settingError } = await supabase
      .from("crm_settings")
      .select("setting_value")
      .eq("setting_key", "SERPAPI_KEY")
      .single();

    if (settingError || !settingRow?.setting_value) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "SerpApi key not found. Add it in the CRM under Διαχείριση → B2B Scraper.",
          businesses: [],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Parse the JSON-encoded value (stored as JSON string e.g. '"abc123"')
    let apiKey: string;
    const rawVal = settingRow.setting_value;
    try {
      apiKey = typeof rawVal === "string" ? JSON.parse(rawVal) : String(rawVal);
    } catch {
      apiKey = String(rawVal).replace(/^"|"$/g, "");
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "SerpApi key is empty. Add it in the CRM under Διαχείριση → B2B Scraper.",
          businesses: [],
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // ── Build search query and coordinates ──
    const query = categoryQueries[category] || categoryQueries.other;
    const ll = regionCoordinates[region] || regionCoordinates["Αττική"];

    // ── Search SerpApi ──
    const rawResults = await searchSerpApi(apiKey, query, ll, maxResults);

    // ── Filter: must have phone number ──
    const withPhone = rawResults.filter(
      (r) => r.phone && r.phone.trim().length > 0
    );

    // ── Deduplicate by company name + phone ──
    const seen = new Set<string>();
    const deduped = withPhone.filter((r) => {
      const key = `${r.company_name}|${r.phone}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── Map to business objects for frontend ──
    const businesses = deduped.map((r) => ({
      company: r.company_name,
      phone: r.phone,
      email: "",
      address: r.address,
      website: r.website,
      category: query,
      region: region,
      source: "serpapi",
      rating: r.rating || null,
      totalReviews: r.reviews || null,
      placeId: r.place_id || null,
      lat: r.gps_coordinates?.latitude ?? null,
      lng: r.gps_coordinates?.longitude ?? null,
    }));

    // ── Import to database if requested ──
    // The CRM UI imports client-side through createLead() so leads keep
    // their attribution; this path serves callers without a session
    // (e.g. the orchestrator function).
    let imported = 0;
    if (importToDb && businesses.length > 0) {
      for (const biz of businesses) {
        const nameParts = biz.company.split(" ");
        const firstName = nameParts[0] || biz.company;
        const lastName = nameParts.slice(1).join(" ") || "";

        const { error } = await supabase.from("leads").insert({
          full_name: biz.company,
          client_name: biz.company,
          client_contact: biz.phone || "",
          first_name: firstName,
          last_name: lastName,
          company: biz.company,
          phone: biz.phone,
          address: biz.address || null,
          region: region,
          lead_type: "B2B",
          service_category: "energy",
          status: "new",
          source: "import",
          source_label: "B2B Scraper · Google Maps",
          comments: [
            `Πηγή: SerpApi Google Maps`,
            `Κατηγορία: ${biz.category}`,
            biz.address ? `Διεύθυνση: ${biz.address}` : null,
            biz.website ? `Ιστοσελίδα: ${biz.website}` : null,
            biz.rating ? `Αξιολόγηση: ${biz.rating} (${biz.totalReviews || 0} κριτικές)` : null,
          ]
            .filter(Boolean)
            .join(" | "),
        });

        if (!error) imported++;
        else console.error("lead insert failed:", error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: businesses.length,
        imported,
        businesses,
        source_info: {
          api: "SerpApi Google Maps",
          query,
          region,
          ll,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error), success: false }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
