// Minimal SMTP client (Deno-native) shared by the functions that send mail. It FAILS CLOSED: credentials and message content are only ever
// written on a TLS connection. There is no plain-text mode and no setting that enables one.
//   port 465                implicit TLS (certificate checked for `host` by Deno)
//   any other port          the server must advertise STARTTLS and the upgrade must succeed, otherwise SmtpSecurityError and nothing is sent
// Supabase blocks outbound 25 and 587 from Edge Functions (docs: guides/functions/limits), so a working configuration here is 465, or a
// provider's alternative STARTTLS port.
// The session uses conn.read/conn.write rather than the streams: a TcpConn whose streams are locked cannot be handed to Deno.startTls.

/** Secure transport was required and is not available. Never caught to continue: the send is abandoned. */
export class SmtpSecurityError extends Error {
  constructor(reason: string) {
    super(`Refusing to send without TLS: ${reason}`);
    this.name = "SmtpSecurityError";
  }
}

const MAX_REPLY_BYTES = 64 * 1024;
const enc = new TextEncoder();
const dec = new TextDecoder();

export class SmtpClient {
  private conn: Deno.Conn | null = null;
  private buffer = "";
  private secure = false;

  async connect(host: string, port: number) {
    if (port === 465) {
      this.conn = await Deno.connectTls({ hostname: host, port });
      this.secure = true;
    } else {
      this.conn = await Deno.connect({ hostname: host, port });
    }
    const banner = await this.read();
    if (!banner.startsWith("220")) throw new Error("SMTP banner refused");
    return banner;
  }

  /** One complete reply: continuation lines ("250-") up to the final line ("250 "). */
  private async read(): Promise<string> {
    const chunk = new Uint8Array(4096);
    while (true) {
      const lines = this.buffer.split("\r\n");
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3}( |$)/.test(lines[i])) {
          this.buffer = lines.slice(i + 1).join("\r\n");
          return lines.slice(0, i + 1).join("\r\n");
        }
      }
      if (this.buffer.length > MAX_REPLY_BYTES) throw new Error("SMTP reply too long");
      const n = await this.conn!.read(chunk);
      if (n === null) throw new Error("SMTP connection closed");
      this.buffer += dec.decode(chunk.subarray(0, n), { stream: true });
    }
  }

  private async write(cmd: string): Promise<void> {
    const bytes = enc.encode(cmd + "\r\n");
    let sent = 0;
    while (sent < bytes.length) sent += await this.conn!.write(bytes.subarray(sent));
  }

  async ehlo(domain: string) {
    await this.write(`EHLO ${domain}`);
    const reply = await this.read();
    if (!reply.startsWith("250")) throw new Error("EHLO refused");
    return reply;
  }

  async startTls(host: string) {
    await this.write("STARTTLS");
    const reply = await this.read();
    if (!reply.startsWith("220")) throw new SmtpSecurityError("the server refused STARTTLS");
    // Anything already buffered arrived before the upgrade, so it could have been injected in plain text. It must not be read as a TLS reply.
    if (this.buffer.length > 0) throw new SmtpSecurityError("unexpected data before the TLS upgrade");
    try {
      this.conn = await Deno.startTls(this.conn as Deno.TcpConn, { hostname: host });
    } catch {
      throw new SmtpSecurityError("the TLS upgrade failed");
    }
    this.secure = true;
    return reply;
  }

  private requireSecure() {
    if (!this.secure) throw new SmtpSecurityError("the connection is not encrypted");
  }

  /** AUTH PLAIN (RFC 4616): base64 of NUL user NUL password, UTF-8 encoded. */
  async auth(user: string, pass: string) {
    this.requireSecure();
    let bin = "";
    for (const b of enc.encode(`\0${user}\0${pass}`)) bin += String.fromCharCode(b);
    await this.write(`AUTH PLAIN ${btoa(bin)}`);
    if (!(await this.read()).startsWith("235")) throw new Error("AUTH failed");
  }

  async mail(from: string) {
    this.requireSecure();
    await this.write(`MAIL FROM:<${from}>`);
    if (!(await this.read()).startsWith("250")) throw new Error("MAIL FROM failed");
  }

  async rcpt(to: string) {
    this.requireSecure();
    await this.write(`RCPT TO:<${to}>`);
    if (!(await this.read()).startsWith("250")) throw new Error("RCPT TO failed");
  }

  /** `message` is the complete DATA body, already CRLF-normalised and dot-stuffed (email-safety.ts smtpDataBody). */
  async data(message: string) {
    this.requireSecure();
    await this.write("DATA");
    if (!(await this.read()).startsWith("354")) throw new Error("DATA failed");
    await this.write(`${message}\r\n.`);
    if (!(await this.read()).startsWith("250")) throw new Error("DATA send failed");
  }

  async quit() {
    try { if (this.secure) await this.write("QUIT"); } catch { /* ignore */ }
    try { this.conn?.close(); } catch { /* ignore */ }
  }
}

/** Connects and negotiates TLS. On any failure the connection is closed and the error thrown; nothing was authenticated or sent. */
export async function openSecureSmtp(host: string, port: number, domain: string): Promise<SmtpClient> {
  const client = new SmtpClient();
  try {
    await client.connect(host, port);
    const capabilities = await client.ehlo(domain);
    if (port !== 465) {
      if (!/^250[ -]STARTTLS\b/im.test(capabilities)) throw new SmtpSecurityError("the server does not offer STARTTLS");
      await client.startTls(host);
      await client.ehlo(domain); // capabilities seen before TLS are discarded (RFC 3207)
    }
    return client;
  } catch (e) {
    await client.quit();
    throw e;
  }
}
