/* Interactive process maps. Each node says what happens, who does it, what is needed, the real possible outcomes, the page to open and the tutorial.
   The case map is BUILT from the application's own stage data (STAGES, STAGE_TRANSITIONS, teamForStage, PERMS): it can not say a stage exists, or that a
   move is possible, when the application says otherwise. The others are written from verified behaviour and say so in `verified`.
   «warning» marks a check that only WARNS; «rule» marks one the application really enforces. The two are never mixed. */
import { PERMS, STAGES, STAGE_TRANSITIONS, LEAD_STATUSES } from '@/lib/roles';
import type { PageKey, Role, Stage } from '@/lib/roles';
import { TEAM_LABEL, teamForStage } from '@/lib/case-flow';

export interface MapNode {
  id: string;
  title: string;
  /** What happens here. */
  what: string;
  /** Who normally does it. Accounts are only two; teams are labels of the work. */
  who: string;
  needs: string[];
  outcomes: { label: string; to: string | null }[];
  route: PageKey | null;
  guide: string | null;
  kind: 'step' | 'decision' | 'end';
  /** Only a warning: the person may continue. */
  warning?: string;
  /** What the application really enforces at this step. */
  rule?: string;
}
export interface ProcessMap { id: string; title: string; lead: string; status: 'verified' | 'partially-verified'; verified: string; nodes: MapNode[] }

const label = (s: string) => STAGES.find((x) => x.id === s)?.label ?? s;
const whoStage = (s: Stage): string => {
  const t = teamForStage(s);
  return t ? `Ομάδα εργασίας (ένδειξη του CRM): ${TEAM_LABEL[t]}. ${t === 'back_office' ? 'Συνήθως ο λογαριασμός Admin / Back Office.' : 'Συνήθως ο Sales Agent του case.'}` : 'Κανείς: το case έχει κλείσει.';
};
const DOC_WARN_STAGES: Stage[] = ['application', 'signed', 'document_check', 'submitted'];
const STAGE_GUIDE: Partial<Record<Stage, string>> = { new: 'case-roi', contacted: 'case-roi', offer: 'case-roi', application: 'diekperaiosi-back-office', signed: 'case-roi', document_check: 'diekperaiosi-back-office', submitted: 'diekperaiosi-back-office', activation: 'diekperaiosi-back-office' };
const STAGE_NEEDS: Partial<Record<Stage, string[]>> = {
  new: ['Όνομα πελάτη (υποχρεωτικό)', 'Υπηρεσία'], contacted: ['Σημείωση της επικοινωνίας'], offer: ['Πάροχος και πρόγραμμα', 'Ποσό (€) προσφοράς'],
  application: ['Στοιχεία πελάτη', 'Πάροχος και πρόγραμμα'], signed: ['Υπογραφή του πελάτη (Νέα υπογραφή)'], document_check: ['Δικαιολογητικά στην καρτέλα Έγγραφα'],
  submitted: ['Καταχώρηση στον πάροχο'], activation: ['Επιβεβαίωση ενεργοποίησης από τον πάροχο'],
};

/** The case lifecycle straight from the application's data. */
export function caseMap(): ProcessMap {
  const nodes: MapNode[] = STAGES.map((s) => {
    const next = STAGE_TRANSITIONS[s.id];
    const isEnd = s.id === 'completed';
    return {
      id: s.id, title: s.label, kind: isEnd ? 'end' : next.length > 2 ? 'decision' : 'step',
      what: s.id === 'completed' ? 'Το case έχει ολοκληρωθεί. Από εδώ δεν υπάρχει άλλη μετάβαση· μόνο ο Admin μπορεί να επαναφέρει ένα ολοκληρωμένο case.'
        : s.id === 'lost' || s.id === 'cancelled' ? `Το case ${s.id === 'lost' ? 'χάθηκε' : 'ακυρώθηκε'}. Μπορεί να ξανανοίξει ως «Νέο».` : `Το case βρίσκεται στο στάδιο «${s.label}».`,
      who: whoStage(s.id), needs: STAGE_NEEDS[s.id] ?? [],
      outcomes: next.map((n) => ({ label: label(n), to: n })),
      route: 'cases', guide: STAGE_GUIDE[s.id] ?? 'case-roi',
      ...(DOC_WARN_STAGES.includes(s.id) ? { warning: 'Αν λείπουν έγγραφα, το CRM το δείχνει ως προειδοποίηση. Δεν σας εμποδίζει να προχωρήσετε.' } : {}),
      rule: next.length ? `Επιτρεπτές μεταβάσεις από εδώ: ${next.map(label).join(', ')}.` : 'Καμία μετάβαση.',
    };
  });
  return { id: 'case', title: 'Η πορεία ενός Case', lead: 'Τα στάδια και οι επιτρεπτές μεταβάσεις όπως τις ορίζει η εφαρμογή. Η πορεία δεν είναι πάντα ευθεία: υπάρχουν επιστροφές και έξοδοι.', status: 'verified', verified: 'Παράγεται αυτόματα από τα στάδια, τις επιτρεπτές μεταβάσεις και τις ομάδες εργασίας που χρησιμοποιεί η ίδια η εφαρμογή.', nodes };
}

