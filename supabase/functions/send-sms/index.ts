import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { authorizeRecord, getCaller, requireCapability, serviceClient } from "../_shared/authz.ts";
import { isOffice } from "../_shared/access.ts";
import { gateRecipients } from "../_shared/outreach-gate.ts";
import { outreachConfigFromEnv, supabaseLoaders } from "../_shared/outreach-loaders.ts";

// SMS. Promotional SMS to individuals needs PRIOR opt-in consent under Greek
// law 3471/2006 art. 11 (ePrivacy). Use this only for messages the recipient
// asked for (e.g. callback confirmations) unless the lead gave SMS consent.

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
  const denied = requireCapability(caller, "communications.sms.send");
  if (denied) return denied;

  try {
    const { campaign_id, leads, message, channel } = await req.json();

    const { data: settings } = await supabase
      .from("crm_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["INFOBIP_API_KEY", "INFOBIP_BASE_URL", "WHATSAPP_SENDER_ID"]);

    const config: Record<string, string> = {};
    settings?.forEach((s: any) => {
      config[s.setting_key] = s.setting_value?.replace(/"/g, "") || "";
    });

    const apiKey = config.INFOBIP_API_KEY;
    const baseUrl = config.INFOBIP_BASE_URL || "https://api.infobip.com";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "INFOBIP_API_KEY not configured in Settings → SMS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = { sent: 0, failed: 0, errors: [] as string[] };

    // Server-selected recipients + central eligibility gate (see send-campaign-email).
    if (!Array.isArray(leads)) {
      return new Response(JSON.stringify({ error: "leads must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Record-level authorization: a sales caller may only message leads assigned to them. Checked for every
    // lead before anything is sent; the first refusal (400/403/404) is returned unchanged. Office callers and
    // the service role may message any lead, so their batches go straight to the eligibility gate.
    if (!isOffice(caller)) {
      for (const l of leads) {
        const owned = await authorizeRecord(supabase, caller, "legacy_lead", l?.id, "communications.sms.send");
        if (owned instanceof Response) return owned;
      }
    }
    const gateChannel = channel === "viber" || channel === "whatsapp" ? channel : "sms";
    const gate = await gateRecipients(leads.map((l: { id?: string }) => l?.id), gateChannel, "promotional",
      supabaseLoaders(supabase), outreachConfigFromEnv());
    for (const d of gate.denied) {
      results.failed++;
      results.errors.push(`${d.id}: not eligible (${d.reasons.join(",")})`);
    }

    for (const lead of gate.allowed) {
      // Kill Switch: skip leads with AI paused
      if (lead.ai_paused) {
        results.failed++;
        results.errors.push(`${lead.id}: AI paused`);
        continue;
      }

      if (!lead.phone) {
        results.failed++;
        results.errors.push(`${lead.id}: no phone`);
        continue;
      }

      try {
        const personalizedMessage = message
          .replace(/\{\{first_name\}\}/g, lead.first_name || "")
          .replace(/\{\{last_name\}\}/g, lead.last_name || "")
          .replace(/\{\{company_name\}\}/g, lead.company_name || "")
          .replace(/\{\{region\}\}/g, lead.region || "");

        let endpoint = "";
        let body: any = {};

        if (channel === "viber") {
          endpoint = `${baseUrl}/viber/2/message`;
          body = {
            scenarioKey: "DEFAULT",
            destinations: [{ to: lead.phone }],
            viber: { text: personalizedMessage, type: "TEXT" },
          };
        } else if (channel === "whatsapp") {
          endpoint = `${baseUrl}/whatsapp/1/send-message`;
          body = {
            from: config.WHATSAPP_SENDER_ID || "Hlektrismos",
            to: lead.phone,
            type: "text",
            text: { previewUrl: false, body: personalizedMessage },
          };
        } else {
          endpoint = `${baseUrl}/sms/2/text/advanced`;
          body = {
            messages: [
              {
                from: "Hlektrismos",
                destinations: [{ to: lead.phone }],
                text: personalizedMessage,
              },
            ],
          };
        }

        const smsRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `App ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        });

        if (smsRes.ok) {
          const data = await smsRes.json();
          results.sent++;
          const externalId = data.bulkId || data.messages?.[0]?.messageId || "";

          if (campaign_id && lead.id) {
            await supabase.from("campaign_sends").upsert({
              campaign_id,
              lead_id: lead.id,
              status: "sent",
              sent_at: new Date().toISOString(),
              external_id: externalId,
            });
          }

          await supabase.from("lead_notes").insert({
            lead_id: lead.id,
            content: `📱 ${channel === "viber" ? "Viber" : channel === "whatsapp" ? "WhatsApp" : "SMS"} campaign sent`,
            author: "system",
            note_type: "sms_campaign",
          });
        } else {
          await smsRes.text().catch(() => ""); // drain; provider text is not returned (may contain PII)
          results.failed++;
          console.error(`[send-sms] provider HTTP ${smsRes.status} for lead ${lead.id}`);
          results.errors.push(`${lead.id}: provider error ${smsRes.status}`);
        }
      } catch {
        results.failed++;
        results.errors.push(`${lead.id}: send failed`);
      }
    }

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    console.error("[send-sms] Error:", e instanceof Error ? e.name : "unknown");
    return new Response(
      JSON.stringify({ error: "Messages could not be sent" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
