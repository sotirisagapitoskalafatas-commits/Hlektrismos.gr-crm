// Input limits and rate limits for functions that send messages, place calls or spend paid quota.
// rateLimited() is per function instance (in memory) and only a cheap first filter. durableLimit() is the shared limit: it
// counts in the database (phase1/21b, public.consume_rate_limit), so every instance sees the same count, and it FAILS CLOSED.
// The batch cap below, the consent / frequency gate (outreach-gate.ts) and the OUTREACH_ENABLED switches apply as well.

/** Largest number of recipients one request may name. */
export const MAX_BATCH = 100;

/** null when the batch is acceptable, otherwise the status and message to answer with. */
export function badBatch(leads: unknown): { status: number; error: string } | null {
  if (!Array.isArray(leads)) return { status: 400, error: "leads must be an array" };
  if (leads.length === 0) return { status: 400, error: "leads must not be empty" };
  if (leads.length > MAX_BATCH) return { status: 413, error: `At most ${MAX_BATCH} recipients per request` };
  return null;
}

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

/**
 * Shared per-caller limit. Returns null when the attempt may proceed, otherwise the status and message to answer with:
 * 429 over the limit, 503 when the counter cannot be reached (nothing is sent when the limit cannot be checked).
 */
export async function durableLimit(admin: RpcClient, bucket: string, limit: number, windowSeconds: number): Promise<{ status: number; error: string } | null> {
  try {
    const { data, error } = await admin.rpc("consume_rate_limit", { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) return { status: 503, error: "Sending is unavailable right now. Try again later." };
    return data === true ? null : { status: 429, error: "Hourly limit reached. Try again later." };
  } catch {
    return { status: 503, error: "Sending is unavailable right now. Try again later." };
  }
}
