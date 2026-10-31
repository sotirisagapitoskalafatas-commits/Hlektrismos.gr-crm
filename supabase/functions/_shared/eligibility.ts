// Central outreach eligibility decision. Pure and dependency-free (unit-tested with plain Node; also bundled into the
// CRM so the person about to call sees the same answer the server enforces).
// FAIL CLOSED: any missing/unknown input denies. A decision is only "allowed" when every rule passes.
// Discovery/scraping NEVER implies permission: a scraped/imported business has no permission record
// until a person with the right evidence creates one, and counsel's approval must be recorded in config.
// The rules are a conservative engineering default, written down for Greek counsel to confirm — not legal advice.

/** "call" = a person (sales agent) phoning; "voice" = an automated / AI call. */
export type Channel = "email" | "sms" | "whatsapp" | "viber" | "voice" | "call";
/** "requested": a reply to something the customer asked for, under a recorded request (phase3/11). It is still commercial content, so it stops at every refusal. */
export type Purpose = "promotional" | "transactional" | "requested";

export interface PermissionRecord {
  status: "granted" | "withdrawn" | "none";
  channel: Channel;
  /** consent = opt-in evidence; existing_customer = similar-products soft opt-in with objection route. */
  basis: "consent" | "existing_customer" | "other" | null;
  /** Where/when the evidence was captured (required for a grant). */
  evidenceRef?: string | null;
  evidenceAt?: string | null;
  /** Legacy: last telephone opt-out register screening (voice). Superseded by `article11`. */
  dncScreenedAt?: string | null;
}

/** «Δεν θέλει επικοινωνία». scope "all" also stops non-marketing contact; channels null = every channel. */
export interface Objection { scope: "marketing" | "all"; channels: Channel[] | null }

/** Latest check of the Article 11 opt-out register (ν. 3471/2006) for the phone number. */
export interface Article11Screening { screenedAt: string | null; result: "not_listed" | "listed" | null }

export interface EligibilityInput {
  channel: Channel;
  purpose: Purpose;
  /** null = the lookup failed or is unavailable -> fail closed. */
  suppressed: boolean | null;
  hasAddress: boolean; // email address or phone number present
  permission: PermissionRecord | null | undefined;
  /** Number of outreach attempts to this contact within `config.windowHours`. */
  recentAttempts: number | null;
  /** Objections on the phone / email. undefined = caller does not supply them (legacy); null = lookup failed. */
  objections?: Objection[] | null;
  /** For "call" / "voice". undefined on "voice" = legacy caller (uses permission.dncScreenedAt); null = lookup failed. */
  article11?: Article11Screening | null;
  now: Date;
  config: EligibilityConfig;
}

