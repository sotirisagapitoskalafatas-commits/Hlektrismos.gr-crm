import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch all tariffs that have an official_url and base_price_day IS NULL (need pricing)
    const { data: tariffs, error: fetchError } = await supabase
      .from("energy_tariffs")
      .select("id, provider_name, program_name, official_url, customer_type")
      .not("official_url", "is", null);

    if (fetchError) throw fetchError;
    if (!tariffs || tariffs.length === 0) {
      return new Response(JSON.stringify({ success: true, updated: 0, message: "No tariffs with URLs found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[scrape-program-details] Found ${tariffs.length} tariffs to process`);
    let updatedCount = 0;
    let failedCount = 0;

    // 2. Process each tariff (batch of 5 at a time to avoid rate limits)
    const BATCH_SIZE = 5;
    for (let i = 0; i < tariffs.length; i += BATCH_SIZE) {
      const batch = tariffs.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (tariff) => {
        if (!tariff.official_url) return;

        try {
          console.log(`[scrape] ${tariff.provider_name} - ${tariff.program_name}`);

          // Fetch HTML from provider page
          const pageRes = await fetch(tariff.official_url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept-Language": "el-GR,el;q=0.9",
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!pageRes.ok) {
            console.warn(`[scrape] HTTP ${pageRes.status} for ${tariff.official_url}`);
            failedCount++;
            return;
          }

          const htmlText = await pageRes.text();

          // Strip HTML tags to get clean text for AI
          const cleanText = htmlText
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .substring(0, 12000);

          if (cleanText.length < 100) {
            console.warn(`[scrape] Too little text from ${tariff.official_url}`);
            failedCount++;
            return;
          }

          // 3. Ask Gemini to extract pricing
          const aiPayload = {
            contents: [{
              parts: [{
                text: `Ανάλυσε αυτή τη σελίδα προγράμματος ενέργειας "${tariff.program_name}" του παρόχου "${tariff.provider_name}". 
Εξάγε τα τιμολογιακά δεδομένα. Return STRICTLY a JSON object:
{
  "base_price_day": number (€/kWh, daytime),
  "base_price_night": number|null (€/kWh, nighttime if dual-zone),
  "fixed_fee_monthly": number (€/month fixed charge),
  "discounted_price_day": number|null (discounted €/kWh if available),
  "discount_conditions": string|null (e.g. "Direct debit 10%", "e-bill 5%"),
  "notes": string|null (any important notes about the program)
}
Αν δεν βρεις κάποιο πεδίο, βάλε null. Μην επινοείς δεδομένα. Raw JSON only, no markdown.

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
              signal: AbortSignal.timeout(30000),
            }
          );

          if (!aiRes.ok) {
            console.warn(`[gemini] HTTP ${aiRes.status} for ${tariff.program_name}`);
            failedCount++;
            return;
          }

          const aiData = await aiRes.json();
          const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

          if (!rawText) {
            console.warn(`[gemini] Empty response for ${tariff.program_name}`);
            failedCount++;
            return;
          }

          const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
          const parsed = JSON.parse(cleanJson);

          if (!parsed.base_price_day && parsed.base_price_day !== 0) {
            console.warn(`[gemini] No base_price_day found for ${tariff.program_name}`);
            failedCount++;
            return;
          }

          // 4. Check if price already exists for today
          const today = new Date().toISOString().split("T")[0];
          const { data: existing } = await supabase
            .from("energy_tariff_prices")
            .select("id")
            .eq("tariff_id", tariff.id)
            .eq("validity_from", today)
            .limit(1)
            .maybeSingle();

          if (existing) {
            // Update existing
            await supabase.from("energy_tariff_prices").update({
              base_price_day: parsed.base_price_day,
              base_price_night: parsed.base_price_night || null,
              fixed_fee_monthly: parsed.fixed_fee_monthly || 0,
              discounted_price_day: parsed.discounted_price_day || null,
              discount_conditions: parsed.discount_conditions || null,
              notes: parsed.notes || null,
              source_type: "scraper",
              verification_status: "needs_review",
              source_url: tariff.official_url,
            }).eq("id", existing.id);
          } else {
            // Insert new
            await supabase.from("energy_tariff_prices").insert({
              tariff_id: tariff.id,
              base_price_day: parsed.base_price_day,
              base_price_night: parsed.base_price_night || null,
              unit_rate_kwh: parsed.base_price_day,
              fixed_fee_monthly: parsed.fixed_fee_monthly || 0,
              discounted_price_day: parsed.discounted_price_day || null,
              discount_conditions: parsed.discount_conditions || null,
              notes: parsed.notes || null,
              validity_from: today,
              source_type: "scraper",
              verification_status: "needs_review",
              source_url: tariff.official_url,
            });
          }

          updatedCount++;
          console.log(`[scrape] ✓ ${tariff.provider_name} - ${tariff.program_name}: €${parsed.base_price_day}/kWh`);
        } catch (err: any) {
          console.error(`[scrape] ✗ ${tariff.program_name}: ${err.message}`);
          failedCount++;
        }
      }));

      // Rate limit: 2 second pause between batches
      if (i + BATCH_SIZE < tariffs.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Log to scraper_logs
    const durationMs = Date.now() - startTime;
    try {
      await supabase.from("scraper_logs").insert({
        provider_name: "scrape-program-details",
        status: "success",
        records_synced: updatedCount,
        duration_ms: durationMs,
      });
    } catch { /* non-critical */ }

    return new Response(JSON.stringify({
      success: true,
      updated: updatedCount,
      failed: failedCount,
      total: tariffs.length,
      duration_ms: durationMs,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[scrape-program-details] Fatal: ${err.message}`);

    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.from("scraper_logs").insert({
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
