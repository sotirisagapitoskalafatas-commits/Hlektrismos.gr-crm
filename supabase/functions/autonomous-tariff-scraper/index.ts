import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GREEK_MONTHS = [
  "Ιανουαρίου", "Φεβρουαρίου", "Μαρτίου", "Απριλίου",
  "Μαΐου", "Ιουνίου", "Ιουλίου", "Αυγούστου",
  "Σεπτεμβρίου", "Οκτωβρίου", "Νοεμβρίου", "Δεκεμβρίου",
];

const TARIFF_EXTRACTION_PROMPT = `You are a Greek energy market analyst. Extract ALL energy provider tariffs from the provided text. Return STRICTLY a JSON array of objects with these keys:
- provider_name: Greek provider name (ΔΕΗ, Protergia, ΗΡΩΝ, Elpedison, Φυσικό Αέριο, nrg, ZeniΘ, Volton, Ελίν, We Energy, Enerwave, Eunice)
- program_name: Exact tariff program name in Greek
- customer_type: "B2C" or "B2B"
- tariff_color: "green" (Ειδικό/Πράσινο), "blue" (Σταθερό), "yellow" (Κυμαινόμενο), or "orange" (Δυναμικό)
- energy_type: "electricity", "gas", "solar", or "ev_charging"
- base_price_day: daytime electricity price in €/kWh (number, 4 decimal places)
- base_price_night: nighttime electricity price in €/kWh if available (number or null)
- unit_rate_kwh: average or single rate in €/kWh (number)
- fixed_fee_monthly: fixed monthly charge in € (number, 0 if none)
- discounted_price_day: discounted daytime price if applicable (number or null)
- discounted_price_night: discounted nighttime price if applicable (number or null)
- discount_conditions: text describing discount conditions (string or null, e.g. "Direct debit", "e-bill", "Online only")
- official_url: official provider page URL for this program if found (string or null)

RAEYE color standards: green = Ειδικό (social tariff), blue = Σταθερό (fixed), yellow = Κυμαινόμενο (variable), orange = Δυναμικό (dynamic).
Return ONLY the JSON array, no markdown, no explanation.`;