export interface EligibilityConfig {
  /** Master switch for automated sending (email/SMS/messaging/voice). Default OFF everywhere. */
  outreachEnabled: boolean;
  /** Automated/AI voice prospecting. Default OFF. */
  voiceEnabled: boolean;
  /** Written legal approval recorded by the owner (checked, not inferred). */
  legalApprovalRecorded: boolean;
  windowHours: number;
  maxAttemptsPerWindow: number;
  contactHours: { start: number; end: number }; // local hours in `timeZone`, [start, end)
  timeZone: string;
  /** Max age of an Article 11 register screening for calls. */
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

export const PHONE_CHANNELS: Channel[] = ["sms", "whatsapp", "viber", "voice", "call"];

export interface Decision { allowed: boolean; reasons: string[] }

function localHour(now: Date, timeZone: string): number | null {
  try {
    const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(now);
    const n = Number(h) % 24;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

const applies = (o: Objection, channel: Channel, purpose: Purpose) =>
  (o.channels === null || o.channels.includes(channel)) && (purpose !== "transactional" || o.scope === "all");

function objectionReason(i: EligibilityInput): string | null {
  if (i.objections === undefined) return null;
  if (i.objections === null) return "OBJECTION_UNKNOWN";
  return i.objections.some((o) => applies(o, i.channel, i.purpose)) ? "OBJECTION_RECORDED" : null;
}

const hasGrant = (p: PermissionRecord | null | undefined, channel: Channel) =>
  !!p && p.status === "granted" && p.channel === channel && (p.basis === "consent" || p.basis === "existing_customer")
  && !!p.evidenceRef && !!p.evidenceAt;

function article11Reasons(a: Article11Screening | null | undefined, now: Date, maxAgeDays: number): string[] {
  if (!a) return ["ARTICLE11_UNKNOWN"];
  if (a.result === "listed") return ["ARTICLE11_LISTED"];
  const s = a.screenedAt ? Date.parse(a.screenedAt) : NaN;
  if (a.result !== "not_listed" || !Number.isFinite(s)) return ["ARTICLE11_NOT_SCREENED"];
  if (now.getTime() - s > maxAgeDays * 86_400_000) return ["ARTICLE11_SCREENING_STALE"];
  return [];
}

export function decideEligibility(i: EligibilityInput): Decision {
  const reasons = new Set<string>();
  const done = (): Decision => (reasons.size ? { allowed: false, reasons: [...reasons] } : { allowed: true, reasons: [] });
  const objection = objectionReason(i);

  // Transactional replies to someone who contacted us are not marketing; still need an address and no «stop all contact».
  if (i.purpose === "transactional") {
    if (!i.hasAddress) reasons.add("NO_ADDRESS");
    if (objection) reasons.add(objection);
    if (i.permission?.status === "withdrawn" && i.objections === undefined) reasons.add("OBJECTION_RECORDED");
    return done();
  }

  const c = i.config;
  const p = i.permission;
  const hour = localHour(i.now, c.timeZone);
  const hours = () => {
    if (hour === null) reasons.add("TIME_UNKNOWN");
    else if (hour < c.contactHours.start || hour >= c.contactHours.end) reasons.add("OUTSIDE_CONTACT_HOURS");
  };

  // A recorded request stands in for the consent record and the outreach switches, and for nothing else: refusals, frequency and hours still apply.
  if (i.purpose === "requested") {
    if (!i.hasAddress) reasons.add("NO_ADDRESS");
    if (objection) reasons.add(objection);
    if (p?.status === "withdrawn") reasons.add("OBJECTION_RECORDED");
    if (i.suppressed === null) reasons.add("SUPPRESSION_UNKNOWN");
    else if (i.suppressed) reasons.add("SUPPRESSED");
    if (i.recentAttempts === null) reasons.add("FREQUENCY_UNKNOWN");
    else if (i.recentAttempts >= c.maxAttemptsPerWindow) reasons.add("FREQUENCY_CAP");
    hours();
    return done();
  }

  // A person phoning for sales. Not an automated send, so the campaign master switches do not apply; the number must
  // not have objected, and without recorded consent for calls it must have a fresh «not listed» Article 11 screening.
  if (i.channel === "call") {
    if (!i.hasAddress) reasons.add("NO_ADDRESS");
    if (objection) reasons.add(objection);
    if (p?.status === "withdrawn") reasons.add("OBJECTION_RECORDED");
    const a11 = article11Reasons(i.article11, i.now, c.dncMaxAgeDays);
    // A listing in the register always stops promotional calls; consent with evidence replaces the screening otherwise.
    if (a11.includes("ARTICLE11_LISTED") || a11.includes("ARTICLE11_UNKNOWN") || !hasGrant(p, "call")) a11.forEach((r) => reasons.add(r));
    hours();
    return done();
  }

  if (!c.outreachEnabled) reasons.add("OUTREACH_DISABLED");
  if (!c.legalApprovalRecorded) reasons.add("LEGAL_APPROVAL_MISSING");
  if (!i.hasAddress) reasons.add("NO_ADDRESS");

  if (i.suppressed === null) reasons.add("SUPPRESSION_UNKNOWN");
  else if (i.suppressed) reasons.add("SUPPRESSED");

  if (objection) reasons.add(objection);
  if (!p || p.status === "none") reasons.add("NO_CHANNEL_PERMISSION");
  else if (p.status === "withdrawn") reasons.add("OBJECTION_RECORDED");
  else {
    if (p.channel !== i.channel) reasons.add("PERMISSION_WRONG_CHANNEL");
    if (p.basis !== "consent" && p.basis !== "existing_customer") reasons.add("BASIS_NOT_SUFFICIENT");
    if (!p.evidenceRef || !p.evidenceAt) reasons.add("NO_PERMISSION_EVIDENCE");
  }

  if (i.recentAttempts === null) reasons.add("FREQUENCY_UNKNOWN");
  else if (i.recentAttempts >= c.maxAttemptsPerWindow) reasons.add("FREQUENCY_CAP");

  hours();

  if (i.channel === "voice") {
    if (!c.voiceEnabled) reasons.add("VOICE_DISABLED");
    if (i.article11 !== undefined) {
      article11Reasons(i.article11, i.now, c.dncMaxAgeDays).forEach((r) => reasons.add(r));
    } else {
      const s = p?.dncScreenedAt ? Date.parse(p.dncScreenedAt) : NaN;
      if (!Number.isFinite(s)) reasons.add("DNC_NOT_SCREENED");
      else if (i.now.getTime() - s > c.dncMaxAgeDays * 86_400_000) reasons.add("DNC_SCREENING_STALE");
    }
  }

  return done();
}
