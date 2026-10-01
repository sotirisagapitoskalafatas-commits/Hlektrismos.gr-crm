/* Single source of truth for the legal pages (Privacy, Cookies, Terms,
   Copyright). Values marked TODO(owner) must be confirmed by the business;
   the pages render them visibly so a missing value cannot go unnoticed. */

export const COMPANY = {
  brand: 'Hlektrismos.gr',
  legalName: 'TODO(owner): Επωνυμία νομικού προσώπου',
  vatId: 'TODO(owner): ΑΦΜ / ΔΟΥ',
  gemi: 'TODO(owner): Αριθμός ΓΕΜΗ',
  address: 'Ζαλοκώστα 8, 10671 Αθήνα',
  phone: '+30 210 22 55 000',
  email: 'info@hlektrismos.gr',
  privacyEmail: 'privacy@hlektrismos.gr',
  copyrightEmail: 'copyright@hlektrismos.gr',
};

/* Designated copyright agent (US Copyright Office DMCA directory). Fill in
   after registering at https://dmca.copyright.gov — see the audit notes. */
export const COPYRIGHT_AGENT = {
  name: 'TODO(owner): Όνομα / τίτλος υπευθύνου',
  address: COMPANY.address,
  phone: COMPANY.phone,
  email: COMPANY.copyrightEmail,
  registrationNumber: 'TODO(owner): DMCA-xxxxxxx',
};

export const POLICY_UPDATED = '1 Οκτωβρίου 2026';

/* Every third party the code sends personal data to, taken from the code
   (src/ and supabase/functions/). Add a row in the SAME change that adds a
   new integration. */
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
