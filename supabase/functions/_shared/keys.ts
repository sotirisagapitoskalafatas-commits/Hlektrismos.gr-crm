// Supabase API keys for Edge Functions: the NEW key system only (docs: functions/secrets, migrating-to-new-api-keys).
//
// * SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS are JSON dictionaries injected by the platform; the
//   key named "default" is used unless another name is passed.
// * Never read here: the legacy SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (they carry the JWT-based keys)
//   and the custom SERVICE_ROLE_KEY secret (it holds the exposed legacy key). There is no fallback: a missing
//   key is a configuration error, reported by name only, never by value.
// * An incoming internal caller proves it holds a secret key by sending it in the `apikey` header (the
//   documented header); `Authorization: Bearer sb_secret_…` is accepted for compatibility. Only values that
//   start with `sb_secret_` and match a configured secret key qualify, so a legacy JWT never does.
// * Holding a valid API key identifies the calling COMPONENT, not a user. Record-level authorization stays in
//   authz.ts / access.ts and is applied to user callers as before.
import { timingSafeEqual } from "./signed-link.ts";

const SECRET_PREFIX = "sb_secret_";
const PUBLISHABLE_PREFIX = "sb_publishable_";

function dictionary(name: "SUPABASE_SECRET_KEYS" | "SUPABASE_PUBLISHABLE_KEYS"): Record<string, string> {
  const raw = Deno.env.get(name) ?? "";
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

/** The named secret key, or "" when it is not configured (never a legacy key). */
export function secretKey(name = "default"): string {
  const v = dictionary("SUPABASE_SECRET_KEYS")[name];
  return typeof v === "string" && v.startsWith(SECRET_PREFIX) ? v : "";
}

/** The named publishable key, or "" when it is not configured (never the legacy anon key). */
export function publishableKey(name = "default"): string {
  const v = dictionary("SUPABASE_PUBLISHABLE_KEYS")[name];
  return typeof v === "string" && v.startsWith(PUBLISHABLE_PREFIX) ? v : "";
}

/** Redacted diagnostic for a missing key: names the variable and key, never a value. */
export function missingKeyResponse(kind: "secret" | "publishable", headers: Record<string, string> = {}): Response {
  const variable = kind === "secret" ? "SUPABASE_SECRET_KEYS" : "SUPABASE_PUBLISHABLE_KEYS";
  console.error(JSON.stringify({ event: "api_key_not_configured", variable, key: "default" }));
  return new Response(JSON.stringify({ error: `Server configuration error: ${variable}["default"] is not available.` }), {
    status: 500, headers: { ...headers, "Content-Type": "application/json" },
  });
}

/** True only when the request presents one of this project's secret keys (apikey header, or Bearer). */
export function presentsSecretKey(req: Request): boolean {
  const configured = Object.values(dictionary("SUPABASE_SECRET_KEYS")).filter((v) => typeof v === "string" && v.startsWith(SECRET_PREFIX));
  if (configured.length === 0) return false;
  const presented = [
    (req.headers.get("apikey") ?? "").trim(),
    (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim(),
  ].filter((v) => v.startsWith(SECRET_PREFIX));
  return presented.some((p) => configured.some((k) => timingSafeEqual(p, k)));
}

/** The bearer token of a signed-in user, or "" (API keys are not user sessions). */
export function userBearer(req: Request): string {
  const t = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return t.startsWith("sb_") ? "" : t;
}

/** Headers for a function-to-function call with the secret key (documented: the `apikey` header). */
export function internalCallHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: secretKey(), "Content-Type": "application/json", ...extra };
}
