/* Single source of truth for the legal pages (Privacy, Cookies, Terms,
   Copyright). Company identity and public contact details as supplied by the
   owner on 27 Oct 2026 (to be cross-checked against the GEMI register before
   publication). No ΔΟΥ was supplied, and no privacy@/copyright@ mailbox is
   confirmed as monitored, so neither is published. Never ship a placeholder:
   src/lib/__tests__/legal-placeholders.test.mjs fails the build on one. */

export const COMPANY = {
  brand: 'Hlektrismos.gr',
  legalName: 'HLEKTRISMOS.GR ΜΟΝΟΠΡΟΣΩΠΗ Ι.Κ.Ε.',
  vatId: 'ΑΦΜ 801198034',
  gemi: 'Αρ. ΓΕΜΗ 151552422000',
  address: 'Ζαλοκώστα 8, Αθήνα, Τ.Κ. 10671',
  phone: '+30 210 22 55 000',
  email: 'info@hlektrismos.gr',
};

export const POLICY_UPDATED = '1 Οκτωβρίου 2026';

/* INTERNAL register (not rendered): every third party the code sends personal
   data to, taken from the code (src/ and supabase/functions/). The public
   Privacy Policy lists recipients by category; keep both in sync and add a row
   in the SAME change that adds a new integration. Rows are code evidence, not
   verified contracts or roles. Not yet listed: the repository's make-voice-call
   also configures OpenAI as the call model and an Azure voice via Vapi; add them
   once the deployed function is verified. */
export const PROCESSORS: Array<{ name: string; purpose: string; data: string; where: string }> = [
  { name: 'Supabase Inc.', purpose: 'Βάση δεδομένων, αυθεντικοποίηση προσωπικού, αποθήκευση αρχείων, edge functions', data: 'Όλα τα δεδομένα αιτημάτων, πελατών, υποθέσεων και εγγράφων· διεύθυνση IP', where: 'Όλη η ιστοσελίδα και το CRM' },
  { name: 'Vercel Inc.', purpose: 'Φιλοξενία ιστοσελίδας· Speed Insights (μόνο με συγκατάθεση)', data: 'Διεύθυνση IP, User-Agent, URL σελίδας, χρόνοι φόρτωσης', where: 'Κάθε επίσκεψη· Speed Insights μόνο μετά από «Αποδοχή»' },
  { name: 'Google LLC (Gemini API)', purpose: 'Απαντήσεις του chatbot JARVIS, ανάγνωση λογαριασμών ρεύματος (OCR), AI βοηθοί του CRM', data: 'Μηνύματα συνομιλίας και στοιχεία που δίνετε στο chat (όνομα, τηλέφωνο, email), εικόνες λογαριασμών, στοιχεία αιτημάτων', where: 'Chatbot· CRM' },
  { name: 'OpenAI, L.L.C.', purpose: 'AI βοηθοί του CRM και αναζήτηση στη βάση γνώσης τιμολογίων', data: 'Στοιχεία αιτημάτων που επεξεργάζεται ο βοηθός· ερωτήματα προσωπικού', where: 'Μόνο εντός CRM' },
  { name: 'Resend, Inc.', purpose: 'Αποστολή email προσφορών και ενημερωτικών (με σύνδεσμο απεγγραφής)', data: 'Email, όνομα, περιεχόμενο μηνύματος', where: 'Όταν σας στέλνουμε προσφορά/ενημέρωση' },
  { name: 'Πάροχος SMTP (ρυθμίζεται στο CRM)', purpose: 'Email επιβεβαίωσης αιτήματος και email από το προσωπικό', data: 'Email, όνομα, περιεχόμενο μηνύματος', where: 'Μετά την υποβολή φόρμας· επικοινωνία με το προσωπικό' },
  { name: 'Infobip Ltd.', purpose: 'SMS, Viber και WhatsApp μηνύματα', data: 'Τηλέφωνο, όνομα, περιεχόμενο μηνύματος', where: 'Μόνο όταν το προσωπικό στέλνει μήνυμα' },
  { name: 'Vapi (Vapi, Inc.)', purpose: 'Τηλεφωνικές κλήσεις με φωνητικό βοηθό AI', data: 'Τηλέφωνο, όνομα, περιοχή, τρέχων πάροχος, ηχογράφηση/απομαγνητοφώνηση κλήσης', where: 'Μόνο κλήσεις που ξεκινά το προσωπικό (οι αυτόματες κλήσεις είναι απενεργοποιημένες)' },
  { name: 'SerpApi, LLC', purpose: 'Αναζήτηση δημόσιων στοιχείων επιχειρήσεων (B2B)', data: 'Επωνυμίες και δημόσια στοιχεία επικοινωνίας επιχειρήσεων', where: 'Μόνο εντός CRM' },
  { name: 'ΑΑΔΕ / gsis.gr', purpose: 'Επαλήθευση στοιχείων επιχείρησης από ΑΦΜ', data: 'ΑΦΜ επιχείρησης', where: 'Μόνο εντός CRM' },
  { name: 'CARTO, OpenRouteService, OSRM, Photon (komoot)', purpose: 'Χάρτης, γεωκωδικοποίηση διευθύνσεων και δρομολόγηση επισκέψεων πεδίου', data: 'Διευθύνσεις/συντεταγμένες πελατών και θέση του υπαλλήλου, διεύθυνση IP του υπαλλήλου', where: 'Μόνο στον χάρτη του CRM' },
];
