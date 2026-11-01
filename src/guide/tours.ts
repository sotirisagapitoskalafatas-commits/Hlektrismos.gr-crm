/* The guided tours. One per account type, built from what the signed-in account really has. Pure data + a pure resolver.
   A step points at real elements through `data-tour` anchors the shell already renders (see TopBar, Sidebar, AppShell). The tour only EXPLAINS: it never
   clicks, navigates or writes on the person's behalf, and it needs no CRM data. A step whose anchor is not on screen (a collapsed sidebar, a phone layout, a
   page the role does not have) is dropped, not shown with a broken spotlight. */
import type { GuideRole } from './markdown';

export interface TourStep {
  id: string;
  title: string;
  /** What this is. */
  body: string;
  /** Why it matters in daily work. */
  why: string;
  /** `data-tour` values, in order of preference; the first one that is present and visible is highlighted. */
  targets: string[];
  /** Guide to open from the step. */
  guide?: string;
}

export const TOUR_ANCHORS = ['page', 'nav:mywork', 'nav:dashboard', 'topbar:module:home', 'topbar:module:crm', 'topbar:module:field', 'topbar:module:analytics', 'topbar:module:ai',
  'topbar:search', 'topbar:assistant', 'topbar:guide', 'topbar:bell', 'topbar:account'] as const;

const COMMON_TAIL: TourStep[] = [
  { id: 'search', title: 'Αναζήτηση παντού', body: 'Η γραμμή αναζήτησης (⌘K ή Ctrl+K) βρίσκει πελάτες, cases, leads και σελίδες χωρίς να ψάχνετε στα μενού.', why: 'Είναι ο γρηγορότερος τρόπος να φτάσετε σε έναν υπάρχοντα πελάτη ή φάκελο.', targets: ['topbar:search'], guide: 'pos-vrisko-ena-pelati' },
  { id: 'bell', title: 'Ειδοποιήσεις', body: 'Το κουδούνι δείχνει όσα χρειάζονται την προσοχή σας.', why: 'Ελέγχετέ το στην αρχή και κατά τη διάρκεια της ημέρας ώστε να μη χάνετε εκκρεμότητες.', targets: ['topbar:bell'] },
];

const GUIDE_STEP: TourStep = { id: 'guide', title: 'Ο Οδηγός είναι πάντα εδώ', body: 'Ο «Οδηγός ATLAS» έχει αναλυτικούς οδηγούς, χάρτες διαδικασιών, βοήθεια για προβλήματα και ξανά αυτή την ξενάγηση.', why: 'Δεν χρειάζεται να θυμάστε τίποτα από αυτή την ξενάγηση: μπορείτε να την επαναλάβετε όποτε θέλετε.', targets: ['topbar:guide', 'topbar:account'], guide: 'ti-einai-to-atlas' };

