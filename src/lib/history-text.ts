/* History wording (UNIFIED_CUSTOMER_FOLDER.md §3, W1–W4, D6). Pure helpers, no database access.
   - Stage codes in stored titles («Στάδιο: new → contacted») are shown with their Greek names. Old rows are
     translated when shown; new rows are written in Greek (stageChangeTitle).
   - The old «Ενημέρωση Case» entry only ever repeated the stage change written next to it: it is hidden.
   - Lead history: every action code the app or the staged SQL writes has a Greek text; an unknown code never
     shows raw. */
import { STAGE_LABEL, stageText } from './case-flow';
import { EXCEPTION_TEXT } from './ops-queue';

const STAGE_CODES = Object.keys(STAGE_LABEL).join('|');
const CODE_ARROW = new RegExp(`\\b(${STAGE_CODES})\\s*→\\s*(${STAGE_CODES})\\b`, 'g');
const EXCEPTION_CODE = /^Εξαίρεση: ([a-z_]+)$/;

/** Title of a stage-change entry, e.g. «Στάδιο: Νέο → Επικοινωνία». */
export const stageChangeTitle = (from: string, to: string) => `Στάδιο: ${stageText(from)} → ${stageText(to)}`;

/** One stage-change entry: the move, then the note and any missing documents (W2). */
export function stageChangeDescription(note?: string | null, missing?: string[]): string {
  const parts: string[] = [];
  if (note?.trim()) parts.push(note.trim());
  if (missing && missing.length) parts.push(`Με ελλείψεις εγγράφων: ${missing.join(' · ')}`);
  return parts.join('\n');
}

/** Stored text with stage codes replaced by their Greek names; exception codes too. */
export function historyText(s: string | null | undefined): string {
  if (!s) return '';
  const ex = EXCEPTION_CODE.exec(s);
  if (ex && EXCEPTION_TEXT[ex[1]]) return `Εξαίρεση: ${EXCEPTION_TEXT[ex[1]]}`;
  return s.replace(CODE_ARROW, (_m, a: string, b: string) => `${stageText(a)} → ${stageText(b)}`);
}

type EventLike = { activity_type: string; title: string; description?: string | null; role?: string | null; occurred_at?: string };

/** The legacy duplicate written by updateCase next to every stage change (W2). */
export const isDuplicateStageEntry = (e: EventLike) =>
  e.activity_type === 'status_change' && e.title === 'Ενημέρωση Case' && /^Στάδιο:/.test(e.description ?? '');

/** Legacy description that only repeats the title («Στάδιο: x → y» under the same title). */
export function historyDescription(e: EventLike): string {
  const d = historyText(e.description);
  return d && d === historyText(e.title) ? '' : d;
}

/** Events as shown: duplicates removed, order kept. */
export const visibleHistory = <T extends EventLike>(events: T[]) => events.filter(e => !isDuplicateStageEntry(e));

/* ---- Team of an entry (D6): the filter and the grey label use the same value: who recorded it. ---- */
export const TEAM_IDS = ['inside_sales', 'field_sales', 'back_office'] as const;
const ROLE_TEXT: Record<string, string> = {
  inside_sales: 'Inside Sales', field_sales: 'Field Sales', back_office: 'Back Office',
  admin: 'Διαχειριστής', manager: 'Διευθυντής',
};
/** Filter id an entry belongs to: the recording role (admin/manager entries have no team button and show
 *  under «Όλα» only); «system» when nobody recorded it. */
export const entryTeam = (e: EventLike) => (ROLE_TEXT[e.role ?? ''] ? (e.role as string) : 'system');
/** Grey label: the recording role; «Σύστημα» when nobody recorded it. */
export const entryTeamLabel = (e: EventLike) => ROLE_TEXT[e.role ?? ''] ?? 'Σύστημα';

