import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { missingKeyResponse, secretKey } from "../_shared/keys.ts";
import { configuredSecrets, matchesAnySecret } from "../_shared/webhook-auth.ts";
import { contactHash, emailKey, phoneKey } from "../_shared/contact-keys.ts";

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

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()).slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The sender's own identifier for this delivery, when it has one: a header, or the field a lead form or connector carries. */
function eventIdOf(req: Request, body: Record<string, unknown>): string | null {
  const raw = req.headers.get("x-event-id") ?? req.headers.get("idempotency-key") ?? body.event_id ?? body.leadgen_id ?? body.lead_id; // not a generic "id": a form's constant id would swallow every later lead
  const id = typeof raw === "number" ? String(raw) : raw;
  return typeof id === "string" && /^[\x21-\x7e]{1,200}$/.test(id) ? id : null;
}
const yes = (v: unknown) => v === true || /^(true|yes|ναι|1)$/i.test(str(v));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Shared-secret auth: ad platforms / Zapier must send
  //   x-webhook-secret: <LEAD_WEBHOOK_SECRET>
  // Fails closed when the secret is not configured.
  // A secret shorter than 32 characters or visibly repetitive counts as not configured; LEAD_WEBHOOK_SECRET_PREVIOUS keeps the
  // old sender working while the secret is rotated (remove it once the sender has switched).
  if (!matchesAnySecret(req.headers.get("x-webhook-secret") ?? "", configuredSecrets("LEAD_WEBHOOK_SECRET"))) {
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
    const source = str(req.headers.get("x-source") || body.source || "webhook", 40).toLowerCase();
    const q = (body.custom_questions && typeof body.custom_questions === "object" && !Array.isArray(body.custom_questions) ? body.custom_questions : {}) as Record<string, unknown>;

    // Age gate: the source form must ask "I am 18 or older" and pass it as
    // age_confirmed (true / "yes" / "ναι"). Without it nothing is stored.
    if (!yes(body.age_confirmed ?? q.age_confirmed)) {
      return new Response(
        JSON.stringify({ error: "age_confirmed (18+) is required; lead not stored" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const first = str(body.first_name ?? body.firstName, 100) || str(body.name, 200).split(/\s+/)[0] || "";
    const last = str(body.last_name ?? body.lastName, 100) || str(body.name, 200).split(/\s+/).slice(1).join(" ");
    const email = str(body.email, 254);
    const phone = str(body.phone ?? body.phone_number, 40);
    if (!email && !phone) {
      return new Response(
        JSON.stringify({ error: "At least email or phone is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if ((email && !EMAIL.test(email)) || (phone && !/^\+?[\d\s().-]{5,40}$/.test(phone))) {
      return new Response(
        JSON.stringify({ error: "Invalid email or phone" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const full = [first, last].filter(Boolean).join(" ") || email || phone;
    // Consent to be contacted about the request, only when the form actually asked and the person ticked it.
    const consent = yes(body.consent ?? body.gdpr_consent ?? q.consent);
    const label = LABEL[source] ?? (str(body.source_label, 100) || "Webhook");
    const extra = Object.keys(q).length ? `Απαντήσεις φόρμας: ${JSON.stringify(q).slice(0, 1500)}` : "";

    const row = {
      full_name: full,
      first_name: first || full,
      last_name: last,
      client_name: full,
      client_contact: email || phone,
      email: email || null,
      phone: phone || null,
      region: str(body.city ?? body.region ?? body.location ?? body.state, 200) || null,
      company: str(body.company, 300) || null,
      lead_type: source === "linkedin" ? "B2B" : null,
      source: "campaign",
      source_label: label,
      campaign_name: str(body.campaign ?? body.campaign_name) || null,
      campaign_id: str(body.campaign_id) || null,
      status: "new",
      comments: [str(body.comments, 4000), extra].filter(Boolean).join("\n") || null,
      age_confirmed: true,
      gdpr_consent: consent,
      consent_granted_at: consent ? new Date().toISOString() : null,
      consent_source: consent ? source : null,
    };

    // Idempotency: senders retry deliveries, sometimes two at once. The check, the lead, the event and the audit row are one transaction under a lock
    // (phase1/21c), so one delivery creates the lead. A failure rolls everything back, so the sender's retry starts clean.
    const key = emailKey(email) ?? phoneKey(phone) ?? email ?? phone;
    const eventId = eventIdOf(req, body);
    const { data: result, error: ingestError } = await supabase.rpc("ingest_webhook_lead", {
      p_source: label, p_event_id: eventId, p_contact_hash: eventId ? null : await contactHash(key), p_lead: row,
    });
    if (ingestError || !result?.lead_id && !result?.duplicate) {
      // Safe diagnostics only (no payload / personal data).
      console.error("Webhook ingest failed", { code: ingestError?.code ?? null, source });
      return new Response(JSON.stringify({ error: "Insert failed", code: ingestError?.code ?? null }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (result.duplicate) {
      return new Response(JSON.stringify({ success: true, lead_id: result.lead_id, duplicate: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No automated call is triggered from here: any outreach goes through the central eligibility gate
    // (consent per channel, Article 11 screening, legal approval) — see supabase/functions/_shared/eligibility.ts.
    return new Response(
      JSON.stringify({ success: true, lead_id: result.lead_id }),
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
