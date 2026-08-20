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
    const { campaign_id, leads, subject, html_body, from_name } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch Resend API key from crm_settings
    const { data: settings } = await supabase
      .from("crm_settings")
      .select("setting_value")
      .eq("setting_key", "RESEND_API_KEY")
      .single();

    const resendApiKey = settings?.setting_value?.replace(/"/g, "") || "";
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured in Settings → Email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = { sent: 0, failed: 0, errors: [] as string[] };

    for (const lead of leads) {
      // Kill Switch: skip leads with AI paused
      if (lead.ai_paused) {
        results.failed++;
        results.errors.push(`${lead.first_name || lead.company_name}: AI paused`);
        continue;
      }

      if (!lead.email) {
        results.failed++;
        results.errors.push(`${lead.first_name || lead.company_name}: no email`);
        continue;
      }

      try {
        const personalizedHtml = html_body
          .replace(/\{\{first_name\}\}/g, lead.first_name || "")
          .replace(/\{\{last_name\}\}/g, lead.last_name || "")
          .replace(/\{\{company_name\}\}/g, lead.company_name || "")
          .replace(/\{\{region\}\}/g, lead.region || "")
          .replace(/\{\{current_provider\}\}/g, lead.current_provider || "");

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${from_name || "Αλέξης - Hlektrismos.gr"} <onboarding@resend.dev>`,
            to: [lead.email],
            subject,
            html: personalizedHtml,
            tags: [
              { name: "campaign_id", value: campaign_id || "direct" },
              { name: "lead_id", value: lead.id || "" },
            ],
          }),
        });

        if (resendRes.ok) {
          const data = await resendRes.json();
          results.sent++;

          // Update campaign_sends if campaign_id provided
          if (campaign_id && lead.id) {
            await supabase.from("campaign_sends").upsert({
              campaign_id,
              lead_id: lead.id,
              status: "sent",
              sent_at: new Date().toISOString(),
              external_id: data.id,
            });
          }

          // Log in lead_notes
          await supabase.from("lead_notes").insert({
            lead_id: lead.id,
            content: `📧 Email campaign sent: "${subject}"`,
            author: "system",
            note_type: "email_campaign",
          });
        } else {
          const errText = await resendRes.text();
          results.failed++;
          results.errors.push(`${lead.email}: ${errText}`);
        }
      } catch (e: any) {
        results.failed++;
        results.errors.push(`${lead.email}: ${e.message}`);
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
