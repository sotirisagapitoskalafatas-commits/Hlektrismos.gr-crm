/* Case journey presentation logic (pure, unit-tested). Uses the EXISTING stages and STAGE_TRANSITIONS from roles.ts;
   nothing here changes stored values or server-side rules. The "responsible team per stage" is a display aid derived
   from the existing activity→team mapping; an explicit next-action owner on the case always takes precedence. */

import type { ChecklistItem } from './documents';

export type Team = 'inside_sales' | 'field_sales' | 'back_office';
export const TEAM_LABEL: Record<Team, string> = { inside_sales: 'Inside Sales', field_sales: 'Field Sales', back_office: 'Back Office' };

export const JOURNEY = ['new', 'contacted', 'offer', 'application', 'signed', 'document_check', 'submitted', 'activation', 'completed'] as const;
export const OUTCOMES = ['lost', 'cancelled'] as const;

export const STAGE_LABEL: Record<string, string> = {
  new: 'Νέο', contacted: 'Επικοινωνία', offer: 'Προσφορά', application: 'Αίτηση', signed: 'Υπογραφή',
  document_check: 'Έλεγχος εγγράφων', submitted: 'Καταχώρηση παρόχου', activation: 'Ενεργοποίηση', completed: 'Ολοκληρώθηκε',
  lost: 'Χάθηκε', cancelled: 'Ακυρώθηκε',
};
export const stageText = (s: string) => STAGE_LABEL[s] ?? s;

const STAGE_TEAM: Record<string, Team | null> = {
  new: 'inside_sales', contacted: 'inside_sales', offer: 'inside_sales',
  application: 'back_office', signed: 'field_sales', document_check: 'back_office',
  submitted: 'back_office', activation: 'back_office', completed: null, lost: null, cancelled: null,
};
export const teamForStage = (s: string): Team | null => STAGE_TEAM[s] ?? null;

/** Stages where missing customer documents block progress. */
const DOC_STAGES = ['application', 'signed', 'document_check', 'submitted'];

export type StepState = 'done' | 'current' | 'upcoming';
export interface Step { stage: string; label: string; state: StepState; reachable: boolean }

/** Stepper model for the 9-step journey. Terminal outcomes are reported separately, never as a step. */
export function journeySteps(current: string, allowedNext: readonly string[]): { steps: Step[]; outcome: string | null } {
  const idx = JOURNEY.indexOf(current as (typeof JOURNEY)[number]);
  const outcome = (OUTCOMES as readonly string[]).includes(current) ? current : null;
  const steps = JOURNEY.map((stage, i) => ({
    stage,
    label: stageText(stage),
    state: (idx < 0 ? 'upcoming' : i < idx ? 'done' : i === idx ? (stage === 'completed' ? 'done' : 'current') : 'upcoming') as StepState,
    reachable: allowedNext.includes(stage),
  }));
  return { steps, outcome };
}

export interface CaseLikeForFlow {
  current_stage: string;
  next_action: string;
  next_action_owner_id: string | null;
  next_follow_up_at: string | null;
}

export interface CaseNextStep {
  title: string;
  reason: string;
  /** Concrete things that block progress right now. */
  blockers: string[];
  /** Who should act: explicit owner when recorded, otherwise the team implied by the stage. */
  owner: { kind: 'person'; id: string } | { kind: 'team'; team: Team } | null;
  /** First allowed forward step (never an outcome), as a suggestion. */
  suggestedStage: string | null;
  done: boolean;
}

export function caseNextStep(c: CaseLikeForFlow, allowedNext: readonly string[], checklist: ChecklistItem[], now: number): CaseNextStep {
  if (c.current_stage === 'completed') return { title: 'Το case ολοκληρώθηκε', reason: 'Δεν απαιτείται άλλη ενέργεια.', blockers: [], owner: null, suggestedStage: null, done: true };
  if ((OUTCOMES as readonly string[]).includes(c.current_stage)) {
    return { title: `Το case έκλεισε: ${stageText(c.current_stage)}`, reason: 'Μπορεί να ανοίξει ξανά μόνο από εξουσιοδοτημένο χρήστη.', blockers: [], owner: null, suggestedStage: null, done: true };
  }

  const blockers: string[] = [];
  if (DOC_STAGES.includes(c.current_stage)) {
    const missing = checklist.filter(i => i.required && (i.status === 'missing' || i.status === 'rejected'));
    for (const m of missing) blockers.push(`${m.status === 'rejected' ? 'Απορρίφθηκε' : 'Λείπει'}: ${m.label}`);
  }
  if (c.next_follow_up_at && new Date(c.next_follow_up_at).getTime() < now) blockers.push('Το follow-up του case είναι εκπρόθεσμο');

  const forward = allowedNext.find(s => (JOURNEY as readonly string[]).includes(s) && JOURNEY.indexOf(s as (typeof JOURNEY)[number]) > JOURNEY.indexOf(c.current_stage as (typeof JOURNEY)[number])) ?? null;
  const team = teamForStage(c.current_stage);
  const owner = c.next_action_owner_id ? { kind: 'person' as const, id: c.next_action_owner_id } : team ? { kind: 'team' as const, team } : null;

  const title = c.next_action?.trim()
    ? c.next_action.trim()
    : blockers.length ? 'Συμπληρώστε τα δικαιολογητικά'
    : forward ? `Προετοιμασία για «${stageText(forward)}»` : 'Ελέγξτε το case';
  const reason = blockers.length
    ? `Υπάρχουν ${blockers.length === 1 ? '1 εκκρεμότητα' : `${blockers.length} εκκρεμότητες`} πριν προχωρήσει το case.`
    : forward ? `Το case είναι στο στάδιο «${stageText(c.current_stage)}». Το επόμενο βήμα είναι «${stageText(forward)}».`
    : `Το case είναι στο στάδιο «${stageText(c.current_stage)}».`;

  return { title, reason, blockers, owner, suggestedStage: forward, done: false };
}

/** Customer-level summary from that customer's cases. Unknown value (0/unset) is counted, never summed as €0. */
export function customerSummary(cases: { current_stage: string; value: number; next_follow_up_at: string | null }[], now: number) {
  const active = cases.filter(k => !['completed', 'lost', 'cancelled'].includes(k.current_stage));
  const upcoming = active.map(k => k.next_follow_up_at).filter((d): d is string => !!d).sort();
  return {
    total: cases.length,
    active: active.length,
    completed: cases.filter(k => k.current_stage === 'completed').length,
    knownValue: cases.reduce((s, k) => s + (k.value > 0 ? k.value : 0), 0),
    withoutValue: cases.filter(k => !(k.value > 0)).length,
    nextFollowUp: upcoming[0] ?? null,
    overdueFollowUp: upcoming.some(d => new Date(d).getTime() < now),
  };
}
