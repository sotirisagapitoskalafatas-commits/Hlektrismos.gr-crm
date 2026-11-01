/* Practice Mode. A small simulator that lives ONLY in memory: it imports no Supabase client, no API module, no storage and no network code, and a test
   proves it. Names, phones and files are invented and obviously fake. Nothing a learner does here is ever saved, sent, e-mailed or shown to a real customer.
   The rules are the application's own (STAGE_TRANSITIONS, DOC_TYPES, the 25 MB limit, who may change a stage), so practising here teaches what the real
   screen will accept. It does NOT simulate screens the application does not have. */
import { STAGES } from '@/lib/roles';
import type { Role, Stage } from '@/lib/roles';
import { uploadableDocTypes } from '@/lib/documents';
import { MAX_UPLOAD_BYTES } from '@/lib/upload-files';
import { checkStageMove } from './troubleshoot';

export const SYNTHETIC = {
  banner: 'ΔΟΚΙΜΑΣΤΙΚΗ ΛΕΙΤΟΥΡΓΙΑ: φανταστικά στοιχεία, τίποτα δεν αποθηκεύεται.',
  names: ['Μαρία Δοκιμαστική', 'Νίκος Παράδειγμα', 'Ελένη Εξάσκηση'],
  phone: '210 000 0000',
  email: 'dokimi@example.invalid',
  files: [{ name: 'logariasmos-dokimi.pdf', mb: 2 }, { name: 'metritis-dokimi.jpg', mb: 3 }, { name: 'poly-megalo-dokimi.pdf', mb: 30 }],
} as const;

export interface PracticeState {
  lead: { name: string; status: 'new' | 'contacted' | 'converted' } | null;
  kase: { stage: Stage } | null;
  docs: string[];
  log: string[];
}
export const initialPractice = (): PracticeState => ({ lead: null, kase: null, docs: [], log: [] });

export type PracticeAction =
  | { t: 'create_lead'; name: string }
  | { t: 'contact_lead' }
  | { t: 'convert_lead' }
  | { t: 'move'; to: Stage }
  | { t: 'upload'; docType: string; mb: number };

export interface PracticeResult { state: PracticeState; ok: boolean; message: string }

/** Applies one action. Pure: returns a new state and a plain-Greek explanation; a refused action explains WHY, using the application's rule. */
export function act(s: PracticeState, a: PracticeAction, role: Role): PracticeResult {
  const no = (message: string): PracticeResult => ({ state: s, ok: false, message });
  const yes = (state: PracticeState, message: string): PracticeResult => ({ state: { ...state, log: [...state.log, message] }, ok: true, message });
  switch (a.t) {
    case 'create_lead':
      if (s.lead) return no('Υπάρχει ήδη δοκιμαστικό lead. Δουλέψτε με αυτό ή ξεκινήστε από την αρχή.');
      if (!a.name.trim()) return no('Μόνο το όνομα ή η επωνυμία είναι υποχρεωτικό. Συμπληρώστε το ονοματεπώνυμο.');
      return yes({ ...s, lead: { name: a.name.trim(), status: 'new' } }, `Δημιουργήθηκε το lead «${a.name.trim()}» με κατάσταση Νέο.`);
    case 'contact_lead':
      if (!s.lead) return no('Δημιουργήστε πρώτα ένα lead.');
      if (s.lead.status !== 'new') return no('Το lead έχει ήδη περάσει αυτό το βήμα.');
      return yes({ ...s, lead: { ...s.lead, status: 'contacted' } }, 'Το lead πέρασε σε «Επικοινωνία».');
    case 'convert_lead':
      if (!s.lead) return no('Δημιουργήστε πρώτα ένα lead.');
      if (s.lead.status === 'converted') return no('Το lead έχει ήδη μετατραπεί σε case.');
      return yes({ ...s, lead: { ...s.lead, status: 'converted' }, kase: { stage: 'new' } }, 'Η «Μετατροπή σε Case» δημιούργησε πελάτη και case στο στάδιο Νέο.');
    case 'move': {
      if (!s.kase) return no('Δεν υπάρχει case. Μετατρέψτε πρώτα το lead.');
      const c = checkStageMove(role, s.kase.stage, a.to);
      if (!c.allowed) return no(c.text);
      return yes({ ...s, kase: { stage: a.to } }, c.text);
    }
    case 'upload': {
      if (!s.kase) return no('Τα έγγραφα ανεβαίνουν σε case. Μετατρέψτε πρώτα το lead.');
      if (!uploadableDocTypes().some((d) => d.key === a.docType)) return no('Επιλέξτε τι είναι το έγγραφο. Ο τύπος είναι υποχρεωτικός.');
      if (a.mb * 1024 * 1024 > MAX_UPLOAD_BYTES) return no(`Το αρχείο ξεπερνά το όριο των ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB. Μικρύνετέ το και δοκιμάστε ξανά.`);
      return yes({ ...s, docs: [...s.docs, a.docType] }, 'Το δοκιμαστικό έγγραφο προστέθηκε. Στο πραγματικό CRM ο Admin / Back Office το ελέγχει στη συνέχεια.');
    }
  }
}

