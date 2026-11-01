/* Search and question-based help over the approved guides. PURE. It understands Greek the cheap, predictable way: accents and final sigma are folded,
   question words are ignored, a few real CRM synonyms are expanded, and word endings are tolerated by a prefix match. No model, no network, no guessing:
   what it returns is only text that exists in a guide, and «Δεν υπάρχει τεκμηρίωση» is a first-class answer. */
import type { GuideDoc, GuideRole } from './markdown';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ');
export const tokens = (s: string): string[] => fold(s).split(/[^a-z0-9α-ω]+/).filter(Boolean);

/** Words that carry no meaning in a question. */
const STOP = new Set((['πως', 'ποια', 'ποιο', 'ποιος', 'ποιοι', 'ποιες', 'τι', 'γιατι', 'που', 'ποτε', 'μπορω', 'μπορει', 'μπορουμε', 'να', 'το', 'τα', 'τη', 'την', 'τον', 'του', 'των', 'της', 'ενα', 'μια', 'μιασ', 'ενασ',
  'και', 'η', 'ο', 'οι', 'με', 'σε', 'απο', 'για', 'θελω', 'θα', 'δεν', 'εχει', 'εχω', 'ειναι', 'στο', 'στη', 'στην', 'στον', 'how', 'do', 'i', 'can', 'the', 'a', 'to', 'νεο', 'νεα', 'νεοσ', 'μου', 'μασ', 'σασ', 'σου']).map(fold));

/** Real CRM vocabulary: what people say → what the guides call it. Folded forms only; each group is mutually interchangeable. */
const SYNONYMS: string[][] = [
  ['lead', 'επαφη', 'ενδιαφερομενοσ', 'ενδιαφερομενη', 'προοπτικη', 'υποψηφιοσ'],
  ['case', 'υποθεση', 'φακελοσ', 'cases'],
  ['πελατησ', 'πελατεσ', 'customer', 'customers'],
  ['παραδοση', 'παραδωσω', 'handover', 'μεταφορα', 'μεταφερω', 'παραδινω', 'παραλαβη'],
  ['followup', 'follow', 'υπενθυμιση', 'ακολουθηση', 'παρακολουθηση'],
  ['παροχη', 'δεδδηε', 'supply', 'ρευμα', 'μετρητησ'],
  ['checkin', 'check', 'αφιξη'],
  ['κωδικοσ', 'password', 'συνθηματικο', 'κωδικου'],
  ['εγγραφο', 'εγγραφα', 'αρχειο', 'δικαιολογητικο', 'δικαιολογητικα', 'upload', 'ανεβασω', 'ανεβασμα', 'φωτογραφια', 'λογαριασμοσ'],
  ['διαδρομη', 'route', 'δρομολογιο', 'στασεισ', 'στασι'],
  ['επισκεψη', 'visit', 'επισκεψεισ'],
  ['σταδιο', 'σταδιου', 'κατασταση', 'stage', 'status'],
  ['προσφορα', 'offer', 'προσφορεσ'],
  ['χρηστησ', 'χρηστεσ', 'λογαριασμοσ', 'υπαλληλοσ', 'προσωπικο'],
  ['διαχειριση', 'admin', 'διαχειριστησ', 'back', 'office', 'backoffice'],
  ['πωλητησ', 'agent', 'sales', 'πωλησεισ'],
  ['δημιουργια', 'δημιουργω', 'φτιαχνω', 'καταχωριση', 'καταχωρηση', 'καταχωρω', 'προσθηκη', 'προσθετω'],
  ['αλλαγη', 'αλλαζω', 'αλλαξω', 'αλλαζει', 'αλλαγεσ'],
];
const SYN = new Map<string, Set<string>>();
for (const g of SYNONYMS) for (const w of g) SYN.set(w, new Set(g));

export const expand = (t: string): string[] => [...(SYN.get(t) ?? [t])];

/** Two tokens match when equal, or when both are long enough and one begins with the first 5 letters of the other (endings differ in Greek). */
export function tokenMatches(q: string, d: string): boolean {
  if (q === d) return true;
  if (q.length < 4 || d.length < 4) return false;
  const k = Math.min(5, q.length, d.length);
  return q.slice(0, k) === d.slice(0, k);
}

export interface Hit { doc: GuideDoc; score: number; why: string[] }