export const TOURS: Record<GuideRole, TourStep[]> = {
  admin: [
    { id: 'home', title: 'Κεντρικός Πίνακας', body: 'Η Αρχική συγκεντρώνει τα επείγοντα, τα follow-ups της ημέρας, τις προσφορές, τις υπογραφές, τα νέα cases και τα σημερινά tasks. Ως Admin βλέπετε επιπλέον την ομάδα και τη σύνοψη διαχειριστή.', why: 'Ξεκινάτε την ημέρα από εδώ για να δείτε τι περιμένει.', targets: ['page'], guide: 'arxiki-kai-protereotites' },
    { id: 'mywork', title: 'Η εργασία μου', body: 'Ό,τι χρειάζεται τη δική σας ενέργεια, με σειρά προτεραιότητας: εργασίες και follow-ups.', why: 'Εδώ κλείνετε τις εκκρεμότητες της ημέρας.', targets: ['nav:mywork', 'topbar:module:home'], guide: 'follow-ups' },
    { id: 'crm', title: 'CRM: Leads, Πελάτες, Cases, Διεκπεραίωση', body: 'Στην ενότητα CRM βρίσκονται τα Leads και οι Πελάτες, τα Cases και η Διεκπεραίωση (η ουρά του Back Office), οι Πάροχοι και, αν έχει ενεργοποιηθεί, το B2B Prospecting.', why: 'Εδώ ελέγχετε και αναθέτετε τη δουλειά της πώλησης από το πρώτο lead ως την ενεργοποίηση.', targets: ['topbar:module:crm'], guide: 'case-roi' },
    { id: 'field', title: 'Πεδίο', body: 'Ημέρα μου και Χάρτης: οι επισκέψεις, οι διαδρομές και τα check-in των Sales Agents.', why: 'Βλέπετε τι γίνεται στο πεδίο και εξετάζετε check-in που σημειώθηκαν για έλεγχο.', targets: ['topbar:module:field'], guide: 'imera-mou-kai-check-in' },
    { id: 'analytics', title: 'Ανάλυση', body: 'Αναφορές (πωλήσεις και pipeline, ταχύτητα ολοκλήρωσης, πηγές) και Έσοδα.', why: 'Η εικόνα της ομάδας για τον προγραμματισμό και την παρακολούθηση.', targets: ['topbar:module:analytics'], guide: 'anafores' },
    ...COMMON_TAIL,
    { id: 'ai', title: 'Atlas AI', body: 'Ο υπάρχων βοηθός CRM για γενικές ερωτήσεις και ενέργειες στο CRM. Ο Οδηγός έχει δικό του, ξεχωριστό βοηθό μάθησης που μόνο εξηγεί.', why: 'Μην συγχέετε τα δύο: ο Οδηγός δεν αλλάζει ποτέ δεδομένα.', targets: ['topbar:assistant'] },
    { id: 'account', title: 'Ο λογαριασμός και η Διαχείριση', body: 'Από εδώ ανοίγετε το προφίλ, την εμφάνιση και, μόνο ως Admin, τη Διαχείριση: Επισκόπηση, Χρήστες & Ρόλοι, Κάδος, Δικαιώματα, Cases & Ροή εργασίας, Έγγραφα, B2B Scraper, Ασφάλεια & Έλεγχοι και Audit Log.', why: 'Η διαχείριση χρηστών και η ασφάλεια γίνονται μόνο από τον κοινό λογαριασμό Admin / Back Office. Ο λογαριασμός είναι κοινός για το γραφείο: το CRM δεν ξέρει ποιος υπάλληλος τον χρησιμοποιεί.', targets: ['topbar:account'], guide: 'kentro-diachirisis' },
    GUIDE_STEP,
  ],
  sales_agent: [
    { id: 'home', title: 'Η προσωπική σας Αρχική', body: 'Η Αρχική δείχνει τα δικά σας επείγοντα, follow-ups της ημέρας, προσφορές, υπογραφές, νέα cases και σημερινά tasks.', why: 'Ξεκινάτε κάθε ημέρα από εδώ για να δείτε τι περιμένει.', targets: ['page'], guide: 'arxiki-kai-protereotites' },
    { id: 'mywork', title: 'Η εργασία μου', body: 'Ό,τι χρειάζεται τη δική σας ενέργεια, με σειρά προτεραιότητας: εργασίες και follow-ups.', why: 'Εδώ κλείνετε τις εκκρεμότητες της ημέρας.', targets: ['nav:mywork', 'topbar:module:home'], guide: 'follow-ups' },
    { id: 'crm', title: 'Leads, Πελάτες και Cases', body: 'Στην ενότητα CRM διαχειρίζεστε τα leads και τους πελάτες σας και τα cases. Από ένα lead φτιάχνετε Case με τη «Μετατροπή σε Case».', why: 'Εδώ περνάει όλη η πώληση: από την πρώτη επαφή ως την παράδοση στο Back Office.', targets: ['topbar:module:crm'], guide: 'lead-dimiourgia' },
    { id: 'field', title: 'Πεδίο: Ημέρα μου και Χάρτης', body: 'Στο Πεδίο βλέπετε τις επισκέψεις της ημέρας, κάνετε Check In / Check Out και δουλεύετε διαδρομές στον χάρτη.', why: 'Καταγράφετε τις επισκέψεις σας σωστά, ακόμη και χωρίς σύνδεση: ο συγχρονισμός γίνεται μόλις επανέλθει το δίκτυο.', targets: ['topbar:module:field'], guide: 'imera-mou-kai-check-in' },
    ...COMMON_TAIL,
    { id: 'account', title: 'Ο λογαριασμός σας', body: 'Εδώ ανοίγετε το προφίλ (όνομα, τηλέφωνο, φωτογραφία), την εμφάνιση και τη ρύθμιση της Αρχικής.', why: 'Ο λογαριασμός σας είναι προσωπικός: ό,τι κάνετε καταγράφεται στο δικό σας όνομα.', targets: ['topbar:account'], guide: 'syndesi-kai-logariasmos' },
    GUIDE_STEP,
  ],
};

export interface ResolvedStep { step: TourStep; target: string }
/** Keeps the steps whose anchor exists on screen right now, with the anchor that will be highlighted. `present` answers "is this anchor visible?". */
export function resolveSteps(steps: TourStep[], present: (anchor: string) => boolean): ResolvedStep[] {
  return steps.flatMap((step) => {
    const target = step.targets.find(present);
    return target ? [{ step, target }] : [];
  });
}
