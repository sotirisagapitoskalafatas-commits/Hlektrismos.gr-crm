/* Admin Center security checks (data + the anonymous-visitor probe). See components/admin/AdminSecurity. */

import { anonymousClient } from './supabase';

export type Status = 'verified' | 'action' | 'unverified';
export interface CheckResult { id: string; label: string; status: Status; detail: string }

const STORE = 'atlas.admin.security.last';
const ANON_TABLES: [string, string][] = [
  ['leads', 'Leads'], ['customers', 'Πελάτες'], ['cases', 'Cases'], ['case_documents', 'Έγγραφα cases'],
  ['follow_ups', 'Follow-ups'], ['profiles', 'Προφίλ προσωπικού'], ['activity_log', 'Ιστορικό ενεργειών'],
  ['crm_emails', 'Email πελατών'], ['crm_integrations', 'Ρυθμίσεις ενσωματώσεων'], ['crm_settings', 'Ρυθμίσεις CRM'],
];

/** Run the anonymous-visitor checks. Exported for the overview card. */
export async function runAnonChecks(): Promise<{ at: string; results: CheckResult[] }> {
  const anon = anonymousClient();
  const results: CheckResult[] = [];
  for (const [table, label] of ANON_TABLES) {
    const { data, error } = await anon.from(table).select('id').limit(1);
    if (error) {
      const denied = /permission|denied|JWT|not allowed|42501|401|403/i.test(`${error.code} ${error.message}`);
      const missing = /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code} ${error.message}`);
      results.push({ id: table, label: `Ανώνυμος επισκέπτης → ${label}`, status: denied || missing ? 'verified' : 'unverified',
        detail: denied ? 'Άρνηση πρόσβασης από τη βάση.' : missing ? 'Ο πίνακας δεν εκτίθεται στο API.' : `Ο έλεγχος δεν ολοκληρώθηκε (${error.message}).` });
    } else if ((data ?? []).length === 0) {
      results.push({ id: table, label: `Ανώνυμος επισκέπτης → ${label}`, status: 'verified', detail: 'Δεν επιστράφηκαν εγγραφές σε ανώνυμο επισκέπτη.' });
    } else {
      results.push({ id: table, label: `Ανώνυμος επισκέπτης → ${label}`, status: 'action', detail: 'Ο ανώνυμος επισκέπτης διάβασε εγγραφή. Ελέγξτε RLS/grants για τον πίνακα.' });
    }
  }
  const { data: files, error: fErr } = await anon.storage.from('hlektrismos_docs').list('contact-forms', { limit: 1 });
  results.push(fErr || (files ?? []).length === 0
    ? { id: 'storage', label: 'Ανώνυμος επισκέπτης → αρχεία φόρμας (hlektrismos_docs)', status: 'verified', detail: 'Δεν επιστράφηκε λίστα αρχείων.' }
    : { id: 'storage', label: 'Ανώνυμος επισκέπτης → αρχεία φόρμας (hlektrismos_docs)', status: 'action', detail: 'Ο ανώνυμος επισκέπτης είδε λίστα αρχείων.' });
  const out = { at: new Date().toISOString(), results };
  try { localStorage.setItem(STORE, JSON.stringify(out)); } catch { /* ignore */ }
  return out;
}

export function lastAnonChecks(): { at: string; results: CheckResult[] } | null {
  try { const v = localStorage.getItem(STORE); return v ? JSON.parse(v) : null; } catch { return null; }
}

/** Source-code findings (evidence + staged fix). Not live checks — labelled as such. */
export const SOURCE_FINDINGS: CheckResult[] = [
  { id: 'profiles-self-promotion', label: 'Αλλαγή του δικού ρόλου από τον χρήστη (profiles)', status: 'action',
    detail: 'Η migration 20260910103000 (γρ. 586) επανέφερε πολιτική που επιτρέπει σε κάθε χρήστη να ορίσει τον εαυτό του διαχειριστή. Διόρθωση: staged-migrations/phase2/05 (δεν έχει εφαρμοστεί).' },
  { id: 'crm-settings', label: 'Κλειδιά/διαπιστευτήρια στο crm_settings', status: 'action',
    detail: 'Ο Διευθυντής μπορεί να διαβάσει το κλειδί SerpApi και να αλλάξει τα role_permissions απευθείας από τον πίνακα. Διόρθωση: phase2/05 §6. Οι διαχειριστές εξακολουθούν να τα διαβάζουν λόγω του παλιού SettingsPanel.' },
  { id: 'doc-blockers', label: 'Έλεγχος εγγράφων πριν την αλλαγή σταδίου', status: 'action',
    detail: 'Σήμερα είναι μόνο καθοδήγηση στην εφαρμογή· ο server δεν μπλοκάρει ακόμη τη μετάβαση. Διόρθωση: staged-migrations/phase2/07 (δεν έχει εφαρμοστεί).' },
  { id: 'phase1', label: 'RLS hardening (staged-migrations/phase1)', status: 'unverified',
    detail: 'Γραμμένο και ελεγμένο τοπικά· η εφαρμογή στο staging/production δεν έχει επιβεβαιωθεί. Οι έλεγχοι ανώνυμου επισκέπτη παραπάνω δείχνουν την πραγματική κατάσταση για email/ενσωματώσεις.' },
];

export const UNVERIFIED: CheckResult[] = [
  { id: 'rls-all', label: 'RLS σε όλους τους πίνακες για συνδεδεμένους χρήστες ανά ρόλο', status: 'unverified', detail: 'Απαιτεί έλεγχο με πραγματικούς λογαριασμούς ανά ρόλο στο staging.' },
  { id: 'mfa', label: 'MFA για διαχειριστές', status: 'unverified', detail: 'Δεν έχει ελεγχθεί η ρύθμιση του Supabase Auth.' },
  { id: 'signup', label: 'Απενεργοποιημένες δημόσιες εγγραφές (Auth)', status: 'unverified', detail: 'Ρύθμιση του Supabase dashboard· ο server έχει backstop (νέοι λογαριασμοί ανενεργοί).' },
  { id: 'backups', label: 'Αντίγραφα ασφαλείας & δοκιμή επαναφοράς', status: 'unverified', detail: 'Δεν έχει γίνει δοκιμή επαναφοράς.' },
  { id: 'functions', label: 'Edge functions: εκδόσεις & μυστικά', status: 'unverified', detail: 'Δεν έχει συγκριθεί η αναπτυγμένη έκδοση με το repository.' },
];

export const STATUS_TEXT: Record<Status, string> = { verified: 'Επαληθεύτηκε', action: 'Χρειάζεται ενέργεια', unverified: 'Δεν έχει επαληθευτεί ζωντανά' };
