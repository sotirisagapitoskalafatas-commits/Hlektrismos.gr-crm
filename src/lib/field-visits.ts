/* Field visits that can exist before any Case (staged phase7/01). PURE: no network, no storage. Everything here is unit-tested; the screens only call it.
   A visit points at a lead, a customer, a case, or carries a controlled `prospect`. «Ready to visit» is DERIVED, never stored; «rescheduled» is a link
   (the old visit is cancelled with status_reason 'rescheduled: …', the new one has rescheduled_from_id). The only new stored status is no_show. */
import { OUTCOMES } from './field-day';
import type { VisitOutcome } from './field-day';

export type VisitStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export const VISIT_STATUS_TEXT: Record<VisitStatus, string> = {
  planned: 'Προγραμματισμένη', in_progress: 'Σε εξέλιξη', completed: 'Ολοκληρώθηκε', cancelled: 'Ακυρώθηκε', no_show: 'Δεν εμφανίστηκε',
};
export const RESCHEDULED_PREFIX = 'rescheduled:';
export const isRescheduled = (v: { status: string; status_reason?: string | null }) => v.status === 'cancelled' && (v.status_reason ?? '').startsWith(RESCHEDULED_PREFIX);
/** The text the screen shows for a visit's state: a rescheduled visit says so instead of «Ακυρώθηκε». */
export function visitStateText(v: { status: string; status_reason?: string | null }): string {
  if (isRescheduled(v)) return 'Επαναπρογραμματίστηκε';
  return VISIT_STATUS_TEXT[v.status as VisitStatus] ?? v.status;
}
export const reasonOf = (v: { status_reason?: string | null }) => (v.status_reason ?? '').replace(/^rescheduled:\s*/, '').trim();
/** Terminal states: nothing more can be done to the visit itself. */
export const isClosed = (status: string) => status === 'completed' || status === 'cancelled' || status === 'no_show';

export interface Prospect { name: string; phone?: string; address?: string }
export interface VisitLinks {
  case_id?: string | null; lead_id?: string | null; customer_id?: string | null; supply_point_id?: string | null; application_id?: string | null; prospect?: Prospect | null;
}
export type SubjectKind = 'case' | 'customer' | 'lead' | 'prospect' | 'none';
export interface SubjectNames { caseTitle?: string | null; customerName?: string | null; leadName?: string | null }

/** What the visit is about, strongest link first. A visit with no Case simply has no Case chip. */
export function visitSubject(v: VisitLinks, names: SubjectNames = {}): { kind: SubjectKind; label: string; chips: SubjectKind[] } {
  const chips: SubjectKind[] = [];
  if (v.case_id) chips.push('case');
  if (v.customer_id) chips.push('customer');
  if (v.lead_id) chips.push('lead');
  if (!chips.length && v.prospect?.name) chips.push('prospect');
  const label = names.customerName?.trim() || names.leadName?.trim() || v.prospect?.name?.trim() || names.caseTitle?.trim() || '—';
  return { kind: chips[0] ?? 'none', label, chips };
}
export const SUBJECT_CHIP: Record<SubjectKind, string> = { case: 'Case', customer: 'Πελάτης', lead: 'Lead', prospect: 'Νέος υποψήφιος', none: '' };

/** «Έτοιμη (στον χώρο)»: a planned visit scheduled within [-30 min, +60 min] of now. Derived on the screen, never stored. With a known distance it also needs to be near. */
export function isReadyToVisit(v: { status: string; scheduled_at: string | null }, now: number, distanceM?: number | null, radiusM = 150): boolean {
  if (v.status !== 'planned' || !v.scheduled_at) return false;
  const t = new Date(v.scheduled_at).getTime();
  if (!Number.isFinite(t) || t < now - 30 * 60_000 || t > now + 60 * 60_000) return false;
  return distanceM == null || distanceM <= radiusM;
}

/* ───────── input validation (the same rules the database guard enforces, so the form can say it first) ───────── */
export interface ScheduleInput { who: 'existing' | 'prospect'; leadId?: string | null; customerId?: string | null; prospect?: Prospect | null; scheduledAt: string; purpose?: string }
export type ScheduleErrors = Partial<Record<'who' | 'name' | 'scheduledAt', string>>;
export function validateSchedule(i: ScheduleInput, now = Date.now()): ScheduleErrors {
  const e: ScheduleErrors = {};
  if (i.who === 'existing' && !i.leadId && !i.customerId) e.who = 'Επιλέξτε Lead ή πελάτη, ή καταχωρίστε νέο υποψήφιο.';
  if (i.who === 'prospect' && !i.prospect?.name?.trim()) e.name = 'Το όνομα ή η επωνυμία είναι υποχρεωτικό.';
  const t = new Date(i.scheduledAt).getTime();
  if (!i.scheduledAt || !Number.isFinite(t)) e.scheduledAt = 'Επιλέξτε ημερομηνία και ώρα.';
  else if (t < now - 24 * 3600_000) e.scheduledAt = 'Η ημερομηνία είναι στο παρελθόν.';
  return e;
}
export const hasErrors = (e: object) => Object.keys(e).length > 0;
/** A reason must say something: cancel, no-show and reschedule need it (the guard refuses a blank one). */
export const reasonError = (r: string | null | undefined): string | null => (r && r.trim().length >= 3 ? null : 'Γράψτε τον λόγο.');