const leadStatus = (id: string) => LEAD_STATUSES.find((x) => x.id === id)?.label ?? id;

export function leadMap(): ProcessMap {
  return {
    id: 'lead', title: 'Από το Lead στο Case', lead: 'Πώς μια πρώτη επαφή γίνεται πελάτης και case.', status: 'partially-verified',
    verified: 'Τα ονόματα, τα πεδία και η κατάσταση από τον κώδικα της σελίδας Leads και της καρτέλας lead. Οι ακριβείς μεταβάσεις καταστάσεων lead δεν περιορίζονται από πίνακα: η κατάσταση αλλάζει από λίστα.',
    nodes: [
      { id: 'create', title: 'Δημιουργία lead', kind: 'step', what: 'Καταχωρείτε ένα «Γρήγορο lead» (αρκεί το όνομα) ή ένα πλήρες «Νέο Lead» με τύπο B2C — Οικιακός ή B2B — Επιχείρηση, πηγή, υπηρεσία και προαιρετικά έγγραφα.', who: 'Sales Agent ή Admin / Back Office', needs: ['Ονοματεπώνυμο ή επωνυμία (υποχρεωτικό)'], outcomes: [{ label: `Κατάσταση «${leadStatus('new')}»`, to: 'contact' }], route: 'leads', guide: 'lead-dimiourgia', rule: 'Μόνο το όνομα είναι υποχρεωτικό. Τηλέφωνο, email και πρόγραμμα συμπληρώνονται και αργότερα.' },
      { id: 'contact', title: 'Επικοινωνία', kind: 'step', what: 'Καλείτε ή γράφετε στον πελάτη και ενημερώνετε την κατάσταση και τα σχόλια του lead.', who: 'Ο Sales Agent του lead', needs: ['Τηλέφωνο ή email'], outcomes: [{ label: leadStatus('contacted'), to: 'assess' }], route: 'leads', guide: 'lead-katastasi-kai-metatropi' },
      { id: 'assess', title: 'Εκτίμηση ενδιαφέροντος', kind: 'decision', what: 'Επιλέγετε την κατάσταση που ταιριάζει: ειδικευμένο (qualified), συνάντηση, προσφορά, ή τέλος: χάθηκε / μη επιλέξιμο / διπλότυπο.', who: 'Ο Sales Agent του lead', needs: [], outcomes: [{ label: 'Ενδιαφέρεται → Μετατροπή σε Case', to: 'convert' }, { label: leadStatus('lost'), to: 'end' }, { label: leadStatus('unqualified'), to: 'end' }, { label: leadStatus('duplicate'), to: 'end' }], route: 'leads', guide: 'lead-katastasi-kai-metatropi' },
      { id: 'convert', title: 'Μετατροπή σε Case', kind: 'step', what: 'Η ενέργεια «Μετατροπή σε Case» δημιουργεί τον πελάτη και το case. Μετά η καρτέλα δείχνει «Μετατράπηκε σε Case» και «Άνοιγμα Case». Οι πελάτες δημιουργούνται μόνο έτσι.', who: 'Ο Sales Agent του lead (ή ο Admin)', needs: ['Στοιχεία πελάτη'], outcomes: [{ label: 'Case στο στάδιο «Νέο»', to: 'case' }], route: 'leads', guide: 'lead-katastasi-kai-metatropi' },
      { id: 'case', title: 'Το Case', kind: 'step', what: 'Η δουλειά συνεχίζεται στο Case: προσφορά, αίτηση, υπογραφή, έλεγχος εγγράφων, καταχώρηση και ενεργοποίηση.', who: 'Sales Agent και Back Office', needs: [], outcomes: [{ label: 'Δείτε τον χάρτη του Case', to: null }], route: 'cases', guide: 'case-roi' },
      { id: 'end', title: 'Τέλος χωρίς πώληση', kind: 'end', what: 'Το lead μένει στο ιστορικό ως χαμένο, μη επιλέξιμο ή διπλότυπο. Δεν δημιουργείται πελάτης.', who: 'Ο Sales Agent του lead', needs: ['Σημείωση για τον λόγο'], outcomes: [], route: 'leads', guide: 'lead-katastasi-kai-metatropi' },
    ],
  };
}

