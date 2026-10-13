/* Text analysis helpers for the mascot. They only read the visitor's own
   message to pick a *tone* (empathetic) or a small thematic accent; they
   never claim that anything was calculated or compared. */

import type { Topic } from './mascotController';

/** Lower-case, strip Greek tonos/diaeresis so «πρόβλημα» matches «προβλημα». */
function norm(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const DIFFICULTY_RE = new RegExp(
  [
    'δεν καταλαβαινω', 'μπερδευτηκα', 'μπερδευομαι', 'δεν ξερω τι να κανω',
    'εκνευρισ', 'θυμωμεν', 'απογοητευ', 'ταλαιπωρ', 'προβλημα', 'δεν δουλευει',
    'χαλια', 'απαραδεκτ', 'πανακριβ', 'δυσκολευομαι', 'βαρεθηκα', 'αγχωμεν', 'εχω αγχος',
  ].join('|'),
);

/** True only when the visitor clearly says they are struggling or frustrated. */
export function detectDifficulty(text: string): boolean {
  return DIFFICULTY_RE.test(norm(text));
}

/** Rough topic of the visitor's message, used for a tiny visual accent only. */
export function detectTopic(text: string): Topic | undefined {
  const t = norm(text);
  if (/φωτοβολτ|ηλιακ/.test(t)) return 'solar';
  if (/ηλεκτροκινησ|φορτιστ|ηλεκτρικο αυτοκινητ/.test(t)) return 'mobility';
  if (/αεριο/.test(t)) return 'gas';
  if (/ρευμα|ηλεκτρικ|κιλοβατ|παροχ|τιμολογ/.test(t)) return 'electricity';
  if (/εξοικονομ|μειωσ|φθηνοτερ|λογαριασμ/.test(t)) return 'savings';
  return undefined;
}
