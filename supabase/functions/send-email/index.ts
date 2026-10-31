import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { prepareMarketingEmail } from "../_shared/email-compliance.ts";
import { authorizeRecord, getCaller, json, requireCapability, serviceClient, type RecordKind } from "../_shared/authz.ts";
import { callerKey, rateLimited } from "../_shared/limits.ts";
import { isOffice } from "../_shared/access.ts";
import { buildHeaders, EmailSafetyError, parseRecipient, safeDisplayName, smtpDataBody } from "../_shared/email-safety.ts";

// ─── Minimal SMTP Client (Deno-native) ───────────────────────────────────────
class SmtpClient {
  private conn: Deno.TcpConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();

  async connect(host: string, port: number, secure: boolean = false) {
    if (secure) {
      // Direct TLS on port 465
      this.conn = await Deno.connectTls({ hostname: host, port });
    } else {
      // Plain TCP, will upgrade to TLS via STARTTLS if needed
      this.conn = await Deno.connect({ hostname: host, port });
    }
    const streams = this.conn.readable.tee();
    this.reader = streams[0].getReader();
    this.writer = this.conn.writable.getWriter();
    const banner = await this.read();
    if (!banner.startsWith("220")) throw new Error(`SMTP banner: ${banner}`);
    return banner;
  }

  private async read(): Promise<string> {
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await this.reader!.read();
      if (done) break;
      chunks.push(this.decoder.decode(value));
      const assembled = chunks.join("");
      if (assembled.includes("\r\n")) break; // line received
    }
    return chunks.join("").replace(/\r\n$/, "");
  }

  private async write(cmd: string): Promise<void> {
    await this.writer!.write(this.encoder.encode(cmd + "\r\n"));
  }

  async ehlo(domain: string) {
    await this.write(`EHLO ${domain}`);
    return await this.read();
  }

  async startTls(host: string) {
    await this.write("STARTTLS");
    const resp = await this.read();
    if (!resp.startsWith("220")) throw new Error(`STARTTLS failed: ${resp}`);

    // Upgrade to TLS
    const transport = this.conn as unknown as { rid: number };
    const tlsConn = await Deno.connectTls({ hostname: host, transport: { rid: transport.rid } as any });

    // Re-create streams over TLS
    const streams = tlsConn.readable.tee();
    this.reader = streams[0].getReader();
    this.writer = tlsConn.writable.getWriter();
    this.conn = tlsConn;

    return resp;
  }

  async auth(user: string, pass: string) {
    const authString = btoa(`${user}:${pass}`);
    await this.write(`AUTH PLAIN ${authString}`);
    const resp = await this.read();
    if (!resp.startsWith("235")) throw new Error(`AUTH failed: ${resp}`);
    return resp;
  }

  async mail(from: string) {
    await this.write(`MAIL FROM:<${from}>`);
    const resp = await this.read();
    if (!resp.startsWith("250")) throw new Error(`MAIL FROM failed: ${resp}`);
    return resp;
  }

  async rcpt(to: string) {
    await this.write(`RCPT TO:<${to}>`);
    const resp = await this.read();
    if (!resp.startsWith("250")) throw new Error(`RCPT TO failed: ${resp}`);
    return resp;
  }

  async data(headers: string, body: string) {
    await this.write("DATA");
    const resp = await this.read();
    if (!resp.startsWith("354")) throw new Error(`DATA failed: ${resp}`);

    // Blank line between header block and body; CRLF + dot-stuffing so a "." line cannot end DATA early.
    await this.write(smtpDataBody(headers + "\r\n\r\n" + body) + "\r\n.");
    const endResp = await this.read();
    if (!endResp.startsWith("250")) throw new Error(`DATA send failed: ${endResp}`);
    return endResp;
  }

  async quit() {
    try { await this.write("QUIT"); } catch { /* ignore */ }
    try { this.reader?.cancel(); } catch { /* ignore */ }
    try { this.writer?.close(); } catch { /* ignore */ }
    try { this.conn?.close(); } catch { /* ignore */ }
  }
}

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
    if (refs.length === 1) {
      const [field, kind] = refs[0];
      const owned = await authorizeRecord(adminClient, caller, kind, payload[field], "communications.email.send");
      if (owned instanceof Response) return owned;
      const stored = await loadRecordEmail(adminClient, kind, owned);
      if (!stored) return json(422, { error: "The record has no valid email address" });
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
    const useTls = smtpPort === 465;

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

    // Send via SMTP
    const client = new SmtpClient();
    try {
      await client.connect(smtpHost, smtpPort, useTls);
      await client.ehlo("hlektrismos.gr");

      // Try STARTTLS if not already TLS and server supports it
      if (!useTls) {
        try {
          await client.startTls(smtpHost);
          await client.ehlo("hlektrismos.gr");
        } catch {
          // Server doesn't support STARTTLS, continue in plain
        }
      }

      if (smtpUser && smtpPass) {
        await client.auth(smtpUser, smtpPass);
      }

      await client.mail(fromEmail);
      await client.rcpt(recipient);
      await client.data(headers, body);
    } finally {
      await client.quit();
    }

    // Log email in crm_settings audit (optional)
    await adminClient.from("crm_settings").upsert({
      setting_key: "email_log_last",
      setting_value: {
        to: [recipient],
        subject,
        sent_at: new Date().toISOString(),
        sent_by: caller.kind === "user" ? caller.id : "service",
      },
      category: "communications",
      description: "Last email sent log",
    }, { onConflict: "setting_key" });

    return json(200, { success: true, message: `Email sent to ${recipient}` });
  } catch (err) {
    if (err instanceof EmailSafetyError) {
      return json(400, { error: err.message });
    }
    // No recipient / SMTP transcript in logs or responses.
    console.error("send-email error:", err instanceof Error ? err.name : "unknown");
    return json(500, { error: "Email could not be sent" });
  }
});

/** The address stored on the authorised record (normalised), or null when missing/invalid. */
async function loadRecordEmail(
  admin: ReturnType<typeof serviceClient>, kind: RecordKind, owned: Record<string, unknown>,
): Promise<string | null> {
  const table = { lead: "leads", legacy_lead: "hlektrismos_leads", customer: "customers", case: "customers" }[kind];
  // A case has no address of its own: use its customer's.
  const id = kind === "case" ? owned.customer_id : owned.id;
  if (typeof id !== "string" || !id) return null;
  const { data } = await admin.from(table).select("email").eq("id", id).maybeSingle();
  try {
    return data?.email ? parseRecipient(data.email) : null;
  } catch {
    return null;
  }
}
