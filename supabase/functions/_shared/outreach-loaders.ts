// Supabase-backed loaders + environment config for the outreach gate (Deno runtime only).
// Requires the staged migrations phase1/02 (`outreach_decisions`) and phase3/09 (`contact_consents`,
// `contact_objections`, `article11_screenings`). If those tables do not exist yet, a lookup throws and the gate
// fails closed (nothing is sent).

import type { Article11Screening, Channel, EligibilityConfig, Objection, PermissionRecord } from "./eligibility.ts";
import { DEFAULT_CONFIG } from "./eligibility.ts";
import { emailKey, phoneKey } from "./contact-keys.ts";
import type { LeadRow, Loaders } from "./outreach-gate.ts";

/** lead id -> key, for the leads that have one. */
function keysOf(rows: LeadRow[], kind: "phone" | "email"): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const k = kind === "email" ? emailKey(r.email) : phoneKey(r.phone);
    if (k) m.set(r.id, k);
  }
  return m;
}

// deno-lint-ignore no-explicit-any
export function supabaseLoaders(admin: any): Loaders {
  return {
    async leads(ids) {
      const { data, error } = await admin.from("hlektrismos_leads").select("*").in("id", ids).is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
    async permissions(rows, channel: Channel) {
      const kind = channel === "email" ? "email" : "phone";
      const keys = keysOf(rows, kind);
      const out: Record<string, PermissionRecord> = {};
      if (keys.size === 0) return out;
      const { data, error } = await admin
        .from("contact_consents")
        .select("address_key, status, channel, basis, evidence_ref, evidence_at")
        .eq("address_kind", kind).eq("channel", channel).in("address_key", [...new Set(keys.values())]);
      if (error) throw error;
      const byKey = new Map<string, PermissionRecord>();
      for (const r of data ?? []) {
        byKey.set(r.address_key, { status: r.status, channel: r.channel, basis: r.basis, evidenceRef: r.evidence_ref, evidenceAt: r.evidence_at });
      }
      for (const [id, k] of keys) { const p = byKey.get(k); if (p) out[id] = p; }
      return out;
    },
    async objections(rows) {
      const phones = keysOf(rows, "phone");
      const emails = keysOf(rows, "email");
      const found: { address_kind: string; address_key: string; scope: Objection["scope"]; channels: Channel[] | null }[] = [];
      for (const [kind, keys] of [["phone", phones], ["email", emails]] as const) {
        if (keys.size === 0) continue;
        const { data, error } = await admin
          .from("contact_objections").select("address_kind, address_key, scope, channels")
          .eq("address_kind", kind).is("lifted_at", null).in("address_key", [...new Set(keys.values())]);
        if (error) throw error;
        found.push(...(data ?? []));
      }
      const out: Record<string, Objection[]> = {};
      for (const r of rows) {
        out[r.id] = found
          .filter((o) => (o.address_kind === "phone" && o.address_key === phones.get(r.id)) || (o.address_kind === "email" && o.address_key === emails.get(r.id)))
          .map((o) => ({ scope: o.scope, channels: o.channels }));
      }
      return out;
    },
    async article11(rows) {
      const keys = keysOf(rows, "phone");
      const out: Record<string, Article11Screening> = {};
      if (keys.size === 0) return out;
      const { data, error } = await admin
        .from("article11_screenings").select("phone_key, result, screened_at")
        .in("phone_key", [...new Set(keys.values())]).order("screened_at", { ascending: false });
      if (error) throw error;
      const latest = new Map<string, Article11Screening>();
      for (const r of data ?? []) if (!latest.has(r.phone_key)) latest.set(r.phone_key, { result: r.result, screenedAt: r.screened_at });
      for (const [id, k] of keys) { const a = latest.get(k); if (a) out[id] = a; }
      return out;
    },
    async suppressedEmails(emails) {
      if (emails.length === 0) return new Set();
      const { data, error } = await admin.from("email_suppressions").select("email").in("email", emails);
      if (error) throw error;
      return new Set((data ?? []).map((r: { email: string }) => r.email));
    },
    async audit(entries) {
      const { error } = await admin.from("outreach_decisions").insert(entries);
      if (error) throw error;
    },
    async recentAttempts(ids, sinceIso) {
      const { data, error } = await admin
        .from("campaign_sends").select("lead_id").in("lead_id", ids).gte("created_at", sinceIso)
        .in("status", ["sent", "delivered", "opened", "clicked", "replied", "queued"]);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of data ?? []) out[r.lead_id] = (out[r.lead_id] ?? 0) + 1;
      return out;
    },
  };
}

/** Owner-controlled switches. Everything defaults OFF; set as Supabase secrets, never in the browser. */
export function outreachConfigFromEnv(): EligibilityConfig {
  return {
    ...DEFAULT_CONFIG,
    outreachEnabled: Deno.env.get("OUTREACH_ENABLED") === "on",
    // Set to "yes" ONLY after written approval from counsel and the business owner is on file.
    legalApprovalRecorded: Deno.env.get("LEGAL_APPROVAL_RECORDED") === "yes",
    voiceEnabled: Deno.env.get("AUTO_VOICE_CALLS") === "on",
  };
}
