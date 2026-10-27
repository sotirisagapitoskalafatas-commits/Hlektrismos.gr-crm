// Caller authentication + record-level authorization for Edge Functions that use the service role.
// The rules live in access.ts (pure, unit-tested); this file only loads the caller and the records.
//
// Usage in a function:
//   const admin = serviceClient();
//   const caller = await getCaller(req, admin);            if (caller instanceof Response) return caller;
//   const lead = await authorizeRecord(admin, caller, "lead", body.lead_id, "communications.sms.send");
//   if (lead instanceof Response) return lead;              // 401 / 403 / 404, nothing done
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { parseOverrides, type Capability } from "./permissions.ts";
import { timingSafeEqual } from "./signed-link.ts";
import {
  canAccessCase, canAccessCustomer, canAccessLead, canAccessLegacyLead, categoryOf, decide,
  type Caller, type Decision,
} from "./access.ts";

export type { Caller } from "./access.ts";

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export const denied = (d: Exclude<Decision, { ok: true }>) => json(d.status, { error: d.error });

const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey());
}

/** Who is calling: the service role (constant-time key match) or an ACTIVE staff user with a known role. */
export async function getCaller(req: Request, admin: SupabaseClient): Promise<Caller | Response> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "Authorization required" });
  const key = serviceKey();
  if (key && timingSafeEqual(token, key)) return { kind: "service" };

  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return json(401, { error: "Invalid session" });
  const { data: profile } = await admin.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
  const category = categoryOf(profile?.role, profile?.is_active);
  if (!profile || !category) return json(403, { error: "Staff access only" });
  const { data: setting } = await admin.from("crm_settings").select("setting_value").eq("setting_key", "role_permissions").maybeSingle();
  return { kind: "user", id: user.id, role: profile.role, category, overrides: parseOverrides(setting?.setting_value) };
}

export type RecordKind = "lead" | "legacy_lead" | "case" | "customer";
const SOURCES: Record<RecordKind, { table: string; columns: string }> = {
  lead: { table: "leads", columns: "id, assigned_to_user_id, created_by_user_id" },
  legacy_lead: { table: "hlektrismos_leads", columns: "id, assigned_to" },
  case: { table: "cases", columns: "id, owner_id, inside_sales_owner, field_sales_owner, next_action_owner_id, created_by, customer_id, lead_id" },
  customer: { table: "customers", columns: "id, created_by" },
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Loads the record (ownership columns only) and decides whether `caller` may perform `cap` on it.
 * Returns the ownership row, or a Response (401/403/404) that the function must return unchanged.
 * Logs a PII-free audit line on refusal.
 */
export async function authorizeRecord(
  admin: SupabaseClient, caller: Caller, kind: RecordKind, id: unknown, cap: Capability | null,
): Promise<Record<string, unknown> | Response> {
  if (typeof id !== "string" || !UUID.test(id)) return json(400, { error: `A valid ${kind} id is required` });
  const src = SOURCES[kind];
  const { data: row } = await admin.from(src.table).select(src.columns).eq("id", id).maybeSingle();
  let cases: Record<string, unknown>[] = [];
  if (kind === "customer" && row && caller.kind === "user" && caller.category === "sales") {
    const { data } = await admin.from("cases").select(SOURCES.case.columns).eq("customer_id", id);
    cases = data ?? [];
  }
  const rule = {
    lead: canAccessLead, legacy_lead: canAccessLegacyLead, case: canAccessCase,
    customer: (c: Caller, r: never) => canAccessCustomer(c, r, cases as never[]),
  }[kind] as (c: Caller, r: never) => boolean;
  const d = decide(caller, cap, row ?? null, rule);
  if (!d.ok) {
    console.warn(JSON.stringify({ event: "authz_denied", kind, status: d.status, caller: caller.kind === "user" ? caller.id : "service", cap }));
    return denied(d);
  }
  return row as Record<string, unknown>;
}

/** Capability-only check (no record). */
export function requireCapability(caller: Caller, cap: Capability): Response | null {
  const d = decide(caller, cap, true, () => true);
  return d.ok ? null : denied(d);
}
