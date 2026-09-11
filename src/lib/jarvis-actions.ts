/* ------------------------------------------------------------------ */
/*  jarvis-actions — Layer 3 (ACTION): detect explicit navigation      */
/*  commands in user messages and map them to CRM pages. Only fires    */
/*  on explicit phrasing ("δείξε μου το χάρτη", "άνοιξε τις υποθέσεις") */
/*  so general energy questions still go to the chat backend.          */
/* ------------------------------------------------------------------ */

import type { PageKey } from './roles';

type NavAction = {
  page: PageKey;
  patterns: RegExp[];
  reply: string;
  noAuthReply: string;
};

const ACTIONS: NavAction[] = [
  {
    page: 'home',
    patterns: [/(αρχική|πήγαινε στην αρχή|πάμε στην αρχή|home\b|dashboard)/i],
    reply: 'Σας πάω στην αρχική οθόνη. 🏠',
    noAuthReply: 'Συνδεθείτε για να δείτε την αρχική σας οθόνη CRM.',
  },
  {
    page: 'map',
    patterns: [/(χάρτ(η|ης)|πιο κοντά|κοντά μου|περιοχή)/i],
    reply: 'Ανοίγω τον χάρτη με τις υπηρεσίες στην περιοχή σας. 🗺️',
    noAuthReply: 'Συνδεθείτε για να δείτε τον χάρτη των πελατών και των ραντεβού σας.',
  },
  {
    page: 'cases',
    patterns: [/(υποθέσεις|υποθέσει|cases|case\b|δικαστικές)/i],
    reply: 'Σας ανοίγω τις υποθέσεις. 📁',
    noAuthReply: 'Συνδεθείτε για να δείτε τις υποθέσεις σας.',
  },
  {
    page: 'customers',
    patterns: [/(πελάτες|πελάτη|πελατών|customers|customer)/i],
    reply: 'Ανοίγω τη λίστα πελατών. 👥',
    noAuthReply: 'Συνδεθείτε για να δείτε τους πελάτες σας.',
  },
  {
    page: 'leads',
    patterns: [/(leads|υποψήφιοι|υποψήφιου|υποψηφ)/i],
    reply: 'Ανοίγω τα υποψήφια leads. 🎯',
    noAuthReply: 'Συνδεθείτε για να δείτε τα leads σας.',
  },
  {
    page: 'myday',
    patterns: [/(ημέρα μου|my ?day|τι (έχω|κάνω) σήμερα|το πρόγραμμά μου σήμερα|το πρόγραμμα μου σήμερα)/i],
    reply: 'Σας ανοίγω την «Ημέρα μου» με τις σημερινές εργασίες. 📅',
    noAuthReply: 'Συνδεθείτε για να δείτε το πρόγραμμα της ημέρας σας.',
  },
  {
    page: 'followups',
    patterns: [/(παρακολούθηση|follow ?up|προγραμματισμένες)/i],
    reply: 'Ανοίγω τις προγραμματισμένες ενέργειες και follow-ups. 🔔',
    noAuthReply: 'Συνδεθείτε για να δείτε τα follow-ups σας.',
  },
  {
    page: 'backoffice',
    patterns: [/(back ?office|διαχείριση εταιρείας|εσωτερική)/i],
    reply: 'Ανοίγω το Backoffice. ⚙️',
    noAuthReply: 'Συνδεθείτε για να μεταβείτε στο Backoffice.',
  },
  {
    page: 'reports',
    patterns: [/(αναφορές|αναφορά|report|στατιστικά)/i],
    reply: 'Ανοίγω τις αναφορές. 📊',
    noAuthReply: 'Συνδεθείτε για να δείτε τις αναφορές σας.',
  },
];

/** Returns the matching navigation action, or null if no explicit intent. */
export function detectNavIntent(text: string): NavAction | null {
  return ACTIONS.find(a => a.patterns.some(p => p.test(text))) ?? null;
}