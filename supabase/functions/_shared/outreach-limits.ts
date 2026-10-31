// Shared limits for everything that sends a message or places a call. Pure parsing plus one database call (consume_rate_limits, phase1/21b).
// The numbers are the owner's commercial decision, so they are not in the code: OUTREACH_LIMITS is a Supabase secret holding JSON (see
// docs/ops/OUTREACH_LIMITS.md). It is an environment value, not a crm_settings row, so a compromised CRM login cannot raise its own limits.
// FAIL CLOSED: a missing or malformed value means no limits are known, and every sender answers 503 without sending.

import { contactHash, emailKey, phoneKey } from "./contact-keys.ts";

export type OutboundAction = "sms" | "viber" | "whatsapp" | "voice" | "email_campaign" | "email_direct" | "offer";
const ACTIONS: OutboundAction[] = ["sms", "viber", "whatsapp", "voice", "email_campaign", "email_direct", "offer"];

export interface ActionLimits {
  /** Requests one caller may make per hour. */ requestsPerHour: number;
  /** Messages (or calls) one caller may send. */ messagesPerHour: number; messagesPerDay: number;
  /** Messages (or calls) the whole organisation may send: this is the figure that bounds the bill. */ orgMessagesPerDay: number;
  /** Recipients named in one request. */ maxRecipients: number;
}
export interface ContactLimits { perHour: number; perDay: number }
export interface OutreachLimits {
  actions: Record<OutboundAction, ActionLimits>;
  /** One person, across channels: `phone` is shared by SMS, Viber, WhatsApp and voice calls, `email` by every kind of email. */
  contact: { phone: ContactLimits; email: ContactLimits };
  /** Longest AI call, in seconds. Without it one call has no cost ceiling of its own. */
  voiceMaxCallSeconds: number;
}

const positive = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;
const contactOk = (c: unknown): c is ContactLimits => !!c && typeof c === "object" && positive((c as ContactLimits).perHour) && positive((c as ContactLimits).perDay);
function actionOk(a: unknown): a is ActionLimits {
  if (!a || typeof a !== "object") return false;
  const x = a as ActionLimits;
  return positive(x.requestsPerHour) && positive(x.messagesPerHour) && positive(x.messagesPerDay) && positive(x.orgMessagesPerDay) && positive(x.maxRecipients);
}

/** The limits when `raw` is complete and valid, otherwise null. An incomplete object is refused whole: no field gets a silent default. */
export function parseOutreachLimits(raw: string | null | undefined): OutreachLimits | null {
  if (!raw) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  const o = v as Partial<OutreachLimits> | null;
  if (!o || typeof o !== "object" || !o.actions || !o.contact) return null;
  if (!ACTIONS.every((k) => actionOk((o.actions as Record<string, unknown>)[k]))) return null;
  if (!contactOk(o.contact.phone) || !contactOk(o.contact.email)) return null;
  if (!positive(o.voiceMaxCallSeconds) || o.voiceMaxCallSeconds < 10 || o.voiceMaxCallSeconds > 3600) return null;
  return o as OutreachLimits;
}

export const outreachLimitsFromEnv = () => parseOutreachLimits(Deno.env.get("OUTREACH_LIMITS"));

export const LIMITS_NOT_SET = { status: 503, error: "Sending limits are not configured." };

type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
type Item = { bucket: string; limit: number; window_seconds: number; cost?: number };

export type LimitScope = "request" | "user" | "org" | "contact";
export type Refusal = { status: number; error: string; scope: LimitScope | "unavailable" };

const UNAVAILABLE: Refusal = { status: 503, error: "Sending is unavailable right now. Try again later.", scope: "unavailable" };

/** All-or-nothing: either every counter is incremented or none is, so a refusal for one person does not use up anyone else's quota. */
async function consume(admin: RpcClient, items: Item[]): Promise<Refusal | null> {
  try {
    const { data, error } = await admin.rpc("consume_rate_limits", { p_items: items });
    if (error) return UNAVAILABLE;
    const r = data as { ok?: unknown; bucket?: unknown } | null;
    if (r?.ok === true) return null;
    if (r?.ok !== false || typeof r.bucket !== "string") return UNAVAILABLE;
    const scope = r.bucket.split(":")[0] as LimitScope;
    return { status: 429, error: scope === "contact" ? "This person has reached the contact limit." : "Sending limit reached. Try again later.", scope };
  } catch {
    return UNAVAILABLE;
  }
}

const HOUR = 3600, DAY = 86400;

/** One request by this caller. Counted per channel, so one channel's traffic does not use up another's. */
export function admitRequest(admin: RpcClient, callerId: string, action: OutboundAction, limits: OutreachLimits) {
  return consume(admin, [{ bucket: `request:${callerId}:${action}`, limit: limits.actions[action].requestsPerHour, window_seconds: HOUR }]);
}

/**
 * One message to one person: the caller's hourly and daily limit, the organisation's daily limit and the person's limits move together.
 * A provider failure does not give the attempt back: the provider may have accepted it, so the count errs towards sending less.
 */
export async function reserveMessage(
  admin: RpcClient, callerId: string, action: OutboundAction, contact: { phone?: string | null; email?: string | null }, limits: OutreachLimits,
): Promise<Refusal | null> {
  const a = limits.actions[action];
  const items: Item[] = [
    { bucket: `user:${callerId}:${action}:h`, limit: a.messagesPerHour, window_seconds: HOUR },
    { bucket: `user:${callerId}:${action}:d`, limit: a.messagesPerDay, window_seconds: DAY },
    { bucket: `org:${action}:d`, limit: a.orgMessagesPerDay, window_seconds: DAY },
  ];
  const phone = phoneKey(contact.phone), email = emailKey(contact.email);
  if (phone) {
    const h = await contactHash(phone);
    items.push({ bucket: `contact:p:${h}:h`, limit: limits.contact.phone.perHour, window_seconds: HOUR }, { bucket: `contact:p:${h}:d`, limit: limits.contact.phone.perDay, window_seconds: DAY });
  }
  if (email) {
    const h = await contactHash(email);
    items.push({ bucket: `contact:e:${h}:h`, limit: limits.contact.email.perHour, window_seconds: HOUR }, { bucket: `contact:e:${h}:d`, limit: limits.contact.email.perDay, window_seconds: DAY });
  }
  if (!phone && !email) return { status: 400, error: "No contact address for this person.", scope: "contact" };
  return consume(admin, items);
}
