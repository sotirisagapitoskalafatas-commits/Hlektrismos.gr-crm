// Record-level access rules for Edge Functions (dependency-free, unit-tested with plain Node).
//
// Edge Functions read and write with the service role, which bypasses RLS, so every function must decide
// itself whether the CALLER may act on the specific record. These rules mirror the staged database policies
// (supabase/staged-migrations/phase4/18 + phase4/21) but do not depend on them being applied.
//
// Two application categories (src/lib/roles.ts), no new role:
//   office = «Admin / Back Office» = admin only (the one shared office login)  -> every record
//   sales  = «Πωλητής»             = inside_sales, field_sales                  -> own records only
// The legacy roles `manager` and `back_office` belong to NEITHER category: their profiles are preserved but they have no
// access to any record (phase6/23 does the same in the database).
// The service role (pg_cron / internal calls presenting the service key) is trusted for records; its
// callers are responsible for having authorised the end user first.

import { hasCapability, type Capability, type Overrides } from "./permissions.ts";

export type Category = "office" | "sales";
export type Caller =
  | { kind: "service" }
  | { kind: "user"; id: string; role: string; category: Category; overrides?: Overrides };

const OFFICE_ROLES = ["admin"];
const SALES_ROLES = ["inside_sales", "field_sales"];

/** Category of an ACTIVE staff role, or null (inactive, unknown or missing role => no access at all). */
export function categoryOf(role: string | null | undefined, isActive: boolean | null | undefined): Category | null {
  if (isActive === false || !role) return null;
  if (OFFICE_ROLES.includes(role)) return "office";
  if (SALES_ROLES.includes(role)) return "sales";
  return null;
}

export const isOffice = (c: Caller) => c.kind === "service" || c.category === "office";

/** Capability check for a user caller; the service role passes (it has already authorised its own caller). */
export function callerCan(c: Caller, cap: Capability): boolean {
  if (c.kind === "service") return true;
  return hasCapability(c.role, cap, c.overrides ?? {});
}

type Id = string | null | undefined;
const mine = (c: Caller, ...ids: Id[]) => c.kind === "user" && ids.some((x) => !!x && x === c.id);

/** CRM lead (public.leads). */
export interface LeadRow { assigned_to_user_id?: Id; created_by_user_id?: Id }
export function canAccessLead(c: Caller, lead: LeadRow | null | undefined): boolean {
  if (!lead) return false;
  return isOffice(c) || mine(c, lead.assigned_to_user_id, lead.created_by_user_id);
}

/** Legacy lead (public.hlektrismos_leads): `assigned_to` holds the auth user id (crm_users.id = auth.users.id). */
export interface LegacyLeadRow { assigned_to?: Id }
export function canAccessLegacyLead(c: Caller, lead: LegacyLeadRow | null | undefined): boolean {
  if (!lead) return false;
  return isOffice(c) || mine(c, lead.assigned_to);
}

/** Case (public.cases). back_office_owner does NOT make a sales user an owner. */
export interface CaseRow {
  owner_id?: Id; inside_sales_owner?: Id; field_sales_owner?: Id; next_action_owner_id?: Id; created_by?: Id;
}
export function canAccessCase(c: Caller, k: CaseRow | null | undefined): boolean {
  if (!k) return false;
  return isOffice(c) || mine(c, k.owner_id, k.inside_sales_owner, k.field_sales_owner, k.next_action_owner_id, k.created_by);
}

/** Customer (public.customers): created by me, or I own one of its cases (the caller passes its cases). */
export interface CustomerRow { created_by?: Id }
export function canAccessCustomer(c: Caller, cu: CustomerRow | null | undefined, casesOfCustomer: CaseRow[] = []): boolean {
  if (!cu) return false;
  return isOffice(c) || mine(c, cu.created_by) || casesOfCustomer.some((k) => canAccessCase(c, k));
}

export type Decision = { ok: true } | { ok: false; status: 401 | 403 | 404; error: string };
const allow: Decision = { ok: true };

/**
 * One decision for "may this caller perform `cap` on this record?". Order matters:
 * not found -> 404; missing capability -> 403; not the caller's record -> 403.
 */
export function decide(c: Caller | null, cap: Capability | null, record: unknown, canAccess: (c: Caller, r: never) => boolean): Decision {
  if (!c) return { ok: false, status: 401, error: "Authorization required" };
  if (cap && !callerCan(c, cap)) return { ok: false, status: 403, error: "Not permitted for your role" };
  if (record === null || record === undefined) return { ok: false, status: 404, error: "Record not found" };
  if (!canAccess(c, record as never)) return { ok: false, status: 403, error: "Not your record" };
  return allow;
}
