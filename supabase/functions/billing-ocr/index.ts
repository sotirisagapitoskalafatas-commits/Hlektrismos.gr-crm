import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { lead_id, file_url, file_type } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch Gemini API key from settings or env
    const { data: settings } = await supabase
      .from("crm_settings")
      .select("setting_value")
      .eq("setting_key", "GEMINI_API_KEY")
      .single();

    const geminiKey = settings?.setting_value?.replace(/"/g, "") || Deno.env.get("GEMINI_API_KEY") || "";

    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the file content
    const fileRes = await fetch(file_url);
    if (!fileRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fileBuffer = await fileRes.arrayBuffer();
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));

    // Determine MIME type
    let mimeType = "application/pdf";
    if (file_type?.includes("image") || file_url?.match(/\.(jpg|jpeg|png)$/i)) {
      mimeType = file_type || "image/jpeg";
    }

    // Call Gemini Vision API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Ανάλυσε αυτό το έγγραφο λογαριασμού ενέργειας (τιμολόγιο ρεύματος) και εξάγε τις ακόλουθες πληροφορίες σε JSON format:
{
  "provider": "όνομα παρόχου (π.χ. ΔΕΗ, Protergia, nrg)",
  "program_name": "όνομα προγράμματος (π.χ. myHome Fix 12)",
  "tariff_color": "green/blue/yellow/orange",
  "unit_rate_kwh": 0.182,
  "fixed_fee_monthly": 5.00,
  "monthly_cost_total": 150.00,
  "consumption_kwh": 800,
  "contract_end_date": "2026-12-31",
  "customer_name": "όνομα πελάτη",
  "address": "διεύθυνση",
  "account_number": "αριθμός λογαριασμού"
}
Αν δεν βρεις κάποιο πεδίο, βάλε null. Μην επινοείς δεδομένα.`,
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Try to parse JSON from response
    let extractedData;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw_text: responseText };
    } catch {
      extractedData = { raw_text: responseText };
    }

    // Update lead with extracted data
    if (lead_id && extractedData) {
      const updates: Record<string, any> = {};
      if (extractedData.provider) updates.current_provider = extractedData.provider;
      if (extractedData.unit_rate_kwh) updates.monthly_cost = extractedData.monthly_cost_total || extractedData.unit_rate_kwh * (extractedData.consumption_kwh || 800);
      if (extractedData.consumption_kwh) updates.consumption_kwh = extractedData.consumption_kwh;
      if (extractedData.consumption_kwh) updates.monthly_kwh = extractedData.consumption_kwh;
      if (extractedData.contract_end_date) updates.contract_end_date = extractedData.contract_end_date;
      if (extractedData.unit_rate_kwh) updates.unit_rate_kwh = extractedData.unit_rate_kwh;

      if (Object.keys(updates).length > 0) {
        await supabase.from("hlektrismos_leads").update(updates).eq("id", lead_id);
      }

      // Log in lead_notes
      await supabase.from("lead_notes").insert({
        lead_id,
        content: `📄 Bill OCR extracted:\nProvider: ${extractedData.provider || "N/A"}\nProgram: ${extractedData.program_name || "N/A"}\nRate: €${extractedData.unit_rate_kwh || "N/A"}/kWh\nMonthly: €${extractedData.monthly_cost_total || "N/A"}\nConsumption: ${extractedData.consumption_kwh || "N/A"} kWh`,
        author: "system",
        note_type: "bill_ocr",
      });
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});