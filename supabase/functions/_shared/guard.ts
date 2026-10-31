import { categoryOf } from "./access.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { hasCapability, parseOverrides, type Capability } from "./permissions.ts";
import { missingKeyResponse, presentsSecretKey, secretKey, userBearer } from "./keys.ts";
import { timingSafeEqual } from "./signed-link.ts";

/**
 * Staff-only gate for edge functions that read customer data, send
 * messages, or spend paid API quota.
 *
 * Allowed callers:
 *   - internal calls that present this project's secret API key (keys.ts), and
 *   - a signed-in user whose public.profiles row exists and is active.
 *
 * The public anon key is NOT enough: it ships in every browser bundle.
 * Returns null when the caller is allowed, otherwise a 401/403 Response.
 */
export async function requireStaff(req: Request): Promise<Response | null> {
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
  if (presentsSecretKey(req)) return null;
  const token = userBearer(req);
  if (!token) return deny(401, "Authorization required");

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(url, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return deny(401, "Invalid session");

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !categoryOf(profile.role, profile.is_active)) return deny(403, "Staff access only"); // legacy and unknown roles hold no access

  return null;
}

const deny = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Per-action authorization. Allowed callers: internal calls presenting the secret API key, or an active
 * staff user whose role holds `capability` (defaults in permissions.ts, admin-overridable via the
 * crm_settings key `role_permissions`). The role is read from the database, never from the request.
 * Returns null when allowed, otherwise a 401/403 Response.
 */
export async function requirePermission(req: Request, capability: Capability): Promise<Response | null> {
  if (!secretKey()) return missingKeyResponse("secret", corsHeaders);
  if (presentsSecretKey(req)) return null;
  const token = userBearer(req);
  if (!token) return deny(401, "Authorization required");

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return deny(401, "Invalid session");

  const { data: profile } = await admin.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  if (!profile || profile.is_active === false) return deny(403, "Staff access only");

  const { data: setting } = await admin.from("crm_settings").select("setting_value").eq("setting_key", "role_permissions").maybeSingle();
  const overrides = parseOverrides(setting?.setting_value);
  if (!hasCapability(profile.role, capability, overrides)) {
    // Structured, PII-free audit line (user id + capability only).
    console.warn(JSON.stringify({ event: "permission_denied", user: user.id, capability }));
    return deny(403, "Not permitted for your role");
  }
  return null;
}

/**
 * For functions invoked by pg_cron: accepts a dedicated, narrowly scoped secret (`x-cron-secret` ==
 * env CRON_SECRET, min 24 chars) instead of the service-role key; otherwise falls back to requireStaff.
 * The cron secret grants nothing except calling the specific functions that opt into this guard.
 */
export async function requireStaffOrCron(req: Request): Promise<Response | null> {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const presented = req.headers.get("x-cron-secret") ?? "";
  if (expected.length >= 24 && presented && timingSafeEqual(presented, expected)) return null;
  return requireStaff(req);
}
