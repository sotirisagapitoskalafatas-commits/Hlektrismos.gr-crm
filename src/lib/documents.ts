/* Customer document types for Greek energy switching/connection, and the per-case checklist.
   The list reflects what Greek retail energy providers TYPICALLY ask for; each provider's exact requirements vary and
   must be confirmed against the provider's current application form (shown to staff as a note in the UI).
   case_documents.category is free text, so new keys need NO migration; the legacy keys
   (bill, identity, offer, application, signed, provider, photo, other) stay valid and keep their old labels. */

export type DocGroup = 'identity' | 'property' | 'supply' | 'business' | 'payment' | 'contract' | 'field' | 'other';

export interface DocType { key: string; label: string; hint: string; group: DocGroup; legacy?: boolean }

export const DOC_GROUP_LABEL: Record<DocGroup, string> = {
  identity: 'Ταυτοποίηση', property: 'Χρήση ακινήτου', supply: 'Παροχή / λογαριασμοί', business: 'Επιχείρηση',
  payment: 'Πληρωμή', contract: 'Αίτηση & σύμβαση', field: 'Πεδίο', other: 'Άλλο',
};

export const DOC_TYPES: DocType[] = [
  { key: 'id_card', label: 'Ταυτότητα ή διαβατήριο', hint: 'Του δικαιούχου της παροχής (και των δύο όψεων)', group: 'identity' },
  { key: 'tax_id_proof', label: 'Αποδεικτικό ΑΦΜ', hint: 'Π.χ. εκκαθαριστικό ή βεβαίωση από TAXISnet', group: 'identity' },
  { key: 'e9', label: 'Ε9 (ιδιοκτησία)', hint: 'Όταν ο πελάτης είναι ιδιοκτήτης του ακινήτου', group: 'property' },
  { key: 'lease', label: 'Μισθωτήριο', hint: 'Όταν ο πελάτης είναι ενοικιαστής — δηλωμένο στο TAXISnet', group: 'property' },
  { key: 'free_use', label: 'Δωρεάν παραχώρηση χρήσης', hint: 'Παραχωρητήριο ή υπεύθυνη δήλωση χρήσης ακινήτου', group: 'property' },
  { key: 'bill_electricity', label: 'Λογαριασμός ρεύματος', hint: 'Πρόσφατος, με τον αριθμό παροχής', group: 'supply' },
  { key: 'bill_gas', label: 'Λογαριασμός φυσικού αερίου', hint: 'Πρόσφατος, με τον αριθμό παροχής φυσικού αερίου', group: 'supply' },
  { key: 'kot_certificate', label: 'Βεβαίωση ΚΟΤ / ευάλωτου πελάτη', hint: 'Μόνο αν ο πελάτης είναι ενταγμένος σε ΚΟΤ', group: 'supply' },
  { key: 'business_registry', label: 'Βεβαίωση ΓΕΜΗ / καταστατικό', hint: 'Για νομικά πρόσωπα', group: 'business' },
  { key: 'tax_start', label: 'Έναρξη εργασιών (ΔΟΥ)', hint: 'Για επιχειρήσεις και ελεύθερους επαγγελματίες', group: 'business' },
  { key: 'legal_rep', label: 'Νομιμοποίηση εκπροσώπου', hint: 'Πρακτικό ή εξουσιοδότηση και ταυτότητα του εκπροσώπου', group: 'business' },
  { key: 'iban', label: 'IBAN / πάγια εντολή', hint: 'Μόνο αν θα γίνεται αυτόματη πληρωμή', group: 'payment' },
  { key: 'solemn_declaration', label: 'Υπεύθυνη δήλωση', hint: 'Όταν τη ζητά ο πάροχος (Ν. 1599/1986)', group: 'contract' },
  { key: 'application', label: 'Αίτηση παρόχου', hint: 'Η αίτηση/σύμβαση του παρόχου', group: 'contract' },
  { key: 'signed', label: 'Υπογεγραμμένη σύμβαση', hint: 'Υπογεγραμμένη από τον πελάτη', group: 'contract' },
  { key: 'offer', label: 'Προσφορά', hint: 'Η προσφορά που δόθηκε στον πελάτη', group: 'contract' },
  { key: 'provider', label: 'Έγγραφο παρόχου', hint: 'Επιβεβαίωση ή αλληλογραφία από τον πάροχο', group: 'contract' },
  { key: 'site_photos', label: 'Φωτογραφίες χώρου / στέγης', hint: 'Για φωτοβολταϊκά ή φορτιστή', group: 'field' },
  { key: 'property_title', label: 'Τίτλος ιδιοκτησίας / άδεια δόμησης', hint: 'Για φωτοβολταϊκά, όταν απαιτείται', group: 'property' },
  { key: 'photo', label: 'Φωτογραφία πεδίου', hint: 'Λήψη από την επίσκεψη', group: 'field' },
  { key: 'other', label: 'Άλλο', hint: 'Περιγράψτε τι είναι στο σχόλιο', group: 'other' },
  // legacy, kept so existing records keep their label; not offered for new uploads
  { key: 'identity', label: 'Ταυτότητα / Δικαιολογητικά', hint: 'Παλαιά κατηγορία', group: 'identity', legacy: true },
  { key: 'bill', label: 'Λογαριασμός', hint: 'Παλαιά κατηγορία', group: 'supply', legacy: true },
];

