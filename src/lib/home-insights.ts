/* Home dashboard logic (pure, unit-tested): pipeline totals and the «Atlas AI» suggestions.
   - Pipeline: an active case without a value is UNKNOWN, not €0. Totals cover known values only and say how many
     cases were left out; when no active case has a value the total is null («μη διαθέσιμο»).
   - Suggestions are rules over the CRM records already loaded; nothing is invented and no AI model is called.
     Each one names a real count or record and carries a navigation action. */

const DAY = 86_400_000;
const TERMINAL = ['completed', 'lost', 'cancelled'];
/** Lead statuses that are no longer open work (the rest count as «ανοιχτά leads»). */
const CLOSED_LEAD = ['converted', 'lost', 'unqualified', 'duplicate'];
/** Stages where the case waits for documents or a signature (indicative; per the case-flow stage→team mapping). */
const PAPER_STAGES = ['application', 'signed', 'document_check'];

export interface PipeCase { id: string; current_stage: string; value: number | null; probability: number | null; updated_at: string; title?: string; customer?: { full_name: string } | null }
export interface PipeLead { status: string | null; assigned_to_user_id: string | null }
export interface PipeFollowUp { status: string; due_at: string }

export const isActive = (c: { current_stage: string }) => !TERMINAL.includes(c.current_stage);
export const isOpenLead = (l: { status: string | null }) => !CLOSED_LEAD.includes(l.status ?? '');
const hasValue = (c: PipeCase) => typeof c.value === 'number' && c.value > 0;

export interface PipelineStats {
  active: number;
  /** Sum of known values of active cases; null when none is known. */
  known: number | null;
  /** Σ value × probability over active cases with a known value; null when none is known. */
  weighted: number | null;
  withoutValue: number;
  byStage: Record<string, number>;
}

export function pipelineStats(cases: PipeCase[]): PipelineStats {
  const active = cases.filter(isActive);
  const valued = active.filter(hasValue);
  const byStage: Record<string, number> = {};
  for (const c of active) byStage[c.current_stage] = (byStage[c.current_stage] ?? 0) + 1;
  return {
    active: active.length,
    known: valued.length ? valued.reduce((s, c) => s + (c.value as number), 0) : null,
    weighted: valued.length ? valued.reduce((s, c) => s + (c.value as number) * ((c.probability ?? 0) / 100), 0) : null,
    withoutValue: active.length - valued.length,
    byStage,
  };
}

export type InsightAction =
  | { kind: 'case'; id: string }
  | { kind: 'page'; page: string; filters?: Record<string, string> };

export interface Insight { id: string; tone: 'attention' | 'info'; text: string; action: InsightAction; actionLabel: string }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const nameOf = (c: PipeCase) => c.customer?.full_name ?? c.title ?? 'case';

export function homeInsights(i: { cases: PipeCase[]; leads: PipeLead[]; followUps: PipeFollowUp[]; now: number; teamView: boolean }): Insight[] {
  const out: Insight[] = [];
  const active = i.cases.filter(isActive);

  const stale = active
    .map(c => ({ c, days: Math.floor((i.now - new Date(c.updated_at).getTime()) / DAY) }))
    .filter(x => Number.isFinite(x.days) && x.days >= 14)
    .sort((a, b) => b.days - a.days);
  if (stale.length) {
    const top = stale[0];
    out.push({
      id: 'stale', tone: 'attention',
      text: stale.length === 1
        ? `Το case «${nameOf(top.c)}» δεν έχει ενημέρωση εδώ και ${top.days} ημέρες.`
        : `${stale.length} cases χωρίς ενημέρωση 14+ ημέρες — το παλαιότερο («${nameOf(top.c)}») ${top.days} ημέρες.`,
      action: { kind: 'case', id: top.c.id }, actionLabel: 'Άνοιγμα case',
    });
  }

  if (i.teamView) {
    const unassigned = i.leads.filter(l => l.status === 'new' && !l.assigned_to_user_id).length;
    if (unassigned) out.push({ id: 'unassigned', tone: 'attention', text: `${plural(unassigned, 'νέο lead περιμένει', 'νέα leads περιμένουν')} ανάθεση.`, action: { kind: 'page', page: 'leads' }, actionLabel: 'Ανάθεση' });
    const overdue = i.followUps.filter(f => f.status === 'pending' && new Date(f.due_at).getTime() < i.now).length;
    if (overdue) out.push({ id: 'overdue', tone: 'attention', text: `Η ομάδα έχει ${plural(overdue, 'εκπρόθεσμο follow-up', 'εκπρόθεσμα follow-ups')}.`, action: { kind: 'page', page: 'followups', filters: { status: 'pending' } }, actionLabel: 'Προβολή' });
  }

  const paper = active.filter(c => PAPER_STAGES.includes(c.current_stage)).length;
  if (paper) out.push({ id: 'paper', tone: 'info', text: `${plural(paper, 'case βρίσκεται', 'cases βρίσκονται')} σε στάδιο αίτησης, υπογραφής ή ελέγχου εγγράφων.`, action: { kind: 'page', page: 'backoffice' }, actionLabel: 'Λειτουργίες' });

  const noValue = active.filter(c => !hasValue(c)).length;
  if (noValue) out.push({ id: 'novalue', tone: 'info', text: `${plural(noValue, 'ενεργό case δεν έχει', 'ενεργά cases δεν έχουν')} καταχωρημένη αξία — δεν μετρούν στο pipeline.`, action: { kind: 'page', page: 'cases', filters: { status: 'active' } }, actionLabel: 'Cases' });

  return out.slice(0, 4);
}
