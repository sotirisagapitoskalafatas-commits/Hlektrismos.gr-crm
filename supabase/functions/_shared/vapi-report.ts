// Reads a Vapi end-of-call-report (docs.vapi.ai/server-url/events). Pure and dependency-free. Everything here comes from the wire, so each field
// is checked: a report that cannot be understood changes nothing. The transcript is "AI: ... User: ..." and artifact.messages carries the same
// turns with roles. The exact shape of `artifact.recording` is not specified on the public page ("Recording object with URLs"), so only an https
// URL from a known field is kept, and the fields used are confirmed by the staging test delivery (docs/ops/VAPI_STAGING_TEST.md).

export type VapiMessage = {
  type?: unknown;
  call?: { id?: unknown; startedAt?: unknown; endedAt?: unknown };
  startedAt?: unknown; endedAt?: unknown; durationSeconds?: unknown; durationMs?: unknown; endedReason?: unknown;
  artifact?: {
    transcript?: unknown; messages?: unknown; recordingUrl?: unknown; stereoRecordingUrl?: unknown;
    recording?: unknown;
  };
};

export interface CallReport {
  callId: string;
  transcript: string;
  /** Only what the customer said. Never the assistant, whose own lines mention calling back and refusing. */
  customerWords: string;
  /** Whole seconds, or null when the report does not say. */
  duration: number | null;
  recordingUrl: string;
}

const MAX_TRANSCRIPT = 100_000;
const MAX_CALL_SECONDS = 6 * 3600;

const httpsUrl = (v: unknown): string | null => {
  if (typeof v !== "string" || v.length > 2000) return null;
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password ? v : null; } catch { return null; }
};

const seconds = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_CALL_SECONDS ? Math.round(v) : null);

function durationOf(m: VapiMessage): number | null {
  const direct = seconds(m.durationSeconds);
  if (direct !== null) return direct;
  if (typeof m.durationMs === "number") { const fromMs = seconds(m.durationMs / 1000); if (fromMs !== null) return fromMs; }
  const start = Date.parse(String(m.startedAt ?? m.call?.startedAt ?? ""));
  const end = Date.parse(String(m.endedAt ?? m.call?.endedAt ?? ""));
  return Number.isFinite(start) && Number.isFinite(end) ? seconds((end - start) / 1000) : null;
}

function recordingOf(m: VapiMessage): string {
  const a = m.artifact ?? {};
  const r = a.recording as { url?: unknown; stereoUrl?: unknown; mono?: { combinedUrl?: unknown } } | string | null | undefined;
  const nested = r && typeof r === "object" ? [r.stereoUrl, r.mono?.combinedUrl, r.url] : [r];
  for (const candidate of [...nested, a.recordingUrl, a.stereoRecordingUrl]) {
    const url = httpsUrl(candidate);
    if (url) return url;
  }
  return "";
}

function customerWordsOf(m: VapiMessage, transcript: string): string {
  const turns = m.artifact?.messages;
  if (Array.isArray(turns)) {
    const said = turns.filter((t) => t && typeof t === "object" && (t as { role?: unknown }).role === "user")
      .map((t) => (t as { message?: unknown }).message).filter((x): x is string => typeof x === "string");
    if (said.length > 0) return said.join(" ");
  }
  return [...transcript.matchAll(/User:\s*([\s\S]*?)(?=\s*(?:AI|User|Assistant|Bot):|$)/g)].map((x) => x[1]).join(" ");
}

/** The parsed report, or null when it is not one this function can act on. */
export function parseEndOfCallReport(m: VapiMessage | undefined): CallReport | null {
  if (!m || typeof m !== "object" || m.type !== "end-of-call-report") return null;
  const callId = m.call?.id;
  if (typeof callId !== "string" || callId.length === 0 || callId.length > 200) return null;
  const raw = m.artifact?.transcript;
  if (raw !== undefined && raw !== null && typeof raw !== "string") return null;
  const transcript = (raw ?? "").slice(0, MAX_TRANSCRIPT);
  return { callId, transcript, customerWords: customerWordsOf(m, transcript), duration: durationOf(m), recordingUrl: recordingOf(m) };
}

/** Lower case without accents, so "Μη με ξαναπάρετε" and "μη με ξαναπαρετε" are the same words. */
export const plainGreek = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Explicit requests only, because each one writes an objection. A missed phrase still ends the call as not_interested and a person reviews it.
const OPT_OUT = [
  /(?:^|[^\p{L}])μην? με (ξανα)?(παρ|παιρν|καλ)/u, /δεν θελω (αλλες |αλλα |αλλο )?(κλησ|τηλεφων)/, /δεν θελω να με (ξανα)?(παρ|παιρν|καλ)/,
  /βγαλτε με απο/, /διαγραψτε με/, /σταματηστε να με/,
];

/** True only when the CUSTOMER asked not to be called again. */
export function spokenOptOut(customerWords: string): boolean {
  const said = plainGreek(customerWords);
  return OPT_OUT.some((p) => p.test(said));
}
