import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { authorizeRecord, getCaller, json, requireCapability, serviceClient } from "../_shared/authz.ts";
import { badBatch, callerKey, claimOnce, cleanText, isUuid, rateLimited, textHash } from "../_shared/limits.ts";
import { isOffice } from "../_shared/access.ts";
import { logAttempt, logResult } from "../_shared/communication-log.ts";
import { admitRequest, LIMITS_NOT_SET, outreachLimitsFromEnv, reserveMessage, type OutboundAction } from "../_shared/outreach-limits.ts";
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
  // Best-effort per-caller throttle (limits.ts): slows a runaway or compromised staff account.
  if (rateLimited(`send-sms:${callerKey(caller)}`, 10, 60_000)) return json(429, { error: "Too many requests. Try again in a minute." });
  const limits = outreachLimitsFromEnv();
  if (!limits) return json(LIMITS_NOT_SET.status, { error: LIMITS_NOT_SET.error });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json(400, { error: "A JSON body is required" });
    const { campaign_id, leads, channel } = body as { campaign_id?: string; leads?: unknown; channel?: string };
    const text = cleanText((body as { message?: unknown }).message, 1, 1000);
    if (!text) return json(400, { error: "message must be 1-1000 characters" });
    const action: OutboundAction = channel === "viber" ? "viber" : channel === "whatsapp" ? "whatsapp" : "sms";
    const bad = badBatch(leads, limits.actions[action].maxRecipients);
    if (bad) return json(bad.status, { error: bad.error });
    if (campaign_id !== undefined && campaign_id !== null && !isUuid(campaign_id)) return json(400, { error: "campaign_id must be a UUID" });
    if (!campaign_id && (leads as unknown[]).length > 1) return json(400, { error: "A batch needs a campaign_id" });
    const overQuota = await admitRequest(supabase, callerKey(caller), action, limits);
    if (overQuota) return json(overQuota.status, { error: overQuota.error });

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

    const results = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };

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
    const gate = await gateRecipients(leads.map((l: { id?: string }) => l?.id), action, "promotional",
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

      // Atomic claim (unique index, phase1/21b): only one request can own this lead in this campaign. A failed claim sends nothing.
      if (campaign_id) {
        const { data: claim, error: claimError } = await supabase.from("campaign_sends")
          .upsert({ campaign_id, lead_id: lead.id, status: "queued" }, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true }).select("lead_id");
        if (claimError) { results.failed++; results.errors.push(`${lead.id}: could not reserve`); continue; }
        if (!claim || claim.length === 0) { results.skipped++; continue; }
      }
      const release = async () => { if (campaign_id) await supabase.from("campaign_sends").delete().eq("campaign_id", campaign_id).eq("lead_id", lead.id).eq("status", "queued"); };
      // Without a campaign there is no claim row: a double click or a retry of the same text to the same person inside ten minutes stops here.
      if (!campaign_id) {
        const once = await claimOnce(supabase, `send-once:${action}:${lead.id}:${await textHash(text)}`, 600);
        if (once) { results.skipped++; continue; }
      }
      // Per caller, per organisation and per person, in one atomic step. The phone counter is shared with the other phone channels and with voice calls.
      const over = await reserveMessage(supabase, callerKey(caller), action, { phone: lead.phone }, limits);
      if (over) {
        await release();
        if (over.scope === "contact") { results.skipped++; results.errors.push(`${lead.id}: contact limit reached`); continue; }
        results.failed++;
        results.errors.push(`${lead.id}: ${over.error}`);
        break; // the caller's or organisation's limit applies to everyone left in this batch too
      }
      const entry = { action, actor: caller, lead_id: lead.id, campaign_id: campaign_id ?? null, contact: { phone: lead.phone } };
      if (!(await logAttempt(supabase, entry))) {
        await release();
        results.failed++;
        results.errors.push(`${lead.id}: could not be recorded`);
        continue;
      }

      try {
        const personalizedMessage = text
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
          const data = await smsRes.json().catch(() => ({})); // the message WAS sent: a bad reply body must not lose that
          results.sent++;
          const externalId = data.bulkId || data.messages?.[0]?.messageId || "";
          await logResult(supabase, entry, "sent", { provider_status: smsRes.status, provider_ref: externalId ? String(externalId).slice(0, 200) : null });

          if (campaign_id && lead.id) {
            await supabase.from("campaign_sends").update({ status: "sent", sent_at: new Date().toISOString(), external_id: externalId })
              .eq("campaign_id", campaign_id).eq("lead_id", lead.id);
          }

          await supabase.from("lead_notes").insert({
            lead_id: lead.id,
            content: `📱 ${channel === "viber" ? "Viber" : channel === "whatsapp" ? "WhatsApp" : "SMS"} campaign sent`,
            author: "system",
            note_type: "sms_campaign",
          });
        } else {
          await smsRes.text().catch(() => ""); // drain; provider text is not returned (may contain PII)
          await release(); // nothing was sent, so a retry may try again
          await logResult(supabase, entry, "failed", { provider_status: smsRes.status });
          results.failed++;
          console.error(`[send-sms] provider HTTP ${smsRes.status} for lead ${lead.id}`);
          results.errors.push(`${lead.id}: provider error ${smsRes.status}`);
        }
      } catch {
        await logResult(supabase, entry, "failed"); // outcome unknown: the claim stays, so a retry cannot send a duplicate
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
