/* Capabilities that wait for a staged database update (docs/ops/PENDING_MIGRATIONS.md).
   Users never see developer wording («migration phase2/07 …»). Everyone gets one neutral Greek sentence; admins,
   who decide when to apply the update, also see which update it waits for, in plain Greek, in the Admin centre. */

import type { Role } from './roles';

export const NOT_YET = 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.';

/** Admins get the technical status; everybody else the neutral sentence. */
export function pendingText(role: Role | null | undefined, technical: string, neutral: string = NOT_YET): string {
  return role === 'admin' ? technical : neutral;
}
