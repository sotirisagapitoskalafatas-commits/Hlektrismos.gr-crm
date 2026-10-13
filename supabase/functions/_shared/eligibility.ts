// Central outreach eligibility decision. Pure and dependency-free (unit-tested with plain Node).
// FAIL CLOSED: any missing/unknown input denies. A decision is only "allowed" when every rule passes.
// Discovery/scraping NEVER implies permission: a scraped/imported business has no permission record
// until a person with the right evidence creates one, and counsel's approval must be recorded in config.

export type Channel = "email" | "sms" | "whatsapp" | "viber" | "voice";
export type Purpose = "promotional" | "transactional";

export interface PermissionRecord {
  status: "granted" | "withdrawn" | "none";
  channel: Channel;
  /** consent = opt-in evidence; existing_customer = similar-products soft opt-in with objection route. */
  basis: "consent" | "existing_customer" | "other" | null;
  /** Where/when the evidence was captured (required for a grant). */
  evidenceRef?: string | null;
  evidenceAt?: string | null;
  /** Last telephone opt-out register screening (voice / human calls). */
  dncScreenedAt?: string | null;
}

export interface EligibilityInput {
  channel: Channel;
  purpose: Purpose;
  /** null = the lookup failed or is unavailable -> fail closed. */
  suppressed: boolean | null;
  hasAddress: boolean; // email address or phone number present
  permission: PermissionRecord | null | undefined;
  /** Number of outreach attempts to this contact within `config.windowHours`. */
  recentAttempts: number | null;
  now: Date;
  config: EligibilityConfig;
}

export interface EligibilityConfig {
  /** Master switch. Default OFF everywhere. */
  outreachEnabled: boolean;
  /** Automated/AI voice prospecting. Default OFF. */
  voiceEnabled: boolean;
  /** Written legal approval recorded by the owner (checked, not inferred). */
  legalApprovalRecorded: boolean;
  windowHours: number;
  maxAttemptsPerWindow: number;
  contactHours: { start: number; end: number }; // local hours in `timeZone`, [start, end)
  timeZone: string;
  dncMaxAgeDays: number;
}

export const DEFAULT_CONFIG: EligibilityConfig = {
  outreachEnabled: false,
  voiceEnabled: false,
  legalApprovalRecorded: false,
  windowHours: 24 * 7,
  maxAttemptsPerWindow: 2,
  contactHours: { start: 9, end: 20 },
  timeZone: "Europe/Athens",
  dncMaxAgeDays: 30,
};

export interface Decision { allowed: boolean; reasons: string[] }

function localHour(now: Date, timeZone: string): number | null {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(now);
    const n = Number(h) % 24;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export function decideEligibility(i: EligibilityInput): Decision {
  const deny = (...reasons: string[]): Decision => ({ allowed: false, reasons });

  // Transactional replies to someone who contacted us are not marketing; still need an address and no known objection.
  if (i.purpose === "transactional") {
    if (!i.hasAddress) return deny("NO_ADDRESS");
    if (i.permission?.status === "withdrawn") return deny("OBJECTION_RECORDED");
    return { allowed: true, reasons: [] };
  }

  const c = i.config;
  const reasons: string[] = [];
  if (!c.outreachEnabled) reasons.push("OUTREACH_DISABLED");
  if (!c.legalApprovalRecorded) reasons.push("LEGAL_APPROVAL_MISSING");
  if (!i.hasAddress) reasons.push("NO_ADDRESS");

  if (i.suppressed === null) reasons.push("SUPPRESSION_UNKNOWN");
  else if (i.suppressed) reasons.push("SUPPRESSED");

  const p = i.permission;
  if (!p || p.status === "none") reasons.push("NO_CHANNEL_PERMISSION");
  else if (p.status === "withdrawn") reasons.push("OBJECTION_RECORDED");
  else {
    if (p.channel !== i.channel) reasons.push("PERMISSION_WRONG_CHANNEL");
    if (p.basis !== "consent" && p.basis !== "existing_customer") reasons.push("BASIS_NOT_SUFFICIENT");
    if (!p.evidenceRef || !p.evidenceAt) reasons.push("NO_PERMISSION_EVIDENCE");
  }

  if (i.recentAttempts === null) reasons.push("FREQUENCY_UNKNOWN");
  else if (i.recentAttempts >= c.maxAttemptsPerWindow) reasons.push("FREQUENCY_CAP");

  const hour = localHour(i.now, c.timeZone);
  if (hour === null) reasons.push("TIME_UNKNOWN");
  else if (hour < c.contactHours.start || hour >= c.contactHours.end) reasons.push("OUTSIDE_CONTACT_HOURS");

  if (i.channel === "voice") {
    if (!c.voiceEnabled) reasons.push("VOICE_DISABLED");
    const s = p?.dncScreenedAt ? Date.parse(p.dncScreenedAt) : NaN;
    if (!Number.isFinite(s)) reasons.push("DNC_NOT_SCREENED");
    else if (i.now.getTime() - s > c.dncMaxAgeDays * 86_400_000) reasons.push("DNC_SCREENING_STALE");
  }

  return reasons.length ? { allowed: false, reasons } : { allowed: true, reasons: [] };
}
