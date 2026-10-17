/* «Φάκελος πελάτη» (docs/product/UNIFIED_CUSTOMER_FOLDER.md §2, Part B). Pure helpers, no database access:
   the status badge, the fixed tab order, which case the case-scoped tabs show, and the header subtitle. */

const CLOSED = ['completed', 'lost', 'cancelled'];
type CaseLike = { id: string; current_stage: string; next_follow_up_at?: string | null; updated_at?: string; created_at?: string; next_action_owner_id?: string | null; owner_id?: string | null };

export type FolderBadge = { id: 'lead' | 'open' | 'customer' | 'none'; label: string };

/** One computed badge, never typed in. «none»: every case was lost or cancelled (Part A §5 question 3 is open;
 *  «Χωρίς ενεργό case» is a neutral placeholder until it is answered). */
export function folderBadge(input: { isLead: boolean; cases: CaseLike[] }): FolderBadge {
  if (input.isLead) return { id: 'lead', label: 'Lead' };
  if (input.cases.some(k => !CLOSED.includes(k.current_stage))) return { id: 'open', label: 'Case σε εξέλιξη' };
  if (input.cases.some(k => k.current_stage === 'completed')) return { id: 'customer', label: 'Πελάτης' };
  return { id: 'none', label: 'Χωρίς ενεργό case' };
}

export type FolderTab = 'overview' | 'cases' | 'docs' | 'history' | 'followups' | 'visits' | 'offers' | 'signatures' | 'backoffice';
/** Same order everywhere. `needsCase`: shown as «Διαθέσιμο μετά τη μετατροπή σε Case» for an unconverted lead;
 *  `scoped`: shows the selected case. */
export const FOLDER_TABS: { id: FolderTab; label: string; needsCase: boolean; scoped: boolean }[] = [
  { id: 'overview', label: 'Σύνοψη', needsCase: false, scoped: false },
  { id: 'cases', label: 'Cases', needsCase: true, scoped: false },
  { id: 'docs', label: 'Έγγραφα', needsCase: false, scoped: true },
  { id: 'history', label: 'Ιστορικό', needsCase: false, scoped: false },
  { id: 'followups', label: 'Follow-ups', needsCase: true, scoped: true },
  { id: 'visits', label: 'Επισκέψεις', needsCase: true, scoped: true },
  { id: 'offers', label: 'Προσφορές', needsCase: true, scoped: true },
  { id: 'signatures', label: 'Υπογραφές', needsCase: true, scoped: true },
  { id: 'backoffice', label: 'Back Office', needsCase: true, scoped: true },
];
export const NEEDS_CASE_TEXT = 'Διαθέσιμο μετά τη μετατροπή σε Case';

/** Tabs a role sees: Back Office only for the roles that have it on the case today (create_application). */
export const folderTabs = (opts: { backOffice: boolean }) => FOLDER_TABS.filter(t => t.id !== 'backoffice' || opts.backOffice);

/** The most urgent open case: earliest follow-up, then the one untouched longest. */
export function mostUrgentCase<T extends CaseLike>(cases: T[]): T | null {
  const open = cases.filter(k => !CLOSED.includes(k.current_stage));
  if (!open.length) return null;
  return [...open].sort((a, b) => {
    const fa = a.next_follow_up_at ? +new Date(a.next_follow_up_at) : Infinity;
    const fb = b.next_follow_up_at ? +new Date(b.next_follow_up_at) : Infinity;
    return fa - fb || +new Date(a.updated_at ?? 0) - +new Date(b.updated_at ?? 0);
  })[0];
}

/** Case the scoped tabs show: the one picked; else the only one; else the most urgent open one; else the newest. */
export function selectedCase<T extends CaseLike>(cases: T[], pickedId: string | null): T | null {
  if (!cases.length) return null;
  const picked = pickedId ? cases.find(k => k.id === pickedId) : undefined;
  if (picked) return picked;
  if (cases.length === 1) return cases[0];
  return mostUrgentCase(cases) ?? [...cases].sort((a, b) => +new Date(b.created_at ?? 0) - +new Date(a.created_at ?? 0))[0];
}

/** «Αθήνα · Υπεύθυνος: Εύα · από 12/10». The owner is the next-action owner of the most urgent open case. */
export function folderSubtitle(input: { city?: string | null; since: string; cases: CaseLike[]; staffName: (id: string) => string | null; fmtDate: (iso: string) => string }): string {
  const urgent = mostUrgentCase(input.cases);
  const ownerId = urgent ? urgent.next_action_owner_id ?? urgent.owner_id ?? null : null;
  const owner = ownerId ? input.staffName(ownerId) : null;
  return [input.city || '', owner ? `Υπεύθυνος: ${owner}` : '', `από ${input.fmtDate(input.since)}`].filter(Boolean).join(' · ');
}

/** «Προέλευση» (Σύνοψη). A case with a lead_id whose lead cannot be read (trashed, or not visible to this user)
 *  is NOT «χωρίς lead»: it says the lead is unavailable. «none» only when no case came from a lead. */
export type FolderOrigin = { kind: 'none' | 'unavailable' | 'lead'; leadId: string | null };
export function folderOrigin(cases: { lead_id?: string | null; created_at?: string }[], readable: (leadId: string) => boolean): FolderOrigin {
  const oldest = [...cases].sort((a, b) => +new Date(a.created_at ?? 0) - +new Date(b.created_at ?? 0)).find(k => k.lead_id);
  if (!oldest?.lead_id) return { kind: 'none', leadId: null };
  return { kind: readable(oldest.lead_id) ? 'lead' : 'unavailable', leadId: oldest.lead_id };
}
export const ORIGIN_TEXT = { none: 'Καταχώρηση χωρίς lead.', unavailable: 'Το lead δεν είναι διαθέσιμο (μπορεί να έχει διαγραφεί ή να μην έχετε πρόσβαση).' } as const;