/** The row to insert. A prospect is stored as the controlled jsonb capture; links are only added when given. Never contains an owner: the database forces it. */
export function visitInsertRow(i: ScheduleInput): Record<string, unknown> {
  const row: Record<string, unknown> = { purpose: (i.purpose ?? '').trim(), scheduled_at: new Date(i.scheduledAt).toISOString(), status: 'planned' };
  if (i.who === 'existing') { if (i.leadId) row.lead_id = i.leadId; if (i.customerId) row.customer_id = i.customerId; }
  else if (i.prospect) {
    const p: Prospect = { name: i.prospect.name.trim() };
    if (i.prospect.phone?.trim()) p.phone = i.prospect.phone.trim();
    if (i.prospect.address?.trim()) p.address = i.prospect.address.trim();
    row.prospect = p;
  }
  return row;
}

/* ───────── outcomes → the correct next action (not just a label) ───────── */
export type NextKind = 'application' | 'handover' | 'followup' | 'manager' | 'reschedule' | 'none';
export interface NextStep { kind: NextKind; needs: ('reason' | 'assignee' | 'due')[]; text: string }
/** Where each recorded outcome leads. «Νέο Sale»: a visit with a Case continues the existing handover; a visit without one continues in the Application. */
export function nextStepFor(outcome: VisitOutcome | null | undefined, ctx: { hasCase: boolean }): NextStep {
  if (!outcome) return { kind: 'none', needs: [], text: '' };
  switch (outcome.key) {
    case 'new_sale': return ctx.hasCase
      ? { kind: 'handover', needs: [], text: 'Συνέχεια: στοιχεία πελάτη, έγγραφα και παράδοση στο Back Office.' }
      : { kind: 'application', needs: [], text: 'Συνέχεια στην Αίτηση ενεργειακής υπηρεσίας (πελάτης, παροχή, υπηρεσία, έγγραφα).' };
    case 'manager': return { kind: 'manager', needs: ['reason'], text: 'Δημιουργείται follow-up στην ουρά του Admin / Back Office.' };
    case 'revisit': case 'not_found': return { kind: 'reschedule', needs: [], text: 'Μπορείτε να προγραμματίσετε νέα επίσκεψη.' };
    case 'no_sale': case 'not_interested': return { kind: 'none', needs: ['reason'], text: 'Καταγράφεται ο λόγος και διατηρείται το ιστορικό.' };
    default: return outcome.next === 'followup'
      ? { kind: 'followup', needs: ['reason', 'assignee', 'due'], text: 'Απαιτείται follow-up: λόγος, υπεύθυνος και ημερομηνία.' }
      : { kind: 'none', needs: [], text: '' };
  }
}
export const outcomeByKey = (key: string) => OUTCOMES.find((o) => o.key === key) ?? null;

export interface FollowUpInput { reason: string; assigneeId: string | null; dueAt: string }
export function validateFollowUp(i: FollowUpInput): Partial<Record<'reason' | 'assignee' | 'due', string>> {
  const e: Partial<Record<'reason' | 'assignee' | 'due', string>> = {};
  if (!i.reason.trim()) e.reason = 'Γράψτε τον λόγο του follow-up.';
  if (!i.assigneeId) e.assignee = 'Επιλέξτε υπεύθυνο.';
  if (!i.dueAt || !Number.isFinite(new Date(i.dueAt).getTime())) e.due = 'Επιλέξτε ημερομηνία.';
  return e;
}
/** A follow-up row for a visit WITHOUT a Case hangs on the lead / customer / visit (staged phase7/01); with a Case it keeps the existing shape. */
export function followUpRow(v: VisitLinks & { id: string }, i: FollowUpInput, kind?: 'manager'): Record<string, unknown> {
  const row: Record<string, unknown> = { due_at: new Date(i.dueAt).toISOString(), channel: 'other', priority: kind === 'manager' ? 'high' : 'normal', reason: i.reason.trim(), assignee_id: i.assigneeId, visit_id: v.id };
  if (v.case_id) row.case_id = v.case_id; else { if (v.lead_id) row.lead_id = v.lead_id; if (v.customer_id) row.customer_id = v.customer_id; }
  if (kind) row.kind = kind;
  return row;
}

/* ───────── offline queue: only what a replay needs ───────── */
/** The payload that may be kept in the browser's offline queue: the visit id, the position and the outcome TEXT. Never a prospect's name, phone or address, never a document. */
export function queuePayload(p: { visitId: string; lat?: number; lng?: number; accuracy?: number; notes?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { visitId: p.visitId };
  if (typeof p.lat === 'number' && typeof p.lng === 'number') { out.lat = p.lat; out.lng = p.lng; if (typeof p.accuracy === 'number') out.accuracy = p.accuracy; }
  if (p.notes) out.notes = p.notes.slice(0, 500);
  return out;
}
export const QUEUE_FORBIDDEN_KEYS = ['prospect', 'name', 'phone', 'email', 'address', 'file', 'document', 'storage_path'] as const;
