/* Direct stage buttons on the case's Back Office tab («Ενεργοποίηση», «Ολοκλήρωση»).
   They act only when the target is an allowed next stage — the same list the database enforces after phase2/07
   (case_stage_transitions). Otherwise they explain what has to happen first. The app never steps through stages on
   its own: that would record work (e.g. «Καταχώρηση Παρόχου») that nobody did. */

import { STAGE_TRANSITIONS } from './roles';
import type { Stage } from './roles';
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
