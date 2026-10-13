// Supabase-backed loaders + environment config for the outreach gate (Deno runtime only).
// Requires the staged migration supabase/staged-migrations/phase1/ (table `contact_permissions`).
// If that table does not exist yet, the permission lookup throws and the gate fails closed (nothing is sent).

import type { Channel, EligibilityConfig, PermissionRecord } from "./eligibility.ts";
import { DEFAULT_CONFIG } from "./eligibility.ts";
import type { LeadRow, Loaders } from "./outreach-gate.ts";

// deno-lint-ignore no-explicit-any
export function supabaseLoaders(admin: any): Loaders {
  return {
    async leads(ids) {
      const { data, error } = await admin.from("hlektrismos_leads").select("*").in("id", ids).is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
    async permissions(ids, channel: Channel) {
      const { data, error } = await admin
        .from("contact_permissions")
        .select("lead_id, status, channel, basis, evidence_ref, evidence_at, dnc_screened_at")
        .in("lead_id", ids)
        .eq("channel", channel);
      if (error) throw error;
      const out: Record<string, PermissionRecord> = {};
      for (const r of data ?? []) {
        out[r.lead_id] = {
          status: r.status, channel: r.channel, basis: r.basis,
          evidenceRef: r.evidence_ref, evidenceAt: r.evidence_at, dncScreenedAt: r.dnc_screened_at,
        };
      }
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
