import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

// ════════════════════════════════════════════════════════════════════════════
// TRANSACTIONAL EMAIL — confirms a form submission the recipient just made.
// Exempt from CAN-SPAM marketing rules ONLY while it stays purely
// transactional: no offers, prices, promotions, newsletters or cross-sell.
// Any commercial content must go through _shared/email-compliance.ts instead.
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { missingKeyResponse, secretKey } from "../_shared/keys.ts";
import { logAttempt, logResult } from "../_shared/communication-log.ts";
import { smtpDataBody } from "../_shared/email-safety.ts";
import { outreachLimitsFromEnv, reserveMessage } from "../_shared/outreach-limits.ts";
import { emailObjection } from "../_shared/outreach-gate.ts";
import { supabaseLoaders } from "../_shared/outreach-loaders.ts";
import { openSecureSmtp } from "../_shared/smtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, first_name, service: rawService } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
    const adminClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey());

    // Guard: only confirm a lead that genuinely submitted the website form in the last 15 min.
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: lead, error: leadError } = await adminClient
      .from("leads")
      .select("id, first_name, email, created_at, ack_sent_at")
      .eq("email", email)
      .eq("source", "website")
      .is("deleted_at", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (leadError) throw leadError; // not the same as "no recent lead": that answer would hide a missing column or a failed read

    if (!lead) {
      // Nothing to confirm silently — the form insert already went through.
      return new Response(JSON.stringify({ ok: true, skipped: "no recent lead" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Security fix (docs/ops/SECURITY_AUDIT.md F-03): ONE confirmation per lead. The public anon key can call this function, so
    // without this an attacker who submits the form with a victim's address could trigger unlimited e-mails from our domain
    // within the 15-minute window. leads.ack_sent_at (already in the table) is claimed atomically BEFORE sending; a failed
    // send releases the claim so a genuine retry still works.
    if (lead.ack_sent_at) {
      return new Response(JSON.stringify({ ok: true, skipped: "already confirmed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: claimed } = await adminClient
      .from("leads")
      .update({ ack_sent_at: new Date().toISOString() })
      .eq("id", lead.id)
      .is("ack_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) {
      return new Response(JSON.stringify({ ok: true, skipped: "already confirmed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const releaseClaim = async () => { await adminClient.from("leads").update({ ack_sent_at: null }).eq("id", lead.id); };

    // Reachable with the public key, so it counts like any other send: the per-person email limit, an objection, and a record. Any refusal skips the mail.
    const limits = outreachLimitsFromEnv();
    const objected = await emailObjection(supabaseLoaders(adminClient), email, null, "transactional");
    const entry = { action: "email_confirmation" as const, actor: { kind: "service" }, contact: { email } };
    if (!limits || objected || (await reserveMessage(adminClient, "public", "email_confirmation", { email }, limits)) || !(await logAttempt(adminClient, entry))) {
      await releaseClaim();
      return new Response(JSON.stringify({ ok: true, skipped: "not sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: setting } = await adminClient
      .from("crm_settings")
      .select("setting_value")
      .eq("setting_key", "email_config")
      .single();

    if (!setting?.setting_value?.smtp_host) {
      await releaseClaim();
      return new Response(JSON.stringify({ ok: false, error: "SMTP not configured" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cfg = setting.setting_value;
    const smtpHost = cfg.smtp_host;
    const smtpPort = cfg.smtp_port || 587;
    const smtpUser = cfg.smtp_user || "";
    const smtpPass = cfg.smtp_password || "";
    const fromEmail = cfg.from_email || smtpUser || "info@hlektrismos.gr";
    const fromLabel = cfg.from_name || "Hlektrismos.gr";

    // Audit fix: user-supplied values are escaped (HTML injection / phishing via our domain) and
    // stripped of CR/LF; `service` is also length-limited.
    const esc = (v: unknown) => String(v ?? "").replace(/[\r\n]+/g, " ").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
    const name = esc((first_name || lead.first_name || email.split("@")[0]).toString().slice(0, 60));
    const service = esc(rawService).slice(0, 60);
    const serviceLine = service ? ` για την υπηρεσία <strong>${service}</strong>` : "";

    const subject = "Λάβαμε το αίτημά σου — Hlektrismos.gr";
    const text = [
      `Γεια σου ${name},`,
      ``,
      `Ευχαριστούμε που επικοινώνησες με την Hlektrismos.gr — τους εξειδικευμένους συμβούλους ενέργειας.`,
      `Λάβαμε με επιτυχία το αίτημά σου${service ? ` για την υπηρεσία «${service}»` : ""}.`,
      ``,
      `Ένας σύμβουλός μας θα επικοινωνήσει μαζί σου σύντομα, για να συζητήσετε τις ανάγκες σου και να σου προτείνει τη βέλτιστη λύση — πάντα δωρεάν.`,
      ``,
      `Μέχρι τότε, μπορείς να μας βρεις στο +30 210 22 55 000 ή στο info@hlektrismos.gr.`,
      ``,
      `Με εκτίμηση,`,
      `Η ομάδα της Hlektrismos.gr`,
    ].join("\r\n");

    const html = [
      `<p>Γεια σου <strong>${name}</strong>,</p>`,
      `<p>Ευχαριστούμε που επικοινώνησες με την <strong>Hlektrismos.gr</strong> — τους εξειδικευμένους συμβούλους ενέργειας.</p>`,
      `<p>Λάβαμε με επιτυχία το αίτημά σου${serviceLine}.</p>`,
      `<p>Ένας σύμβουλός μας θα επικοινωνήσει μαζί σου <strong>σύντομα</strong>, για να συζητήσετε τις ανάγκες σου και να σου προτείνει τη βέλτιστη λύση — <strong>πάντα δωρεάν</strong>.</p>`,
      `<p>Μέχρι τότε, μπορείς να μας βρεις στο <a href="tel:+302102255000">+30 210 22 55 000</a> ή στο <a href="mailto:info@hlektrismos.gr">info@hlektrismos.gr</a>.</p>`,
      `<p style="margin-top:24px;color:#666">Με εκτίμηση,<br/>Η ομάδα της <strong>Hlektrismos.gr</strong></p>`,
    ].join("\r\n");

    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const headers = [
      `From: ${fromLabel} <${fromEmail}>`,
      `To: ${email}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      `MIME-Version: 1.0`,
      `Date: ${new Date().toUTCString()}`,
      `X-Mailer: Hlektrismos-CRM/1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].join("\r\n");

    const body = [
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      text,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      html,
      `--${boundary}--`,
    ].join("\r\n");

    // TLS or nothing (smtp.ts): the session opens before the password or the message is written.
    let client: Awaited<ReturnType<typeof openSecureSmtp>> | null = null;
    let dataStarted = false; // after DATA the outcome can be unknown: the claim then stays, so a retry cannot send a second mail
    try {
      client = await openSecureSmtp(smtpHost, smtpPort, "hlektrismos.gr");
      if (smtpUser && smtpPass) {
        await client.auth(smtpUser, smtpPass);
      }
      await client.mail(fromEmail);
      await client.rcpt(email);
      dataStarted = true;
      await client.data(smtpDataBody(headers + "\r\n\r\n" + body));
    } catch (sendErr) {
      // Before DATA nothing was delivered. After DATA the server may have accepted the mail: record "unknown" for reconciliation and keep the claim.
      await logResult(adminClient, entry, dataStarted ? "unknown" : "failed");
      if (!dataStarted) await releaseClaim();
      throw sendErr;
    } finally {
      await client?.quit();
    }
    await logResult(adminClient, entry, "sent");

    return new Response(JSON.stringify({ ok: true, message: "Confirmation email sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    // No SMTP/internal detail to the caller (the function is reachable with the public anon key); the detail stays in the log.
    console.error("send-lead-confirmation error:", err instanceof Error ? err.name : "error");
    return new Response(JSON.stringify({ ok: false, error: "Η αποστολή δεν ολοκληρώθηκε." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});