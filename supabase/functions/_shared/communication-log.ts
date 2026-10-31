// Attributable record of every outbound message and call (public.communication_log, phase1/21b; insert-only).
// Who, to whom, which record, what happened and when. Never message text, provider replies or secrets; the address is stored only as a hash.
// An attempt that cannot be recorded is not sent: the caller stops. The result row afterwards is best effort, because the message has left.

import { contactHash, emailKey, phoneKey } from "./contact-keys.ts";
import type { OutboundAction } from "./outreach-limits.ts";

type Insert = { from(t: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }> } };
export type LogActor = { kind: string; id?: string };

export interface CommunicationEntry {
  action: OutboundAction;
  actor: LogActor;
  lead_id?: string | null;
  customer_id?: string | null;
  campaign_id?: string | null;
  contact: { phone?: string | null; email?: string | null };
}

async function row(e: CommunicationEntry, result: string, extra: Record<string, unknown> = {}) {
  const key = e.action.startsWith("email") ? emailKey(e.contact.email) : phoneKey(e.contact.phone) ?? emailKey(e.contact.email);
  return {
    action: e.action, result,
    actor_kind: e.actor.kind === "user" ? "user" : "service", actor_id: e.actor.kind === "user" ? e.actor.id ?? null : null,
    lead_id: e.lead_id ?? null, customer_id: e.customer_id ?? null, campaign_id: e.campaign_id ?? null,
    recipient_hash: key ? await contactHash(key) : null,
    ...extra,
  };
}

/** True when the attempt is on record. False means do not send. */
export async function logAttempt(admin: Insert, e: CommunicationEntry): Promise<boolean> {
  try {
    const { error } = await admin.from("communication_log").insert(await row(e, "attempt"));
    return !error;
  } catch {
    return false;
  }
}

/** The outcome. `provider_status` is the HTTP status only; `provider_ref` is the provider's message id, never its reply text. */
export async function logResult(admin: Insert, e: CommunicationEntry, result: "sent" | "failed" | "unknown", detail: { provider_status?: number; provider_ref?: string | null } = {}) {
  try {
    const { error } = await admin.from("communication_log").insert(await row(e, result, { provider_status: detail.provider_status ?? null, provider_ref: detail.provider_ref ?? null }));
    if (error) console.error(JSON.stringify({ event: "communication_log_failed", action: e.action, result }));
  } catch {
    console.error(JSON.stringify({ event: "communication_log_failed", action: e.action, result }));
  }
}
