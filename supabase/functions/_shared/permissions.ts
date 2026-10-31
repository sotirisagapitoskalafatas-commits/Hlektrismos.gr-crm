// Action-level capabilities (dependency-free so it can be unit-tested with plain Node).
// Provisional, deliberately conservative defaults; an admin can override per role through the
// crm_settings key `role_permissions` (validated by `parseOverrides`). Unknown role or capability => denied.

export type Role = "admin" | "sales_agent";

/** Pre-phase6/25 stored values of the one Sales Agent account type. Read-side compatibility only: nothing writes them. */
const SALES_AGENT_ALIASES: readonly string[] = ["sales_agent", "field_sales", "inside_sales"];

/** The account type a stored role means, or null: `manager`, `back_office` and anything unknown hold no access. */
export function normalizeRole(role: string | null | undefined): Role | null {
  if (role === "admin") return "admin";
  return role && SALES_AGENT_ALIASES.includes(role) ? "sales_agent" : null;
}

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
  sales_agent: [
    "crm.read.assigned", "case.update.sales", "prospecting.search", "campaign.draft", "communications.email.send",
  ],
};

export type Overrides = Partial<Record<Role, Capability[]>>;

const isCap = (c: unknown): c is Capability => typeof c === "string" && (CAPABILITIES as readonly string[]).includes(c);

/** Parse the admin-editable override JSON. Anything malformed is ignored (defaults stay in force). */
export function parseOverrides(raw: unknown): Overrides {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return {}; } }
  if (!v || typeof v !== "object") return {};
  const out: Overrides = {};
  const entries = Object.entries(v as Record<string, unknown>).filter(([, caps]) => Array.isArray(caps)) as [string, unknown[]][];
  // Overrides saved before phase6/25 are keyed field_sales / inside_sales. They keep applying and, when they differ, the stricter list wins, so nothing widens.
  for (const [key, caps] of entries) {
    const role = normalizeRole(key);
    if (!role || key === role) continue;
    const list = caps.filter(isCap);
    out[role] = out[role] ? out[role]!.filter((c) => list.includes(c)) : list;
  }
  for (const [key, caps] of entries) if (normalizeRole(key) === key) out[key as Role] = caps.filter(isCap);
  return out;
}

export function hasCapability(stored: string | null | undefined, cap: Capability, overrides: Overrides = {}): boolean {
  const role = normalizeRole(stored);
  if (!role || !isCap(cap)) return false;
  // An admin can never be locked out of administration by a bad override.
  if (role === "admin") return true;
  const list = overrides[role] ?? DEFAULT_ROLE_CAPABILITIES[role];
  return list.includes(cap);
}