export function handoverMap(): ProcessMap {
  return {
    id: 'handover', title: 'Παράδοση στο Back Office', lead: 'Πώς περνά ένα case από τον Sales Agent στο γραφείο και τι βλέπει το Back Office.', status: 'partially-verified',
    verified: 'Η ενέργεια «Παράδοση», το κείμενο επόμενης ενέργειας, η ουρά «Διεκπεραίωση» και οι επιλογές «Επιστροφή για διόρθωση» από τον κώδικα. Ο προεπιλεγμένος υπεύθυνος Back Office πρέπει να έχει οριστεί από τον Admin.',
    nodes: [
      { id: 'sell', title: 'Ο πελάτης συμφωνεί', kind: 'step', what: 'Ο Sales Agent συμπληρώνει τα στοιχεία και τα έγγραφα που έχει στον φάκελο.', who: 'Sales Agent', needs: ['Στοιχεία πελάτη', 'Όσα έγγραφα υπάρχουν'], outcomes: [{ label: 'Παράδοση', to: 'hand' }], route: 'cases', guide: 'paradosi-sto-back-office', warning: 'Αν λείπουν έγγραφα, η παράδοση επιτρέπεται: το CRM μόνο προειδοποιεί.' },
      { id: 'hand', title: 'Παράδοση', kind: 'step', what: 'Η «Παράδοση» ορίζει την επόμενη ενέργεια «Παραλαβή από Sales — Νέο Sale», αναθέτει το case στον προεπιλεγμένο υπεύθυνο Back Office (αν έχει οριστεί) και καταγράφει δραστηριότητα «Νέο Sale — παράδοση στο Back Office».', who: 'Sales Agent', needs: ['Σύντομη σημείωση'], outcomes: [{ label: 'Το case εμφανίζεται στη Διεκπεραίωση', to: 'queue' }, { label: 'Δεν έχει οριστεί υπεύθυνος Back Office', to: 'noassignee' }], route: 'cases', guide: 'paradosi-sto-back-office', rule: 'Χωρίς ορισμένο υπεύθυνο, το case δεν αλλάζει υπεύθυνο και το CRM το λέει.' },
      { id: 'noassignee', title: 'Δεν έχει οριστεί υπεύθυνος Back Office', kind: 'decision', what: 'Το μήνυμα λέει: «Δεν έχει οριστεί υπεύθυνος Back Office — ορίστε τον στη Διαχείριση → Cases & Ροή.» Το case μένει στον τωρινό υπεύθυνό του.', who: 'Admin / Back Office', needs: ['Ορισμός υπευθύνου στη Διαχείριση → Cases & Ροή εργασίας'], outcomes: [{ label: 'Μετά τον ορισμό, νέα παράδοση', to: 'hand' }], route: 'admin', guide: 'kentro-diachirisis' },
      { id: 'queue', title: 'Η ουρά «Διεκπεραίωση»', kind: 'step', what: 'Το Back Office βλέπει τα cases από «Αίτηση» έως «Ενεργοποίηση», με φίλτρα όπως «Από Sales», «Δικά μου», «Εξαιρέσεις», «Με εκκρεμότητες».', who: 'Admin / Back Office', needs: [], outcomes: [{ label: 'Επεξεργασία', to: 'process' }], route: 'backoffice', guide: 'diekperaiosi-back-office' },
      { id: 'process', title: 'Επεξεργασία', kind: 'decision', what: 'Έλεγχος στοιχείων και εγγράφων, προσφορά, αίτηση και καταχώρηση στον πάροχο.', who: 'Admin / Back Office', needs: ['Έγγραφα (ενδεικτική λίστα, επιβεβαίωση με τον πάροχο)'], outcomes: [{ label: 'Προχωρά στο επόμενο στάδιο', to: null }, { label: 'Επιστροφή για διόρθωση στον Sales Agent', to: 'sell' }], route: 'backoffice', guide: 'diekperaiosi-back-office', warning: 'Οι εκκρεμότητες εγγράφων βασίζονται στην ενδεικτική λίστα· επιβεβαιώστε με τον πάροχο.' },
    ],
  };
}