export interface Task { text: string; done: (s: PracticeState) => boolean }
export interface Exercise { id: string; title: string; level: 'beginner' | 'intermediate' | 'advanced'; goal: string; guide: string; roles: ('admin' | 'sales_agent')[]; tasks: Task[] }
const past = (s: PracticeState, order: Stage[], st: Stage) => !!s.kase && order.indexOf(s.kase.stage) >= order.indexOf(st);
const FLOW: Stage[] = ['new', 'contacted', 'offer', 'application', 'signed', 'document_check', 'submitted', 'activation', 'completed'];

export const EXERCISES: Exercise[] = [
  { id: 'first-lead', title: 'Από το πρώτο lead στο case', level: 'beginner', goal: 'Καταχωρίστε μια επαφή και κάντε τη case.', guide: 'lead-dimiourgia', roles: ['admin', 'sales_agent'], tasks: [
    { text: 'Δημιουργήστε ένα lead με ένα από τα φανταστικά ονόματα.', done: (s) => !!s.lead },
    { text: 'Περάστε το lead σε «Επικοινωνία».', done: (s) => s.lead?.status === 'contacted' || s.lead?.status === 'converted' },
    { text: 'Κάντε «Μετατροπή σε Case».', done: (s) => !!s.kase },
  ] },
  { id: 'case-flow', title: 'Η πορεία ενός case', level: 'intermediate', goal: 'Προχωρήστε ένα case μέχρι την υπογραφή, με τις επιτρεπτές μεταβάσεις.', guide: 'case-roi', roles: ['admin', 'sales_agent'], tasks: [
    { text: 'Φτάστε το case στο στάδιο «Επικοινωνία».', done: (s) => past(s, FLOW, 'contacted') },
    { text: 'Δοκιμάστε μια μετάβαση που ΔΕΝ επιτρέπεται (π.χ. από «Επικοινωνία» σε «Ενεργοποίηση») και διαβάστε γιατί.', done: (s) => refused(s) },
    { text: 'Προχωρήστε μέχρι το στάδιο «Υπογραφή».', done: (s) => past(s, FLOW, 'signed') },
  ] },
  { id: 'documents', title: 'Έγγραφα πελάτη', level: 'beginner', goal: 'Ανεβάστε έγγραφο με σωστό τύπο και μέγεθος.', guide: 'eggrafa', roles: ['admin', 'sales_agent'], tasks: [
    { text: 'Ανεβάστε έναν «Λογαριασμός ρεύματος» (2 MB).', done: (s) => s.docs.includes('bill_electricity') },
    { text: 'Δοκιμάστε το αρχείο των 30 MB και δείτε το μήνυμα.', done: (s) => refusedBig(s) },
  ] },
];

/* the learner's refused attempts are remembered in the log with a stable marker so a task can be checked without hidden state */
const REFUSED = '⚠';
const refused = (s: PracticeState) => s.log.some((l) => l.startsWith(REFUSED));
const refusedBig = (s: PracticeState) => s.log.some((l) => l.startsWith(REFUSED) && l.includes('MB'));
/** Same as `act`, but a refusal is also written to the log (marked) so the exercise can see that the learner tried and read the reason. */
export function actLogged(s: PracticeState, a: PracticeAction, role: Role): PracticeResult {
  const r = act(s, a, role);
  return r.ok ? r : { ...r, state: { ...s, log: [...s.log, `${REFUSED} ${r.message}`] } };
}

export const progressOf = (ex: Exercise, s: PracticeState): { done: number; total: number; next: Task | null } => {
  const flags = ex.tasks.map((t) => t.done(s)); const firstOpen = flags.indexOf(false);
  return { done: flags.filter(Boolean).length, total: ex.tasks.length, next: firstOpen === -1 ? null : ex.tasks[firstOpen] };
};
export const stageChoices = (s: PracticeState): { id: Stage; label: string }[] => (s.kase ? STAGES.filter((x) => x.id !== s.kase!.stage).map((x) => ({ id: x.id, label: x.label })) : []);