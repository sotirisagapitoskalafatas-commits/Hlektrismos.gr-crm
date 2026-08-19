import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Minimal IMAP Client (Deno-native) ────────────────────────────────────────
class ImapClient {
  private conn: Deno.TcpConn | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private tag = 0;

  async connect(host: string, port: number) {
    const useTls = port === 993;
    if (useTls) {
      this.conn = await Deno.connectTls({ hostname: host, port });
    } else {
      this.conn = await Deno.connect({ hostname: host, port });
    }
    const streams = this.conn.readable.tee();
    this.reader = streams[0].getReader();
    this.writer = this.conn.writable.getWriter();
    const banner = await this.read();
    return banner;
  }

  private async read(): Promise<string> {
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await this.reader!.read();
      if (done) break;
      chunks.push(this.decoder.decode(value));
      const assembled = chunks.join("");
      // IMAP responses end with a tagged line or untagged continuation
      if (assembled.match(/\r\n[A-Z0-9]+\s+(OK|NO|BAD)\s/) || assembled.includes("+ OK")) break;
      if (chunks.length > 100) break; // safety
    }
    return chunks.join("");
  }

  private async write(cmd: string): Promise<void> {
    await this.writer!.write(this.encoder.encode(cmd + "\r\n"));
  }

  private nextTag(): string {
    return `A${++this.tag}`;
  }

  async login(user: string, pass: string) {
    const tag = this.nextTag();
    await this.write(`${tag} LOGIN ${user} ${pass}`);
    const resp = await this.read();
    if (!resp.includes(`${tag} OK`)) throw new Error(`LOGIN failed: ${resp.substring(0, 200)}`);
    return resp;
  }

  async select(mailbox: string) {
    const tag = this.nextTag();
    await this.write(`${tag} SELECT "${mailbox}"`);
    const resp = await this.read();
    if (!resp.includes(`${tag} OK`)) throw new Error(`SELECT failed: ${resp.substring(0, 200)}`);
    // Parse message count
    const match = resp.match(/(\d+)\s+EXISTS/);
    return { exists: match ? parseInt(match[1]) : 0, response: resp };
  }

  async search(criteria: string) {
    const tag = this.nextTag();
    await this.write(`${tag} SEARCH ${criteria}`);
    const resp = await this.read();
    const match = resp.match(/SEARCH\s+([\d\s]+)/);
    return match ? match[1].trim().split(/\s+/).filter(Boolean).map(Number) : [];
  }

  async fetch(uid: number, items: string = 'RFC822') {
    const tag = this.nextTag();
    await this.write(`${tag} FETCH ${uid} (${items})`);
    const resp = await this.read();
    return resp;
  }

  async fetchHeaders(uid: number) {
    const tag = this.nextTag();
    await this.write(`${tag} FETCH ${uid} (BODY[HEADER.FIELDS (FROM TO SUBJECT DATE)])`);
    const resp = await this.read();
    return resp;
  }

  async fetchBody(uid: number) {
    const tag = this.nextTag();
    await this.write(`${tag} FETCH ${uid} BODY[TEXT]`);
    const resp = await this.read();
    return resp;
  }

  async logout() {
    try {
      const tag = this.nextTag();
      await this.write(`${tag} LOGOUT`);
    } catch { /* ignore */ }
    try { this.reader?.cancel(); } catch { /* ignore */ }
    try { this.writer?.close(); } catch { /* ignore */ }
    try { this.conn?.close(); } catch { /* ignore */ }
  }
}

// ─── Parse email headers from IMAP response ────────────────────────────────────
function parseHeaders(raw: string) {
  const headers: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([\w-]+):\s*(.*)/);
    if (match) {
      headers[match[1].toLowerCase()] = match[2].trim();
    }
  }
  return {
    from: headers['from'] || '',
    to: headers['to'] || '',
    subject: headers['subject'] || '',
    date: headers['date'] || '',
  };
}

