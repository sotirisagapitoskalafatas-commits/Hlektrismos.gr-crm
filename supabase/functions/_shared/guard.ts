import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

/**
 * Staff-only gate for edge functions that read customer data, send
 * messages, or spend paid API quota.
 *
 * Allowed callers:
 *   - internal calls / pg_cron that present the service-role key, and
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

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny(401, "Authorization required");

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && token === serviceKey) return null;

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const admin = createClient(url, serviceKey);
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return deny(401, "Invalid session");

  const { data: profile } = await admin
    .from("profiles")
    .select("id, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false) return deny(403, "Staff access only");

  return null;
}
