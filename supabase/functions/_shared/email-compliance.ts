// Commercial-email compliance (CAN-SPAM 15 U.S.C. 7704, Greek law 3471/2006
// art. 11, RFC 8058 one-click unsubscribe).
//
// EVERY commercial / marketing email (campaigns, offers, promos, re-engagement,
// 1:1 sales emails) MUST go through prepareMarketingEmail() right before it is
// sent. It:
//   1. refuses to send if the address is on public.email_suppressions,
//   2. appends the unsubscribe link + physical postal address footer,
//   3. returns List-Unsubscribe and List-Unsubscribe-Post headers.
// Unsubscribes take effect immediately (well inside the 10-business-day limit)
// because the suppression list is checked before every single send.
//
// Transactional emails (form-submission confirmations, appointment
// confirmations, Supabase auth emails) are exempt and are marked
// "TRANSACTIONAL" at the send site. Do not add promotional content to them.
// deno-lint-ignore-file no-explicit-any

export const POSTAL_ADDRESS =
  Deno.env.get("COMPANY_POSTAL_ADDRESS") ?? "Hlektrismos.gr, Ζαλοκώστα 8, 10671 Αθήνα, Ελλάδα";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(pad), (c) => c.charCodeAt(0)));
}

async function hmac(data: string): Promise<string> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET");
  // Fail closed: no secret means no valid unsubscribe link, so no marketing send.
  if (!secret || secret.length < 16) throw new Error("UNSUBSCRIBE_SECRET is not configured (min 16 chars)");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export function normalizeEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

/** Signed, non-expiring unsubscribe URL for one address. */
export async function unsubscribeUrl(email: string): Promise<string> {
  const e = normalizeEmail(email);
  const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/unsubscribe`;
  return `${base}?e=${b64url(enc.encode(e))}&t=${await hmac(e)}`;
}

/** Returns the email address if the token is valid, otherwise null. */
export async function verifyUnsubscribeToken(e: string | null, t: string | null): Promise<string | null> {
  if (!e || !t) return null;
  let email: string;
  try { email = normalizeEmail(fromB64url(e)); } catch { return null; }
  const expected = await hmac(email);
  if (expected.length !== t.length) return null;
  let diff = 0;
  for (let i = 0; i < t.length; i++) diff |= expected.charCodeAt(i) ^ t.charCodeAt(i);
  return diff === 0 ? email : null;
}

export async function isSuppressed(admin: any, email: string): Promise<boolean> {
  const { data, error } = await admin
    .from("email_suppressions")
    .select("email")
    .eq("email", normalizeEmail(email))
    .maybeSingle();
  // Fail closed: if the list cannot be read, treat the address as suppressed.
  if (error) return true;
  return !!data;
}

export async function suppress(admin: any, email: string, source: string): Promise<void> {
  await admin.from("email_suppressions").upsert(
    { email: normalizeEmail(email), reason: "unsubscribe", source },
    { onConflict: "email", ignoreDuplicates: true },
  );
}

function footerHtml(url: string): string {
  return `
<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px" />
<p style="font-size:12px;line-height:1.6;color:#64748b;font-family:Arial,sans-serif;margin:0">
  Λαμβάνετε αυτό το email από το ${POSTAL_ADDRESS}.<br />
  Δεν θέλετε άλλα τέτοια μηνύματα; <a href="${url}" style="color:#0369a1">Απεγγραφή με ένα κλικ</a>.
</p>`;
}

function footerText(url: string): string {
  return `\n\n—\nΛαμβάνετε αυτό το email από το ${POSTAL_ADDRESS}.\nΑπεγγραφή με ένα κλικ: ${url}\n`;
}

export type PreparedEmail =
  | { suppressed: true }
  | { suppressed: false; html?: string; text?: string; headers: Record<string, string>; unsubscribeUrl: string };

/** Call immediately before sending ANY commercial email. */
export async function prepareMarketingEmail(
  admin: any,
  to: string,
  content: { html?: string; text?: string },
): Promise<PreparedEmail> {
  if (await isSuppressed(admin, to)) return { suppressed: true };
  const url = await unsubscribeUrl(to);
  return {
    suppressed: false,
    unsubscribeUrl: url,
    html: content.html !== undefined
      ? (content.html.includes("</body>") ? content.html.replace("</body>", `${footerHtml(url)}</body>`) : content.html + footerHtml(url))
      : undefined,
    text: content.text !== undefined ? content.text + footerText(url) : undefined,
    headers: {
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
