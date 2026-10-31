// Server-side recipient selection + eligibility gate for every outbound promotional path
// (email, SMS/WhatsApp/Viber, voice, scheduler). Dependency-free: data access is injected via `Loaders`,
// so the exact same code is unit-tested with fakes and run in production with Supabase loaders.
//
// Contract: the caller passes lead IDS only. Address, phone and every other attribute are re-read from the
// database here; request-supplied contact details are never trusted. If ANY lookup fails, EVERY recipient is denied.

import { decideEligibility, type Article11Screening, type Channel, type EligibilityConfig, type Objection, type PermissionRecord, type Purpose } from "./eligibility.ts";

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
  /** Per-channel consent, keyed by lead id (looked up by the lead's phone / email, see phase3/09). */
  permissions(rows: LeadRow[], channel: Channel): Promise<Record<string, PermissionRecord>>;
  /** Active objections on each lead's phone / email (an empty list = none). */
  objections(rows: LeadRow[]): Promise<Record<string, Objection[]>>;
  /** Latest Article 11 register screening of each lead's phone (calls only). */
  article11(rows: LeadRow[]): Promise<Record<string, Article11Screening>>;
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

/**
 * For a single staff-written email, which does not go through the campaign gate: true when a recorded objection covers this address, or when
 * the objections cannot be read. Marketing objections stop commercial mail; only a «stop all contact» objection stops a service message.
 */
export async function emailObjection(loaders: Pick<Loaders, "objections">, email: string, purpose: Purpose): Promise<boolean> {
  try {
    const found = (await loaders.objections([{ id: "recipient", email }])).recipient ?? [];
    return found.some((o) => (o.channels === null || o.channels.includes("email")) && (purpose === "promotional" || o.scope === "all"));
  } catch {
    return true;
  }
}

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

    const phoneCall = channel === "voice" || channel === "call";
    const [perms, suppressed, attempts, objections, screenings] = await Promise.all([
      loaders.permissions(rows, channel),
      channel === "email" ? loaders.suppressedEmails(emails) : Promise.resolve(new Set<string>()),
      loaders.recentAttempts(ids, new Date(now.getTime() - config.windowHours * 3_600_000).toISOString()),
      loaders.objections(rows),
      phoneCall ? loaders.article11(rows) : Promise.resolve({} as Record<string, Article11Screening>),
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
        objections: objections[id] ?? [],
        article11: phoneCall ? (screenings[id] ?? { screenedAt: null, result: null }) : undefined,
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
