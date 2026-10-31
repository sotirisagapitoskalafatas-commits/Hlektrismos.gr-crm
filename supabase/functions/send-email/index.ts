import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { prepareMarketingEmail } from "../_shared/email-compliance.ts";
import { authorizeRecord, getCaller, json, requireCapability, serviceClient, type RecordKind } from "../_shared/authz.ts";
import { callerKey, claimOnce, rateLimited, releaseOnce, textHash } from "../_shared/limits.ts";
import { isOffice } from "../_shared/access.ts";
import { logAttempt, logResult } from "../_shared/communication-log.ts";
import { buildHeaders, EmailSafetyError, parseRecipient, safeDisplayName, smtpDataBody } from "../_shared/email-safety.ts";
import { admitRequest, LIMITS_NOT_SET, outreachLimitsFromEnv, reserveMessage } from "../_shared/outreach-limits.ts";
import { emailObjection } from "../_shared/outreach-gate.ts";
import { supabaseLoaders } from "../_shared/outreach-loaders.ts";
import { openSecureSmtp, SmtpSecurityError } from "../_shared/smtp.ts";

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Staff-composed emails from the CRM. Treated as COMMERCIAL by default
// (suppression check, unsubscribe footer, postal address, List-Unsubscribe).
// Pass `transactional: true` ONLY for pure service messages (e.g. documents
// the customer asked for, appointment logistics) — never for promotions.
//
// Authorization (stage 2b): the caller needs communications.email.send. When the request names a record
// (lead_id = public.leads, legacy_lead_id = public.hlektrismos_leads, case_id, customer_id) the caller must be
// allowed to act on that record and the email goes ONLY to the address stored on it. Without a record only
// office callers (or the service role) may send, to one validated address. `transactional: true` (suppression
// bypass) is limited to office callers and the service role. The sender address is configuration only.
const RECORD_FIELDS: [string, RecordKind][] = [
  ["lead_id", "lead"], ["legacy_lead_id", "legacy_lead"], ["case_id", "case"], ["customer_id", "customer"],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const adminClient = serviceClient();
  const caller = await getCaller(req, adminClient);
  if (caller instanceof Response) return caller;
  const noCap = requireCapability(caller, "communications.email.send");
  if (noCap) return noCap;
  if (rateLimited(`send-email:${callerKey(caller)}`, 30, 60_000)) return json(429, { error: "Too many requests. Try again in a minute." });
  const limits = outreachLimitsFromEnv();
  if (!limits) return json(LIMITS_NOT_SET.status, { error: LIMITS_NOT_SET.error });
  const overQuota = await admitRequest(adminClient, callerKey(caller), "email_direct", limits);
  if (overQuota) return json(overQuota.status, { error: overQuota.error });

  try {
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") return json(400, { error: "Invalid JSON body" });
    const { to, subject, html, text, from_name, transactional } = payload;

    if (!subject || (!html && !text)) {
      return json(400, { error: "Missing required fields: to, subject, and html or text" });
    }
    if (transactional === true && !isOffice(caller)) {
      return json(403, { error: "Only office staff may send transactional (non-marketing) email" });
    }

    // Recipient: from the referenced record, or (office only) one validated address from the request.
    const refs = RECORD_FIELDS.filter(([field]) => payload[field] !== undefined && payload[field] !== null && payload[field] !== "");
    if (refs.length > 1) return json(400, { error: "Reference at most one record" });
    let recipient: string;
    let recipientPhone: string | null = null; // an objection may be on the phone number: a spoken refusal is
    let recordCustomer: string | null = null;
    if (refs.length === 1) {
      const [field, kind] = refs[0];
      const owned = await authorizeRecord(adminClient, caller, kind, payload[field], "communications.email.send");
      if (owned instanceof Response) return owned;
      const contact = await loadRecordEmail(adminClient, kind, owned);
      const stored = contact?.email;
      if (!stored) return json(422, { error: "The record has no valid email address" });
      recipientPhone = contact.phone;
      if (kind === "customer" || kind === "case") recordCustomer = String(kind === "case" ? owned.customer_id : owned.id);
      if (to !== undefined && to !== null && to !== "") {
        let requested = "";
        try { requested = parseRecipient(to); } catch { /* treated as a mismatch */ }
        if (requested !== stored) return json(400, { error: "Recipient does not match the record's email address" });
      }
      recipient = stored;
    } else {
      if (!isOffice(caller)) {
        return json(403, { error: "Reference the lead, case or customer you are emailing" });
      }
      if (!to) return json(400, { error: "Missing required fields: to, subject, and html or text" });
      if (Array.isArray(to)) return json(400, { error: "Send to one recipient at a time" });
      recipient = parseRecipient(to);
    }

    // Load SMTP config from crm_settings (service role query)
    const { data: setting } = await adminClient
      .from("crm_settings")
      .select("setting_value")
      .eq("setting_key", "email_config")
      .single();

    if (!setting?.setting_value?.smtp_host) {
      return json(400, { error: "SMTP not configured. Go to Settings → Email to set up." });
    }

    const cfg = setting.setting_value;
    const smtpHost = cfg.smtp_host;
    const smtpPort = cfg.smtp_port || 587;
    const smtpUser = cfg.smtp_user || "";
    const smtpPass = cfg.smtp_password || "";
    let fromEmail: string;
    try {
      fromEmail = parseRecipient(cfg.from_email || smtpUser);
    } catch {
      return json(400, { error: "Sender address is not configured correctly. Go to Settings → Email." });
    }
    const fromLabel = safeDisplayName(from_name, safeDisplayName(cfg.from_name, "Hlektrismos.gr"));

    // A recorded «δεν θέλω επικοινωνία» stops this mail too. Unreadable objections stop it as well: refusal is the safe answer.
    const objection = await emailObjection(supabaseLoaders(adminClient), recipient, recipientPhone, transactional === true ? "transactional" : "promotional");
    if (objection === "unknown") return json(503, { error: "Objections cannot be checked right now. Nothing was sent." });
    if (objection === "objected") return json(409, { error: "This person has asked not to be contacted." });

    // Commercial-email compliance (skipped only for explicit transactional mail).
    let outHtml: string | undefined = html;
    let outText: string | undefined = text;
    const extraHeaders: Record<string, string> = {};
    if (transactional !== true) {
      const prepared = await prepareMarketingEmail(adminClient, recipient, {
        html: html ?? undefined,
        text: text ?? html?.replace(/<[^>]*>/g, "") ?? "",
      });
      if (prepared.suppressed) {
        return json(409, { error: "Recipient has unsubscribed from commercial emails." });
      }
      outHtml = prepared.html;
      outText = prepared.text;
      Object.assign(extraHeaders, prepared.headers);
    }

    // Build MIME message
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const mimeText = outText || outHtml?.replace(/<[^>]*>/g, "") || "";
    const mimeHtml = outHtml || `<p>${outText}</p>`;

    // Every header value is validated (no CR/LF injection); Subject/From name are RFC 2047 encoded.
    const headers = buildHeaders({
      from: fromEmail,
      fromName: fromLabel,
      to: recipient,
      subject: String(subject),
      extra: {
        "MIME-Version": "1.0",
        "Date": new Date().toUTCString(),
        "X-Mailer": "Hlektrismos-CRM/1.0",
        ...extraHeaders,
        "Content-Type": `multipart/alternative; boundary="${boundary}"`,
      },
    });

    const body = [
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      mimeText,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      mimeHtml,
      `--${boundary}--`,
    ].join("\r\n");

    // A double click or a retry of the same mail to the same person inside ten minutes stops here.
    const onceKey = `send-once:email_direct:${await textHash(recipient, subject, mimeText)}`;
    const once = await claimOnce(adminClient, onceKey, 600);
    if (once) return json(once.status === 429 ? 409 : once.status, { error: "This email was just sent." });
    const over = await reserveMessage(adminClient, callerKey(caller), "email_direct", { email: recipient }, limits);
    if (over) return json(over.status, { error: over.error });
    const [recordField, recordKind] = refs[0] ?? [];
    const entry = {
      action: "email_direct" as const, actor: caller, contact: { email: recipient },
      lead_id: recordKind === "lead" || recordKind === "legacy_lead" ? String(payload[recordField as string]) : null,
      customer_id: recordCustomer,
    };
    if (!(await logAttempt(adminClient, entry))) return json(500, { error: "Email could not be recorded" });

    // Send via SMTP: TLS or nothing (smtp.ts). The session opens before the password or the message is written.
    let client: Awaited<ReturnType<typeof openSecureSmtp>> | null = null;
    try {
      client = await openSecureSmtp(smtpHost, smtpPort, "hlektrismos.gr");
      if (smtpUser && smtpPass) {
        await client.auth(smtpUser, smtpPass);
      }

      await client.mail(fromEmail);
      await client.rcpt(recipient);
      await client.data(smtpDataBody(headers + "\r\n\r\n" + body));
    } catch (sendErr) {
      await logResult(adminClient, entry, "failed");
      if (sendErr instanceof SmtpSecurityError) await releaseOnce(adminClient, onceKey); // refused before anything was written, so a retry is not a duplicate
      throw sendErr;
    } finally {
      await client?.quit();
    }
    await logResult(adminClient, entry, "sent");

    return json(200, { success: true, message: `Email sent to ${recipient}` });
  } catch (err) {
    if (err instanceof EmailSafetyError) {
      return json(400, { error: err.message });
    }
    if (err instanceof SmtpSecurityError) {
      console.error("send-email refused: no TLS");
      return json(502, { error: "The mail server does not offer a secure connection. Nothing was sent." });
    }
    // No recipient / SMTP transcript in logs or responses.
    console.error("send-email error:", err instanceof Error ? err.name : "unknown");
    return json(500, { error: "Email could not be sent" });
  }
});

/** The address stored on the authorised record (normalised), or null when missing/invalid. */
async function loadRecordEmail(
  admin: ReturnType<typeof serviceClient>, kind: RecordKind, owned: Record<string, unknown>,
): Promise<{ email: string; phone: string | null } | null> {
  const table = { lead: "leads", legacy_lead: "hlektrismos_leads", customer: "customers", case: "customers" }[kind];
  // A case has no address of its own: use its customer's.
  const id = kind === "case" ? owned.customer_id : owned.id;
  if (typeof id !== "string" || !id) return null;
  const { data } = await admin.from(table).select("email, phone, deleted_at").eq("id", id).maybeSingle();
  try {
    return data?.email && !data.deleted_at ? { email: parseRecipient(data.email), phone: data.phone ?? null } : null;
  } catch {
    return null;
  }
}
