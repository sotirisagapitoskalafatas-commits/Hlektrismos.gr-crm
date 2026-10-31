import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { authorizeRecord, getCaller, json, requireCapability, serviceClient } from "../_shared/authz.ts";
import { configuredSecrets } from "../_shared/webhook-auth.ts";
import { callerKey, durableLimit, rateLimited } from "../_shared/limits.ts";
import { gateRecipients } from "../_shared/outreach-gate.ts";
import { outreachConfigFromEnv, supabaseLoaders } from "../_shared/outreach-loaders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Staff-only: this function reads customer data, sends messages or spends paid API quota.
  const supabase = serviceClient();
  const caller = await getCaller(req, supabase);
  if (caller instanceof Response) return caller;
  const denied = requireCapability(caller, "communications.voice.initiate");
  if (denied) return denied;
  if (rateLimited(`make-voice-call:${callerKey(caller)}`, 10, 60_000)) return json(429, { error: "Too many requests. Try again in a minute." });
  const overQuota = await durableLimit(supabase, `make-voice-call:${callerKey(caller)}`, 30, 3600);
  if (overQuota) return json(overQuota.status, { error: overQuota.error });

  try {
    // Only the lead id is trusted from the request; the phone number and lead details come from the database.
    const { lead_id } = await req.json();

    // Central eligibility gate: AI voice prospecting is disabled by default and needs consent evidence,
    // a fresh opt-out register screening, contact hours, frequency limits and recorded legal approval.
    // Includes the per-lead AI kill switch. Fails closed if any check cannot be completed.
    if (typeof lead_id !== "string") {
      return new Response(JSON.stringify({ error: "lead_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Capability (admin-only by default) + record-level access (defence in depth); 400/401/403/404 unchanged.
    const owned = await authorizeRecord(supabase, caller, "legacy_lead", lead_id, "communications.voice.initiate");
    if (owned instanceof Response) return owned;
    const gate = await gateRecipients([lead_id], "voice", "promotional", supabaseLoaders(supabase), outreachConfigFromEnv());
    if (gate.allowed.length === 0) {
      return new Response(
        JSON.stringify({ error: "Call not permitted", reasons: gate.denied[0]?.reasons ?? ["LEAD_NOT_FOUND"] }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { phone, first_name, last_name, region, company_name, current_provider } = gate.allowed[0];

    // Fetch Vapi credentials from crm_settings
    const { data: settings } = await supabase
      .from("crm_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["VAPI_API_KEY", "VAPI_PHONE_NUMBER_ID", "SUPABASE_URL"]);

    const config: Record<string, string> = {};
    settings?.forEach((s: any) => {
      config[s.setting_key] = s.setting_value?.replace(/"/g, "") || "";
    });

    const vapiKey = config.VAPI_API_KEY;
    const phoneNumberId = config.VAPI_PHONE_NUMBER_ID;
    const supabaseUrl = config.SUPABASE_URL || Deno.env.get("SUPABASE_URL");

    // This call supplies its assistant and server URL inline, so Vapi does not attach the org credential: the secret must travel in
    // server.headers (docs.vapi.ai/server-url/server-authentication). An HMAC credential needs a saved assistant, which this path does not
    // use. Without a usable webhook secret the result of a billable call would be lost, so no call is placed.
    const webhookSecret = configuredSecrets("VAPI_WEBHOOK_SECRET")[0];
    if (!webhookSecret || configuredSecrets("VAPI_HMAC_SECRET").length > 0) {
      return json(503, { error: "Voice webhook is not configured" });
    }

    if (!vapiKey || !phoneNumberId) {
      return new Response(
        JSON.stringify({ error: "VAPI_API_KEY or VAPI_PHONE_NUMBER_ID not configured in Settings → Voice" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!phone) {
      return new Response(
        JSON.stringify({ error: "Lead has no phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leadName = [first_name, last_name].filter(Boolean).join(" ") || "Άγνωστος";

    // Create voice_calls record
    const { data: voiceCall } = await supabase
      .from("voice_calls")
      .insert({
        lead_id: lead_id || null,
        direction: "outbound",
        status: "initiating",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Call Vapi.ai
    const vapiRes = await fetch("https://api.vapi.ai/call/phone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vapiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumberId,
        customer: {
          number: phone,
          name: leadName,
        },
        assistant: {
          model: {
            provider: "openai",
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `Είσαι ο Αλέξης, ψηφιακός βοηθός τεχνητής νοημοσύνης (AI) της Hlektrismos.gr. Μιλάς ελληνικά.
ΥΠΟΧΡΕΩΤΙΚΑ: Αν σε ρωτήσουν, λες πάντα ότι είσαι AI και ότι η κλήση καταγράφεται. Αν ο συνομιλητής αρνηθεί την καταγραφή, ζητήσει άνθρωπο ή πει ότι δεν θέλει άλλες κλήσεις, ευχαρίστησε, πες ότι θα τον καλέσει άνθρωπος (ή ότι δεν θα ξανακληθεί) και τερμάτισε την κλήση.

ΣΤΟΧΟΣ ΤΗΣ ΚΛΗΣΗΣ: Να κατανοήσεις τον τρέχοντα πάροχο ρεύματος του πελάτη, την κατανάλωση, και να ενδείξεις ενδιαφέρον για εξοικονόμηση.

ΠΛΗΡΟΦΟΡΙΕΣ ΠΕΛΑΤΗ:
- Όνομα: ${leadName}
- Περιοχή: ${region || 'Ελλάδα'}
- Εταιρεία: ${company_name || 'N/A'}
- Τρέχων Πάροχος: ${current_provider || 'Άγνωστος'}

ΟΔΗΓΙΕΣ:
1. Αποσαφήνισε τον τρέχοντα πάροχο και πρόγραμμα
2. Ρώτα για μηνιαίο κόστος ρεύματος
3. Αν ο πελάτης πληρώνει > 150€/μήνα, πρότεινε σύγκριση τιμών
4. Αν εκφράσει ενδιαφέρον: ζήτα email ή κλείσε ραντεβού
5. Μίλα φυσικά, ζεστά, σε καθαρά ελληνικά
6. ΜΗΝ ακούγεσαι σαν robot. Να ακούγεσαι σαν φυσικός άνθρωπος.`,
              },
            ],
          },
          voice: {
            provider: "azure",
            voiceId: "el-GR-NestorasNeural",
          },
          language: "el",
          // Disclosure up front: the caller is an AI (EU AI Act art. 50(1)) and
          // the call is recorded/transcribed. Do not remove or move later.
          firstMessage: `Γεια σας, ${leadName}! Είμαι ο Αλέξης, ψηφιακός βοηθός τεχνητής νοημοσύνης της Hlektrismos.gr. Η κλήση καταγράφεται και απομαγνητοφωνείται για να καταχωρήσουμε σωστά το αίτημά σας. Αν προτιμάτε να μιλήσετε με άνθρωπο ή δεν θέλετε καταγραφή, πείτε το μου και θα κλείσω. Σας ενοχλώ για λίγο;`,
          endCallMessage: "Σας ευχαριστώ πολύ για τον χρόνο σας. Καλή συνέχεια!",
          endCallPhrases: ["αντίο", "γεια σας", "δεν με ενδιαφέρει", "μη με ξαναπαρείτε", "τέλος"],
          server: { url: `${supabaseUrl}/functions/v1/vapi-webhook`, headers: { "x-vapi-secret": webhookSecret } },
        },
        metadata: {
          lead_id: lead_id || "",
          voice_call_id: voiceCall?.id || "",
        },
      }),
    });

    if (vapiRes.ok) {
      const callData = await vapiRes.json();

      // Update voice_calls with Vapi call ID
      if (voiceCall?.id) {
        await supabase
          .from("voice_calls")
          .update({ vapi_call_id: callData.id, status: "ringing" })
          .eq("id", voiceCall.id);
      }

      // Log in lead_notes
      if (lead_id) {
        await supabase.from("lead_notes").insert({
          lead_id,
          content: `📞 AI Voice call initiated to ${phone} (Vapi ID: ${callData.id})`,
          author: "system",
          note_type: "ai_call",
        });
      }

      return new Response(
        JSON.stringify({ success: true, call_id: callData.id, voice_call_id: voiceCall?.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const errText = await vapiRes.text();
      if (voiceCall?.id) {
        await supabase
          .from("voice_calls")
          .update({ status: "failed", transcript: errText })
          .eq("id", voiceCall.id);
      }
      return new Response(
        JSON.stringify({ error: "Voice call could not be started" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e: unknown) {
    console.error("[make-voice-call] Error:", e instanceof Error ? e.name : "unknown");
    return new Response(
      JSON.stringify({ error: "Call could not be started" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
