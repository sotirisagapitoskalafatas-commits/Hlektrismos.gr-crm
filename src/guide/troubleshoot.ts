/* Guided troubleshooting. Decision trees whose causes are ones the application really has (transition matrix, page access, upload limit, the messages it shows),
   and two checkers that answer from the LIVE data of the application instead of from prose. When the tree can not decide, it says who to ask: it never guesses.
   PURE: no network, no CRM data, nothing is read or changed. */
import { STAGES, STAGE_TRANSITIONS, canOpenPage, PAGE_TITLES, can } from '@/lib/roles';
import type { PageKey, Role, Stage } from '@/lib/roles';
import { MAX_UPLOAD_BYTES } from '@/lib/upload-files';

export interface TOption { label: string; next: string }
export interface TNode {
  id: string; text: string; options?: TOption[];
  result?: { kind: 'cause' | 'escalate' | 'ok' | 'planned'; text: string; guide?: string };
}
export interface Tree { id: string; title: string; ask: string; status: 'verified' | 'partially-verified' | 'planned'; start: string; nodes: Record<string, TNode>; checker?: 'stage-move' | 'page-access' }

const MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
const ESC = 'Αν το πρόβλημα συνεχίζεται, γράψτε στον Admin / Back Office το ακριβές μήνυμα που βλέπετε και τη σελίδα, χωρίς κωδικούς ή στοιχεία πελατών.';

