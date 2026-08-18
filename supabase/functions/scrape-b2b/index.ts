import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScrapedBusiness {
  company: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  category: string;
  region: string;
  source: string;
  lat?: number;
  lng?: number;
  rating?: number;
  totalReviews?: number;
  placeId?: string;
}

// Greek business category keywords for search queries
const categorySearchTerms: Record<string, string[]> = {
  energy: ["ενέργεια εταιρεία", "ηλεκτροενέργεια", "εταιρεία ρεύματος"],
  solar: ["φωτοβολταϊκά", "solar panels", "ηλιακή ενέργεια", "pv install"],
  ev_charging: ["σταθμός φόρτισης", "ev charging", "ηλεκτροκίνηση"],
  real_estate: ["ακίνητα", "μεσιτικό γραφείο", "real estate"],
  construction: ["κατασκευαστική εταιρεία", "εργοληπτική"],
  restaurant: ["εστιατόριο", "ταβέρνα", "εστιατόρια"],
  hotel: ["ξενοδοχείο", "μοτέλ", "ξενοδοχεία"],
  retail: ["κατάστημα", "εμπορικό κέντρο", "showroom"],
  technology: ["software εταιρεία", "IT εταιρεία", "τεχνολογία"],
  healthcare: ["ιατρείο", "κλινική", "φαρμακείο", "νοσοκομείο"],
  automotive: ["αυτοκίνητο service", "επισκευή αυτοκινήτου", "garage"],
  professional: ["δικηγορικό γραφείο", "λογιστικό γραφείο", "μηχανικός"],
  fitness: ["γυμναστήριο", "fitness center", "gym"],
  beauty: ["κομμωτήριο", "αισθητική", "beauty salon"],
  logistics: ["μεταφορική εταιρεία", "logistics", "courier"],
  education: ["φροντιστήριο", "σχολή", "akadimía"],
  bakery: ["αρτοποιείο", "ζαχαροπλαστείο", "φούρνος"],
  other: ["εταιρεία", "επιχείρηση", "business"],
};

// Region to approximate lat/lng for Greek regions
const regionCoords: Record<string, { lat: number; lng: number }> = {
  Αττική: { lat: 37.9838, lng: 23.7275 },
  Θεσσαλονίκη: { lat: 40.6401, lng: 22.9444 },
  Κεντρική_Ελλάδα: { lat: 38.2466, lng: 23.6647 },
  Πελοπόννησος: { lat: 37.5, lng: 22.5 },
  Κρήτη: { lat: 35.2401, lng: 24.4691 },
  Ιόνια_Νησιά: { lat: 39.6243, lng: 19.9217 },
  Νησιά_Αιγαίου: { lat: 37.5, lng: 25.5 },
  Θεσσαλία: { lat: 39.6, lng: 22.0 },
  Ήπειρος: { lat: 39.6, lng: 20.8 },
  Δυτική_Ελλάδα: { lat: 38.2, lng: 21.7 },
  Στερεά_Ελλάδα: { lat: 38.6, lng: 22.7 },
  Δυτική_Μακεδονία: { lat: 40.3, lng: 21.8 },
  Ανατολική_Μακεδονία_Θράκη: { lat: 41.1, lng: 24.8 },
  Βόρειο_Αιγαίο: { lat: 39.0, lng: 26.0 },
};

