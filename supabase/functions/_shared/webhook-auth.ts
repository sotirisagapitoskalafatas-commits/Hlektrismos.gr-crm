// Authentication helpers for callers that cannot send a Supabase JWT (provider webhooks, ad-platform senders).
// A shared secret is only as strong as its value, so a configured secret that is short or visibly repetitive is treated as NOT configured
// (the function then refuses every request). Secrets are compared in constant time, and a rotation never needs a gap: the new value goes in
// NAME, the old one in NAME_PREVIOUS until the sender has switched, then NAME_PREVIOUS is removed.
import { isStrongSecret, timingSafeEqual } from "./signed-link.ts";

/** The strong secrets configured for `name` (current first, then the previous one while a rotation is in progress). */
export function configuredSecrets(name: string): string[] {
  return [Deno.env.get(name) ?? "", Deno.env.get(`${name}_PREVIOUS`) ?? ""].filter(isStrongSecret);
}

/** True when `presented` equals ANY configured strong secret. Every candidate is compared (no early exit on the first match). */
export function matchesAnySecret(presented: string, secrets: string[]): boolean {
  let ok = false;
  for (const s of secrets) if (timingSafeEqual(presented, s)) ok = true;
  return ok && secrets.length > 0;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const enc = new TextEncoder();

/** HMAC-SHA256 over `${timestamp}.${rawBody}`, hex encoded: the payload format and encoding Vapi's HMAC credential offers (docs.vapi.ai/server-url/server-authentication). */
export async function hmacHex(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`)));
}

export const HMAC_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Verifies a timestamped HMAC. The timestamp must be an integer inside the tolerance window (seconds or milliseconds since the epoch are both
 * accepted: the provider's documentation does not state which), which bounds replay to the window; the signature must match for ANY configured secret.
 */
export async function verifyHmac(
  secrets: string[], signature: string | null, timestamp: string | null, rawBody: string, nowMs = Date.now(), toleranceMs = HMAC_TOLERANCE_MS,
): Promise<boolean> {
  if (!signature || !timestamp || secrets.length === 0 || !/^\d{9,14}$/.test(timestamp.trim())) return false;
  const t = Number(timestamp.trim());
  const tMs = t < 1e12 ? t * 1000 : t;
  if (Math.abs(nowMs - tMs) > toleranceMs) return false;
  let ok = false;
  for (const s of secrets) if (timingSafeEqual((await hmacHex(s, timestamp.trim(), rawBody)).toLowerCase(), signature.trim().toLowerCase())) ok = true;
  return ok;
}
