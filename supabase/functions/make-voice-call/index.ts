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
    const { lead_id, phone, first_name, last_name, region, company_name, current_provider } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Kill Switch: check if AI is paused for this lead
    if (lead_id) {
      const { data: leadCheck } = await supabase
        .from("hlektrismos_leads")
        .select("ai_paused")
        .eq("id", lead_id)
        .single();
      if (leadCheck?.ai_paused) {
        return new Response(
          JSON.stringify({ error: "AI is paused for this lead (Kill Switch active)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

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
                content: `Είσαι ο Αλέξης, ενεργειακός σύμβουλος της Hlektrismos.gr. Μιλάς ελληνικά.

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
          firstMessage: `Γεια σας, ${leadName}! Εδώ ο Αλέξης από την Hlektrismos.gr. Σας ενοχλώ για λίγο; Θα ήθελα να σας ρωτήσω για το ρεύμα σας.`,
          endCallMessage: "Σας ευχαριστώ πολύ για τον χρόνο σας. Καλή συνέχεια!",
          endCallPhrases: ["αντίο", "γεια σας", "δεν με ενδιαφέρει", "μη με ξαναπαρείτε", "τέλος"],
        },
        webhookUrl: `${supabaseUrl}/functions/v1/vapi-webhook`,
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
        JSON.stringify({ error: `Vapi error: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
