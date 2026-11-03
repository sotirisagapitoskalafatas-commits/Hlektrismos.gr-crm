export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: string[];
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '2.0.0',
    date: '2026-11-03',
    title: 'Πρώτη καταγεγραμμένη έκδοση ATLAS v2',
    summary: 'Καθιερώνεται η πρώτη επίσημη baseline έκδοση της τρέχουσας γενιάς ATLAS CRM v2 και η ενιαία καταγραφή εκδόσεων.',
    changes: [
      'Καθιερώνεται αρίθμηση εκδόσεων βάσει Semantic Versioning.',
      'Καταγράφονται αυτόματα το περιβάλλον, το Git commit, το branch και ο χρόνος δημιουργίας του build.',
      'Προστίθενται πληροφορίες έκδοσης και ιστορικό αλλαγών στο CRM και στις οθόνες σύνδεσης και ανάκτησης κωδικού.',
    ],
  },
];