// Official URLs per provider — used as fallback when scraper doesn't find them
const OFFICIAL_URLS: Record<string, Record<string, string>> = {
  "ΔΕΗ": { B2C: "https://myhome-online.gr/el/products", B2B: "https://mybusiness-online.gr/el/products" },
  "Protergia": { B2C: "https://www.protergia.gr/antistoixisi/spiti/", B2B: "https://www.protergia.gr/antistoixisi/epixeirisi/" },
  "ΗΡΩΝ": { B2C: "https://www.heron.gr/antistoixisi/spiti/", B2B: "https://www.heron.gr/antistoixisi/epixeirisi/" },
  "nrg": { B2C: "https://www.nrg.gr/antistoixisi/spiti", B2B: "https://www.nrg.gr/antistoixisi/epixeirisi" },
  "Elpedison": { B2C: "https://www.elpedison.gr/antistoixisi/spiti", B2B: "https://www.elpedison.gr/antistoixisi/epixeirisi" },
  "ZeniΘ": { B2C: "https://zenith.gr/antistoixisi/spiti/", B2B: "https://zenith.gr/antistoixisi/epixeirisi/" },
  "Volton": { B2C: "https://volton.gr/antistoixisi/spiti/", B2B: "https://volton.gr/antistoixisi/epixeirisi/" },
  "Φυσικό Αέριο": { B2C: "https://www.fysikoaeriohellas.gr/antistoixisi/spiti/", B2B: "https://www.fysikoaeriohellas.gr/antistoixisi/epixeirisi/" },
  "Ελίν": { B2C: "https://energy.elin.gr/antistoixisi/spiti/", B2B: "https://energy.elin.gr/antistoixisi/epixeirisi/" },
  "We Energy": { B2C: "https://weenergy.gr/antistoixisi/spiti/", B2B: "https://weenergy.gr/antistoixisi/epixeirisi/" },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const serpApiKey = Deno.env.get("SERPAPI_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!serpApiKey || !geminiApiKey) {
      return new Response(JSON.stringify({
        error: "Missing required API keys: SERPAPI_API_KEY, GEMINI_API_KEY",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const currentMonth = GREEK_MONTHS[now.getMonth()];
    const currentYear = now.getFullYear();
    const validityMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const validityFrom = `${validityMonth}-01`;

    console.log(`[autonomous-tariff-scraper] Starting scrape for ${currentMonth} ${currentYear} (validity: ${validityMonth})`);

    // ─── Phase 1: SerpApi Search ───────────────────────────────────────────
    const searchQuery = `ΡΑΕΥΕ τιμές ρεύματος ${currentMonth} ${currentYear}`;
    console.log(`[serpapi] Query: ${searchQuery}`);

    const serpParams = new URLSearchParams({
      engine: "google",
      q: searchQuery,
      gl: "gr",
      hl: "el",
      api_key: serpApiKey,
    });

    const serpRes = await fetch(`https://serpapi.com/search.json?${serpParams}`, {
      signal: AbortSignal.timeout(30000),
    });

    if (!serpRes.ok) {
      const serpError = await serpRes.text();
      console.error(`[serpapi] HTTP ${serpRes.status}: ${serpError}`);
      throw new Error(`SerpApi request failed: HTTP ${serpRes.status}`);
    }

    const serpData = await serpRes.json();
    const organicResults = serpData.organic_results || [];

    if (organicResults.length === 0) {
      console.warn("[serpapi] No organic results found");
    }

    const textBlock = organicResults
      .map((r: { title?: string; snippet?: string }) =>
        `${r.title || ""} ${r.snippet || ""}`
      )
      .join("\n")
      .trim();

    console.log(`[serpapi] Extracted ${organicResults.length} results, text block length: ${textBlock.length}`);

    if (textBlock.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "No search results returned from SerpApi",
        search_query: searchQuery,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Phase 2: Gemini AI Extraction ─────────────────────────────────────
    console.log("[gemini] Sending text block for tariff extraction...");

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: TARIFF_EXTRACTION_PROMPT }],
          },
          contents: [{
            role: "user",
            parts: [{ text: textBlock }],
          }],
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(60000),
      }
    );

    if (!geminiRes.ok) {
      const geminiError = await geminiRes.text();
      console.error(`[gemini] HTTP ${geminiRes.status}: ${geminiError}`);
      throw new Error(`Gemini API request failed: HTTP ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log(`[gemini] Raw response length: ${rawText.length}`);

    // Strip markdown code fences if present
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let tariffs: Array<{
      provider_name: string;
      program_name: string;
      customer_type: string;
      tariff_color: string;
      energy_type: string;
      base_price_day: number | null;
      base_price_night: number | null;
      unit_rate_kwh: number;
      fixed_fee_monthly: number;
      discounted_price_day: number | null;
      discounted_price_night: number | null;
      discount_conditions: string | null;
      official_url: string | null;
    }> = [];

    try {
      tariffs = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[gemini] Failed to parse JSON response:", parseErr);
      console.error("[gemini] Raw text:", rawText);
      throw new Error("Gemini returned invalid JSON — cannot parse tariff data");
    }

    if (!Array.isArray(tariffs) || tariffs.length === 0) {
      console.warn("[gemini] Parsed response is empty or not an array");
      return new Response(JSON.stringify({
        success: false,
        error: "Gemini returned no tariff data from search results",
        search_query: searchQuery,
        results_scanned: organicResults.length,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[gemini] Extracted ${tariffs.length} tariff records`);

    // ─── Phase 3: Database Update ──────────────────────────────────────────

    // 3a. Upsert energy_tariffs (product catalog)
    console.log(`[db] Upserting ${tariffs.length} energy_tariffs...`);

    const tariffCatalogInserts = tariffs.map((t) => ({
      provider_name: t.provider_name,
      program_name: t.program_name,
      customer_type: (t.customer_type || "B2C") as "B2C" | "B2B",
      tariff_color: t.tariff_color || "green",
      energy_type: t.energy_type || "electricity",
      official_url: t.official_url || OFFICIAL_URLS[t.provider_name]?.[t.customer_type || "B2C"] || null,
      is_active: true,
    }));

    const { data: insertedCatalog, error: catalogError } = await supabase
      .from("energy_tariffs")
      .upsert(tariffCatalogInserts, { onConflict: "provider_name,program_name" })
      .select("id, provider_name, program_name");

    if (catalogError) {
      console.error("[db] energy_tariffs upsert error:", catalogError);
      throw new Error(`Failed to upsert energy_tariffs: ${catalogError.message}`);
    }

    console.log(`[db] Upserted ${insertedCatalog?.length || 0} energy_tariffs`);

    // Build a map of tariff_id by (provider_name, program_name)
    const tariffIdMap = new Map<string, string>();
    for (const t of insertedCatalog || []) {
      tariffIdMap.set(`${t.provider_name}::${t.program_name}`, t.id);
    }

    // 3b. Insert energy_tariff_prices (pricing history)
    console.log(`[db] Inserting ${tariffs.length} energy_tariff_prices...`);

    const priceInserts = tariffs
      .filter((t) => {
        const id = tariffIdMap.get(`${t.provider_name}::${t.program_name}`);
        return id != null;
      })
      .map((t) => ({
        tariff_id: tariffIdMap.get(`${t.provider_name}::${t.program_name}`)!,
        base_price_day: t.base_price_day ?? t.unit_rate_kwh ?? null,
        base_price_night: t.base_price_night ?? null,
        unit_rate_kwh: t.unit_rate_kwh ?? null,
        fixed_fee_monthly: t.fixed_fee_monthly ?? 0,
        discounted_price_day: t.discounted_price_day ?? null,
        discounted_price_night: t.discounted_price_night ?? null,
        discount_conditions: t.discount_conditions ?? null,
        validity_from: validityFrom,
        verification_status: "needs_review" as const,
        source_url: t.official_url || null,
      }));

    const { data: insertedPrices, error: priceError } = await supabase
      .from("energy_tariff_prices")
      .upsert(priceInserts, { onConflict: "tariff_id,validity_from" })
      .select("id");

    if (priceError) {
      console.error("[db] energy_tariff_prices insert error:", priceError);
      // Non-fatal — catalog is already saved
      console.warn("[db] Continuing despite price insert failure...");
    } else {
      console.log(`[db] Inserted ${insertedPrices?.length || 0} energy_tariff_prices`);
    }

    // 3c. Also update legacy market_tariffs for backward compatibility
    console.log(`[db] Updating legacy market_tariffs for backward compat...`);

    const { error: legacyDeleteErr } = await supabase
      .from("market_tariffs")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (legacyDeleteErr) {
      console.warn("[db] Legacy market_tariffs delete failed:", legacyDeleteErr.message);
    } else {
      const legacyInserts = tariffs.map((t) => ({
        provider_name: t.provider_name,
        program_name: t.program_name,
        customer_type: t.customer_type || "B2C",
        tariff_color: t.tariff_color || "green",
        energy_type: t.energy_type || "electricity",
        unit_rate_kwh: Number(t.unit_rate_kwh) || 0,
        fixed_fee_monthly: Number(t.fixed_fee_monthly) || 0,
        validity_month: validityMonth,
        source_url: t.official_url || "",
        category: t.customer_type || "B2C",
        resource: t.energy_type === "gas" ? "αέριο" : "ρεύμα",
        last_verified: new Date().toISOString(),
      }));

      const { error: legacyInsertErr } = await supabase
        .from("market_tariffs")
        .insert(legacyInserts);

      if (legacyInsertErr) {
        console.warn("[db] Legacy market_tariffs insert failed:", legacyInsertErr.message);
      }
    }

    // 3d. Upsert unique providers into rag_document_endpoints
    const uniqueProviders = [...new Set(tariffs.map((t) => t.provider_name))];
    console.log(`[db] Upserting ${uniqueProviders.length} providers into rag_document_endpoints...`);

    for (const provider of uniqueProviders) {
      const providerTariffs = tariffs.filter((t) => t.provider_name === provider);
      const types = [...new Set(providerTariffs.map((t) => t.customer_type || "B2C"))];

      for (const custType of types) {
        const { error: upsertErr } = await supabase
          .from("rag_document_endpoints")
          .upsert({
            provider_name: provider,
            customer_type: custType,
            endpoint_label: `${provider} — ${custType === "B2B" ? "Επιχείρηση" : "Οικιακό"}`,
            endpoint_url: OFFICIAL_URLS[provider]?.[custType] || `https://www.google.com/search?q=${encodeURIComponent(`τιμολόγιο ${provider} ${custType}`)}`,
            file_type: "html",
            sync_frequency: "monthly",
            last_synced_at: new Date().toISOString(),
            is_active: true,
          }, {
            onConflict: "provider_name,customer_type",
          });

        if (upsertErr) {
          console.warn(`[db] Upsert rag_document_endpoints failed for ${provider}/${custType}:`, upsertErr.message);
        }
      }
    }

    // Log to scraper_logs
    const durationMs = Date.now() - startTime;
    try {
      await supabase.from("scraper_logs").insert({
        provider_name: "autonomous-scraper",
        status: "success",
        records_synced: tariffs.length,
        duration_ms: durationMs,
      });
    } catch {
      // Non-critical
    }

    console.log(`[autonomous-tariff-scraper] Completed in ${durationMs}ms — ${tariffs.length} tariffs, ${uniqueProviders.length} providers`);

    return new Response(JSON.stringify({
      success: true,
      validity_month: validityMonth,
      tariffs_inserted: tariffs.length,
      prices_inserted: insertedPrices?.length || 0,
      catalog_inserted: insertedCatalog?.length || 0,
      providers: uniqueProviders,
      search_query: searchQuery,
      results_scanned: organicResults.length,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[autonomous-tariff-scraper] Fatal error: ${err.message}`, err);

    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.from("scraper_logs").insert({
        provider_name: "autonomous-scraper",
        status: "error",
        error_message: err.message,
        duration_ms: durationMs,
      });
    } catch {
      // Swallow
    }

    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