export const TREES: Tree[] = [
  { id: 'cannot-see-lead', title: 'Δεν βλέπω ένα lead', ask: 'Ένα lead που περιμένω δεν εμφανίζεται', status: 'partially-verified', start: 'role', nodes: {
    role: { id: 'role', text: 'Με ποιον λογαριασμό δουλεύετε;', options: [{ label: 'Sales Agent', next: 'mine' }, { label: 'Admin / Back Office', next: 'admin' }] },
    mine: { id: 'mine', text: 'Το lead το δημιουργήσατε εσείς ή σας το ανέθεσε ο Admin;', options: [{ label: 'Το δημιούργησα εγώ', next: 'filter' }, { label: 'Μου το ανέθεσαν', next: 'filter' }, { label: 'Δεν το δημιούργησα και δεν μου το ανέθεσαν', next: 'notmine' }] },
    notmine: { id: 'notmine', text: '', result: { kind: 'cause', text: 'Όταν η ορατότητα των πωλητών είναι περιορισμένη, ο Sales Agent βλέπει μόνο τα leads που δημιούργησε ή που του ανατέθηκαν. Ζητήστε από τον Admin να σας το αναθέσει. Ο Admin βλέπει αν η ορατότητα είναι ενεργή στη Διαχείριση → Επισκόπηση → «Ορατότητα πωλητών».', guide: 'roloi-kai-dikaiomata' } },
    filter: { id: 'filter', text: 'Έχετε επιλέξει φίλτρο σταδίου ή κατάστασης στη λίστα Leads;', options: [{ label: 'Ναι', next: 'clear' }, { label: 'Όχι', next: 'converted' }] },
    clear: { id: 'clear', text: '', result: { kind: 'cause', text: 'Επιλέξτε «Όλα τα leads» ή «Όλα» στο φίλτρο σταδίου. Ένα lead σε άλλη κατάσταση δεν φαίνεται κάτω από λάθος φίλτρο.', guide: 'lead-katastasi-kai-metatropi' } },
    converted: { id: 'converted', text: 'Το lead έχει ήδη μετατραπεί σε Case;', options: [{ label: 'Ναι ή δεν ξέρω', next: 'case' }, { label: 'Όχι', next: 'escalate' }] },
    case: { id: 'case', text: '', result: { kind: 'cause', text: 'Μετά τη «Μετατροπή σε Case» ο πελάτης και το case βρίσκονται στις ενότητες Πελάτες και Cases. Στην καρτέλα του lead θα δείτε «Μετατράπηκε σε Case» και «Άνοιγμα Case».', guide: 'lead-katastasi-kai-metatropi' } },
    admin: { id: 'admin', text: 'Έχετε επιλέξει φίλτρο σταδίου στη λίστα Leads;', options: [{ label: 'Ναι', next: 'clear' }, { label: 'Όχι', next: 'trash' }] },
    trash: { id: 'trash', text: '', result: { kind: 'cause', text: 'Ένα lead που διαγράφηκε μπαίνει στον Κάδο (Διαχείριση → Κάδος) και δεν φαίνεται στη λίστα. Από εκεί μπορεί να επανέλθει. Αν δεν είναι ούτε εκεί, μπορεί να έχει μετατραπεί σε Case.', guide: 'kentro-diachirisis' } },
    escalate: { id: 'escalate', text: '', result: { kind: 'escalate', text: `Δεν υπάρχει γνωστή αιτία από τα παραπάνω. ${ESC}` } },
  } },
  { id: 'cannot-move-case', title: 'Δεν μπορώ να μετακινήσω ένα case', ask: 'Η αλλαγή σταδίου δεν γίνεται', status: 'verified', start: 'checker', checker: 'stage-move', nodes: {
    checker: { id: 'checker', text: 'Επιλέξτε το τωρινό στάδιο και αυτό που θέλετε.' } } },
  { id: 'cannot-upload', title: 'Δεν ανεβαίνει ένα έγγραφο', ask: 'Το έγγραφο δεν αποθηκεύεται', status: 'partially-verified', start: 'msg', nodes: {
    msg: { id: 'msg', text: 'Τι βλέπετε;', options: [{ label: 'Το αρχείο είναι μεγάλο', next: 'size' }, { label: 'Δεν έχω επιλέξει τι είναι το έγγραφο', next: 'type' }, { label: '«Το έγγραφο δεν αποθηκεύτηκε. Δοκιμάστε ξανά.»', next: 'again' }, { label: 'Είμαι εκτός σύνδεσης', next: 'offline' }] },
    size: { id: 'size', text: '', result: { kind: 'cause', text: `Κάθε αρχείο μπορεί να είναι έως ${MB} MB. Μικρύνετε ή ξαναφωτογραφίστε το έγγραφο και δοκιμάστε ξανά.`, guide: 'eggrafa' } },
    type: { id: 'type', text: '', result: { kind: 'cause', text: 'Η φόρμα ζητά «Τι είναι το έγγραφο; (απαιτείται)». Επιλέξτε τον τύπο (π.χ. Λογαριασμός ρεύματος, Φωτογραφία μετρητή) και δοκιμάστε ξανά.', guide: 'eggrafa' } },
    again: { id: 'again', text: 'Δοκιμάσατε ξανά με καλό δίκτυο;', options: [{ label: 'Ναι, αποτυγχάνει ξανά', next: 'escalate' }, { label: 'Όχι ακόμη', next: 'retry' }] },
    retry: { id: 'retry', text: '', result: { kind: 'cause', text: 'Ελέγξτε τη σύνδεση και δοκιμάστε ξανά το ίδιο αρχείο. Το μήνυμα είναι γενικό και συχνά οφείλεται σε προσωρινό πρόβλημα δικτύου.', guide: 'eggrafa' } },
    offline: { id: 'offline', text: '', result: { kind: 'cause', text: 'Χωρίς σύνδεση αποθηκεύονται σε αναμονή σε αυτόν τον browser μόνο το Check In, το Check Out, η φωτογραφία και η σημείωση πεδίου, και στέλνονται όταν επανέλθει το δίκτυο. Για τα έγγραφα του case ανεβάστε όταν υπάρχει σύνδεση.', guide: 'imera-mou-kai-check-in' } },
    escalate: { id: 'escalate', text: '', result: { kind: 'escalate', text: `Δεν είναι γνωστό από τον οδηγό γιατί αποτυγχάνει. ${ESC}` } },
  } },
  { id: 'cannot-open-section', title: 'Δεν μπορώ να ανοίξω μια ενότητα', ask: 'Μια σελίδα δεν είναι διαθέσιμη στον λογαριασμό μου', status: 'verified', start: 'checker', checker: 'page-access', nodes: { checker: { id: 'checker', text: 'Επιλέξτε τον λογαριασμό σας και την ενότητα.' } } },
  { id: 'cannot-find-record', title: 'Δεν βρίσκω έναν υπάρχοντα πελάτη', ask: 'Ο πελάτης δεν εμφανίζεται στην αναζήτηση', status: 'verified', start: 'what', nodes: {
    what: { id: 'what', text: 'Τι ψάχνετε;', options: [{ label: 'Έναν πελάτη', next: 'cust' }, { label: 'Μια πρώτη επαφή που δεν έγινε ακόμη πελάτης', next: 'lead' }] },
    cust: { id: 'cust', text: 'Ο πελάτης έχει γίνει ποτέ case από lead;', options: [{ label: 'Ναι ή δεν ξέρω', next: 'filt' }, { label: 'Όχι, ήταν μόνο lead', next: 'lead' }] },
    lead: { id: 'lead', text: '', result: { kind: 'cause', text: 'Οι πελάτες δημιουργούνται μόνο όταν ένα lead μετατρέπεται σε case. Μια επαφή που δεν έχει μετατραπεί είναι lead, όχι πελάτης: ψάξτε στη λίστα Leads.', guide: 'lead-katastasi-kai-metatropi' } },
    filt: { id: 'filt', text: 'Έχετε ενεργό το φίλτρο «Μόνο με ενεργό case»;', options: [{ label: 'Ναι', next: 'unfilter' }, { label: 'Όχι', next: 'spelling' }] },
    unfilter: { id: 'unfilter', text: '', result: { kind: 'cause', text: 'Αφαιρέστε το φίλτρο «Μόνο με ενεργό case»: κρύβει πελάτες χωρίς ενεργό case.', guide: 'pos-vrisko-ena-pelati' } },
    spelling: { id: 'spelling', text: '', result: { kind: 'cause', text: 'Η αναζήτηση πελατών δουλεύει με όνομα, τηλέφωνο, email ή πόλη. Δοκιμάστε μικρότερο κομμάτι του ονόματος ή το τηλέφωνο. Η γενική αναζήτηση (⌘K ή Ctrl+K) ψάχνει σε περισσότερα μέρη.', guide: 'pos-vrisko-ena-pelati' } },
  } },
  { id: 'cannot-save', title: 'Δεν αποθηκεύεται ένα lead', ask: 'Η καταχώρηση ή η αλλαγή lead αποτυγχάνει', status: 'verified', start: 'msg', nodes: {
    msg: { id: 'msg', text: 'Τι λέει το μήνυμα;', options: [{ label: 'Δεν υπάρχει σύνδεση με τον server', next: 'net' }, { label: 'Δεν έχετε δικαίωμα να αποθηκεύσετε αυτό το lead', next: 'perm' }, { label: 'Λείπει υποχρεωτικό στοιχείο', next: 'req' }, { label: 'Προεπισκόπηση ρόλου: μόνο ανάγνωση', next: 'prev' }] },
    net: { id: 'net', text: '', result: { kind: 'cause', text: 'Ελέγξτε το δίκτυο και δοκιμάστε ξανά. Ό,τι γράψατε στη φόρμα δεν χάνεται όσο η φόρμα μένει ανοιχτή.', guide: 'lead-dimiourgia' } },
    perm: { id: 'perm', text: '', result: { kind: 'escalate', text: `Ο λογαριασμός σας δεν έχει δικαίωμα σε αυτό το lead (π.χ. ανήκει σε άλλον Sales Agent). Ζητήστε από τον Admin / Back Office να σας το αναθέσει.`, guide: 'roloi-kai-dikaiomata' } },
    req: { id: 'req', text: '', result: { kind: 'cause', text: 'Μόνο το όνομα ή η επωνυμία είναι υποχρεωτικό. Συμπληρώστε το ονοματεπώνυμο και δοκιμάστε ξανά. Τηλέφωνο και email μπορούν να προστεθούν αργότερα.', guide: 'lead-dimiourgia' } },
    prev: { id: 'prev', text: '', result: { kind: 'cause', text: 'Βρίσκεστε σε προεπισκόπηση ρόλου (παρουσίαση): δεν εκτελείται καμία εγγραφή. Βγείτε από την προεπισκόπηση και δοκιμάστε ξανά.' } },
  } },
  { id: 'cannot-hand-over', title: 'Δεν ολοκληρώνεται η παράδοση στο Back Office', ask: 'Η παράδοση ενός case δεν δείχνει υπεύθυνο', status: 'partially-verified', start: 'msg', nodes: {
    msg: { id: 'msg', text: 'Βλέπετε το μήνυμα «Δεν έχει οριστεί υπεύθυνος Back Office»;', options: [{ label: 'Ναι', next: 'assignee' }, { label: 'Όχι, κάτι άλλο', next: 'escalate' }] },
    assignee: { id: 'assignee', text: '', result: { kind: 'escalate', text: 'Ο Admin πρέπει να ορίσει τον προεπιλεγμένο υπεύθυνο Back Office στη Διαχείριση → Cases & Ροή εργασίας. Μέχρι τότε το case μένει στον τωρινό υπεύθυνο και δεν χάνεται. Μετά τον ορισμό, κάντε ξανά την παράδοση.', guide: 'paradosi-sto-back-office' } },
    escalate: { id: 'escalate', text: '', result: { kind: 'escalate', text: `Δεν είναι γνωστή άλλη αιτία από τον οδηγό. ${ESC}` } },
  } },
  { id: 'cannot-change-password', title: 'Δεν μπορώ να αλλάξω τον κωδικό μου', ask: 'Η αλλαγή κωδικού δεν γίνεται', status: 'partially-verified', start: 'msg', nodes: {
    msg: { id: 'msg', text: 'Τι μήνυμα βλέπετε στην κάρτα «Αλλαγή κωδικού πρόσβασης»;', options: [{ label: 'Ο τρέχων κωδικός δεν είναι σωστός', next: 'wrong' }, { label: 'Ο νέος κωδικός απορρίφθηκε ως αδύναμος ή πρέπει να διαφέρει', next: 'weak' }, { label: 'Απαιτείται νέα επαλήθευση (σύνδεση παλαιότερη από 24 ώρες)', next: 'reauth' }, { label: 'Πάρα πολλές προσπάθειες', next: 'rate' }, { label: 'Δεν θυμάμαι τον τρέχοντα κωδικό', next: 'forgot' }] },
    wrong: { id: 'wrong', text: '', result: { kind: 'cause', text: 'Ο τρέχων κωδικός δεν ταιριάζει και ο κωδικός δεν άλλαξε. Ελέγξτε τον και δοκιμάστε ξανά.', guide: 'allagi-kodikou' } },
    weak: { id: 'weak', text: '', result: { kind: 'cause', text: 'Ο νέος κωδικός χρειάζεται τουλάχιστον 12 χαρακτήρες, να διαφέρει από τον τρέχοντα και να μην είναι εύκολος να μαντευτεί. Δείτε τις «Απαιτήσεις κωδικού» στην κάρτα.', guide: 'allagi-kodikou' } },
    reauth: { id: 'reauth', text: '', result: { kind: 'cause', text: 'Η υπηρεσία ζητά νέα επαλήθευση. Η απλούστερη λύση είναι «Αποσύνδεση και νέα σύνδεση (χωρίς email)» και μετά νέα προσπάθεια. Εναλλακτικά ζητήστε κωδικό επαλήθευσης στο email και χρησιμοποιήστε το πιο πρόσφατο.', guide: 'allagi-kodikou' } },
    rate: { id: 'rate', text: '', result: { kind: 'cause', text: 'Περιμένετε λίγο πριν δοκιμάσετε ξανά. Ο κωδικός δεν άλλαξε.', guide: 'allagi-kodikou' } },
    forgot: { id: 'forgot', text: '', result: { kind: 'cause', text: 'Αποσυνδεθείτε και χρησιμοποιήστε την «Επαναφορά κωδικού» από τη σελίδα εισόδου: θα σταλεί σύνδεσμος στο email του λογαριασμού σας.', guide: 'syndesi-kai-logariasmos' } },
  } },
];

