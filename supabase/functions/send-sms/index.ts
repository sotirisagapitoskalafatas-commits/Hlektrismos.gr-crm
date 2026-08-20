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
    const { campaign_id, leads, message, channel } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: settings } = await supabase
      .from("crm_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["INFOBIP_API_KEY", "INFOBIP_BASE_URL"]);

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

    for (const lead of leads) {
      // Kill Switch: skip leads with AI paused
      if (lead.ai_paused) {
        results.failed++;
        results.errors.push(`${lead.phone}: AI paused`);
        continue;
      }

      if (!lead.phone) {
        results.failed++;
        results.errors.push(`${lead.first_name || lead.company_name}: no phone`);
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
            content: `📱 ${channel === "viber" ? "Viber" : "SMS"} campaign sent`,
            author: "system",
            note_type: "sms_campaign",
          });
        } else {
          const errText = await smsRes.text();
          results.failed++;
          results.errors.push(`${lead.phone}: ${errText}`);
        }
      } catch (e: any) {
        results.failed++;
        results.errors.push(`${lead.phone}: ${e.message}`);
      }
    }

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