function fieldScore(qs: string[], text: string, weight: number): number {
  const dt = tokens(text); if (!dt.length) return 0;
  let s = 0;
  for (const q of qs) if (expand(q).some((e) => dt.some((d) => tokenMatches(e, d)))) s += weight;
  return s;
}

/** Ranked guides for a query; `role` hides what the account may not use. A query made only of stop words returns nothing. */
export function search(docs: GuideDoc[], query: string, role: GuideRole | null): Hit[] {
  const qs = tokens(query).filter((t) => !STOP.has(t));
  if (!qs.length) return [];
  const hits: Hit[] = [];
  for (const doc of docs) {
    if (role && !doc.meta.roles.includes(role)) continue;
    const m = doc.meta; const why: string[] = [];
    const t = fieldScore(qs, m.title, 8); if (t) why.push('τίτλος');
    const k = fieldScore(qs, m.keywords.join(' '), 6); if (k) why.push('λέξεις-κλειδιά');
    const s = fieldScore(qs, m.summary, 3); if (s) why.push('περίληψη');
    const h = fieldScore(qs, doc.blocks.filter((b) => b.t === 'h2').map((b) => (b as { text: string }).text).join(' '), 3);
    const b = fieldScore(qs, doc.text, 1);
    const score = t + k + s + h + b;
    // every meaningful word of a short question should be found somewhere: a single stray hit in a long body is noise
    const covered = qs.filter((q) => expand(q).some((e) => tokens(`${m.title} ${m.keywords.join(' ')} ${m.summary} ${doc.text}`).some((d) => tokenMatches(e, d)))).length;
    const strong = t + k + s + h > 0;
    if (score > 0 && (covered >= Math.ceil(qs.length * 0.6) || (strong && covered >= Math.max(1, Math.floor(qs.length / 2))))) hits.push({ doc, score: score + (m.status === 'verified' ? 1 : 0), why });
  }
  return hits.sort((a, b) => b.score - a.score || a.doc.meta.title.localeCompare(b.doc.meta.title, 'el'));
}

/* ───────── question-based help (the Learning Assistant) ───────── */
export interface Answer {
  kind: 'answer' | 'planned' | 'forbidden' | 'none';
  doc: GuideDoc | null;
  /** The numbered steps of the guide's own procedure, verbatim. */
  steps: string[];
  others: GuideDoc[];
  message: string;
}
const flat = (inl: { v: string }[]) => inl.map((x) => x.v).join('');

/** The steps of the section called «Βήμα προς βήμα» (or the first numbered list), exactly as the guide writes them. */
export function stepsOf(doc: GuideDoc): string[] {
  let inSteps = false;
  for (const b of doc.blocks) {
    if (b.t === 'h2') inSteps = /βημα προς βημα/.test(fold(b.text));
    else if (inSteps && b.t === 'steps') return b.items.map(flat);
  }
  const first = doc.blocks.find((b) => b.t === 'steps');
  return first && first.t === 'steps' ? first.items.map(flat) : [];
}

/** Never invents: it quotes a guide, says the feature is planned, says the account may not use it, or says nothing is documented. It never acts on the CRM. */
export function answer(docs: GuideDoc[], question: string, role: GuideRole | null): Answer {
  const mine = search(docs, question, role);
  if (!mine.length) {
    const other = search(docs, question, null);
    if (other.length) return { kind: 'forbidden', doc: other[0].doc, steps: [], others: [], message: 'Αυτή η λειτουργία δεν είναι διαθέσιμη στον λογαριασμό σας. Αν τη χρειάζεστε, ζητήστε το από τον Admin / Back Office.' };
    return { kind: 'none', doc: null, steps: [], others: [], message: 'Δεν υπάρχει τεκμηρίωση για αυτή την ερώτηση στον οδηγό. Δοκιμάστε άλλες λέξεις ή αναφέρετε το κενό από το «Αναφορά προβλήματος».' };
  }
  const top = mine[0].doc;
  const others = mine.slice(1, 4).map((h) => h.doc);
  if (top.meta.status === 'planned') return { kind: 'planned', doc: top, steps: [], others, message: 'Αυτή η λειτουργία δεν έχει ακόμη υλοποιηθεί ή δεν είναι ακόμη διαθέσιμη. Ο οδηγός την περιγράφει ως προγραμματισμένη, δεν υπάρχουν οδηγίες χρήσης.' };
  return { kind: 'answer', doc: top, steps: stepsOf(top), others, message: top.meta.summary };
}
