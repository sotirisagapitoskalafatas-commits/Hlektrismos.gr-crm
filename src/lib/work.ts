/* "What needs my attention" — pure logic behind Home and My Work.
   Every number is derived from records the UI actually loaded; nothing is estimated, defaulted or invented.
   A value that cannot be known is returned as null (shown as "μη διαθέσιμο"), never as 0.

   METRIC DEFINITIONS (single source of truth for Home and My Work)
   • Εκπρόθεσμα      : my follow-ups, status pending (or snoozed and now due), due < now.
   • Σήμερα          : my follow-ups, same calendar day as now, due >= now.
   • Πρώτη επικοινωνία: leads assigned to me with stored status `new`.
   • Case με ενέργεια: active cases whose next-action owner is me (legacy fallback: I am an owner and no
                       next-action owner is recorded). Active = stage not in completed/lost/cancelled.
   • Χωρίς ανάθεση   : leads with status `new` and no assignee (shown to managers/admins).
   • Χωρίς κίνηση 7+ : active cases not updated for 7 days.                                            */

import { leadStatusDisplay } from './lead-status';
import type { StatusTone } from './lead-status';

export type WorkKind = 'followup' | 'lead' | 'case';
export type Bucket = 'overdue' | 'today' | 'now' | 'upcoming';
export type PrimaryAction = 'complete-followup' | 'open-case' | 'open-lead';

export interface FollowUpLike {
  id: string; case_id: string; due_at: string; channel: string; reason: string;
  assignee_id: string | null; status: 'pending' | 'completed' | 'cancelled' | 'snoozed'; snoozed_until: string | null;
  case: { id: string; case_no: string; title: string; customer: { full_name: string; phone?: string | null } | null } | null;
}
export interface CaseLike {
  id: string; case_no: string; title: string; current_stage: string; next_action: string; updated_at: string; value: number;
  owner_id: string | null; inside_sales_owner: string | null; field_sales_owner: string | null; back_office_owner: string | null;
  next_action_owner_id: string | null; customer: { full_name: string; phone?: string | null } | null;
}
export interface LeadLike {
  id: string; status: string | null; assigned_to_user_id: string | null; created_at: string;
  full_name: string | null; client_name: string | null; first_name: string | null; last_name: string | null;
  phone: string | null; service_category: string | null; company: string | null;
}

export interface WorkItem {
  key: string;
  kind: WorkKind;
  bucket: Bucket;
  title: string;
  subtitle: string;
  /** epoch ms; null when the record has no deadline. */
  due: number | null;
  /** epoch ms the item has been waiting since (lead creation / case last update); null for dated follow-ups. */
  since: number | null;
  statusLabel: string;
  statusTone: StatusTone;
  primary: { label: string; action: PrimaryAction };
  phone: string | null;
  followUpId?: string;
  caseId?: string;
  leadId?: string;
}

