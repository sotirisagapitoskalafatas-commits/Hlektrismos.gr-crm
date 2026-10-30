// Action-level capabilities (dependency-free so it can be unit-tested with plain Node).
// Provisional, deliberately conservative defaults; an admin can override per role through the
// crm_settings key `role_permissions` (validated by `parseOverrides`). Unknown role or capability => denied.

export type Role = "admin" | "manager" | "inside_sales" | "field_sales" | "back_office";

export const CAPABILITIES = [
  "crm.read.all", "crm.read.team", "crm.read.assigned",
  "case.update.sales", "case.update.operations", "case.documents.verify",
  "prospecting.search", "prospecting.import",
  "campaign.draft", "campaign.approve", "campaign.send",
  "communications.email.send", "communications.sms.send", "communications.voice.initiate",
  "integrations.manage", "users.manage_roles", "audit.read", "pii.export",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const DEFAULT_ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin: CAPABILITIES,
  manager: [], // legacy role: no capabilities (see LEGACY_ROLES below)
  inside_sales: [
    "crm.read.assigned", "case.update.sales", "prospecting.search", "campaign.draft", "communications.email.send",
  ],
  field_sales: ["crm.read.assigned", "case.update.sales"],
  back_office: [], // legacy role: no capabilities (see LEGACY_ROLES below)
};

/** Preserved profiles that hold no privileges: no default, and no admin override can grant them anything. */
export const LEGACY_ROLES: readonly string[] = ["manager", "back_office"];

export type Overrides = Partial<Record<Role, Capability[]>>;

const isRole = (r: unknown): r is Role => typeof r === "string" && r in DEFAULT_ROLE_CAPABILITIES;
const isCap = (c: unknown): c is Capability => typeof c === "string" && (CAPABILITIES as readonly string[]).includes(c);

/** Parse the admin-editable override JSON. Anything malformed is ignored (defaults stay in force). */
export function parseOverrides(raw: unknown): Overrides {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return {}; } }
  if (!v || typeof v !== "object") return {};
  const out: Overrides = {};
  for (const [role, caps] of Object.entries(v as Record<string, unknown>)) {
    if (!isRole(role) || !Array.isArray(caps)) continue;
    out[role] = caps.filter(isCap);
  }
  return out;
}

export function hasCapability(role: string | null | undefined, cap: Capability, overrides: Overrides = {}): boolean {
  if (!isRole(role) || !isCap(cap)) return false;
  // An admin can never be locked out of administration by a bad override.
  if (role === "admin") return true;
  if (LEGACY_ROLES.includes(role)) return false; // not even through role_permissions overrides
  const list = overrides[role] ?? DEFAULT_ROLE_CAPABILITIES[role];
  return list.includes(cap);
}
