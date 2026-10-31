import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { missingKeyResponse, secretKey } from "../_shared/keys.ts";
import { timingSafeEqual } from "../_shared/signed-link.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Audit fix: previously unauthenticated. Configure the same value as the
  // "Server URL secret" in Vapi (sent as the x-vapi-secret header). Fails closed.
  const expected = Deno.env.get("VAPI_WEBHOOK_SECRET") ?? "";
  if (expected.length < 16 || !timingSafeEqual(req.headers.get("x-vapi-secret") ?? "", expected)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { message } = payload;

    if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey());

    const eventType = message?.type;
    const callId = payload.call?.id || payload.callId;
    const transcript = payload.transcript || payload.call?.transcript;

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

    if (eventType === "call-ended") {
      const duration = payload.call?.duration || 0;
      const recordingUrl = payload.call?.recordingUrl || "";

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
    } else if (eventType === "transcript-update" && transcript) {
      // Partial transcript updates during the call
      await supabase
        .from("voice_calls")
        .update({ transcript: transcript })
        .eq("id", voiceCall.id);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (e: any) {
    console.error("vapi-webhook error:", e);
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  }
});
