/* Contextual help: a short introduction per page and a few field-level tips. Pure data, every sentence something the application really does.
   A tip never appears for a field the account can not see, and never explains an action the role may not take (`roles`). Each links to ONE guide. */
import type { PageKey } from '@/lib/roles';
import type { GuideRole } from './markdown';

export interface PageIntro { page: PageKey; text: string; guide: string }
export const PAGE_INTROS: PageIntro[] = [
  { page: 'home', text: 'Η Αρχική συγκεντρώνει τα επείγοντα, τα follow-ups της ημέρας, τις προσφορές, τις υπογραφές, τα νέα cases και τα σημερινά tasks.', guide: 'arxiki-kai-protereotites' },
  { page: 'mywork', text: 'Εδώ βρίσκετε ό,τι χρειάζεται τη δική σας ενέργεια, με σειρά προτεραιότητας.', guide: 'follow-ups' },
  { page: 'leads', text: 'Τα leads είναι οι πρώτες επαφές. Όταν ο πελάτης προχωρά, το lead μετατρέπεται σε Case.', guide: 'lead-dimiourgia' },
  { page: 'customers', text: 'Οι πελάτες δημιουργούνται όταν ένα lead μετατρέπεται σε Case. Εδώ βρίσκετε τα στοιχεία και τους φακέλους τους.', guide: 'pos-vrisko-ena-pelati' },
  { page: 'cases', text: 'Κάθε case ακολουθεί τα στάδια της πώλησης, από το «Νέο» ως την «Ενεργοποίηση» ή το «Ολοκληρώθηκε».', guide: 'case-roi' },
  { page: 'backoffice', text: 'Η ουρά του Back Office: τα cases που περιμένουν έλεγχο εγγράφων, καταχώρηση ή ενεργοποίηση.', guide: 'diekperaiosi-back-office' },
  { page: 'myday', text: 'Οι επισκέψεις της ημέρας, με Check In και Check Out.', guide: 'imera-mou-kai-check-in' },
  { page: 'map', text: 'Ο χάρτης δείχνει leads και επισκέψεις στην περιοχή σας και σας βοηθά να οργανώσετε διαδρομή.', guide: 'imera-mou-kai-check-in' },
  { page: 'reports', text: 'Αναφορές για τις πωλήσεις και το pipeline, την ταχύτητα ολοκλήρωσης και τις πηγές των leads.', guide: 'anafores' },
  { page: 'admin', text: 'Το Κέντρο Διαχείρισης είναι διαθέσιμο μόνο στον λογαριασμό Admin / Back Office.', guide: 'kentro-diachirisis' },
];
export const introFor = (page: string): PageIntro | null => PAGE_INTROS.find((p) => p.page === page) ?? null;

export interface HelpTip { id: string; title: string; text: string; guide: string; roles: GuideRole[] }
export const HELP_TIPS: HelpTip[] = [
  { id: 'doc-type', title: 'Τι είναι το έγγραφο', text: 'Επιλέξτε τον τύπο του αρχείου (π.χ. Λογαριασμός ρεύματος, Φωτογραφία μετρητή). Ο τύπος είναι υποχρεωτικός και βοηθά τον έλεγχο των δικαιολογητικών. Κάθε αρχείο μπορεί να είναι έως 25 MB.', guide: 'eggrafa', roles: ['admin', 'sales_agent'] },
  { id: 'stage-change', title: 'Αλλαγή σταδίου', text: 'Επιτρέπονται μόνο οι μεταβάσεις που ορίζει η ροή του CRM. Αν λείπουν έγγραφα, το CRM προειδοποιεί αλλά δεν σας εμποδίζει.', guide: 'case-roi', roles: ['admin', 'sales_agent'] },
  { id: 'agent-visibility', title: 'Ορατότητα πωλητών', text: 'Ρυθμίζει αν κάθε Sales Agent βλέπει μόνο τα δικά του leads και cases ή και των άλλων. Η αλλαγή αφορά όλους τους Sales Agents. Αν η αντίστοιχη ενημέρωση βάσης δεν έχει εφαρμοστεί, η οθόνη το δείχνει ως εκκρεμότητα και οι πωλητές βλέπουν όλα τα leads.', guide: 'roloi-kai-dikaiomata', roles: ['admin'] },
];
export const tipsFor = (role: GuideRole): HelpTip[] => HELP_TIPS.filter((t) => t.roles.includes(role));
