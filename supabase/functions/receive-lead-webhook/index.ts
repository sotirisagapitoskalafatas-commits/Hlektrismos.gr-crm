import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { missingKeyResponse, secretKey } from "../_shared/keys.ts";
import { timingSafeEqual } from "../_shared/signed-link.ts";

// Ad-platform / Zapier lead intake → public.leads (the table the CRM lists).
// Previously this wrote to the legacy hlektrismos_leads table, which the new CRM does not show, so ad-form leads never
// reached the team. Only what the form sent is stored: no invented provider, region or customer category.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-source",
};

const LABEL: Record<string, string> = {
  facebook: "Facebook Lead Ads", fb: "Facebook Lead Ads", google: "Google Ads", instagram: "Instagram", linkedin: "LinkedIn Lead Gen Forms",
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const yes = (v: unknown) => v === true || /^(true|yes|ναι|1)$/i.test(str(v));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Shared-secret auth: ad platforms / Zapier must send
  //   x-webhook-secret: <LEAD_WEBHOOK_SECRET>
  // Fails closed when the secret is not configured.
  const expected = Deno.env.get("LEAD_WEBHOOK_SECRET") ?? "";
  // A configured secret shorter than 16 characters is treated as not configured (same rule as vapi-webhook).
  if (expected.length < 16 || !timingSafeEqual(req.headers.get("x-webhook-secret") ?? "", expected)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey());

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return new Response(JSON.stringify({ error: "A JSON object is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const source = str(req.headers.get("x-source") || body.source || "webhook").toLowerCase();
    const q = (body.custom_questions ?? {}) as Record<string, unknown>;

    // Age gate: the source form must ask "I am 18 or older" and pass it as
    // age_confirmed (true / "yes" / "ναι"). Without it nothing is stored.
    if (!yes(body.age_confirmed ?? q.age_confirmed)) {
      return new Response(
        JSON.stringify({ error: "age_confirmed (18+) is required; lead not stored" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const first = str(body.first_name ?? body.firstName) || str(body.name).split(/\s+/)[0] || "";
    const last = str(body.last_name ?? body.lastName) || str(body.name).split(/\s+/).slice(1).join(" ");
    const email = str(body.email);
    const phone = str(body.phone ?? body.phone_number);
    if (!email && !phone) {
      return new Response(
        JSON.stringify({ error: "At least email or phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const full = [first, last].filter(Boolean).join(" ") || email || phone;
    // Consent to be contacted about the request, only when the form actually asked and the person ticked it.
    const consent = yes(body.consent ?? body.gdpr_consent ?? q.consent);
    const label = LABEL[source] ?? (str(body.source_label) || "Webhook");
    const extra = Object.keys(q).length ? `Απαντήσεις φόρμας: ${JSON.stringify(q).slice(0, 1500)}` : "";

    const row = {
      full_name: full,
      first_name: first || full,
      last_name: last,
      client_name: full,
      client_contact: email || phone,
      email: email || null,
      phone: phone || null,
      region: str(body.city ?? body.region ?? body.location ?? body.state) || null,
      company: str(body.company) || null,
      lead_type: source === "linkedin" ? "B2B" : null,
      source: "campaign",
      source_label: label,
      campaign_name: str(body.campaign ?? body.campaign_name) || null,
      campaign_id: str(body.campaign_id) || null,
      status: "new",
      comments: [str(body.comments), extra].filter(Boolean).join("\n") || null,
      age_confirmed: true,
      gdpr_consent: consent,
      consent_granted_at: consent ? new Date().toISOString() : null,
      consent_source: consent ? source : null,
    };

    // Idempotency: senders retry deliveries. The same contact from the same source inside ten minutes is the same lead.
    const { data: recent } = await supabase.from("leads").select("id")
      .eq(email ? "email" : "phone", email || phone).eq("source_label", label)
      .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()).limit(1);
    if (recent && recent.length > 0) {
      return new Response(JSON.stringify({ success: true, lead_id: recent[0].id, duplicate: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lead, error: insertError } = await supabase.from("leads").insert(row).select("id").single();
    if (insertError) {
      // Safe diagnostics only (no payload / personal data).
      console.error("Webhook insert failed", { code: insertError.code, source });
      return new Response(JSON.stringify({ error: "Insert failed", code: insertError.code ?? null }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("activity_log").insert({
      entity_type: "lead", entity_id: lead.id, action: "created", details: { via: "webhook", source: label },
    });

    // No automated call is triggered from here: any outreach goes through the central eligibility gate
    // (consent per channel, Article 11 screening, legal approval) — see supabase/functions/_shared/eligibility.ts.
    return new Response(
      JSON.stringify({ success: true, lead_id: lead.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err instanceof Error ? err.name : "unknown");
    return new Response(
      JSON.stringify({ error: "Webhook failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
