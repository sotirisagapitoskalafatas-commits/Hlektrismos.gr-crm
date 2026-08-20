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

const TARIFF_EXTRACTION_PROMPT = `You are a Greek energy market analyst. Extract all energy provider tariffs found in the provided text. Return STRICTLY a JSON array of objects with keys: provider_name, program_name, customer_type (B2C/B2B), tariff_color (blue/green/yellow/orange), energy_type (electricity/gas/solar), unit_rate_kwh (number), fixed_fee_monthly (number). Map to RAEYE color standards. No markdown.`;

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
      unit_rate_kwh: number;
      fixed_fee_monthly: number;
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
    console.log(`[db] Truncating market_tariffs...`);

    const { error: truncateError } = await supabase.rpc("exec_sql", {
      query: "TRUNCATE TABLE market_tariffs",
    });

    if (truncateError) {
      // Fallback: delete all rows manually
      console.warn("[db] exec_sql truncate failed, falling back to delete...");
      const { error: deleteError } = await supabase
        .from("market_tariffs")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (deleteError) {
        console.error("[db] Delete fallback also failed:", deleteError);
        throw new Error(`Failed to truncate market_tariffs: ${deleteError.message}`);
      }
    }

    console.log(`[db] Inserting ${tariffs.length} tariff records...`);

    const tariffInserts = tariffs.map((t) => ({
      provider_name: t.provider_name,
      program_name: t.program_name,
      customer_type: t.customer_type || "B2C",
      tariff_color: t.tariff_color || "green",
      energy_type: t.energy_type || "electricity",
      unit_rate_kwh: Number(t.unit_rate_kwh) || 0,
      fixed_fee_monthly: Number(t.fixed_fee_monthly) || 0,
      validity_month: validityMonth,
      source_url: "",
      category: t.customer_type || "B2C",
      resource: t.energy_type === "gas" ? "αέριο" : "ρεύμα",
      last_verified: new Date().toISOString(),
    }));

    const { data: insertedTariffs, error: insertError } = await supabase
      .from("market_tariffs")
      .insert(tariffInserts)
      .select("provider_name");

    if (insertError) {
      console.error("[db] Bulk insert error:", insertError);
      throw new Error(`Failed to insert tariffs: ${insertError.message}`);
    }

    console.log(`[db] Inserted ${(insertedTariffs || []).length} tariff records`);

    // Upsert unique providers into rag_document_endpoints
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
            endpoint_url: `https://www.google.com/search?q=${encodeURIComponent(`τιμολόγιο ${provider} ${custType}`)}`,
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
      // Non-critical — do not fail the function
    }

    console.log(`[autonomous-tariff-scraper] Completed in ${durationMs}ms — ${tariffs.length} tariffs, ${uniqueProviders.length} providers`);

    return new Response(JSON.stringify({
      success: true,
      validity_month: validityMonth,
      tariffs_inserted: tariffs.length,
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

    // Log failure
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
      // Swallow logging failure
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
