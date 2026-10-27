// Email header and recipient safety for every function that builds an email (dependency-free, unit-tested).
//
// * Header values (Subject, display names, Reply-To …) must not contain CR, LF or other control characters:
//   one "\r\n" in a value lets the caller inject extra headers (Bcc:) or a whole second message.
// * Recipients are single, syntactically valid addresses (no lists, no display-name tricks, no control chars).
// * The sender identity is configuration, never request input: callers pass a configured From address and may
//   only choose a sanitised display name.
// * Raw SMTP bodies are dot-stuffed and use CRLF line endings, so a "." line cannot end the DATA phase early.

export class EmailSafetyError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "EmailSafetyError"; }
}

// deno-lint-ignore no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Throws if a header value could break out of its header. */
export function assertHeaderSafe(value: string, field = "header"): string {
  if (typeof value !== "string") throw new EmailSafetyError("bad_header", `${field} must be text`);
  if (CONTROL.test(value)) throw new EmailSafetyError("header_injection", `${field} contains control characters`);
  if (value.length > 998) throw new EmailSafetyError("bad_header", `${field} too long`);
  return value;
}

// Pragmatic RFC 5321 subset: one local@domain, no quotes, no comments, a dotted domain with a 2+ letter TLD.
const ADDRESS = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** A single, valid, lower-cased address. Rejects lists ("a@x.gr, b@y.gr"), display names and injection. */
export function parseRecipient(raw: unknown): string {
  if (typeof raw !== "string") throw new EmailSafetyError("bad_recipient", "Recipient must be text");
  const v = raw.trim();
  if (CONTROL.test(v)) throw new EmailSafetyError("header_injection", "Recipient contains control characters");
  if (v.length > 254 || !ADDRESS.test(v)) throw new EmailSafetyError("bad_recipient", "Not a single valid email address");
  return v.toLowerCase();
}

/** Display name for From/To: control characters removed, quotes and angle brackets dropped, length-capped. */
export function safeDisplayName(raw: unknown, fallback: string): string {
  const v = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 78) : "";
  return v || fallback;
}

/** RFC 2047 encoded-word for non-ASCII header text (after the safety check). */
export function encodeHeaderWord(value: string): string {
  assertHeaderSafe(value);
  // deno-lint-ignore no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

/** Body for raw SMTP DATA: CRLF line endings and dot-stuffing (RFC 5321 §4.5.2). */
export function smtpDataBody(body: string): string {
  return body.replace(/\r\n|\r|\n/g, "\r\n").split("\r\n").map((l) => (l.startsWith(".") ? "." + l : l)).join("\r\n");
}

/**
 * Builds the header block of a message from validated parts only. `from` is the configured sender address;
 * `fromName` is a sanitised display name. Throws on any unsafe value.
 */
export function buildHeaders(p: { from: string; fromName?: string; to: string; subject: string; replyTo?: string; extra?: Record<string, string> }): string {
  const from = parseRecipient(p.from);
  const to = parseRecipient(p.to);
  const lines = [
    `From: ${encodeHeaderWord(safeDisplayName(p.fromName, "Hlektrismos.gr"))} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeaderWord(assertHeaderSafe(p.subject, "Subject"))}`,
  ];
  if (p.replyTo) lines.push(`Reply-To: <${parseRecipient(p.replyTo)}>`);
  for (const [k, v] of Object.entries(p.extra ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,40}$/.test(k) || /^(from|to|cc|bcc|subject|reply-to|sender|return-path)$/i.test(k)) {
      throw new EmailSafetyError("bad_header", `Header ${k} not allowed`);
    }
    lines.push(`${k}: ${assertHeaderSafe(v, k)}`);
  }
  return lines.join("\r\n");
}
