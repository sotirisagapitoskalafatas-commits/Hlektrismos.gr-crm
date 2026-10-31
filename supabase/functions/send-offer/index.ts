import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { prepareMarketingEmail } from "../_shared/email-compliance.ts";
import { signExpiringLink } from "../_shared/signed-link.ts";
import { callerKey, durableLimit, rateLimited } from "../_shared/limits.ts";

/** The acceptance link stops working after this long (the offer must be re-sent). */
const OFFER_LINK_TTL_SECONDS = 14 * 24 * 60 * 60;
import { authorizeRecord, getCaller, json, requireCapability, serviceClient } from "../_shared/authz.ts";
import { gateRecipients } from "../_shared/outreach-gate.ts";
import { outreachConfigFromEnv, supabaseLoaders } from "../_shared/outreach-loaders.ts";
import { crmSiteUrl } from "../_shared/site-url.ts";
import { callerCan } from "../_shared/access.ts";
import { assertHeaderSafe, parseRecipient } from "../_shared/email-safety.ts";

// COMMERCIAL EMAIL (a sales offer): the email goes through
// prepareMarketingEmail() — suppression check, unsubscribe link, postal
// address and List-Unsubscribe headers.
//
// Authorization (stage 2b): the caller needs communications.email.send AND access to the lead
// (public.hlektrismos_leads: office = all, sales = own). Viber/WhatsApp additionally need
// communications.sms.send. Recipient name, email, phone and the tariff names come from the database,
// never from the request; the accept link is signed only after these checks.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = serviceClient();
  const caller = await getCaller(req, supabase);
  if (caller instanceof Response) return caller;
  const noCap = requireCapability(caller, "communications.email.send");
  if (noCap) return noCap;
  if (rateLimited(`send-offer:${callerKey(caller)}`, 20, 60_000)) return json(429, { error: "Too many requests. Try again in a minute." });
  const overQuota = await durableLimit(supabase, `send-offer:${callerKey(caller)}`, 100, 3600);
  if (overQuota) return json(overQuota.status, { error: overQuota.error });

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json(400, { error: "Invalid JSON body" });
    // Only ids and the two figures are read from the request; everything else is loaded below.
    const { lead_id, tariff_id } = body;
    const estimated_cost = num(body.estimated_cost);
    const savings = num(body.savings);

    if (!lead_id || !tariff_id) {
      return json(400, { error: "lead_id and tariff_id required" });
    }

    // 0. Caller may email this lead? (401 / 403 / 404 returned unchanged, nothing signed or sent.)
    const owned = await authorizeRecord(supabase, caller, "legacy_lead", lead_id, "communications.email.send");
    if (owned instanceof Response) return owned;
    if (typeof tariff_id !== "string" || !UUID.test(tariff_id)) {
      return json(400, { error: "A valid tariff id is required" });
    }

    const { data: lead } = await supabase
      .from("hlektrismos_leads")
      .select("first_name, last_name, email, phone, status, deleted_at")
      .eq("id", lead_id)
      .maybeSingle();
    const { data: tariff } = await supabase
      .from("energy_tariffs")
      .select("provider_name, program_name")
      .eq("id", tariff_id)
      .maybeSingle();
    if (!lead || lead.deleted_at || !tariff) return json(404, { error: "Record not found" });
    // An offer never reopens a closed lead: that would also revive older acceptance links.
    if (["customer", "lost", "unsubscribed", "do_not_contact"].includes(String(lead.status))) {
      return json(409, { error: "This lead is closed" });
    }

    const provider_name = String(tariff.provider_name ?? "");
    const program_name = String(tariff.program_name ?? "");
    const customer_name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "πελάτη";
    const customer_phone = typeof lead.phone === "string" && lead.phone.trim() ? lead.phone.trim() : null;
    let customer_email: string | null = null;
    try { customer_email = lead.email ? parseRecipient(lead.email) : null; } catch { customer_email = null; }
    const mayMessagePhone = callerCan(caller, "communications.sms.send");
    const savingsTxt = savings !== null ? savings.toFixed(2) : "0";

    // Idempotency: the same offer is not sent twice within ten minutes (double click, retry, replay).
    const recent = await supabase.from("crm_tasks").select("id").eq("lead_id", lead_id).eq("tariff_id", tariff_id)
      .ilike("title", "Προσφορά στάλθηκε%").gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()).limit(1);
    if ((recent.data ?? []).length > 0) return json(409, { error: "This offer was just sent. Wait a few minutes before sending it again." });

    // Atomic: two simultaneous requests cannot both pass (the task check above only sees finished sends).
    const once = await durableLimit(supabase, `send-offer-once:${lead_id}:${tariff_id}`, 1, 600);
    if (once) return json(once.status === 429 ? 409 : once.status, { error: "This offer was just sent. Wait a few minutes before sending it again." });

    // An offer is commercial: each channel goes through the central gate (consent, objections, suppression, hours, master switches).
    const passes = async (channel: "email" | "viber" | "whatsapp") =>
      (await gateRecipients([lead_id], channel, "promotional", supabaseLoaders(supabase), outreachConfigFromEnv())).allowed.length > 0;
    const mayEmail = !!customer_email && await passes("email");
    const mayViber = !!customer_phone && mayMessagePhone && await passes("viber");
    const mayWhatsApp = !!customer_phone && mayMessagePhone && await passes("whatsapp");
    if (!mayEmail && !mayViber && !mayWhatsApp) return json(403, { error: "No channel is permitted for this lead" });

    const site = crmSiteUrl(Deno.env.get("SITE_URL"));
    if (!site) return json(503, { error: "SITE_URL is not configured" });

    // 1. Generate acceptance link (signed and expiring). It opens the confirmation page on the CRM site.
    const acceptToken = await signExpiringLink("accept-offer", OFFER_LINK_TTL_SECONDS, String(lead_id), String(tariff_id));
    const acceptUrl = `${site}/#/offer?lead_id=${lead_id}&tariff_id=${tariff_id}&t=${encodeURIComponent(acceptToken)}`;

    // 2. Compose Greek savings message
    const message = `⚡ Hlektrismos.gr — Νέα Προσφορά για εσάς!

Αγαπητέ/ή ${customer_name},

Βρήκαμε καλύτερη τιμή για εσάς:
📊 Πάροχος: ${provider_name}
📋 Πρόγραμμα: ${program_name}
💰 Εκτιμώμενο κόστος: €${estimated_cost ?? ""}/μήνα
${savings !== null && savings > 0 ? `✅ Εξοικονόμηση: €${savings.toFixed(2)}/μήνα (€${(savings * 12).toFixed(2)}/χρόνο)` : ''}

👉 Δεχτείτε την προσφορά: ${acceptUrl}

Ηλεκτρισμός.gr — Σας βοηθάμε να εξοικονομήστε! 🔋`;

    // 3. Send via Viber (if phone available and the caller may message phones)
    let viberResult = null;
    if (mayViber) {
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
      } catch (err: unknown) {
        console.warn(`[send-offer] Viber failed: ${err instanceof Error ? err.name : "unknown"}`);
      }
    }

    // 4. Send via WhatsApp (if phone available, the caller may message phones and Infobip configured)
    let whatsappResult = null;
    if (mayWhatsApp) {
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
      } catch (err: unknown) {
        console.warn(`[send-offer] WhatsApp failed: ${err instanceof Error ? err.name : "unknown"}`);
      }
    }

    // 5. Send via Email (if the lead has a valid stored email)
    let emailResult = null;
    if (mayEmail) {
      try {
        const resendApiKey = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "RESEND_API_KEY").single()).data?.setting_value;

        const prepared = await prepareMarketingEmail(supabase, customer_email, { text: message });
        if (prepared.suppressed) {
          console.warn("[send-offer] Email skipped: recipient unsubscribed");
        } else if (resendApiKey) {
          // Tariff names come from the database but still must not break out of the Subject header.
          const subject = assertHeaderSafe(`⚡ Νέα Προσφορά Ενέργειας — ${provider_name} ${program_name}`, "Subject");
          emailResult = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Hlektrismos.gr <offers@hlektrismos.gr>",
              to: [customer_email],
              subject,
              text: prepared.text,
              headers: prepared.headers,
            }),
          });
          console.log(`[send-offer] Email: ${emailResult.status}`);
        }
      } catch (err: unknown) {
        console.warn(`[send-offer] Email failed: ${err instanceof Error ? err.name : "unknown"}`);
      }
    }

    // Nothing went out: no status change and no "sent" record.
    if (!viberResult?.ok && !whatsappResult?.ok && !emailResult?.ok) return json(502, { error: "The offer could not be delivered" });

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
      description: `Εκτιμώμενο κόστος: €${estimated_cost ?? ""}/μήνα. Εξοικονόμηση: €${savingsTxt}/μήνα. Περιμένουμε απάντηση.`,
      status: "pending",
      priority: "high",
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day
    });

    // 7. Log in lead_notes
    await supabase.from("lead_notes").insert({
      lead_id,
      content: `📧 Προσφορά στάλθηκε: ${provider_name} — ${program_name}\nΚόστος: €${estimated_cost ?? ""}/μήνα | Εξοικονόμηση: €${savingsTxt}/μήνα\nViber: ${viberResult ? '✓' : '✗'} | Email: ${emailResult ? '✓' : '✗'}`,
      author: "system",
      note_type: "offer_sent",
    });

    return json(200, {
      success: true,
      viber_sent: viberResult?.ok || false,
      email_sent: emailResult?.ok || false,
    });
  } catch (err: unknown) {
    console.error(`[send-offer] Error: ${err instanceof Error ? err.name : "unknown"}`);
    return json(500, { error: "Offer could not be sent" });
  }
});
