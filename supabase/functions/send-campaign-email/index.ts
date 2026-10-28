import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { authorizeRecord, getCaller, requireCapability, serviceClient } from "../_shared/authz.ts";
import { isOffice } from "../_shared/access.ts";
import { assertHeaderSafe, EmailSafetyError, parseRecipient, safeDisplayName } from "../_shared/email-safety.ts";
import { gateRecipients } from "../_shared/outreach-gate.ts";
import { outreachConfigFromEnv, supabaseLoaders } from "../_shared/outreach-loaders.ts";
import { prepareMarketingEmail } from "../_shared/email-compliance.ts";

// MARKETING EMAIL: every message goes through prepareMarketingEmail()
// (suppression check, unsubscribe link, postal address, List-Unsubscribe).

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
  const denied = requireCapability(caller, "campaign.send");
  if (denied) return denied;

  try {
    const { campaign_id, leads, subject, html_body, from_name } = await req.json();

    // Header safety: the sender address is configuration; only a sanitised display name may be chosen and the
    // Subject must not contain CR/LF (header injection). Validated once, before any recipient is processed.
    let fromHeader: string;
    let safeSubject: string;
    try {
      safeSubject = assertHeaderSafe(String(subject ?? ""), "Subject");
      const fromAddress = parseRecipient(Deno.env.get("MARKETING_FROM_EMAIL") ?? "onboarding@resend.dev");
      fromHeader = `${safeDisplayName(from_name, "Hlektrismos.gr")} <${fromAddress}>`;
    } catch (e) {
      const msg = e instanceof EmailSafetyError ? e.message : "Invalid email headers";
      return new Response(JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    // Recipients are selected server-side: only lead IDs are read from the request; addresses and every other
    // attribute come from the database, and each recipient must pass the central eligibility gate.
    if (!Array.isArray(leads)) {
      return new Response(JSON.stringify({ error: "leads must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Per-lead targeting: campaign.send is admin-only by default; if an override grants it to a sales role,
    // that caller may only target leads assigned to them (first refusal returned unchanged, nothing sent).
    if (!isOffice(caller)) {
      for (const l of leads) {
        const owned = await authorizeRecord(supabase, caller, "legacy_lead", l?.id, "campaign.send");
        if (owned instanceof Response) return owned;
      }
    }
    const gate = await gateRecipients(leads.map((l: { id?: string }) => l?.id), "email", "promotional",
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

      if (!lead.email) {
        results.failed++;
        results.errors.push(`${lead.id}: no email`);
        continue;
      }

      try {
        const personalizedHtml = html_body
          .replace(/\{\{first_name\}\}/g, lead.first_name || "")
          .replace(/\{\{last_name\}\}/g, lead.last_name || "")
          .replace(/\{\{company_name\}\}/g, lead.company_name || "")
          .replace(/\{\{region\}\}/g, lead.region || "")
          .replace(/\{\{current_provider\}\}/g, lead.current_provider || "");

        const prepared = await prepareMarketingEmail(supabase, lead.email, { html: personalizedHtml });
        if (prepared.suppressed) {
          results.failed++;
          results.errors.push(`${lead.id}: unsubscribed (suppression list)`);
          continue;
        }

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // Must be a sender on your own verified domain (accurate header info).
            from: fromHeader,
            to: [lead.email],
            subject: safeSubject,
            html: prepared.html,
            headers: prepared.headers,
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
          await resendRes.text().catch(() => ""); // drain; provider text is not returned (may contain PII)
          results.failed++;
          console.error(`[send-campaign-email] provider HTTP ${resendRes.status} for lead ${lead.id}`);
          results.errors.push(`${lead.id}: provider error ${resendRes.status}`);
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
    console.error("[send-campaign-email] Error:", e instanceof Error ? e.name : "unknown");
    return new Response(
      JSON.stringify({ error: "Campaign could not be sent" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
