import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { missingKeyResponse, secretKey } from "../_shared/keys.ts";
import { configuredSecrets, matchesAnySecret, verifyHmac } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/** The fields of a Vapi server message this function reads. */
type VapiEvent = {
  message?: {
    type?: string;
    call?: { id?: string; startedAt?: string; endedAt?: string };
    durationSeconds?: number;
    artifact?: { transcript?: string; recording?: { url?: string } | string; recordingUrl?: string };
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Authentication (fails closed). Vapi documents two usable mechanisms (docs.vapi.ai/server-url/server-authentication):
  //  * a Bearer-Token credential sent in the header X-Vapi-Secret  -> VAPI_WEBHOOK_SECRET (+ VAPI_WEBHOOK_SECRET_PREVIOUS while rotating)
  //  * an HMAC credential: signature over "{timestamp}.{body}" (SHA-256, hex) with a timestamp header for replay protection
  //    -> VAPI_HMAC_SECRET (+ _PREVIOUS); header names default to x-signature / x-timestamp and can be set to the names configured in Vapi
  //    with VAPI_HMAC_SIGNATURE_HEADER / VAPI_HMAC_TIMESTAMP_HEADER. When VAPI_HMAC_SECRET is configured the HMAC is REQUIRED
  //    (the static header alone is then not accepted). Secrets shorter than 32 characters or visibly repetitive count as not configured.
  // The raw body is read once: the HMAC covers its exact bytes.
  const rawBody = await req.text();
  const hmacSecrets = configuredSecrets("VAPI_HMAC_SECRET");
  const authorized = hmacSecrets.length > 0
    ? await verifyHmac(
        hmacSecrets,
        req.headers.get(Deno.env.get("VAPI_HMAC_SIGNATURE_HEADER") || "x-signature"),
        req.headers.get(Deno.env.get("VAPI_HMAC_TIMESTAMP_HEADER") || "x-timestamp"),
        rawBody,
      )
    : matchesAnySecret(req.headers.get("x-vapi-secret") ?? "", configuredSecrets("VAPI_WEBHOOK_SECRET"));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { payload = null; }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const p = payload as VapiEvent;

    if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey());

    // Vapi nests every field under `message` (docs.vapi.ai/server-url/events). Only the end-of-call report changes data: it carries the
    // complete transcript. status-update, transcript and the other informational messages are acknowledged and ignored.
    const m = p.message;
    const eventType = m?.type;
    const callId = m?.call?.id;
    const transcript = m?.artifact?.transcript;

    if (!callId) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Find the voice_calls record
    const { data: voiceCall } = await supabase
      .from("voice_calls")
      .select("*")
      .eq("vapi_call_id", callId)
      .single();

    if (!voiceCall) {
      return new Response(JSON.stringify({ ok: true, note: "no matching voice_call" }), { headers: corsHeaders });
    }

    // Replay safety: a call that is already completed is final. A replayed or duplicated end-of-call event changes nothing
    // (no second status change, no duplicate transcript note), and a late partial transcript cannot overwrite the final one.
    if (voiceCall.status === "completed") {
      return new Response(JSON.stringify({ ok: true, note: "already completed" }), { headers: corsHeaders });
    }

    if (eventType === "end-of-call-report") {
      const started = Date.parse(m?.call?.startedAt ?? ""), ended = Date.parse(m?.call?.endedAt ?? "");
      const duration = m?.durationSeconds ?? (Number.isFinite(started) && Number.isFinite(ended) ? Math.round((ended - started) / 1000) : 0);
      const rec = m?.artifact?.recording;
      const recordingUrl = (typeof rec === "string" ? rec : rec?.url) || m?.artifact?.recordingUrl || "";

      // Determine outcome from transcript
      let outcome = "unknown";
      let sentiment = "neutral";
      const transcriptLower = (transcript || "").toLowerCase();

      if (transcriptLower.includes("ενδιαφέρον") || transcriptLower.includes("προσφορά") || transcriptLower.includes("email") || transcriptLower.includes("ραντεβού")) {
        outcome = "interested";
        sentiment = "positive";
      } else if (transcriptLower.includes("δεν με ενδιαφέρει") || transcriptLower.includes("όχι") || transcriptLower.includes("αρκεί")) {
        outcome = "not_interested";
        sentiment = "negative";
      } else if (transcriptLower.includes("τηλέφωνο") || transcriptLower.includes("ξαναπαρείτε") || transcriptLower.includes("αργότερα")) {
        outcome = "callback_requested";
      } else if (duration < 5) {
        outcome = "no_answer";
      }

      await supabase
        .from("voice_calls")
        .update({
          status: "completed",
          duration_seconds: duration,
          recording_url: recordingUrl,
          transcript: transcript || "",
          sentiment,
          outcome,
          ended_at: new Date().toISOString(),
        })
        .eq("id", voiceCall.id);

      // Update lead status based on outcome
      if (voiceCall.lead_id) {
        let newStatus: string | null = null;
        if (outcome === "interested") newStatus = "qualified";
        else if (outcome === "not_interested") newStatus = "lost";
        else if (outcome === "callback_requested") newStatus = "contacted";

        if (newStatus) {
          await supabase
            .from("hlektrismos_leads")
            .update({ pipeline_status: newStatus })
            .eq("id", voiceCall.lead_id);
        }

        // Log transcript in lead_notes
        await supabase.from("lead_notes").insert({
          lead_id: voiceCall.lead_id,
          content: `📞 AI Call ${outcome} (${duration}s)\n\nTranscript:\n${transcript || "No transcript available"}`,
          author: "system",
          note_type: "ai_call_transcript",
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (e: any) {
    console.error("vapi-webhook error:", e);
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  }
});
