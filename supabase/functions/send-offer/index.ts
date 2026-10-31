import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { prepareMarketingEmail } from "../_shared/email-compliance.ts";
import { signExpiringLink } from "../_shared/signed-link.ts";
import { callerKey, rateLimited } from "../_shared/limits.ts";
import { logAttempt, logResult } from "../_shared/communication-log.ts";
import { admitRequest, LIMITS_NOT_SET, outreachLimitsFromEnv, reserveMessage } from "../_shared/outreach-limits.ts";

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
// Every offer has its own record (public.offers, phase3/10). The link is signed for that offer and lead, so it can accept nothing else.
//
// Promotional or requested: an offer is promotional and passes the full gate on each channel. The one exception is a quote the customer asked for, and it
// applies only when the owner has set SERVICE_COMMS_APPROVED=yes after counsel's advice AND contact_service_requests holds a live, evidenced request for
// that lead and channel (phase3/11). Then the gate applies its non-marketing rule: an address, and no «stop all contact» objection. If the lookup fails,
// the promotional rule applies. A request is never treated as marketing consent.
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
  const limits = outreachLimitsFromEnv();
  if (!limits) return json(LIMITS_NOT_SET.status, { error: LIMITS_NOT_SET.error });
  const overQuota = await admitRequest(supabase, callerKey(caller), "offer", limits);
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

    // Each channel goes through the central gate (consent, objections, suppression, hours, master switches).
    const requested = new Set<string>();
    if (Deno.env.get("SERVICE_COMMS_APPROVED") === "yes") {
      const { data: asked, error } = await supabase.from("contact_service_requests").select("channels")
        .eq("lead_id", lead_id).eq("request_type", "quote").is("withdrawn_at", null).gt("expires_at", new Date().toISOString());
      if (!error) for (const r of asked ?? []) for (const c of r.channels ?? []) requested.add(c);
    }
    const passes = async (channel: "email" | "viber" | "whatsapp") =>
      (await gateRecipients([lead_id], channel, requested.has(channel) ? "transactional" : "promotional", supabaseLoaders(supabase), outreachConfigFromEnv())).allowed.length > 0;
    const mayEmail = !!customer_email && await passes("email");
    const mayViber = !!customer_phone && mayMessagePhone && await passes("viber");
    const mayWhatsApp = !!customer_phone && mayMessagePhone && await passes("whatsapp");
    if (!mayEmail && !mayViber && !mayWhatsApp) return json(403, { error: "No channel is permitted for this lead" });
    const used = [mayEmail && "email", mayViber && "viber", mayWhatsApp && "whatsapp"].filter((c): c is string => !!c);

    const site = crmSiteUrl(Deno.env.get("SITE_URL"));
    if (!site) return json(503, { error: "SITE_URL is not configured" });

    // The offer's record. A database unique index holds one open offer per lead and tariff, so two simultaneous requests cannot both pass this.
    const actorId = caller.kind === "user" ? caller.id : null;
    const { data: created, error: createError } = await supabase.rpc("offer_create", {
      p_lead_id: lead_id, p_tariff_id: tariff_id, p_expires_at: new Date(Date.now() + OFFER_LINK_TTL_SECONDS * 1000).toISOString(),
      p_purpose: used.every((c) => requested.has(c)) ? "requested_service" : "promotional", p_estimated_cost: estimated_cost, p_savings: savings, p_actor_id: actorId,
    });
    if (createError || !created?.state) return json(503, { error: "The offer could not be recorded. Nothing was sent." });
    if (created.state === "open") return json(409, { error: "This offer was just sent. Wait a few minutes before sending it again." });
    if (created.state === "closed") return json(409, { error: "This lead is closed" });
    if (created.state !== "created") return json(404, { error: "Record not found" });
    const offerId: string = created.offer_id;

    // 1. Generate acceptance link: signed for this offer and this lead, and expiring. It opens the confirmation page on the CRM site.
    const acceptToken = await signExpiringLink("accept-offer-v2", OFFER_LINK_TTL_SECONDS, offerId, String(lead_id));
    const acceptUrl = `${site}/#/offer?offer_id=${offerId}&lead_id=${lead_id}&t=${encodeURIComponent(acceptToken)}`;

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

    // One channel, one message: limits and the record of the attempt come first, and a refusal skips this channel only.
    const begin = async (contact: { phone?: string | null; email?: string | null }) => {
      if (await reserveMessage(supabase, callerKey(caller), "offer", contact, limits)) return null;
      const entry = { action: "offer" as const, actor: caller, lead_id: String(lead_id), contact };
      return (await logAttempt(supabase, entry)) ? entry : null;
    };
    const finish = async (entry: NonNullable<Awaited<ReturnType<typeof begin>>>, channel: string, res: Response) => {
      await logResult(supabase, entry, res.ok ? "sent" : "failed", { provider_status: res.status });
      await supabase.rpc("offer_record_delivery", { p_offer_id: offerId, p_channel: channel, p_ok: res.ok, p_status: res.status, p_actor_id: actorId });
    };

    // 3. Send via Viber (if phone available and the caller may message phones)
    let viberResult = null;
    if (mayViber) {
      try {
        const infobipApiKey = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "INFOBIP_API_KEY").single()).data?.setting_value;
        const infobipBaseUrl = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "INFOBIP_BASE_URL").single()).data?.setting_value;

        const entry = infobipApiKey && infobipBaseUrl ? await begin({ phone: customer_phone }) : null;
        if (entry) {
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
          await finish(entry, "viber", viberResult);
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

        const entry = infobipApiKey && infobipBaseUrl ? await begin({ phone: customer_phone }) : null;
        if (entry) {
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
          await finish(entry, "whatsapp", whatsappResult);
          console.log(`[send-offer] WhatsApp: ${whatsappResult.status}`);
        }
      } catch (err: unknown) {
        console.warn(`[send-offer] WhatsApp failed: ${err instanceof Error ? err.name : "unknown"}`);
      }
    }

    // 5. Send via Email (if the lead has a valid stored email)
    let emailResult = null;
    if (mayEmail && customer_email) {
      try {
        const resendApiKey = (await supabase.from("crm_settings").select("setting_value").eq("setting_key", "RESEND_API_KEY").single()).data?.setting_value;

        const prepared = await prepareMarketingEmail(supabase, customer_email, { text: message });
        if (prepared.suppressed) {
          console.warn("[send-offer] Email skipped: recipient unsubscribed");
        } else if (resendApiKey) {
          // Tariff names come from the database but still must not break out of the Subject header.
          const subject = assertHeaderSafe(`⚡ Νέα Προσφορά Ενέργειας — ${provider_name} ${program_name}`, "Subject");
          const entry = await begin({ email: customer_email });
          if (entry) {
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
          await finish(entry, "email", emailResult);
          console.log(`[send-offer] Email: ${emailResult.status}`);
          }
        }
      } catch (err: unknown) {
        console.warn(`[send-offer] Email failed: ${err instanceof Error ? err.name : "unknown"}`);
      }
    }

    // Nothing went out: no status change and no "sent" record, and a retry may start a new offer at once.
    const delivered = [viberResult?.ok && "viber", whatsappResult?.ok && "whatsapp", emailResult?.ok && "email"].filter((c): c is string => !!c);
    if (delivered.length === 0) {
      await supabase.rpc("offer_mark_failed", { p_offer_id: offerId, p_actor_id: actorId });
      return json(502, { error: "The offer could not be delivered" });
    }

    // 6. The offer, the lead's status, the follow-up task, the note and the history, as one transaction. A failure here does not unsend the message, and the
    // link still works (offer_accept accepts an offer that was created but not yet marked sent), so it is logged and reported, not hidden.
    const { error: sentError } = await supabase.rpc("offer_mark_sent", { p_offer_id: offerId, p_channels: delivered, p_actor_id: actorId });
    if (sentError) console.error(JSON.stringify({ event: "offer_mark_sent_failed", offer: offerId }));

    return json(200, {
      success: true,
      offer_id: offerId,
      viber_sent: viberResult?.ok || false,
      email_sent: emailResult?.ok || false,
      recorded: !sentError,
    });
  } catch (err: unknown) {
    console.error(`[send-offer] Error: ${err instanceof Error ? err.name : "unknown"}`);
    return json(500, { error: "Offer could not be sent" });
  }
});