export function fieldMap(): ProcessMap {
  return {
    id: 'field', title: 'Πεδίο: από τη διαδρομή στην επίσκεψη', lead: 'Η ημέρα ενός Sales Agent στο πεδίο.', status: 'partially-verified',
    verified: 'Τα ονόματα και τα μηνύματα της Ημέρας μου, της Λειτουργίας Πεδίου και του χώρου διαδρομών από τον κώδικα. Ο έλεγχος διπλοτύπων από το Back Office και η έγκριση νέων επιχειρήσεων περιγράφονται όπως τα δείχνει η οθόνη· δεν έχουν δοκιμαστεί σε πραγματικό περιβάλλον από τον οδηγό.',
    nodes: [
      { id: 'plan', title: 'Σχεδιασμός διαδρομής', kind: 'step', what: 'Φτιάχνετε μια «Νέα διαδρομή» και προσθέτετε στάσεις από υπάρχοντα cases ή από επιχειρήσεις που βρίσκετε στον χάρτη.', who: 'Sales Agent', needs: [], outcomes: [{ label: 'Στάσεις στη διαδρομή', to: 'visit' }], route: 'map', guide: 'xartis-kai-diadromes' },
      { id: 'discover', title: 'Ανακάλυψη επιχείρησης (χάρτης)', kind: 'decision', what: 'Η «Ανακάλυψη επιχειρήσεων» ψάχνει σε δημόσιες καταχωρίσεις OpenStreetMap κοντά στις στάσεις: δεν είναι πλήρης κατάλογος και δεν είναι ακόμη πελάτης ή lead.', who: 'Sales Agent', needs: [], outcomes: [{ label: '+ Προσθήκη ως στάση', to: 'dupcheck' }], route: 'map', guide: 'xartis-kai-diadromes', warning: 'Η ανακάλυψη δεν δημιουργεί lead.' },
      { id: 'dupcheck', title: 'Έλεγχος διπλοτύπων Back Office', kind: 'decision', what: 'Μια νέα επιχείρηση ελέγχεται από το Back Office για διπλότυπο. Αν απορριφθεί, εμφανίζεται «Απορρίφθηκε από Back Office. Δεν δημιουργήθηκε Lead.»', who: 'Admin / Back Office', needs: [], outcomes: [{ label: 'Εγκρίνεται → στάση της διαδρομής', to: 'visit' }, { label: 'Απορρίπτεται', to: null }], route: 'map', guide: 'xartis-kai-diadromes' },
      { id: 'visit', title: 'Επίσκεψη και Check In', kind: 'step', what: 'Στην «Ημέρα μου» ή στη Λειτουργία Πεδίου κάνετε Check In στον πελάτη, δουλεύετε και κάνετε Check Out με «Αποτέλεσμα επίσκεψης».', who: 'Sales Agent', needs: ['Θέση GPS (αν δεν υπάρχει, καταγράφεται με αιτία)'], outcomes: [{ label: 'Check Out με αποτέλεσμα', to: 'result' }], route: 'myday', guide: 'imera-mou-kai-check-in', warning: 'Αν δεν υπάρχει θέση GPS ή αποθηκευμένη διεύθυνση, η οθόνη λέει ότι το Check In καταγράφεται και σημειώνεται για έλεγχο από τον υπεύθυνο.' },
      { id: 'result', title: 'Αποτέλεσμα και επόμενο βήμα', kind: 'end', what: 'Καταγράφετε το αποτέλεσμα, προαιρετικά νέο follow-up και, αν ο πελάτης συμφώνησε, παράδοση στο Back Office.', who: 'Sales Agent', needs: ['Αιτία όταν το αποτέλεσμα την απαιτεί'], outcomes: [{ label: 'Νέο follow-up', to: null }, { label: 'Παράδοση στο Back Office', to: null }], route: 'myday', guide: 'paradosi-sto-back-office' },
    ],
  };
}

export const MAPS = (): ProcessMap[] => [leadMap(), caseMap(), handoverMap(), fieldMap()];

/** What each account may do, from the real permission table: used by the page to show «who may» on a map step. */
export const mayDo = (role: Role, action: keyof typeof ACTION_TEXT): boolean => (PERMS[role] as string[]).includes(action);
export const ACTION_TEXT = { create_application: 'Δημιουργία αίτησης', submit_provider: 'Καταχώρηση στον πάροχο', verify_document: 'Έλεγχος εγγράφου', change_stage: 'Αλλαγή σταδίου', assign: 'Ανάθεση', check_in: 'Check In' } as const;
