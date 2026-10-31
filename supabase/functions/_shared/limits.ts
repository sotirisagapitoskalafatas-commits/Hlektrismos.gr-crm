// Input limits and rate limits for functions that send messages, place calls or spend paid quota.
// rateLimited() is per function instance (in memory) and only a cheap first filter. claimOnce() is a shared "only once for this long" lock in the
// database (phase1/21b, public.claim_once), so every instance sees it, and it FAILS CLOSED.
// The volume limits are in outreach-limits.ts. The batch cap below, the consent / frequency gate (outreach-gate.ts) and the OUTREACH_ENABLED
// switches apply as well.

/** Hard ceiling on the recipients of one request, whatever OUTREACH_LIMITS says. */
export const MAX_BATCH = 100;

/** null when the batch is acceptable, otherwise the status and message to answer with. `max` is the configured limit for this channel. */
export function badBatch(leads: unknown, max: number = MAX_BATCH): { status: number; error: string } | null {
  const cap = Math.min(max, MAX_BATCH);
  if (!Array.isArray(leads)) return { status: 400, error: "leads must be an array" };
  if (leads.length === 0) return { status: 400, error: "leads must not be empty" };
  if (leads.length > cap) return { status: 413, error: `At most ${cap} recipients per request` };
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** The trimmed string when it is a string of min..max characters, else null. */
export function cleanText(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= min && t.length <= max ? t : null;
}

/** A stable per-caller key: the user id, or "service" for an internal component. */
export function callerKey(c: { kind: string; id?: string }): string {
  return c.kind === "user" && c.id ? c.id : "service";
}

const buckets = new Map<string, number[]>();

/** True when `key` has already made `limit` attempts within `windowMs`; otherwise records this attempt and returns false. */
export function rateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) { buckets.set(key, recent); return true; }
  recent.push(now);
  buckets.set(key, recent);
  return false;
}

/** Test helper: forget every recorded attempt. */
export function resetRateLimits(): void { buckets.clear(); }

/** Minimal client shape: the service-role client of the calling function. */
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

/** A stable, non-reversible key for "the same text": lets a once-lock tell a retry from a different message. */
export async function textHash(...parts: unknown[]): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.map(String).join("\u0000")));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Takes the lock on `key` for `seconds`. Returns null when this caller holds it, otherwise the status and message to answer with:
 * 429 already taken, 503 when the lock cannot be reached (nothing is sent when it cannot be checked).
 */
export async function claimOnce(admin: RpcClient, key: string, seconds: number): Promise<{ status: number; error: string } | null> {
  try {
    const { data, error } = await admin.rpc("claim_once", { p_key: key, p_seconds: seconds });
    if (error) return { status: 503, error: "Sending is unavailable right now. Try again later." };
    return data === true ? null : { status: 429, error: "This was just sent." };
  } catch {
    return { status: 503, error: "Sending is unavailable right now. Try again later." };
  }
}

/** Gives the lock back after a send that definitely did not happen. Best effort: if this fails, the lock simply expires. */
export async function releaseOnce(admin: RpcClient, key: string): Promise<void> {
  try { await admin.rpc("release_once", { p_key: key }); } catch { /* it expires by itself */ }
}