const TERMINAL = ['completed', 'lost', 'cancelled'];
const DAY = 86_400_000;
const CHANNEL: Record<string, string> = { phone: 'Τηλέφωνο', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', visit: 'Επίσκεψη', meeting: 'Συνάντηση' };
export const SERVICE: Record<string, string> = { electricity: 'Ρεύμα', gas: 'Φυσικό αέριο', solar: 'Φωτοβολταϊκά', ev: 'Ηλεκτροκίνηση', storage: 'Αποθήκευση' };

export const isActiveCase = (c: { current_stage: string }) => !TERMINAL.includes(c.current_stage);

export function leadName(l: Pick<LeadLike, 'full_name' | 'client_name' | 'first_name' | 'last_name' | 'company'>): string {
  const n = l.full_name || l.client_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.company;
  return n && n.trim() ? n.trim() : 'Χωρίς όνομα';
}

function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export function followUpBucket(dueMs: number, now: number): Bucket {
  if (dueMs < now) return 'overdue';
  return sameLocalDay(dueMs, now) ? 'today' : 'upcoming';
}

/** A follow-up is "mine and open" when assigned to me and pending, or snoozed and the snooze has ended. */
export function isOpenFollowUpFor(f: FollowUpLike, uid: string, now: number): boolean {
  if (f.assignee_id !== uid) return false;
  if (f.status === 'pending') return true;
  if (f.status === 'snoozed') return !!f.snoozed_until && new Date(f.snoozed_until).getTime() <= now;
  return false;
}

export function isMyCaseAction(c: CaseLike, uid: string): boolean {
  if (!isActiveCase(c)) return false;
  if (c.next_action_owner_id) return c.next_action_owner_id === uid;
  return [c.owner_id, c.inside_sales_owner, c.field_sales_owner, c.back_office_owner].includes(uid);
}

const RANK: Record<Bucket, number> = { overdue: 0, today: 1, now: 2, upcoming: 3 };

export function buildWorkItems(i: { uid: string; cases: CaseLike[]; followUps: FollowUpLike[]; leads: LeadLike[]; now: number }): WorkItem[] {
  const { uid, now } = i;
  const items: WorkItem[] = [];
  const caseWithFollowUpNow = new Set<string>();

  for (const f of i.followUps) {
    if (!isOpenFollowUpFor(f, uid, now)) continue;
    const dueMs = new Date(f.due_at).getTime();
    if (!Number.isFinite(dueMs)) continue;
    const bucket = followUpBucket(dueMs, now);
    if (bucket !== 'upcoming') caseWithFollowUpNow.add(f.case_id);
    items.push({
      key: `fu:${f.id}`, kind: 'followup', bucket,
      title: f.case?.customer?.full_name ?? f.case?.title ?? 'Follow-up',
      subtitle: [f.reason, CHANNEL[f.channel] ?? f.channel, f.case?.case_no].filter(Boolean).join(' · '),
      due: dueMs, since: null, statusLabel: bucket === 'overdue' ? 'Εκπρόθεσμο' : bucket === 'today' ? 'Σήμερα' : 'Προγραμματισμένο',
      statusTone: bucket === 'overdue' ? 'danger' : bucket === 'today' ? 'warning' : 'neutral',
      primary: { label: 'Ολοκλήρωση', action: 'complete-followup' },
      phone: f.case?.customer?.phone ?? null, followUpId: f.id, caseId: f.case_id,
    });
  }

  for (const l of i.leads) {
    if (l.assigned_to_user_id !== uid || l.status !== 'new') continue;
    const st = leadStatusDisplay(l.status);
    items.push({
      key: `lead:${l.id}`, kind: 'lead', bucket: 'now', title: leadName(l),
      subtitle: ['Πρώτη επικοινωνία', SERVICE[l.service_category ?? ''] ?? l.service_category].filter(Boolean).join(' · '),
      due: null, since: new Date(l.created_at).getTime(), statusLabel: st.label, statusTone: st.tone,
      primary: { label: 'Άνοιγμα lead', action: 'open-lead' }, phone: l.phone, leadId: l.id,
    });
  }

  for (const c of i.cases) {
    if (!isMyCaseAction(c, uid) || caseWithFollowUpNow.has(c.id)) continue;
    items.push({
      key: `case:${c.id}`, kind: 'case', bucket: 'now', title: c.customer?.full_name ?? c.title,
      subtitle: [c.next_action || 'Χρειάζεται ενέργεια', c.case_no].filter(Boolean).join(' · '),
      due: null, since: new Date(c.updated_at).getTime(), statusLabel: 'Case', statusTone: 'info',
      primary: { label: 'Άνοιγμα case', action: 'open-case' }, phone: c.customer?.phone ?? null, caseId: c.id,
    });
  }

  const created = new Map(i.leads.map((l) => [l.id, new Date(l.created_at).getTime()]));
  const updated = new Map(i.cases.map((c) => [c.id, new Date(c.updated_at).getTime()]));
  return items.sort((a, b) => {
    if (RANK[a.bucket] !== RANK[b.bucket]) return RANK[a.bucket] - RANK[b.bucket];
    if (a.due !== null && b.due !== null) return a.due - b.due;
    // no deadline: oldest waiting first (leads by creation, cases by staleness)
    const ta = a.leadId ? created.get(a.leadId) ?? 0 : a.caseId ? updated.get(a.caseId) ?? 0 : 0;
    const tb = b.leadId ? created.get(b.leadId) ?? 0 : b.caseId ? updated.get(b.caseId) ?? 0 : 0;
    return ta - tb;
  });
}

export interface HomeSummary {
  overdue: number;
  today: number;
  awaitingFirstContact: number;
  casesNeedingMyAction: number;
  team: null | {
    unassignedNewLeads: number;
    staleCases: number;
    overdueFollowUps: number;
    /** Sum of case values that are known (> 0) and the number of active cases with no value recorded. */
    pipelineKnownValue: number;
    activeCasesWithoutValue: number;
  };
}

export function buildHomeSummary(i: {
  uid: string; isTeamView: boolean; items: WorkItem[]; cases: CaseLike[]; leads: LeadLike[]; followUps: FollowUpLike[]; now: number;
}): HomeSummary {
  const count = (k: WorkKind, b?: Bucket) => i.items.filter((x) => x.kind === k && (!b || x.bucket === b)).length;
  const summary: HomeSummary = {
    overdue: count('followup', 'overdue'),
    today: count('followup', 'today'),
    awaitingFirstContact: count('lead'),
    casesNeedingMyAction: count('case'),
    team: null,
  };
  if (i.isTeamView) {
    const active = i.cases.filter(isActiveCase);
    summary.team = {
      unassignedNewLeads: i.leads.filter((l) => l.status === 'new' && !l.assigned_to_user_id).length,
      staleCases: active.filter((c) => i.now - new Date(c.updated_at).getTime() > 7 * DAY).length,
      overdueFollowUps: i.followUps.filter((f) => f.status === 'pending' && new Date(f.due_at).getTime() < i.now).length,
      pipelineKnownValue: active.reduce((s, c) => s + (c.value > 0 ? c.value : 0), 0),
      activeCasesWithoutValue: active.filter((c) => !(c.value > 0)).length,
    };
  }
  return summary;
}
