import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { authorizeRecord, getCaller, serviceClient } from "../_shared/authz.ts";
import { isOffice } from "../_shared/access.ts";
import { safeFetch, denoResolver, SafeFetchError } from "../_shared/safe-fetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Bills are only ever read from this project's Supabase Storage (never from an arbitrary URL).
const BILL_BUCKETS = ["hlektrismos_docs", "energy-bills"];
const MAX_FILE_BYTES = 25 * 1024 * 1024; // = MAX_UPLOAD_BYTES in src/lib/upload-files.ts

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Chunked base64 (a single spread over a large file overflows the call stack). */
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const validStoragePath = (p: unknown): p is string =>
  typeof p === "string" && p.length > 0 && p.length <= 1024 && !p.startsWith("/") && !p.split("/").includes("..");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Staff (or service role) only, and only for a lead the caller may access.
  const supabase = serviceClient();
  const caller = await getCaller(req, supabase);
  if (caller instanceof Response) return caller;

  try {
    const { lead_id, file_url, file_type, bucket, path } = await req.json().catch(() => ({}));

    const lead = await authorizeRecord(supabase, caller, "legacy_lead", lead_id, null);
    if (lead instanceof Response) return lead;

    // Where the file comes from: a storage object (bucket + path) or a URL on this project's Supabase host.
    let fileBytes: Uint8Array;
    if (bucket !== undefined || path !== undefined) {
      if (typeof bucket !== "string" || !BILL_BUCKETS.includes(bucket) || !validStoragePath(path)) {
        return jsonError(400, "Invalid file location");
      }
      // Sales users may only read files of THIS (their own) lead: its folder, or a file listed in its bill_files.
      // Office/service may read any bill file.
      if (!isOffice(caller) && !path.startsWith(`leads/${lead_id}/`)) {
        const { data: files } = await supabase.from("hlektrismos_leads").select("bill_files").eq("id", lead_id).maybeSingle();
        const listed = Array.isArray(files?.bill_files) && files.bill_files.some((f: { path?: unknown }) => f?.path === path);
        if (!listed) return jsonError(403, "Not your file");
      }
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(path);
      if (dlErr || !blob) return jsonError(400, "Failed to fetch file");
      if (blob.size > MAX_FILE_BYTES) return jsonError(400, "File too large");
      fileBytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      let storageHost = "";
      try { storageHost = new URL(Deno.env.get("SUPABASE_URL") ?? "").hostname.toLowerCase(); } catch { /* unset */ }
      let parsed: URL | null = null;
      try { parsed = typeof file_url === "string" ? new URL(file_url) : null; } catch { parsed = null; }
      if (!storageHost || !parsed || parsed.hostname.toLowerCase() !== storageHost || !parsed.pathname.startsWith("/storage/v1/object/")) {
        return jsonError(400, "File must be a Supabase Storage file of this project");
      }
      try {
        const res = await safeFetch(parsed.toString(), {
          resolve: denoResolver(), allowHosts: [storageHost], maxBytes: MAX_FILE_BYTES, timeoutMs: 20_000, maxRedirects: 0,
        });
        if (res.status < 200 || res.status >= 300) return jsonError(400, "Failed to fetch file");
        fileBytes = res.body;
      } catch (e) {
        if (e instanceof SafeFetchError) {
          return jsonError(400, e.code === "too_large" ? "File too large" : "Failed to fetch file");
        }
        throw e;
      }
    }

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

    const base64Data = toBase64(fileBytes);

    // Determine MIME type
    let mimeType = "application/pdf";
    const fileName = typeof path === "string" ? path : typeof file_url === "string" ? new URL(file_url).pathname : "";
    if (file_type?.includes("image") || fileName.match(/\.(jpg|jpeg|png)$/i)) {
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
      console.error(`[billing-ocr] Gemini API error: HTTP ${geminiRes.status}`);
      return new Response(
        JSON.stringify({ error: "Bill analysis failed" }),
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
  } catch (e) {
    console.error(`[billing-ocr] Error: ${(e as Error)?.name ?? "unknown"}`);
    return new Response(
      JSON.stringify({ error: "Bill OCR failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});