/* ───────── checkers: answers from the application's own data ───────── */
export interface MoveCheck { allowed: boolean; allowedNext: Stage[]; text: string }
const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)?.label ?? s;

/** Can a case move from one stage to another? Straight from STAGE_TRANSITIONS, plus who may. */
export function checkStageMove(role: Role, from: Stage, to: Stage): MoveCheck {
  const next = STAGE_TRANSITIONS[from] ?? [];
  if (from === to) return { allowed: false, allowedNext: next, text: 'Το case είναι ήδη σε αυτό το στάδιο.' };
  if (!can(role, 'change_stage')) return { allowed: false, allowedNext: next, text: 'Ο λογαριασμός σας δεν έχει δικαίωμα αλλαγής σταδίου.' };
  if (from === 'completed') return { allowed: false, allowedNext: [], text: `Ένα ολοκληρωμένο case δεν αλλάζει στάδιο. Μόνο ο Admin μπορεί να το ανοίξει ξανά με την «Επαναφορά ολοκληρωμένου case (διαχειριστής)», με γραπτή αιτιολογία, και μόνο όταν η λειτουργία έχει ενεργοποιηθεί στο σύστημα.` };
  if (next.includes(to)) return { allowed: true, allowedNext: next, text: `Η μετάβαση από «${stageLabel(from)}» σε «${stageLabel(to)}» επιτρέπεται. Αν λείπουν έγγραφα, το CRM μόνο προειδοποιεί: δεν σας εμποδίζει.` };
  return { allowed: false, allowedNext: next, text: `Από «${stageLabel(from)}» δεν επιτρέπεται απευθείας μετάβαση σε «${stageLabel(to)}». Επιτρέπονται: ${next.map(stageLabel).join(', ') || 'καμία'}. Περάστε από ένα ενδιάμεσο στάδιο${role === 'admin' ? '. Ο Admin έχει και την «Αλλαγή σταδίου (Back Office)» (οποιοδήποτε στάδιο, με γραπτή αιτιολογία), αλλά λειτουργεί μόνο όταν έχει ενεργοποιηθεί στο σύστημα· αλλιώς το CRM δείχνει μια σημείωση αντί για φόρμα' : ''}.` };
}

export interface AccessCheck { allowed: boolean; text: string }
/** Can this account open this page? The same rule the application applies (canOpenPage). */
export function checkPageAccess(role: Role, page: PageKey): AccessCheck {
  const ok = canOpenPage(page, role);
  const title = PAGE_TITLES[page] ?? page;
  return ok ? { allowed: true, text: `Ο λογαριασμός ${role === 'admin' ? 'Admin / Back Office' : 'Sales Agent'} έχει πρόσβαση στη σελίδα «${title}».` }
    : { allowed: false, text: `Η σελίδα «${title}» δεν περιλαμβάνεται στον λογαριασμό ${role === 'admin' ? 'Admin / Back Office' : 'Sales Agent'}. Είναι σκόπιμο: τα δικαιώματα ορίζονται από τον ρόλο. Αν τη χρειάζεστε, ζητήστε το από τον Admin / Back Office.` };
}

export const CHECKABLE_PAGES: PageKey[] = ['home', 'mywork', 'leads', 'customers', 'cases', 'providers', 'prospecting', 'myday', 'map', 'field', 'backoffice', 'reports', 'revenue', 'admin', 'automations', 'aiworkforce'];