// ─── CORS ──────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    // Load IMAP config from crm_settings
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: setting } = await adminClient
      .from("crm_settings")
      .select("setting_value")
      .eq("setting_key", "email_config")
      .single();

    const cfg = setting?.setting_value || {};
    const imapHost = cfg.imap_host;
    const imapPort = cfg.imap_port || 993;
    const imapUser = cfg.imap_user || cfg.smtp_user || "";
    const imapPass = cfg.imap_password || cfg.smtp_password || "";

    if (!imapHost || !imapUser) {
      return new Response(JSON.stringify({ error: "IMAP not configured. Go to Settings → Email → Incoming (IMAP)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Connect via IMAP
    const client = new ImapClient();
    try {
      await client.connect(imapHost, imapPort);
      await client.login(imapUser, imapPass);
      const { exists } = await client.select("INBOX");

      // Search for unseen messages
      const unseenUids = await client.search("UNSEEN");

      // Fetch last 20 unseen max
      const uidsToFetch = unseenUids.slice(-20);
      const imported: any[] = [];

      for (const uid of uidsToFetch) {
        try {
          const headerRaw = await client.fetchHeaders(uid);
          const bodyRaw = await client.fetchBody(uid);
          const headers = parseHeaders(headerRaw);

          // Extract email address from "From: Name <email>" format
          const fromMatch = headers.from.match(/<([^>]+)>/) || [null, headers.from];
          const fromEmail = fromMatch[1]?.toLowerCase().trim() || '';
          const fromName = headers.from.replace(/<[^>]+>/, '').trim();

          // Store in crm_emails
          const emailId = `imap-${uid}-${Date.now()}`;
          await adminClient.from('crm_emails').upsert({
            id: emailId,
            from_email: fromEmail,
            to_email: imapUser,
            subject: headers.subject || '(no subject)',
            body: bodyRaw.substring(0, 10000), // truncate large bodies
            folder: 'inbox',
            is_read: false,
            created_at: headers.date ? new Date(headers.date).toISOString() : new Date().toISOString(),
          }, { onConflict: 'id' });

          // Check if sender matches an existing lead
          const { data: existingLead } = await adminClient
            .from('hlektrismos_leads')
            .select('id, first_name, last_name')
            .eq('email', fromEmail)
            .single();

          if (existingLead) {
            // Add to lead_notes as email_received
            await adminClient.from('lead_notes').insert({
              lead_id: existingLead.id,
              content: `📧 Email received from ${fromName} (${fromEmail}):\n\nSubject: ${headers.subject}\n\n${bodyRaw.substring(0, 2000)}`,
              author: 'Email System',
              note_type: 'email_received',
            });
            imported.push({ uid, from: fromEmail, subject: headers.subject, leadMatched: existingLead.first_name });
          } else {
            // Create new lead
            const nameParts = fromName.split(' ');
            await adminClient.from('hlektrismos_leads').insert({
              first_name: nameParts[0] || fromName,
              last_name: nameParts.slice(1).join(' ') || '',
              email: fromEmail,
              phone: '',
              region: '',
              customer_type: 'Επικοινωνία',
              provider: '',
              status: 'new',
              lawful_basis: 'legitimate-interest',
              customer_category: 'B2C',
              comments: `Auto-created from inbound email: ${headers.subject}`,
              source: 'Email Inbound',
            });
            imported.push({ uid, from: fromEmail, subject: headers.subject, leadMatched: 'NEW LEAD' });
          }
        } catch (e) {
          console.error(`Failed to process IMAP uid ${uid}:`, e);
        }
      }

      await client.logout();

      return new Response(JSON.stringify({
        success: true,
        message: `Processed ${imported.length} emails from INBOX (${exists} total)`,
        imported,
        timestamp: new Date().toISOString(),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } finally {
      await client.logout();
    }
  } catch (err) {
    console.error("fetch-emails error:", err);
    return new Response(JSON.stringify({ error: err.message || "IMAP connection failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
