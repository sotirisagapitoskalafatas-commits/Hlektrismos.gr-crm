/* «Αναφορά προβλήματος» for the guide. There is NO server for it: nothing is sent or stored. The person checks a short note and copies it to the Admin / Back Office.
   Because that note might be pasted anywhere, it is refused while it still looks like it contains a secret or personal data. PURE. */
export const KINDS = [
  { id: 'wrong', label: 'Λάθος ή παλιό περιεχόμενο' },
  { id: 'missing', label: 'Λείπει κάποιο θέμα' },
  { id: 'broken', label: 'Κάτι δεν λειτουργεί στον οδηγό' },
  { id: 'other', label: 'Άλλο' },
] as const;
export type FeedbackKind = (typeof KINDS)[number]['id'];

/** Why a note must not be copied yet. Empty = it looks safe. The checks are deliberately cautious (they may refuse a harmless number). */
export function sensitive(text: string): string[] {
  const out: string[] = [];
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) out.push('Περιέχει διεύθυνση email.');
  if (/(?:\+?30[\s-]?)?\b(?:69\d|2\d{2,3})[\s-]?\d{3}[\s-]?\d{3,4}\b/.test(text) || /\b\d{9,}\b/.test(text.replace(/\s/g, ''))) out.push('Περιέχει αριθμό που μοιάζει με τηλέφωνο, ΑΦΜ ή αριθμό παροχής.');
  if (/[A-Za-z0-9_-]{28,}/.test(text) || /eyJ[A-Za-z0-9_-]{8,}/.test(text)) out.push('Περιέχει μεγάλη σειρά χαρακτήρων που μοιάζει με κλειδί ή κωδικό.');
  if (/(κωδικ[όοά]ς?|password|pass|token|κλειδί|secret)\s*[:=]\s*\S+/i.test(text)) out.push('Φαίνεται να γράφετε κωδικό ή κλειδί.');
  if (/\bGR\d{2}\s?\d{4}/i.test(text)) out.push('Περιέχει αριθμό που μοιάζει με IBAN.');
  return out;
}

export interface ReportInput { kind: FeedbackKind; guideId: string | null; role: 'admin' | 'sales_agent' | null; version: string; note: string }
/** The text to copy. It names the account TYPE, never a person, and carries no data from the CRM. */
export function buildReport(i: ReportInput): string {
  const kind = KINDS.find((k) => k.id === i.kind)?.label ?? 'Άλλο';
  return [`Αναφορά για τον Οδηγό ATLAS (έκδοση ${i.version})`, `Είδος: ${kind}`, `Οδηγός: ${i.guideId ?? 'γενικά'}`, `Λογαριασμός: ${i.role === 'admin' ? 'Admin / Back Office' : i.role === 'sales_agent' ? 'Sales Agent' : 'άγνωστος'}`, '', i.note.trim()].join('\n');
}
export const canCopy = (note: string): boolean => note.trim().length >= 10 && note.length <= 1000 && sensitive(note).length === 0;
