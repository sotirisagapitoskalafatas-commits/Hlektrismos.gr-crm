import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const getCurrentValidityMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Regex-based HTML price extraction
function extractPricesFromHtml(html: string): { unit_rate_kwh: number | null; fixed_fee_monthly: number | null } {
  // Strip HTML tags for text extraction
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // Match rates like "0,158 €/kWh" or "0.1580 €/kWh" or "0,1580€/kWh"
  const rateMatch = text.match(/(\d[.,]\d{3,5})\s*€?\s*\/?\s*kWh/i)
    || text.match(/(\d[.,]\d{3,5})\s*€\s*\/kWh/i)
    || text.match(/τιμή[:\s]*(\d[.,]\d{3,5})/i)
    || text.match(/rate[:\s]*(\d[.,]\d{3,5})/i);

  // Match fixed fees like "4,50 €/μήνα" or "€5.00/month"
  const feeMatch = text.match(/(\d{1,2}[.,]\d{2})\s*€?\s*\/?\s*μήνα/i)
    || text.match(/(\d{1,2}[.,]\d{2})\s*€\s*\/month/i)
    || text.match(/σταθερή[:\s]*(\d{1,2}[.,]\d{2})/i);

  return {
    unit_rate_kwh: rateMatch ? parseFloat(rateMatch[1].replace(",", ".")) : null,
    fixed_fee_monthly: feeMatch ? parseFloat(feeMatch[1].replace(",", ".")) : 5.0,
  };
}

// Generate text embedding using Gemini or OpenAI
async function generateEmbedding(text: string): Promise<number[] | null> {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiKey) {
    console.log("No OPENAI_API_KEY found, skipping embedding generation");
    return null;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-small",
      }),
    });
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    console.error("Embedding generation failed:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startTime = Date.now();

  try {
    const validityMonth = getCurrentValidityMonth();
    console.log(`Starting tariff sync for ${validityMonth}...`);

    // Fetch all active endpoints from DB
    const { data: endpoints, error: fetchError } = await supabase
      .from("rag_document_endpoints")
      .select("*")
      .eq("is_active", true)
      .order("provider_name");

    if (fetchError || !endpoints || endpoints.length === 0) {
      throw new Error(`Failed to fetch endpoints: ${fetchError?.message || "No endpoints found"}`);
    }

    console.log(`Found ${endpoints.length} active endpoints to scrape`);

    const results: any[] = [];
    const errors: string[] = [];

    // Process endpoints (limit concurrency to avoid rate limits)
    for (const endpoint of endpoints) {
      try {
        if (endpoint.file_type !== 'html') {
          console.log(`Skipping non-HTML endpoint: ${endpoint.endpoint_label}`);
          continue;
        }

        console.log(`Fetching: ${endpoint.provider_name} - ${endpoint.endpoint_label}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(endpoint.endpoint_url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HlektrismosBot/1.0)' },
        });
        clearTimeout(timeout);

        if (!response.ok) {
          errors.push(`${endpoint.provider_name}: HTTP ${response.status}`);
          continue;
        }

        const html = await response.text();
        const extracted = extractPricesFromHtml(html);

        if (extracted.unit_rate_kwh) {
          const docString = `Provider: ${endpoint.provider_name}. Program: ${endpoint.endpoint_label} (${endpoint.tariff_color || 'B2B'}). Validity: ${validityMonth}. Base Rate: ${extracted.unit_rate_kwh} €/kWh. Fixed Fee: €${extracted.fixed_fee_monthly}/month.`;

          // Generate embedding if OpenAI key is available
          const embedding = await generateEmbedding(docString);

          results.push({
            provider_name: endpoint.provider_name,
            program_name: endpoint.endpoint_label,
            customer_type: endpoint.customer_type,
            tariff_color: endpoint.tariff_color || 'green',
            unit_rate_kwh: extracted.unit_rate_kwh,
            fixed_fee_monthly: extracted.fixed_fee_monthly,
            validity_month: validityMonth,
            source_url: endpoint.endpoint_url,
            category: endpoint.customer_type,
            resource: 'ρεύμα',
            last_verified: new Date().toISOString(),
            embedding: embedding,
          });

          // Update endpoint last_synced_at
          await supabase
            .from("rag_document_endpoints")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("id", endpoint.id);
        } else {
          errors.push(`${endpoint.provider_name}: Could not extract prices from ${endpoint.endpoint_label}`);
        }
      } catch (err: any) {
        errors.push(`${endpoint.provider_name}: ${err.message}`);
        console.error(`Error scraping ${endpoint.provider_name}:`, err.message);
      }
    }

    // Upsert results into market_tariffs
    if (results.length > 0) {
      const { error: upsertError } = await supabase
        .from("market_tariffs")
        .upsert(results, {
          onConflict: "provider_name, program_name, validity_month",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        errors.push(`DB upsert: ${upsertError.message}`);
      }
    }

    const duration = Date.now() - startTime;

    // Log scraper results
    await supabase.from("scraper_logs").insert({
      provider_name: "ALL",
      status: results.length > 0 ? "success" : "partial",
      records_synced: results.length,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      duration_ms: duration,
    });

    return new Response(JSON.stringify({
      success: true,
      validity_month: validityMonth,
      synced: results.length,
      total_endpoints: endpoints.length,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Sync failed:", error);

    await supabase.from("scraper_logs").insert({
      provider_name: "SYSTEM",
      status: "error",
      records_synced: 0,
      error_message: error.message,
      duration_ms: Date.now() - startTime,
    }).catch(() => {});

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
