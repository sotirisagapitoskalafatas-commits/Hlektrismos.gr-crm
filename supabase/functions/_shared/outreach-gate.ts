// Server-side recipient selection + eligibility gate for every outbound promotional path
// (email, SMS/WhatsApp/Viber, voice, scheduler). Dependency-free: data access is injected via `Loaders`,
// so the exact same code is unit-tested with fakes and run in production with Supabase loaders.
//
// Contract: the caller passes lead IDS only. Address, phone and every other attribute are re-read from the
// database here; request-supplied contact details are never trusted. If ANY lookup fails, EVERY recipient is denied.

import { decideEligibility, type Channel, type EligibilityConfig, type PermissionRecord, type Purpose } from "./eligibility.ts";

export const MAX_BATCH = 200;

export interface LeadRow {
  id: string;
  email?: string | null;
  phone?: string | null;
  ai_paused?: boolean | null;
  // deno-lint-ignore no-explicit-any
  [k: string]: any;
}

export interface Loaders {
  leads(ids: string[]): Promise<LeadRow[]>;
  permissions(ids: string[], channel: Channel): Promise<Record<string, PermissionRecord>>;
  /** Lower-cased, trimmed addresses that are on the suppression list. */
  suppressedEmails(emails: string[]): Promise<Set<string>>;
  recentAttempts(ids: string[], sinceIso: string): Promise<Record<string, number>>;
  /** Optional, best-effort audit sink (one row per decision). Failure never changes the decision. */
  audit?(entries: AuditEntry[]): Promise<void>;
}

export interface AuditEntry {
  lead_id: string;
  channel: Channel;
  purpose: Purpose;
  allowed: boolean;
  reasons: string[];
}

export interface GateResult {
  allowed: LeadRow[];
  denied: { id: string; reasons: string[] }[];
}

const norm = (e: string) => e.trim().toLowerCase();

export async function gateRecipients(
  rawIds: unknown,
  channel: Channel,
  purpose: Purpose,
  loaders: Loaders,
  config: EligibilityConfig,
  now: Date = new Date(),
): Promise<GateResult> {
  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)))]
    : [];
  if (ids.length === 0) return { allowed: [], denied: [] };
  if (ids.length > MAX_BATCH) {
    return { allowed: [], denied: ids.map((id) => ({ id, reasons: ["BATCH_TOO_LARGE"] })) };
  }
  const denyAll = (reason: string): GateResult => ({ allowed: [], denied: ids.map((id) => ({ id, reasons: [reason] })) });

  try {
    const rows = await loaders.leads(ids);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const emails = rows.map((r) => (r.email ? norm(r.email) : "")).filter(Boolean);

    const [perms, suppressed, attempts] = await Promise.all([
      loaders.permissions(ids, channel),
      channel === "email" ? loaders.suppressedEmails(emails) : Promise.resolve(new Set<string>()),
      loaders.recentAttempts(ids, new Date(now.getTime() - config.windowHours * 3_600_000).toISOString()),
    ]);

    const result: GateResult = { allowed: [], denied: [] };
    for (const id of ids) {
      const lead = byId.get(id);
      if (!lead) { result.denied.push({ id, reasons: ["LEAD_NOT_FOUND"] }); continue; }
      if (lead.ai_paused) { result.denied.push({ id, reasons: ["AI_PAUSED"] }); continue; }
      const address = channel === "email" ? lead.email : lead.phone;
      const d = decideEligibility({
        channel,
        purpose,
        suppressed: channel === "email" ? (lead.email ? suppressed.has(norm(lead.email)) : false) : false,
        hasAddress: !!address,
        permission: perms[id] ?? null,
        recentAttempts: attempts[id] ?? 0,
        now,
        config,
      });
      if (d.allowed) result.allowed.push(lead);
      else result.denied.push({ id, reasons: d.reasons });
    }
    const entries: AuditEntry[] = [
      ...result.allowed.map((l) => ({ lead_id: l.id, channel, purpose, allowed: true, reasons: [] as string[] })),
      ...result.denied.map((d) => ({ lead_id: d.id, channel, purpose, allowed: false, reasons: d.reasons })),
    ];
    try { await loaders.audit?.(entries); } catch { /* audit is best-effort */ }
    return result;
  } catch {
    // Fail closed: never send because a check could not be completed.
    return denyAll("LOOKUP_FAILED");
  }
}
