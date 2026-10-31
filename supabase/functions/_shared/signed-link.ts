// HMAC-signed links + constant-time comparison for public, no-login endpoints.
// Fails closed: without LINK_SIGNING_SECRET (min 16 chars) nothing validates.

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time string comparison (length leak only). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Token binds a purpose + parts, e.g. signLink("accept-offer", leadId, tariffId). */
export async function signLink(purpose: string, ...parts: string[]): Promise<string> {
  const secret = Deno.env.get("LINK_SIGNING_SECRET") ?? "";
  if (secret.length < 16) throw new Error("LINK_SIGNING_SECRET is not configured (min 16 chars)");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode([purpose, ...parts].join("|")))));
}

export async function verifyLink(token: string | null, purpose: string, ...parts: string[]): Promise<boolean> {
  if (!token) return false;
  try { return timingSafeEqual(await signLink(purpose, ...parts), token); } catch { return false; }
}

/** Longest lifetime an expiring token may claim; anything further out is refused even with a valid signature. */
export const MAX_LINK_TTL_SECONDS = 60 * 24 * 60 * 60;

/** Expiring token `<exp>.<sig>`: the signature covers the purpose, the expiry and the parts, so the expiry cannot be edited. */
export async function signExpiringLink(purpose: string, ttlSeconds: number, ...parts: string[]): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + Math.min(Math.max(1, Math.floor(ttlSeconds)), MAX_LINK_TTL_SECONDS);
  return `${exp}.${await signLink(purpose, String(exp), ...parts)}`;
}

export type LinkCheck = "ok" | "expired" | "invalid";

/** Verifies an expiring token. "expired" is only reported for a token whose signature is otherwise valid. */
export async function verifyExpiringLink(token: string | null, purpose: string, ...parts: string[]): Promise<LinkCheck> {
  if (!token) return "invalid";
  const dot = token.indexOf(".");
  if (dot < 1) return "invalid";
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(exp) || exp - now > MAX_LINK_TTL_SECONDS) return "invalid";
  let expected: string;
  try { expected = await signLink(purpose, String(exp), ...parts); } catch { return "invalid"; }
  if (!timingSafeEqual(expected, sig)) return "invalid";
  return exp < now ? "expired" : "ok";
}