const BY_KEY = new Map(DOC_TYPES.map(d => [d.key, d]));
export const docLabel = (key: string) => BY_KEY.get(key)?.label ?? key;
export const uploadableDocTypes = () => DOC_TYPES.filter(d => !d.legacy);

export interface ChecklistInput { service_type: string | null; property_type: string | null; case_type: string | null }
export interface ChecklistItem {
  /** Satisfied by any ONE of these document types. */
  anyOf: string[];
  label: string;
  required: boolean;
  status: 'verified' | 'received' | 'rejected' | 'missing';
  /** True when only a legacy, less specific category matched (e.g. old «Ταυτότητα / Δικαιολογητικά»). */
  viaLegacy?: boolean;
}

const BUSINESS_PROPS = ['Κατάστημα', 'Γραφείο'];
export function isBusinessCase(c: ChecklistInput): boolean {
  return BUSINESS_PROPS.includes(c.property_type ?? '') || /b2b|business|επιχειρ/i.test(c.case_type ?? '');
}

/** Typical document set for the case; it is guidance, not a provider-specific rule. */
export function requiredDocs(c: ChecklistInput): { anyOf: string[]; label: string; required: boolean }[] {
  const svc = c.service_type ?? 'energy';
  const list: { anyOf: string[]; label: string; required: boolean }[] = [
    { anyOf: ['id_card'], label: 'Ταυτότητα ή διαβατήριο', required: true },
  ];
  if (svc === 'energy' || svc === 'gas') {
    list.push({ anyOf: svc === 'gas' ? ['bill_gas'] : ['bill_electricity'], label: svc === 'gas' ? 'Λογαριασμός φυσικού αερίου' : 'Λογαριασμός ρεύματος', required: true });
    list.push({ anyOf: ['e9', 'lease', 'free_use'], label: 'Αποδεικτικό χρήσης ακινήτου (Ε9, μισθωτήριο ή παραχώρηση)', required: true });
  }
  if (svc === 'solar') {
    list.push({ anyOf: ['bill_electricity'], label: 'Λογαριασμός ρεύματος', required: true });
    list.push({ anyOf: ['e9', 'property_title'], label: 'Ε9 ή τίτλος ιδιοκτησίας', required: true });
    list.push({ anyOf: ['site_photos'], label: 'Φωτογραφίες στέγης / χώρου', required: false });
  }
  if (svc === 'ev') {
    list.push({ anyOf: ['site_photos'], label: 'Φωτογραφίες χώρου φορτιστή', required: false });
    list.push({ anyOf: ['e9', 'lease', 'free_use'], label: 'Αποδεικτικό χρήσης ακινήτου', required: false });
  }
  if (isBusinessCase(c)) {
    list.push({ anyOf: ['tax_start', 'business_registry'], label: 'Έναρξη εργασιών ή βεβαίωση ΓΕΜΗ', required: true });
    list.push({ anyOf: ['legal_rep'], label: 'Νομιμοποίηση εκπροσώπου (για νομικά πρόσωπα)', required: false });
  }
  list.push({ anyOf: ['signed'], label: 'Υπογεγραμμένη σύμβαση / αίτηση', required: true });
  return list;
}

const LEGACY_FOR: Record<string, string> = { id_card: 'identity', bill_electricity: 'bill', bill_gas: 'bill' };

export function buildChecklist(c: ChecklistInput, docs: { category: string; status: string }[]): ChecklistItem[] {
  const best = (keys: string[]) => {
    const found = docs.filter(d => keys.includes(d.category));
    if (found.some(d => d.status === 'verified')) return 'verified' as const;
    if (found.some(d => d.status !== 'rejected')) return 'received' as const;
    if (found.length) return 'rejected' as const;
    return 'missing' as const;
  };
  return requiredDocs(c).map(r => {
    const status = best(r.anyOf);
    if (status !== 'missing') return { ...r, status };
    const legacyKeys = r.anyOf.map(k => LEGACY_FOR[k]).filter(Boolean);
    const legacy = legacyKeys.length ? best(legacyKeys) : 'missing';
    return legacy !== 'missing' && legacy !== 'rejected' ? { ...r, status: legacy, viaLegacy: true } : { ...r, status };
  });
}
