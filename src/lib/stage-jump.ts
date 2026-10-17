/* Direct stage buttons on the case's Back Office tab («Ενεργοποίηση», «Ολοκλήρωση»).
   They act only when the target is an allowed next stage — the same list the database enforces after phase2/07
   (case_stage_transitions). Otherwise they explain what has to happen first. The app never steps through stages on
   its own: that would record work (e.g. «Καταχώρηση Παρόχου») that nobody did. */

import { STAGES, STAGE_TRANSITIONS, can } from './roles';
import type { Role, Stage } from './roles';
// Same wording as the case stepper («Πορεία»).
import { stageText as stageLabel } from './case-flow';

export type JumpCheck = { allowed: true } | { allowed: false; message: string };

/** Shortest path of allowed moves from `from` to `to` (excluding lost/cancelled), or null. */
function path(from: Stage, to: Stage): Stage[] | null {
  const seen = new Set<Stage>([from]);
  const queue: Stage[][] = [[from]];
  while (queue.length) {
    const p = queue.shift()!;
    for (const n of STAGE_TRANSITIONS[p[p.length - 1]] ?? []) {
      if (n === 'lost' || n === 'cancelled' || seen.has(n)) continue;
      const next = [...p, n];
      if (n === to) return next;
      seen.add(n);
      queue.push(next);
    }
  }
  return null;
}

export function checkJump(current: Stage, target: Stage): JumpCheck {
  if (current === target) return { allowed: false, message: `Το case είναι ήδη στο στάδιο «${stageLabel(target)}».` };
  if ((STAGE_TRANSITIONS[current] ?? []).includes(target)) return { allowed: true };
  if (current === 'completed') return { allowed: false, message: 'Το case έχει ολοκληρωθεί· δεν αλλάζει στάδιο.' };
  if (current === 'lost' || current === 'cancelled') {
    return { allowed: false, message: `Το case είναι «${stageLabel(current)}». Ανοίξτε το ξανά (→ «Νέο») πριν από οποιαδήποτε άλλη μετάβαση.` };
  }
  const p = path(current, target);
  if (!p) return { allowed: false, message: `Η μετάβαση «${stageLabel(current)}» → «${stageLabel(target)}» δεν επιτρέπεται.` };
  const before = p[p.length - 2];
  return {
    allowed: false,
    message: `«${stageLabel(target)}» γίνεται μόνο από «${stageLabel(before)}». Το case είναι στο «${stageLabel(current)}» — επόμενο βήμα: «${stageLabel(p[1])}»${p.length > 3 ? ` (χρειάζονται πρώτα ${p.length - 2} βήματα)` : ''}.`,
  };
}


/* ---- «Αλλαγή σταδίου από Back Office» (staged phase2/07b set_case_stage) ----------------------------------------
   Back Office works a case from where it really is, so it may move a case to any other stage with a written reason.
   Mirrors the SQL exactly (a test compares them over every role x from x to): who = the roles that hold
   «create_application»; not to the same stage; a completed case is final; completed only from «Ενεργοποίηση». */
export const STAGE_SET_MIN_REASON = 10;

export const canUseStageSet = (role: Role | null | undefined) => !!role && can(role, 'create_application');

export function canSetStage(role: Role | null | undefined, from: string, to: string): boolean {
  if (!canUseStageSet(role)) return false;
  if (from === to || from === 'completed') return false;
  if (to === 'completed' && from !== 'activation') return false;
  return STAGES.some(s => s.id === to);
}

/** The stages the control offers for a case in `from`, in journey order (final outcomes last). */
export const stageSetTargets = (role: Role | null | undefined, from: string): Stage[] =>
  STAGES.map(s => s.id).filter(to => canSetStage(role, from, to));

/** Greek text for a refusal of set_case_stage (or its absence). Never shows migration or developer wording. */
export function stageSetErrorText(message: string | null | undefined): string {
  const m = message ?? '';
  if (/PREVIEW_READ_ONLY|μόνο ανάγνωση/.test(m)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση.';
  if (/Could not find the function|PGRST202|schema cache/i.test(m)) return 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.';
  if (/not allowed|42501|permission/i.test(m)) return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.';
  if (/reason of at least/i.test(m)) return `Χρειάζεται αιτιολογία τουλάχιστον ${STAGE_SET_MIN_REASON} χαρακτήρων.`;
  if (/already in this stage/i.test(m)) return 'Το case είναι ήδη σε αυτό το στάδιο.';
  if (/completed case does not change/i.test(m)) return 'Το case έχει ολοκληρωθεί· δεν αλλάζει στάδιο.';
  if (/completed only from/i.test(m)) return `«${stageLabel('completed')}» γίνεται μόνο από «${stageLabel('activation')}».`;
  if (/unknown stage|case not found/i.test(m)) return 'Η αλλαγή σταδίου δεν ήταν δυνατή.';
  return 'Η αλλαγή σταδίου δεν αποθηκεύτηκε. Δοκιμάστε ξανά.';
}


/* ---- «Επαναφορά ολοκληρωμένου case» (staged phase2/07c reopen_completed_case) ----------------------------------
   A completed case is final on the ordinary path. The one exception is an ADMIN, with a written reason, to one of the
   working stages. Mirrors the SQL (a test compares them): who = admin only; only a completed case; the target is one of
   new … activation, never completed, lost or cancelled. */
export const canReopenCase = (role: Role | null | undefined, stage: string | null | undefined) => role === 'admin' && stage === 'completed';

/** The stages the reopening may go to, in journey order. */
export const reopenTargets = (): Stage[] => STAGES.map(s => s.id).filter(id => id !== 'completed' && id !== 'lost' && id !== 'cancelled');

/** Greek text for a refusal of reopen_completed_case (or its absence). Never shows migration or developer wording. */
export function reopenErrorText(message: string | null | undefined): string {
  const m = message ?? '';
  if (/PREVIEW_READ_ONLY|μόνο ανάγνωση/.test(m)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση.';
  if (/Could not find the function|PGRST202|schema cache/i.test(m)) return 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.';
  if (/not allowed|42501|permission/i.test(m)) return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.';
  if (/reason of at least/i.test(m)) return `Χρειάζεται αιτιολογία τουλάχιστον ${STAGE_SET_MIN_REASON} χαρακτήρων.`;
  if (/not completed/i.test(m)) return 'Το case δεν είναι ολοκληρωμένο.';
  if (/unknown stage|case not found/i.test(m)) return 'Η επαναφορά δεν ήταν δυνατή.';
  return 'Η επαναφορά του case δεν αποθηκεύτηκε. Δοκιμάστε ξανά.';
}
