/* Greek names for stored status codes (UNIFIED_CUSTOMER_FOLDER.md §3: L4–L7, T3). Pure, no database access.
   A known code gets its Greek name. An unknown code made of latin letters (a new code nobody translated yet) is
   never shown raw; text a person typed into a free-text status is shown as typed. */

export const DOC_STATUS_TEXT: Record<string, string> = {
  required: 'Απαιτείται',
  received: 'Παραλήφθηκε',
  verified: 'Ελέγχθηκε',
  rejected: 'Απορρίφθηκε',
  missing: 'Λείπει',
};

export const OFFER_STATUS_TEXT: Record<string, string> = {
  draft: 'Πρόχειρη',
  sent: 'Στάλθηκε',
  accepted: 'Έγινε αποδεκτή',
  rejected: 'Απορρίφθηκε',
};

export const SIGNATURE_STATUS_TEXT: Record<string, string> = {
  captured: 'Καταγράφηκε',
  received: 'Παραλήφθηκε',
  verified: 'Ελέγχθηκε',
  rejected: 'Απορρίφθηκε',
};

/** cases.application_status / activation_status are free text; these are the codes the app or a provider writes. */
export const APPLICATION_STATUS_TEXT: Record<string, string> = {
  pending: 'Σε εκκρεμότητα',
  draft: 'Πρόχειρη',
  submitted: 'Υποβλήθηκε',
  approved: 'Εγκρίθηκε',
  rejected: 'Απορρίφθηκε',
  active: 'Ενεργή',
  inactive: 'Ανενεργή',
};

const CODE = /^[a-z][a-z0-9_]*$/;
export function statusText(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '';
  return map[value] ?? (CODE.test(value) ? 'Άγνωστη κατάσταση' : value);
}

/** «Cases: 1 σε εξέλιξη · 2 ολοκληρωμένα» (L4/L5). Zero parts are left out. */
export function caseCountText(s: { total: number; active: number; completed: number }): string {
  if (s.total === 0) return 'Χωρίς case';
  const closed = s.total - s.active - s.completed;
  const parts = [
    s.active ? `${s.active} σε εξέλιξη` : '',
    s.completed ? `${s.completed} ${s.completed === 1 ? 'ολοκληρωμένο' : 'ολοκληρωμένα'}` : '',
    closed > 0 ? `${closed} ${closed === 1 ? 'έκλεισε' : 'έκλεισαν'} χωρίς ενεργοποίηση` : '',
  ].filter(Boolean);
  return `Cases: ${parts.join(' · ')}`;
}
