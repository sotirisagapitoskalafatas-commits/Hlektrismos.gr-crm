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

  try {
    const body = await req.json();
    const {
      lead_id,
      tariff_id,
      provider_name,
      program_name,
      estimated_cost,
      savings,
      customer_name,
      customer_phone,
      customer_email,
    } = body;

    if (!lead_id || !tariff_id) {
      return new Response(JSON.stringify({ error: "lead_id and tariff_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Generate acceptance link
    const acceptUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/accept-offer?lead_id=${lead_id}&tariff_id=${tariff_id}`;

    // 2. Compose Greek savings message
    const message = `⚡ Hlektrismos.gr — Νέα Προσφορά για εσάς!

Αγαπητέ/ή ${customer_name},

Βρήκαμε καλύτερη τιμή για εσάς:
📊 Πάροχος: ${provider_name}
📋 Πρόγραμμα: ${program_name}
💰 Εκτιμώμενο κόστος: €${estimated_cost}/μήνα
${savings > 0 ? `✅ Εξοικονόμηση: €${savings.toFixed(2)}/μήνα (€${(savings * 12).toFixed(2)}/χρόνο)` : ''}

👉 Δεχτείτε την προσφορά: ${acceptUrl}

Ηλεκτρισμός.gr — Σας βοηθάμε να εξοικονομήστε! 🔋`;

    // 3. Send via Viber (if phone available)
    let viberResult = null;
    if (customer_phone) {
      try {
        const infobipApiKey = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "INFOBIP_API_KEY").single()).data?.setting_value;
        const infobipBaseUrl = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "INFOBIP_BASE_URL").single()).data?.setting_value;

        if (infobipApiKey && infobipBaseUrl) {
          viberResult = await fetch(`${infobipBaseUrl}/viber/1/send-message`, {
            method: "POST",
            headers: {
              "Authorization": `App ${infobipApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Hlektrismos",
              to: customer_phone,
              type: "text",
              text: message,
            }),
          });
          console.log(`[send-offer] Viber: ${viberResult.status}`);
        }
      } catch (err: any) {
        console.warn(`[send-offer] Viber failed: ${err.message}`);
      }
    }

    // 4. Send via WhatsApp (if phone available and Infobip configured)
    let whatsappResult = null;
    if (customer_phone) {
      try {
        const infobipApiKey = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "INFOBIP_API_KEY").single()).data?.setting_value;
        const infobipBaseUrl = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "INFOBIP_BASE_URL").single()).data?.setting_value;
        const whatsappSenderId = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "WHATSAPP_SENDER_ID").single()).data?.setting_value;

        if (infobipApiKey && infobipBaseUrl) {
          whatsappResult = await fetch(`${infobipBaseUrl}/whatsapp/1/send-message`, {
            method: "POST",
            headers: {
              "Authorization": `App ${infobipApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: whatsappSenderId || "Hlektrismos",
              to: customer_phone,
              type: "text",
              text: { previewUrl: false, body: message },
            }),
          });
          console.log(`[send-offer] WhatsApp: ${whatsappResult.status}`);
        }
      } catch (err: any) {
        console.warn(`[send-offer] WhatsApp failed: ${err.message}`);
      }
    }

    // 5. Send via Email (if email available)
    let emailResult = null;
    if (customer_email) {
      try {
        const resendApiKey = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "RESEND_API_KEY").single()).data?.setting_value;

        if (resendApiKey) {
          emailResult = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Hlektrismos.gr <offers@hlektrismos.gr>",
              to: [customer_email],
              subject: `⚡ Νέα Προσφορά Ενέργειας — ${provider_name} ${program_name}`,
              text: message,
            }),
          });
          console.log(`[send-offer] Email: ${emailResult.status}`);
        }
      } catch (err: any) {
        console.warn(`[send-offer] Email failed: ${err.message}`);
      }
    }

    // 6. Update lead status to follow_up
    await supabase.from("hlektrismos_leads").update({
      status: "follow_up",
      last_contact_at: new Date().toISOString(),
    }).eq("id", lead_id);

    // 6. Create task for follow-up
    await supabase.from("crm_tasks").insert({
      lead_id,
      tariff_id,
      title: `Προσφορά στάλθηκε: ${provider_name} - ${program_name}`,
      description: `Εκτιμώμενο κόστος: €${estimated_cost}/μήνα. Εξοικονόμηση: €${savings?.toFixed(2) || '0'}/μήνα. Περιμένουμε απάντηση.`,
      status: "pending",
      priority: "high",
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day
    });

    // 7. Log in lead_notes
    await supabase.from("lead_notes").insert({
      lead_id,
      content: `📧 Προσφορά στάλθηκε: ${provider_name} — ${program_name}\nΚόστος: €${estimated_cost}/μήνα | Εξοικονόμηση: €${savings?.toFixed(2) || '0'}/μήνα\nViber: ${viberResult ? '✓' : '✗'} | Email: ${emailResult ? '✓' : '✗'}`,
      author: "system",
      note_type: "offer_sent",
    });

    return new Response(JSON.stringify({
      success: true,
      accept_url: acceptUrl,
      viber_sent: viberResult?.ok || false,
      email_sent: emailResult?.ok || false,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error(`[send-offer] Error: ${err.message}`);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