// Region name mapping for Apify queries
const regionNames: Record<string, string> = {
  Αττική: "Αττική, Ελλάδα",
  Θεσσαλονίκη: "Θεσσαλονίκη, Ελλάδα",
  Κεντρική_Ελλάδα: "Κεντρική Ελλάδα",
  Πελοπόννησος: "Πελοπόννησος, Ελλάδα",
  Κρήτη: "Κρήτη, Ελλάδα",
  Ιόνια_Νησιά: "Ιόνια Νησιά, Ελλάδα",
  Νησιά_Αιγαίου: "Νησιά Αιγαίου, Ελλάδα",
  Θεσσαλία: "Θεσσαλία, Ελλάδα",
  Ήπειρος: "Ήπειρος, Ελλάδα",
  Δυτική_Ελλάδα: "Δυτική Ελλάδα",
  Στερεά_Ελλάδα: "Στερεά Ελλάδα",
  Δυτική_Μακεδονία: "Δυτική Μακεδονία, Ελλάδα",
  Ανατολική_Μακεδονία_Θράκη: "Ανατολική Μακεδονία Θράκη, Ελλάδα",
  Βόρειο_Αιγαίο: "Βόρειο Αιγαίο, Ελλάδα",
};

// ─── APIFY: Google Maps Scraper ────────────────────────────────────────────
async function searchApify(
  apifyToken: string,
  searchTerm: string,
  region: string,
  maxResults: number
): Promise<ScrapedBusiness[]> {
  const regionName = regionNames[region] || "Ελλάδα";
  const searchQuery = `${searchTerm} ${regionName}`;

  // Start Apify actor run (compass/crawler-google-places)
  const startUrl = `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${apifyToken}`;
  const startBody = {
    searchStringsArray: [searchQuery],
    maxCrawledPlacesPerSearch: maxResults,
    language: "el",
    countryCode: "gr",
    maxImages: 0,
    maxReviews: 0,
    includeWebResults: false,
    scrapeContacts: true,
  };

  try {
    const startResp = await fetch(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(startBody),
      signal: AbortSignal.timeout(15000),
    });

    if (!startResp.ok) {
      const errText = await startResp.text();
      console.error("Apify start failed:", startResp.status, errText);
      return [];
    }

    const startData = await startResp.json();
    const runId = startData?.data?.id;
    if (!runId) return [];

    // Poll for completion (max 120s)
    const datasetId = await pollApifyRun(apifyToken, runId, 120000);
    if (!datasetId) return [];

    // Fetch results from dataset
    const dataUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&format=json&limit=${maxResults}`;
    const dataResp = await fetch(dataUrl, { signal: AbortSignal.timeout(30000) });
    if (!dataResp.ok) return [];

    const items = await dataResp.json();
    if (!Array.isArray(items)) return [];

    return items.map((item: any): ScrapedBusiness => ({
      company: item.title || item.name || "",
      phone: item.phone || item.phoneNumber || "",
      email: item.emails?.[0] || item.email || "",
      address: item.address || item.street || "",
      website: item.url || item.website || "",
      category: item.categoryName || item.category || searchTerm,
      region: region,
      source: "apify",
      lat: item.location?.lat || item.latitude,
      lng: item.location?.lng || item.longitude,
      rating: item.totalScore || item.rating,
      totalReviews: item.reviewsCount || item.totalReviews,
      placeId: item.placeId || item.cid,
    }));
  } catch (err) {
    console.error("Apify error:", err);
    return [];
  }
}

async function pollApifyRun(
  token: string,
  runId: string,
  timeoutMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}?token=${token}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      const status = data?.data?.status;
      if (status === "SUCCEEDED") {
        return data.data.defaultDatasetId || null;
      }
      if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        console.error("Apify run failed:", status);
        return null;
      }
      // Still running, wait 3s
      await new Promise((r) => setTimeout(r, 3000));
    } catch {
      return null;
    }
  }
  return null;
}

// ─── Google Maps Places API (Nearby Search) ────────────────────────────────
async function searchGooglePlaces(
  apiKey: string,
  searchTerm: string,
  lat: number,
  lng: number,
  maxResults: number
): Promise<ScrapedBusiness[]> {
  const businesses: ScrapedBusiness[] = [];
  let pageToken = "";
  let fetched = 0;

  while (fetched < maxResults) {
    const radius = 20000;
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(searchTerm)}&language=el&key=${apiKey}`;
    if (pageToken) url += `&pagetoken=${pageToken}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) break;
      const data = await response.json();
      if (!data.results || data.results.length === 0) break;

      for (const place of data.results) {
        if (fetched >= maxResults) break;
        businesses.push({
          company: place.name || "",
          phone: place.formatted_phone_number || "",
          email: "",
          address: place.vicinity || "",
          website: "",
          category: searchTerm,
          region: "",
          source: "google_places",
          lat: place.geometry?.location?.lat,
          lng: place.geometry?.location?.lng,
          rating: place.rating,
          totalReviews: place.user_ratings_total,
          placeId: place.place_id,
        });
        fetched++;
      }

      pageToken = data.next_page_token || "";
      if (!pageToken) break;
      await new Promise((r) => setTimeout(r, 2000));
    } catch {
      break;
    }
  }
  return businesses;
}

// ─── Google Maps Place Details ─────────────────────────────────────────────
async function getPlaceDetails(
  apiKey: string,
  placeId: string
): Promise<{ phone: string; website: string; address: string }> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,website,formatted_address&language=el&key=${apiKey}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return { phone: "", website: "", address: "" };
    const data = await response.json();
    return {
      phone: data.result?.formatted_phone_number || "",
      website: data.result?.website || "",
      address: data.result?.formatted_address || "",
    };
  } catch {
    return { phone: "", website: "", address: "" };
  }
}

// ─── Google Custom Search API ──────────────────────────────────────────────
async function searchGoogleCustom(
  apiKey: string,
  cseId: string,
  query: string,
  maxResults: number
): Promise<ScrapedBusiness[]> {
  const businesses: ScrapedBusiness[] = [];
  try {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cseId}&num=${Math.min(maxResults, 10)}&gl=gr&hl=el`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const data = await response.json();

    for (const item of data.items || []) {
      if (businesses.length >= maxResults) break;
      const title = item.title || "";
      const snippet = item.snippet || "";
      const link = item.link || "";

      const phoneMatch = snippet.match(/(\+?30)?[\s-]?(\d{10}|\d{3}[\s.-]\d{3}[\s.-]\d{4})/);
      const emailMatch = snippet.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);

      businesses.push({
        company: title.split(" - ")[0].trim(),
        phone: phoneMatch ? phoneMatch[0].trim() : "",
        email: emailMatch ? emailMatch[0] : "",
        address: "",
        website: link,
        category: "",
        region: "",
        source: "google_search",
      });
    }
  } catch {
    // silent
  }
  return businesses;
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

    const {
      category = "other",
      region = "",
      maxResults = 20,
      source = "auto",
      importToDb = false,
      googleApiKey = "",
      customSearchId = "",
      apifyToken = "",
    } = await req.json();

    const apiKey = googleApiKey || Deno.env.get("GOOGLE_MAPS_API_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
    const cseId = customSearchId || Deno.env.get("GOOGLE_CUSTOM_SEARCH_ID") || "";
    const apifyApiToken = apifyToken || Deno.env.get("APIFY_TOKEN") || "";

    let allBusinesses: ScrapedBusiness[] = [];
    const searchTerms = categorySearchTerms[category] || categorySearchTerms.other;
    const coords = regionCoords[region] || regionCoords["Αττική"];

    // Determine which sources are available
    const hasApify = !!apifyApiToken;
    const hasGoogle = !!apiKey;
    const hasCustomSearch = hasGoogle && !!cseId;

    if (!hasApify && !hasGoogle) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No scraping API configured. Please add an Apify token or Google Maps API key in Settings → B2B Scraper.",
          businesses: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Determine source priority
    let sources: string[];
    if (source === "auto") {
      // Apify first (best results), then Google Places, then Custom Search
      sources = [];
      if (hasApify) sources.push("apify");
      if (hasGoogle) sources.push("google_places");
      if (hasCustomSearch) sources.push("google_search");
    } else if (source === "apify" && hasApify) {
      sources = ["apify"];
    } else if (source === "google_places" && hasGoogle) {
      sources = ["google_places"];
    } else if (source === "google_search" && hasCustomSearch) {
      sources = ["google_search"];
    } else {
      // Fallback to whatever is available
      sources = [];
      if (hasApify) sources.push("apify");
      if (hasGoogle) sources.push("google_places");
      if (hasCustomSearch) sources.push("google_search");
    }

    // Execute scraping
    for (const src of sources) {
      if (allBusinesses.length >= maxResults) break;

      if (src === "apify") {
        // Apify: use first search term for the region
        const term = searchTerms[0];
        const remaining = maxResults - allBusinesses.length;
        const results = await searchApify(apifyApiToken, term, region, remaining);
        allBusinesses = [...allBusinesses, ...results];
      } else {
        // Google sources: iterate through search terms
        for (const term of searchTerms) {
          if (allBusinesses.length >= maxResults) break;
          const remaining = maxResults - allBusinesses.length;

          if (src === "google_places") {
            const results = await searchGooglePlaces(apiKey, term, coords.lat, coords.lng, remaining);
            allBusinesses = [...allBusinesses, ...results];
          } else if (src === "google_search") {
            const results = await searchGoogleCustom(apiKey, cseId, `${term} ${region ? region + " " : ""}Ελλάδα τηλέφωνο email`, remaining);
            allBusinesses = [...allBusinesses, ...results];
          }
        }
      }
    }

    // Enrich with place details (phone, website) for Google Places results only
    const needsEnrichment = allBusinesses.filter((b) => b.source === "google_places" && b.placeId && !b.phone);
    if (needsEnrichment.length > 0) {
      const enriched = await Promise.all(
        needsEnrichment.slice(0, 20).map(async (biz) => {
          if (biz.placeId && apiKey) {
            const details = await getPlaceDetails(apiKey, biz.placeId);
            return {
              ...biz,
              phone: details.phone || biz.phone,
              website: details.website || biz.website,
              address: details.address || biz.address,
            };
          }
          return biz;
        })
      );
      const enrichedIds = new Set(enriched.map((e) => e.placeId));
      allBusinesses = [
        ...enriched,
        ...allBusinesses.filter((b) => !b.placeId || !enrichedIds.has(b.placeId)),
      ];
    }

    // Deduplicate by company name + phone
    const seen = new Set<string>();
    allBusinesses = allBusinesses.filter((b) => {
      const key = `${b.company}|${b.phone}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Import to database if requested
    if (importToDb && allBusinesses.length > 0) {
      let imported = 0;
      for (const biz of allBusinesses.slice(0, maxResults)) {
        const nameParts = biz.company.split(" ");
        const firstName = nameParts[0] || biz.company;
        const lastName = nameParts.slice(1).join(" ") || "";

        const { error } = await supabase.from("hlektrismos_leads").insert({
          first_name: firstName,
          last_name: lastName,
          email: biz.email || "",
          phone: biz.phone || "",
          region: region || biz.region,
          customer_type: "Εταιρεία (B2B)",
          provider: "B2B Scraper",
          status: "new",
          lawful_basis: "Legitimate_Interest",
          customer_category: "B2B_Corporate",
          comments: `Source: ${biz.source} | Category: ${biz.category} | Address: ${biz.address} | Website: ${biz.website} | Rating: ${biz.rating || "N/A"} (${biz.totalReviews || 0} reviews)`,
        });

        if (!error) imported++;
      }

      return new Response(
        JSON.stringify({
          success: true,
          count: allBusinesses.length,
          imported,
          businesses: allBusinesses,
          source_info: {
            api: sources.join(" + "),
            apify: hasApify,
            google_places: hasGoogle,
            custom_search: hasCustomSearch,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: allBusinesses.length,
        businesses: allBusinesses,
        source_info: {
          api: sources.join(" + "),
          apify: hasApify,
          google_places: hasGoogle,
          custom_search: hasCustomSearch,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error), success: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
