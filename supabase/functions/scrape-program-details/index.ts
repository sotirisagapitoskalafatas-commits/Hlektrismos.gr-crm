import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sanity check: reject prices outside realistic Greek market range
const MIN_PRICE = 0.05;
const MAX_PRICE = 0.35;

function isValidPrice(p: number | null | undefined): boolean {
  if (p === null || p === undefined) return false;
  return p >= MIN_PRICE && p <= MAX_PRICE;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // ─── JWT Auth Verification ──────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for DB writes
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Accept provider filter from query param or body
    let providerFilter: string | null = null;
    if (req.method === "GET") {
      const url = new URL(req.url);
      providerFilter = url.searchParams.get("provider");
    } else {
      try {
        const body = await req.json();
        providerFilter = body?.provider || null;
      } catch { /* no body */ }
    }

    // 1. Fetch tariffs
    let query = supabaseAdmin
      .from("energy_tariffs")
      .select("id, provider_name, program_name, official_url, customer_type")
      .not("official_url", "is", null)
      .eq("is_active", true);

    if (providerFilter) {
      query = query.eq("provider_name", providerFilter);
    }

    const { data: tariffs, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    if (!tariffs || tariffs.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        updated: 0,
        message: providerFilter ? `No tariffs found for ${providerFilter}` : "No tariffs with URLs found",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[scrape] Processing ${tariffs.length} tariffs${providerFilter ? ` for ${providerFilter}` : ""}`);
    let updatedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // 2. Process SEQUENTIALLY (one URL at a time) to avoid timeout
    for (const tariff of tariffs) {
      if (!tariff.official_url) continue;

      try {
        console.log(`[scrape] ${tariff.provider_name} - ${tariff.program_name}`);

        // Fetch HTML with 8s timeout per page
        const pageRes = await fetch(tariff.official_url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "el-GR,el;q=0.9,en;q=0.5",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
        });

        if (!pageRes.ok) {
          console.warn(`[scrape] HTTP ${pageRes.status} for ${tariff.official_url}`);
          failedCount++;
          errors.push(`${tariff.program_name}: HTTP ${pageRes.status}`);
          continue;
        }

        const htmlText = await pageRes.text();

        // Check for PDF links — if found, try to fetch and extract text
        let contentToAnalyze = htmlText;
        const pdfMatch = htmlText.match(/href=["']([^"']*\.pdf[^"']*)/i);
        if (pdfMatch && pdfMatch[1]) {
          const pdfUrl = new URL(pdfMatch[1], tariff.official_url).href;
          console.log(`[scrape] Found PDF: ${pdfUrl}`);
          try {
            const pdfRes = await fetch(pdfUrl, {
              signal: AbortSignal.timeout(10000),
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              },
            });
            if (pdfRes.ok) {
              // We can't parse PDF directly in Deno, but we include the URL in the prompt
              // so Gemini can reference it. We still pass the HTML content.
              console.log(`[scrape] PDF fetched (${pdfRes.headers.get("content-type")})`);
            }
          } catch (pdfErr: any) {
            console.warn(`[scrape] PDF fetch failed: ${pdfErr.message}`);
          }
        }

        // Strip HTML to clean text
        const cleanText = contentToAnalyze
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .substring(0, 10000);

        if (cleanText.length < 100) {
          console.warn(`[scrape] Too little text from ${tariff.official_url}`);
          failedCount++;
          errors.push(`${tariff.program_name}: empty page`);
          continue;
        }

        // 3. Ask Gemini to extract pricing
        const aiPayload = {
          contents: [{
            parts: [{
              text: `Ανάλυσε αυτή τη σελίδα προγράμματος ενέργειας "${tariff.program_name}" του παρόχου "${tariff.provider_name}".
Εξάγε τα τιμολογιακά δεδομένα. Return STRICTLY a JSON object:
{
  "base_price_day": number (€/kWh, daytime rate),
  "base_price_night": number|null (€/kWh, nighttime rate if dual-zone),
  "fixed_fee_monthly": number (€/month fixed charge, default 0 if not shown),
  "discounted_price_day": number|null (discounted €/kWh if available),
  "discount_conditions": string|null (e.g. "Direct debit 10%", "e-bill 5%"),
  "notes": string|null (any important notes)
}
Αν δεν βρεις κάποιο πεδίο, βάλε null. ΜΗΝ επινοείς δεδομένα. Raw JSON only, no markdown.

Page content:
${cleanText}`
            }],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        };

        const aiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-goog-api-key": geminiApiKey,
            },
            body: JSON.stringify(aiPayload),
            signal: AbortSignal.timeout(25000),
          }
        );

        if (!aiRes.ok) {
          console.warn(`[gemini] HTTP ${aiRes.status} for ${tariff.program_name}`);
          failedCount++;
          errors.push(`${tariff.program_name}: Gemini ${aiRes.status}`);
          continue;
        }

        const aiData = await aiRes.json();
        const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!rawText) {
          console.warn(`[gemini] Empty response for ${tariff.program_name}`);
          failedCount++;
          errors.push(`${tariff.program_name}: empty AI response`);
          continue;
        }

        const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanJson);

        if (!parsed.base_price_day && parsed.base_price_day !== 0) {
          console.warn(`[gemini] No base_price_day for ${tariff.program_name}`);
          failedCount++;
          errors.push(`${tariff.program_name}: no price extracted`);
          continue;
        }

        // 4. SANITY CHECK: reject unrealistic prices
        if (!isValidPrice(parsed.base_price_day)) {
          console.warn(`[sanity] Rejected price €${parsed.base_price_day}/kWh for ${tariff.program_name} (outside ${MIN_PRICE}-${MAX_PRICE} range)`);
          failedCount++;
          errors.push(`${tariff.program_name}: price €${parsed.base_price_day} outside range`);
          continue;
        }

        if (parsed.discounted_price_day && !isValidPrice(parsed.discounted_price_day)) {
          parsed.discounted_price_day = null; // null out invalid discount, keep base price
        }

        // 5. Upsert to energy_tariff_prices
        const today = new Date().toISOString().split("T")[0];
        const { data: existing } = await supabaseAdmin
          .from("energy_tariff_prices")
          .select("id")
          .eq("tariff_id", tariff.id)
          .eq("validity_from", today)
          .limit(1)
          .maybeSingle();

        const priceData = {
          base_price_day: parsed.base_price_day,
          base_price_night: parsed.base_price_night || null,
          fixed_fee_monthly: parsed.fixed_fee_monthly || 0,
          discounted_price_day: parsed.discounted_price_day || null,
          discount_conditions: parsed.discount_conditions || null,
          notes: parsed.notes || null,
          source_type: "scraper",
          verification_status: "needs_review",
          source_url: tariff.official_url,
        };

        if (existing) {
          await supabaseAdmin.from("energy_tariff_prices").update(priceData).eq("id", existing.id);
        } else {
          await supabaseAdmin.from("energy_tariff_prices").insert({
            tariff_id: tariff.id,
            ...priceData,
            unit_rate_kwh: parsed.base_price_day,
            validity_from: today,
          });
        }

        updatedCount++;
        console.log(`[scrape] ✓ ${tariff.provider_name} - ${tariff.program_name}: €${parsed.base_price_day}/kWh`);
      } catch (err: any) {
        console.error(`[scrape] ✗ ${tariff.program_name}: ${err.message}`);
        failedCount++;
        errors.push(`${tariff.program_name}: ${err.message}`);
      }
    }

    // Log to scraper_logs
    const durationMs = Date.now() - startTime;
    try {
      await supabaseAdmin.from("scraper_logs").insert({
        provider_name: providerFilter || "all",
        status: failedCount > 0 && updatedCount === 0 ? "error" : "success",
        records_synced: updatedCount,
        duration_ms: durationMs,
        error_message: errors.length > 0 ? errors.join("; ").substring(0, 1000) : null,
      });
    } catch { /* non-critical */ }

    return new Response(JSON.stringify({
      success: true,
      provider: providerFilter || "all",
      updated: updatedCount,
      failed: failedCount,
      total: tariffs.length,
      duration_ms: durationMs,
      errors: errors.slice(0, 10),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[scrape-program-details] Fatal: ${err.message}`);

    try {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabaseAdmin.from("scraper_logs").insert({
        provider_name: "scrape-program-details",
        status: "error",
        error_message: err.message,
        duration_ms: durationMs,
      });
    } catch { /* swallow */ }

    return new Response(JSON.stringify({ error: err.message, duration_ms: durationMs }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
