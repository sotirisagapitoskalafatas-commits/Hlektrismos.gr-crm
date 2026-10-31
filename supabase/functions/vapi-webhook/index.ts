import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { missingKeyResponse, secretKey } from "../_shared/keys.ts";
import { configuredSecrets, matchesAnySecret, verifyHmac } from "../_shared/webhook-auth.ts";
import { parseEndOfCallReport, plainGreek, spokenOptOut, type VapiMessage } from "../_shared/vapi-report.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
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
  //    (the static header alone is then not accepted). Secrets shorter than 32 characters or visibly repetitive are never accepted.
  // The raw body is read once: the HMAC covers its exact bytes.
  const rawBody = await req.text();
  const hmacSecrets = configuredSecrets("VAPI_HMAC_SECRET");
  const authorized = Deno.env.get("VAPI_HMAC_SECRET") // set but weak means no usable secret: refuse, never fall back to the static header
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
    // Vapi nests every field under `message` (docs.vapi.ai/server-url/events). Only the end-of-call report changes data: it carries the
    // complete transcript. status-update, transcript and the other informational messages are acknowledged and ignored.
    const m = (payload as { message?: VapiMessage }).message;
    if (m?.type !== "end-of-call-report") return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    const report = parseEndOfCallReport(m);
    if (!report) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey());

    // A failed read is an error, not "no such call": answering 200 would lose the report.
    const { data: voiceCall, error: findError } = await supabase.from("voice_calls").select("id, lead_id, status").eq("vapi_call_id", report.callId).maybeSingle();
    if (findError) throw findError;
    if (!voiceCall) {
      return new Response(JSON.stringify({ ok: true, note: "no matching voice_call" }), { headers: corsHeaders });
    }
    // Replay safety: a completed call is final. A repeated or late report changes nothing.
    if (voiceCall.status === "completed") {
      return new Response(JSON.stringify({ ok: true, note: "already completed" }), { headers: corsHeaders });
    }

    // Determine outcome from what the customer said. A refusal is checked first: "μη με ξαναπαρείτε" must not read as a callback request.
    let outcome = "unknown";
    let sentiment = "neutral";
    const words = plainGreek(report.customerWords || report.transcript);
    if (words.includes("μη με ξαναπαρ") || words.includes("δεν με ενδιαφερει") || words.includes("οχι") || words.includes("αρκει")) {
      outcome = "not_interested";
      sentiment = "negative";
    } else if (words.includes("ενδιαφερον") || words.includes("προσφορα") || words.includes("email") || words.includes("ραντεβου")) {
      outcome = "interested";
      sentiment = "positive";
    } else if (words.includes("τηλεφωνο") || words.includes("ξαναπαρειτε") || words.includes("αργοτερα")) {
      outcome = "callback_requested";
    } else if (report.duration !== null && report.duration < 5) {
      outcome = "no_answer";
    }

    // The lead, unless it was deleted meanwhile: a deleted record is not updated, and its call result stays on the voice_calls row only.
    const { data: lead, error: leadError } = voiceCall.lead_id
      ? await supabase.from("hlektrismos_leads").select("id, phone, email, deleted_at").eq("id", voiceCall.lead_id).maybeSingle()
      : { data: null, error: null };
    if (leadError) throw leadError;
    const liveLead = lead && !lead.deleted_at ? lead : null;

    // A spoken «μη με ξαναπάρετε» is recorded before the call is closed, so a failure here is still visible below.
    const optOut = spokenOptOut(report.customerWords);
    let objectionRecorded = false;
    // Recorded for a lead in the Trash too: it holds the phone number, and the «no» must still be there if the lead is restored. One retry for a passing fault.
    if (optOut && lead) {
      for (let attempt = 0; attempt < 2 && !objectionRecorded; attempt++) {
        const { error: objectionError } = await supabase.rpc("record_spoken_objection", { p_phone: lead.phone, p_email: lead.email ?? null, p_lead_id: lead.id, p_voice_call_id: voiceCall.id });
        objectionRecorded = !objectionError;
      }
      if (!objectionRecorded) console.error(JSON.stringify({ event: "spoken_objection_not_recorded", voice_call: voiceCall.id }));
    }

    // A refusal that could not be recorded for a lead in the Trash has no note or pause to fall back on: answer 5xx so Vapi retries, and do not close the call.
    if (optOut && !objectionRecorded && !liveLead) {
      return new Response(JSON.stringify({ error: "Refusal not recorded" }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: claimed, error: claimError } = await supabase
      .from("voice_calls")
      .update({
        status: "completed",
        duration_seconds: report.duration,
        recording_url: report.recordingUrl,
        transcript: report.transcript,
        sentiment,
        outcome,
        ended_at: new Date().toISOString(),
      })
      .eq("id", voiceCall.id).neq("status", "completed").select("id");
    if (claimError) throw claimError;
    // Two simultaneous reports: the one that changed nothing stops here, so the note and the lead update happen once.
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ ok: true, note: "already completed" }), { headers: corsHeaders });
    }

    // Update lead status based on outcome
    if (liveLead) {
      let newStatus: string | null = null;
      if (outcome === "interested") newStatus = "qualified";
      else if (outcome === "not_interested") newStatus = "lost";
      else if (outcome === "callback_requested") newStatus = "contacted";

      if (newStatus) {
        await supabase
          .from("hlektrismos_leads")
          .update({ pipeline_status: newStatus })
          .eq("id", liveLead.id);
      }

      // The objection could not be written (its table may not exist yet). The lead is paused so nothing automated reaches them, and the note says
      // plainly that the refusal is NOT on record, so a person can act on it. The note reports the pause only if the pause happened.
      let paused = false;
      if (optOut && !objectionRecorded) {
        const { error: pauseError } = await supabase.from("hlektrismos_leads").update({ ai_paused: true }).eq("id", liveLead.id);
        paused = !pauseError;
      }
      const optOutLine = !optOut ? "" : objectionRecorded
        ? "🚫 Ο πελάτης ζήτησε να μην τον ξανακαλέσουμε. Η άρνηση καταχωρήθηκε.\n\n"
        : `⚠️ Ο πελάτης ζήτησε να μην τον ξανακαλέσουμε. Η άρνηση ΔΕΝ καταχωρήθηκε: καταχωρήστε την χειροκίνητα. ${paused ? "Το lead μπήκε σε παύση AI." : "Η παύση AI ΑΠΕΤΥΧΕ."}\n\n`;

      // Log transcript in lead_notes
      await supabase.from("lead_notes").insert({
        lead_id: liveLead.id,
        content: `${optOutLine}📞 AI Call ${outcome} (${report.duration ?? "?"}s)\n\nTranscript:\n${report.transcript || "No transcript available"}`,
        author: "system",
        note_type: "ai_call_transcript",
      });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (e: any) {
    console.error("vapi-webhook error:", e?.name ?? "unknown");
    return new Response(JSON.stringify({ error: "Webhook failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
