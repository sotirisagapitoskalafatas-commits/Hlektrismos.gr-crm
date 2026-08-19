import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    await this.write(headers + "\r\n" + body + "\r\n.");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, html, text, from_name } = await req.json();

    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, subject, and html or text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load SMTP config from crm_settings (service role query)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: setting } = await adminClient
      .from("crm_settings")
      .select("setting_value")
      .eq("setting_key", "email_config")
      .single();

    if (!setting?.setting_value?.smtp_host) {
      return new Response(JSON.stringify({ error: "SMTP not configured. Go to Settings → Email to set up." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = setting.setting_value;
    const smtpHost = cfg.smtp_host;
    const smtpPort = cfg.smtp_port || 587;
    const smtpUser = cfg.smtp_user || "";
    const smtpPass = cfg.smtp_password || "";
    const fromEmail = cfg.from_email || smtpUser;
    const fromLabel = from_name || cfg.from_name || "Hlektrismos.gr";
    const useTls = smtpPort === 465;

    // Build MIME message
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const mimeText = text || html?.replace(/<[^>]*>/g, "") || "";
    const mimeHtml = html || `<p>${text}</p>`;

    const headers = [
      `From: ${fromLabel} <${fromEmail}>`,
      `To: ${to}`,
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
      const recipients = Array.isArray(to) ? to : [to];
      for (const r of recipients) {
        await client.rcpt(r);
      }
      await client.data(headers, body);
    } finally {
      await client.quit();
    }

    // Log email in crm_settings audit (optional)
    await adminClient.from("crm_settings").upsert({
      setting_key: "email_log_last",
      setting_value: {
        to: Array.isArray(to) ? to : [to],
        subject,
        sent_at: new Date().toISOString(),
        sent_by: user.id,
      },
      category: "communications",
      description: "Last email sent log",
    }, { onConflict: "setting_key" });

    return new Response(JSON.stringify({ success: true, message: `Email sent to ${to}` }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
