import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const channelFilter = body.channel_filter || null;
    const maxCalls = body.max_calls || 5;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Find leads that need outreach (new leads with score > 0, not contacted in 3+ days)
    const { data: leads } = await supabase
      .from("hlektrismos_leads")
      .select("*")
      .eq("pipeline_status", "new")
      .gt("lead_score", 0)
      .eq("deleted_at", null)
      .order("lead_score", { ascending: false })
      .limit(channelFilter === "voice" ? maxCalls : 20);

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ message: "No leads require outreach at this time", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        // Determine best channel
        let channel = "email";
        if (channelFilter) {
          channel = channelFilter;
        } else if (lead.phone && !lead.email) {
          channel = "sms";
        } else if (lead.phone && lead.email) {
          // If we have phone, alternate: email first, then voice after day 7
          const daysSinceCreation = Math.floor(
            (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          channel = daysSinceCreation >= 7 ? "voice" : "email";
        }

        if (channel === "voice" && lead.phone) {
          // Trigger voice call
          const voiceRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/make-voice-call`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              lead_id: lead.id,
              phone: lead.phone,
              first_name: lead.first_name,
              last_name: lead.last_name,
              region: lead.region,
              company_name: lead.company_name,
              current_provider: lead.current_provider,
            }),
          });
          if (voiceRes.ok) processed++;
          else errors++;
        } else if (lead.email) {
          // Create a campaign_sends record for email
          await supabase.from("campaign_sends").insert({
            campaign_id: null,
            lead_id: lead.id,
            status: "queued",
          });
          processed++;
        }
      } catch (e) {
        errors++;
      }
    }

    // Update lead scores
    await supabase.rpc("exec_sql", {
      sql: `UPDATE hlektrismos_leads SET lead_score = GREATEST(lead_score - 5, 0) WHERE id IN (${leads.map(l => `'${l.id}'`).join(",")})`,
    }).catch(() => {});

    return new Response(
      JSON.stringify({ message: `Scheduler completed: ${processed} processed, ${errors} errors`, processed, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
