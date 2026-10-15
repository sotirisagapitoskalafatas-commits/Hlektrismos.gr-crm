/* Case workflow rules on the client (pure, unit-tested). The database is the authority
   (staged migration phase2/07); these only decide what to OFFER and how to explain a refusal. */

import type { Role } from './roles';

export const RETURNABLE_STAGES = ['application', 'document_check', 'submitted', 'activation'] as const;
export type ReturnTeam = 'inside_sales' | 'field_sales';
export const RETURN_TEAM_LABEL: Record<ReturnTeam, string> = { inside_sales: 'Inside Sales', field_sales: 'Field Sales' };

export interface ReturnableCase { current_stage: string; returned_at?: string | null; return_to_team?: string | null; next_action_owner_id?: string | null }

export const canReturn = (role: Role | null | undefined, c: ReturnableCase) =>
  (role === 'back_office' || role === 'admin' || role === 'manager')
  && (RETURNABLE_STAGES as readonly string[]).includes(c.current_stage) && !c.returned_at;

export const canResubmit = (role: Role | null | undefined, uid: string | null | undefined, c: ReturnableCase) =>
  !!c.returned_at && (role === 'admin' || role === 'manager' || role === c.return_to_team || (!!uid && c.next_action_owner_id === uid));

/** Missing signature → Field Sales (in-person step); anything else → Inside Sales (owns the customer contact). */
export const defaultReturnTeam = (items: string[]): ReturnTeam => (items.some(i => /υπογ/i.test(i)) ? 'field_sales' : 'inside_sales');

export type BlockerStatus = 'missing' | 'rejected' | 'unverified';
/** mode: 'warn' (default — shown, never blocks) or 'block' (the database refuses the move). Absent = an older server: treat as block. */
export interface StageBlocker { label: string; status: BlockerStatus; mode?: 'warn' | 'block' }
export type StageError = { kind: 'documents'; blockers: StageBlocker[] } | { kind: 'transition' } | { kind: 'other'; message: string };

export const BLOCKER_TEXT: Record<BlockerStatus, string> = { missing: 'λείπει', rejected: 'απορρίφθηκε', unverified: 'δεν έχει ελεγχθεί' };

/** Reads the database refusal raised by cases_stage_guard (hint + JSON detail). */
export function parseStageError(err: { message?: string; details?: string | null; hint?: string | null } | null | undefined): StageError | null {
  if (!err) return null;
  if (err.hint === 'document_blockers' || /stage_blocked/.test(err.message ?? '')) {
    try {
      const list = JSON.parse(err.details ?? '[]') as { label?: string; status?: string }[];
      return { kind: 'documents', blockers: list.map(b => ({ label: String(b.label ?? ''), status: (['missing', 'rejected', 'unverified'].includes(String(b.status)) ? b.status : 'missing') as BlockerStatus })) };
    } catch { return { kind: 'documents', blockers: [] }; }
  }
  if (err.hint === 'transition' || /stage_transition_not_allowed/.test(err.message ?? '')) return { kind: 'transition' };
  return { kind: 'other', message: err.message ?? '' };
}

export function stageErrorText(e: StageError): string {
  if (e.kind === 'documents') return e.blockers.length
    ? `Δεν επιτρέπεται η μετάβαση: ${e.blockers.map(b => `${b.label} (${BLOCKER_TEXT[b.status]})`).join(' · ')}.`
    : 'Δεν επιτρέπεται η μετάβαση: λείπουν απαιτούμενα έγγραφα.';
  if (e.kind === 'transition') return 'Η μετάβαση σε αυτό το στάδιο δεν επιτρέπεται από το τρέχον στάδιο.';
  if (/PREVIEW_READ_ONLY|μόνο ανάγνωση/.test(e.message)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση.';
  if (/not allowed|42501|permission/i.test(e.message)) return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.';
  if (/reason of at least/i.test(e.message)) return 'Χρειάζεται αιτιολογία τουλάχιστον 10 χαρακτήρων.';
  if (/at least one missing/i.test(e.message)) return 'Επιλέξτε τουλάχιστον ένα στοιχείο που λείπει ή είναι λάθος.';
  if (/already returned/i.test(e.message)) return 'Το case έχει ήδη επιστραφεί.';
  if (/Could not find the function|PGRST202|schema cache/i.test(e.message)) return 'Η λειτουργία ενεργοποιείται μετά την εφαρμογή της migration phase2/07 (εκκρεμεί έγκριση).';
  return 'Η ενέργεια απέτυχε. Δοκιμάστε ξανά.';
}
