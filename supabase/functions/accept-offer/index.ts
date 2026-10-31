import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { missingKeyResponse, secretKey } from "../_shared/keys.ts";
import { verifyExpiringLink } from "../_shared/signed-link.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/** Escape database text before it is interpolated into the HTML page (same rules as src/lib/escape-html.ts). */
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"'`]/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" } as Record<string, string>
  )[c]);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const lead_id = url.searchParams.get("lead_id");
    const tariff_id = url.searchParams.get("tariff_id");
    const token = url.searchParams.get("t");
    const html = (status: number, body: string) =>
      new Response(`<html><body style="font-family:sans-serif;text-align:center;padding:50px">${body}</body></html>`,
        { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

    // Audit fix: the link must be HMAC-signed (see send-offer) and acceptance needs an
    // explicit POST, so mail scanners / link previews that GET the URL cannot convert a lead.
    const linkCheck = lead_id && tariff_id ? await verifyExpiringLink(token, "accept-offer", lead_id, tariff_id) : "invalid";
    if (lead_id && tariff_id && linkCheck === "expired") {
      return html(410, "<h2>⌛ Ο σύνδεσμος έχει λήξει</h2><p>Παρακαλώ ζητήστε νέα προσφορά από τον υπάλληλό σας.</p>");
    }
    if (lead_id && tariff_id && linkCheck !== "ok") {
      return html(403, "<h2>❌ Μη έγκυρος ή ληγμένος σύνδεσμος</h2><p>Παρακαλώ ζητήστε νέα προσφορά από τον σύμβουλό σας.</p>");
    }
    if (lead_id && tariff_id && req.method !== "POST") {
      const action = new URL(req.url).pathname + new URL(req.url).search;
      return html(200, `<h2>Επιβεβαίωση αποδοχής προσφοράς</h2><form method="POST" action="${escapeHtml(action)}"><button type="submit" style="padding:12px 28px;font-size:16px">Αποδέχομαι την προσφορά</button></form>`);
    }

    if (!lead_id || !tariff_id) {
      return new Response(
        `<html><body style="font-family:sans-serif;text-align:center;padding:50px">
          <h2>❌ Μη έγκυρος σύνδεσμος</h2>
          <p>Παρακαλώ ζητήστε νέα προσφορά από τον υπάλληλό σας.</p>
        </body></html>`,
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (!secretKey()) return missingKeyResponse("secret");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey());

    // 0. Current state, checked server-side (the signed link only proves the offer was issued, not that it may still be accepted):
    //    the lead exists and is not deleted or closed, and an offer for exactly this lead + tariff was really sent.
    const done = () => html(200, "<h2>✅ Η προσφορά έχει ήδη γίνει αποδεκτή</h2><p>Ευχαριστούμε! Θα επικοινωνήσουμε μαζί σας σύντομα.</p>");
    const { data: lead } = await supabase.from("hlektrismos_leads").select("id, status, deleted_at").eq("id", lead_id).maybeSingle();
    if (!lead || lead.deleted_at) return html(404, "<h2>❌ Η προσφορά δεν βρέθηκε</h2><p>Παρακαλώ ζητήστε νέα προσφορά από τον υπάλληλό σας.</p>");
    if (lead.status === "customer") return done(); // replay: already accepted, nothing is written again
    if (["lost", "unsubscribed", "do_not_contact"].includes(String(lead.status))) {
      return html(409, "<h2>❌ Η προσφορά δεν είναι πλέον διαθέσιμη</h2><p>Παρακαλώ επικοινωνήστε με τον υπάλληλό σας.</p>");
    }
    const { data: offered } = await supabase.from("crm_tasks").select("id").eq("lead_id", lead_id).eq("tariff_id", tariff_id)
      .ilike("title", "Προσφορά στάλθηκε%").limit(1);
    if (!offered || offered.length === 0) return html(404, "<h2>❌ Η προσφορά δεν βρέθηκε</h2><p>Παρακαλώ ζητήστε νέα προσφορά από τον υπάλληλό σας.</p>");

    // 1. One transition only: compare-and-set on the status read above, so two simultaneous requests cannot both convert.
    const { data: changed } = await supabase.from("hlektrismos_leads").update({
      status: "customer",
      converted_at: new Date().toISOString(),
    }).eq("id", lead_id).eq("status", lead.status).select("id");
    if (!changed || changed.length === 0) return done();

    // 2. Fetch tariff details for the thank-you page
    const { data: tariff } = await supabase
      .from("energy_tariffs")
      .select("provider_name, program_name")
      .eq("id", tariff_id)
      .single();

    // 3. Create completion task
    await supabase.from("crm_tasks").insert({
      lead_id,
      tariff_id,
      title: `Πελάτης αποδέχτηκε προσφορά: ${tariff?.provider_name || ''} — ${tariff?.program_name || ''}`,
      description: "Ο πελάτης αποδέχτηκε την προσφορά μέσω του συνδέσμου αποδοχής.",
      status: "completed",
      priority: "high",
      completed_at: new Date().toISOString(),
    });

    // 4. Log in lead_notes
    await supabase.from("lead_notes").insert({
      lead_id,
      content: `✅ Ο πελάτης αποδέχτηκε την προσφορά: ${tariff?.provider_name || ''} — ${tariff?.program_name || ''}`,
      author: "system",
      note_type: "offer_accepted",
    });

    // 5. Return thank-you HTML page with redirect
    return new Response(
      `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ευχαριστούμε! — Hlektrismos.gr</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #f0fdf4, #ecfdf5); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { max-width: 480px; margin: 0 auto; }
    h1 { color: #059669; font-size: 28px; margin-bottom: 12px; }
    p { color: #374151; font-size: 16px; line-height: 1.6; }
    .check { font-size: 64px; margin-bottom: 20px; }
    .brand { color: #0ea5e9; font-weight: 700; }
    .timer { color: #9ca3af; font-size: 13px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="check">✅</div>
    <h1>Ευχαριστούμε!</h1>
    <p>
      Η προσφορά αποδέχτηκε επιτυχώς.<br>
      Θα επικοινωνήσουμε μαζί σας σύντομα για την οριστικοποίηση<br>
      του νέου σας τιμολογίου <strong>${escapeHtml(tariff?.provider_name)} — ${escapeHtml(tariff?.program_name)}</strong>.
    </p>
    <p style="font-size:14px;color:#6b7280">
      Αν έχετε ερωτήσεις, τηλεφωνήστε μας στο <strong>210 123 4567</strong>.
    </p>
    <p class="brand">Hlektrismos.gr — Σας βοηθάμε να εξοικονομήστε! 🔋</p>
    <p class="timer">Ανακατεύθυνση σε 5 δευτερόλεπτα...</p>
  </div>
  <script>
    setTimeout(function() { window.location.href = 'https://hlektrismos.gr'; }, 5000);
  </script>
</body>
</html>`,
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  } catch (err: any) {
    console.error(`[accept-offer] Error: ${err.message}`);
    return new Response(
      `<html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h2>⚠️ Σφάλμα</h2>
        <p>Παρακαλώ επικοινωνήστε μαζί μας στο 210 123 4567.</p>
      </body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
});
