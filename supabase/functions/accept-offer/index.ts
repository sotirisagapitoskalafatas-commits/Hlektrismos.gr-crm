import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { missingKeyResponse, secretKey } from "../_shared/keys.ts";
import { isUuid } from "../_shared/limits.ts";
import { verifyExpiringLink, verifyLink } from "../_shared/signed-link.ts";
import { crmSiteUrl } from "../_shared/site-url.ts";

// The customer's acceptance of an offer. POST with JSON only: Supabase rewrites text/html GET responses to text/plain
// (docs: guides/functions/http-methods), so the confirmation page lives on the CRM site (src/pages/OfferAccept.tsx) and calls this.
// A GET changes nothing, so mail scanners and link previews cannot accept an offer. It sends the browser to that page, which keeps links in old
// e-mails, which point straight at this function, working as links.
//
// Current links carry offer_id, lead_id and t: a token signed for exactly that offer and lead (send-offer). offer_accept (phase3/10) is one transaction.
// Links from before offers had their own record (no offer_id) are never honoured automatically, signed or not: they change nothing, are queued for a
// person (offer_legacy_link_reviews), and the customer is told someone will confirm. See docs/ops/OFFER_LINKS.md.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (status: number, state: string) =>
  new Response(JSON.stringify({ state }), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const STATUS: Record<string, number> = { accepted: 200, already_accepted: 200, expired: 410, closed: 409, not_found: 404 };

/** The same link, on the confirmation page. Only known fields are carried over, and the target is configuration, so this is not an open redirect. */
function toConfirmationPage(req: Request): Response {
  const site = crmSiteUrl(Deno.env.get("SITE_URL"));
  if (!site) return reply(405, "method_not_allowed");
  const from = new URL(req.url).searchParams;
  const to = new URLSearchParams();
  for (const k of ["offer_id", "lead_id", "tariff_id", "t"]) { const v = from.get(k); if (v) to.set(k, v); }
  return new Response(null, { status: 303, headers: { Location: `${site}/#/offer?${to}`, "Cache-Control": "no-store" } });
}

/** Which old format this is, or null when a token is present and is not genuine. */
async function legacyFormat(t: unknown, lead: string, tariff: string): Promise<string | null> {
  if (t === undefined || t === null || t === "") return "unsigned";
  if (typeof t !== "string") return null;
  if ((await verifyExpiringLink(t, "accept-offer", lead, tariff)) !== "invalid") return "signed_expiring";
  return (await verifyLink(t, "accept-offer", lead, tariff)) ? "signed_no_expiry" : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method === "GET" || req.method === "HEAD") return toConfirmationPage(req);
  if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
  if (req.method !== "POST") return reply(405, "method_not_allowed");

  try {
    const body = await req.json().catch(() => null) as { offer_id?: unknown; lead_id?: unknown; tariff_id?: unknown; t?: unknown } | null;
    const { offer_id, lead_id, tariff_id, t } = body ?? {};
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey());

    if (offer_id === undefined || offer_id === null) {
      if (!isUuid(lead_id) || !isUuid(tariff_id)) return reply(400, "invalid");
      const format = await legacyFormat(t, lead_id, tariff_id);
      if (!format) return reply(403, "invalid");
      const { data: queued, error } = await supabase.rpc("offer_note_legacy_link", { p_lead_id: lead_id, p_tariff_id: tariff_id, p_format: format, p_signature_valid: format !== "unsigned" });
      if (error) return reply(500, "error");
      return queued === true ? reply(202, "needs_review") : reply(404, "not_found");
    }

    if (!isUuid(offer_id) || !isUuid(lead_id) || typeof t !== "string") return reply(400, "invalid");
    const link = await verifyExpiringLink(t, "accept-offer-v2", offer_id, lead_id);
    if (link === "expired") return reply(410, "expired");
    if (link !== "ok") return reply(403, "invalid");

    const { data, error } = await supabase.rpc("offer_accept", { p_offer_id: offer_id, p_lead_id: lead_id });
    const state = (data as { state?: unknown } | null)?.state;
    if (error || typeof state !== "string" || !(state in STATUS)) return reply(500, "error");
    return reply(STATUS[state], state);
  } catch (err: unknown) {
    console.error(`[accept-offer] Error: ${err instanceof Error ? err.name : "unknown"}`);
    return reply(500, "error");
  }
});
