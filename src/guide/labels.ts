/* Words the Learning Centre screens share. */
import type { GuideStatus } from './markdown';

export const STATUS_TEXT: Record<GuideStatus, { label: string; pill: string }> = {
  verified: { label: 'Επαληθευμένο', pill: 'ui-pill--green' },
  'partially-verified': { label: 'Μερικώς επαληθευμένο', pill: 'ui-pill--orange' },
  planned: { label: 'Προγραμματισμένο: δεν υπάρχει ακόμη', pill: 'ui-pill--gray' },
};
export const LEVEL_TEXT = { beginner: 'Αρχάριος', intermediate: 'Ενδιάμεσος', advanced: 'Προχωρημένος' } as const;
