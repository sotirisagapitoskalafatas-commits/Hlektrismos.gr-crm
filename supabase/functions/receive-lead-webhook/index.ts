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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const source = (req.headers.get("x-source") || body.source || "webhook").toLowerCase();

    let leadData: Record<string, unknown> = {};

    switch (source) {
      case "facebook":
      case "fb":
        leadData = {
          first_name: body.first_name || body.firstName || "",
          last_name: body.last_name || body.lastName || "",
          email: body.email || "",
          phone: body.phone || body.phone_number || "",
          region: body.city || body.state || "",
          customer_type: "B2C",
          provider: "Unknown",
          status: "new",
          source: "Facebook Lead Ads",
          lawful_basis: "consent",
          customer_category: "residential",
          comments: `Facebook lead: ${JSON.stringify(body.custom_questions || {})}`,
        };
        break;

      case "google":
        leadData = {
          first_name: body.first_name || "",
          last_name: body.last_name || "",
          email: body.email || "",
          phone: body.phone_number || "",
          region: body.city || body.location || "",
          customer_type: "B2C",
          provider: "Unknown",
          status: "new",
          source: "Google Ads",
          lawful_basis: "consent",
          customer_category: "residential",
          comments: `Google Ads lead from campaign: ${body.campaign || "unknown"}`,
        };
        break;

      case "instagram":
        leadData = {
          first_name: body.first_name || "",
          last_name: body.last_name || "",
          email: body.email || "",
          phone: body.phone || "",
          region: body.city || "",
          customer_type: "B2C",
          provider: "Unknown",
          status: "new",
          source: "Instagram",
          lawful_basis: "consent",
          customer_category: "residential",
          comments: `Instagram lead via DM automation`,
        };
        break;

      case "linkedin":
        leadData = {
          first_name: body.first_name || "",
          last_name: body.last_name || "",
          email: body.email || "",
          phone: body.phone || "",
          region: body.location || "",
          customer_type: "B2B",
          provider: "Unknown",
          status: "new",
          source: "LinkedIn Lead Gen Forms",
          lawful_basis: "legitimate_interest",
          customer_category: "business",
          company: body.company || "",
          job_title: body.job_title || "",
          comments: `LinkedIn lead: company=${body.company || "N/A"}`,
        };
        break;

      default:
        // Generic webhook — accept any fields
        leadData = {
          first_name: body.first_name || body.name?.split(" ")[0] || "",
          last_name: body.last_name || body.name?.split(" ").slice(1).join(" ") || "",
          email: body.email || "",
          phone: body.phone || body.phone_number || "",
          region: body.region || body.city || "",
          customer_type: body.customer_type || "B2C",
          provider: body.provider || "Unknown",
          status: "new",
          source: body.source || source || "Webhook",
          lawful_basis: body.lawful_basis || "consent",
          customer_category: body.customer_category || "residential",
          comments: body.comments || "",
        };
    }

    // Validate required fields
    if (!leadData.email && !leadData.phone) {
      return new Response(
        JSON.stringify({ error: "At least email or phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert lead
    const { data: lead, error: insertError } = await supabase
      .from("hlektrismos_leads")
      .insert(leadData)
      .select("id, first_name, last_name")
      .single();

    if (insertError) {
      throw new Error(`Insert failed: ${insertError.message}`);
    }

    // Log the webhook
    await supabase.from("lead_notes").insert({
      lead_id: lead.id,
      content: `📥 Lead received via ${source.toUpperCase()} webhook`,
      author: "System",
      note_type: "system",
    });

    // Auto-trigger AI call for high-priority sources
    const autoCallSources = ["facebook", "google", "linkedin", "fb"];
    if (autoCallSources.includes(source)) {
      try {
        await supabase.functions.invoke("make-voice-call", {
          body: { lead_id: lead.id },
        });
      } catch (callErr) {
        console.log(`Auto-call failed for lead ${lead.id}:`, callErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: lead.id,
        name: `${lead.first_name} ${lead.last_name}`,
        auto_call: autoCallSources.includes(source),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
