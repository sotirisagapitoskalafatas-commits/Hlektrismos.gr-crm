import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
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
      this.conn = await Deno.connectTls({ hostname: host, port });
    } else {
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
      if (assembled.includes("\r\n")) break;
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
    const transport = this.conn as unknown as { rid: number };
    const tlsConn = await Deno.connectTls({ hostname: host, transport: { rid: transport.rid } as any });
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, first_name, service } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Guard: only confirm a lead that genuinely submitted the website form in the last 15 min.
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: lead } = await adminClient
      .from("leads")
      .select("id, first_name, email, created_at")
      .eq("email", email)
      .eq("source", "website")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lead) {
      // Nothing to confirm silently — the form insert already went through.
      return new Response(JSON.stringify({ ok: true, skipped: "no recent lead" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: setting } = await adminClient
      .from("crm_settings")
      .select("setting_value")
      .eq("setting_key", "email_config")
      .single();

    if (!setting?.setting_value?.smtp_host) {
      return new Response(JSON.stringify({ ok: false, error: "SMTP not configured" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cfg = setting.setting_value;
    const smtpHost = cfg.smtp_host;
    const smtpPort = cfg.smtp_port || 587;
    const smtpUser = cfg.smtp_user || "";
    const smtpPass = cfg.smtp_password || "";
    const fromEmail = cfg.from_email || smtpUser || "info@hlektrismos.gr";
    const fromLabel = cfg.from_name || "Hlektrismos.gr";
    const useTls = smtpPort === 465;

    const name = (first_name || lead.first_name || email.split("@")[0]).toString().slice(0, 60);
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

    const client = new SmtpClient();
    try {
      await client.connect(smtpHost, smtpPort, useTls);
      await client.ehlo("hlektrismos.gr");
      if (!useTls) {
        try {
          await client.startTls(smtpHost);
          await client.ehlo("hlektrismos.gr");
        } catch { /* server doesn't support STARTTLS */ }
      }
      if (smtpUser && smtpPass) {
        await client.auth(smtpUser, smtpPass);
      }
      await client.mail(fromEmail);
      await client.rcpt(email);
      await client.data(headers, body);
    } finally {
      await client.quit();
    }

    return new Response(JSON.stringify({ ok: true, message: "Confirmation email sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("send-lead-confirmation error:", err);
    return new Response(JSON.stringify({ ok: false, error: err.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});