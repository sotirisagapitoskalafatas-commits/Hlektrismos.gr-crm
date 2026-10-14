/* "Recommended next action" for a lead, derived ONLY from fields that exist on the record.
   It is a suggestion shown to the employee, never an automatic action. Stored statuses are not changed here. */

export type LeadNextActionId = 'mark-contacted' | 'mark-qualified' | 'convert' | 'open-case';
export type SecondaryActionId = 'call' | 'edit';

export interface LeadNextInput {
  status: string | null;
  first_contact_user_id: string | null;
  converted_case_id: string | null;
  phone: string | null;
  created_at: string;
}

export interface LeadNext {
  /** Short imperative title. */
  title: string;
  /** Why this is recommended, in plain Greek, grounded in the record. */
  reason: string;
  tone: 'attention' | 'progress' | 'done' | 'unknown';
  primary?: { label: string; action: LeadNextActionId };
  secondary?: { label: string; action: SecondaryActionId };
}

const HOUR = 3_600_000, DAY = 86_400_000;
function waiting(createdAt: string, now: number): string {
  const ms = Math.max(0, now - new Date(createdAt).getTime());
  if (ms < HOUR) return 'λιγότερο από 1 ώρα';
  if (ms < DAY) { const h = Math.round(ms / HOUR); return h === 1 ? '1 ώρα' : `${h} ώρες`; }
  const d = Math.round(ms / DAY);
  return d === 1 ? '1 ημέρα' : `${d} ημέρες`;
}

export function leadNextAction(l: LeadNextInput, now: number): LeadNext {
  const call = l.phone ? ({ label: 'Κλήση', action: 'call' } as const) : undefined;
  switch (l.status) {
    case 'new':
      return {
        title: 'Επικοινωνία με τον πελάτη',
        reason: l.first_contact_user_id
          ? 'Το lead είναι «Νέο» αλλά έχει ήδη καταγραφεί πρώτη επικοινωνία. Ενημερώστε την κατάσταση.'
          : `Δεν έχει καταγραφεί ακόμη επικοινωνία — το lead περιμένει ${waiting(l.created_at, now)}.`,
        tone: 'attention',
        primary: { label: 'Καταγραφή πρώτης επικοινωνίας', action: 'mark-contacted' },
        secondary: call,
      };
    case 'contacted':
      return {
        title: 'Ολοκληρώστε την αξιολόγηση',
        reason: 'Το lead είναι σε επικοινωνία. Όταν επιβεβαιωθεί το ενδιαφέρον, σημειώστε το ως ειδικευμένο.',
        tone: 'progress',
        primary: { label: 'Σήμανση ως ειδικευμένο', action: 'mark-qualified' },
        secondary: call,
      };
    case 'qualified':
    case 'meeting':
    case 'offer':
      return {
        title: 'Δημιουργία Case',
        reason: 'Το lead είναι ειδικευμένο και δεν έχει μετατραπεί ακόμη σε Case.',
        tone: 'progress',
        primary: { label: 'Μετατροπή σε Case', action: 'convert' },
        secondary: call,
      };
    case 'converted':
      return l.converted_case_id
        ? { title: 'Συνέχεια στο Case', reason: 'Το lead έχει μετατραπεί. Η εργασία συνεχίζεται στο Case.', tone: 'done', primary: { label: 'Άνοιγμα Case', action: 'open-case' } }
        : { title: 'Καμία ενέργεια', reason: 'Το lead έχει μετατραπεί, αλλά δεν υπάρχει συνδεδεμένο Case στην εγγραφή.', tone: 'done' };
    case 'lost':
    case 'unqualified':
    case 'duplicate':
      return { title: 'Δεν απαιτείται ενέργεια', reason: 'Το lead δεν προχωρά (χάθηκε, μη επιλέξιμο ή διπλότυπο).', tone: 'done' };
    default:
      return {
        title: 'Ελέγξτε την κατάσταση',
        reason: l.status ? `Η κατάσταση «${l.status}» δεν αναγνωρίζεται από την εφαρμογή.` : 'Το lead δεν έχει καταχωρημένη κατάσταση.',
        tone: 'unknown',
      };
  }
}
