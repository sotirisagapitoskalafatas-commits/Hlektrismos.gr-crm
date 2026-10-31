import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { missingKeyResponse, secretKey } from "../_shared/keys.ts";
import { isUuid } from "../_shared/limits.ts";
import { verifyExpiringLink } from "../_shared/signed-link.ts";

// The customer's acceptance of an offer. POST with JSON only: Supabase rewrites text/html GET responses to text/plain
// (docs: guides/functions/http-methods), so the confirmation page lives on the CRM site (src/pages/OfferAccept.tsx) and calls this.
// A GET changes nothing, so mail scanners and link previews cannot accept an offer.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (status: number, state: string) =>
  new Response(JSON.stringify({ state }), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
  if (req.method !== "POST") return reply(405, "method_not_allowed");

  try {
    const body = await req.json().catch(() => null) as { lead_id?: unknown; tariff_id?: unknown; t?: unknown } | null;
    const { lead_id, tariff_id, t } = body ?? {};
    if (!isUuid(lead_id) || !isUuid(tariff_id) || typeof t !== "string") return reply(400, "invalid");

    const link = await verifyExpiringLink(t, "accept-offer", lead_id, tariff_id);
    if (link === "expired") return reply(410, "expired");
    if (link !== "ok") return reply(403, "invalid");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey());

    // Current state, checked server-side: the signed link only proves the offer was issued, not that it may still be accepted.
    const { data: lead, error: leadError } = await supabase.from("hlektrismos_leads").select("id, status, deleted_at").eq("id", lead_id).maybeSingle();
    if (leadError) return reply(500, "error");
    if (!lead || lead.deleted_at) return reply(404, "not_found");
    if (lead.status === "customer") return reply(200, "already_accepted"); // replay: nothing is written again
    if (["lost", "unsubscribed", "do_not_contact"].includes(String(lead.status))) return reply(409, "closed");

    const { data: offered, error: offeredError } = await supabase.from("crm_tasks").select("id").eq("lead_id", lead_id).eq("tariff_id", tariff_id)
      .ilike("title", "Προσφορά στάλθηκε%").limit(1);
    if (offeredError) return reply(500, "error");
    if (!offered || offered.length === 0) return reply(404, "not_found");

    // One transition only: compare-and-set on the status read above, so two simultaneous requests cannot both convert.
    const { data: changed, error: changeError } = await supabase.from("hlektrismos_leads").update({
      status: "customer",
      converted_at: new Date().toISOString(),
    }).eq("id", lead_id).eq("status", lead.status).select("id");
    if (changeError) return reply(500, "error");
    if (!changed || changed.length === 0) return reply(200, "already_accepted");

    const { data: tariff } = await supabase.from("energy_tariffs").select("provider_name, program_name").eq("id", tariff_id).maybeSingle();

    await supabase.from("crm_tasks").insert({
      lead_id,
      tariff_id,
      title: `Πελάτης αποδέχτηκε προσφορά: ${tariff?.provider_name || ''} — ${tariff?.program_name || ''}`,
      description: "Ο πελάτης αποδέχτηκε την προσφορά μέσω του συνδέσμου αποδοχής.",
      status: "completed",
      priority: "high",
      completed_at: new Date().toISOString(),
    });

    await supabase.from("lead_notes").insert({
      lead_id,
      content: `✅ Ο πελάτης αποδέχτηκε την προσφορά: ${tariff?.provider_name || ''} — ${tariff?.program_name || ''}`,
      author: "system",
      note_type: "offer_accepted",
    });

    return reply(200, "accepted");
  } catch (err: unknown) {
    console.error(`[accept-offer] Error: ${err instanceof Error ? err.name : "unknown"}`);
    return reply(500, "error");
  }
});