/* ---- Lead history (W3) ---- */
const LEAD_ACTION: Record<string, string> = {
  created: 'Δημιουργία',
  updated: 'Ενημέρωση στοιχείων',
  converted: 'Μετατροπή σε Case',
  trashed: 'Μεταφορά στον Κάδο',
  restored: 'Επαναφορά από τον Κάδο',
  purged: 'Οριστική διαγραφή',
  routed_to_backoffice: 'Ανάθεση στη Διεκπεραίωση',
  contact_objection: 'Καταγραφή: δεν θέλει επικοινωνία',
  contact_objection_lifted: 'Άρση της άρνησης επικοινωνίας',
  contact_consent_granted: 'Καταγραφή συγκατάθεσης',
  contact_consent_withdrawn: 'Ανάκληση συγκατάθεσης',
};
export const knownLeadActions = Object.keys(LEAD_ACTION);

/** Greek text for a lead activity_log entry. statusText turns a lead status code into its label. */
export function leadActionText(a: { action: string; details?: Record<string, unknown> | null }, statusText: (s: string) => string): string {
  const d = a.details ?? {};
  if (a.action === 'status_change') return `Κατάσταση: ${statusText(String(d.from ?? ''))} → ${statusText(String(d.to ?? ''))}`;
  const base = LEAD_ACTION[a.action];
  if (!base) return 'Ενέργεια στο lead';
  const reason = typeof d.reason === 'string' && d.reason.trim() && a.action === 'trashed' ? ` · ${d.reason.trim()}` : '';
  return base + reason;
}

/* ---- One timeline for the customer folder (UNIFIED_CUSTOMER_FOLDER.md §2, Ιστορικό; finding B2) ----
   Merges the lead's entries (activity_log) with every case's entries (timeline_events), newest first, each
   labelled «Lead» or with its case number. Nothing is dropped by type: Back Office entries (document check,
   application, provider, activation, override, return) are part of the history. A lead read that failed (null)
   leaves the case entries untouched. */
export type HistoryEntry = {
  key: string; at: string;
  source: 'lead' | 'case'; label: string; caseId: string | null;
  title: string; description: string; typeLabel: string;
  team: string; teamLabel: string; userName: string | null;
};
type CaseEventIn = EventLike & { id: string; case_id: string; case_no: string; occurred_at: string; user?: { full_name?: string | null } | null };
type LeadActivityIn = { id: string; action: string; details: Record<string, unknown> | null; created_at: string };
type LeadIn = { id: string; created_at: string; converted_at?: string | null; source_label: string };

export function mergeHistory(input: {
  caseEvents: CaseEventIn[];
  leads: { lead: LeadIn; activity: LeadActivityIn[] | null }[];
  statusText: (s: string) => string;
  typeLabel: (activityType: string) => string;
}): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const e of visibleHistory(input.caseEvents)) {
    out.push({
      key: `c-${e.id}`, at: e.occurred_at, source: 'case', label: e.case_no, caseId: e.case_id,
      title: historyText(e.title) || input.typeLabel(e.activity_type), description: historyDescription(e),
      typeLabel: input.typeLabel(e.activity_type), team: entryTeam(e), teamLabel: entryTeamLabel(e), userName: e.user?.full_name ?? null,
    });
  }
  for (const { lead, activity } of input.leads) {
    const rows = activity ?? [];
    for (const a of rows) {
      out.push({
        key: `l-${a.id}`, at: a.created_at, source: 'lead', label: 'Lead', caseId: null,
        title: leadActionText(a, input.statusText), description: '', typeLabel: 'Lead',
        team: 'system', teamLabel: 'Σύστημα', userName: null,
      });
    }
    // the lead's own dates, unless the log already has the same fact
    if (lead.converted_at && !rows.some(a => a.action === 'converted')) {
      out.push({ key: `lc-${lead.id}`, at: lead.converted_at, source: 'lead', label: 'Lead', caseId: null, title: 'Μετατράπηκε σε Case', description: '', typeLabel: 'Lead', team: 'system', teamLabel: 'Σύστημα', userName: null });
    }
    if (!rows.some(a => a.action === 'created')) {
      out.push({ key: `ln-${lead.id}`, at: lead.created_at, source: 'lead', label: 'Lead', caseId: null, title: `Νέο lead · ${lead.source_label}`, description: '', typeLabel: 'Lead', team: 'system', teamLabel: 'Σύστημα', userName: null });
    }
  }
  return out.sort((a, b) => +new Date(b.at) - +new Date(a.at));
}
