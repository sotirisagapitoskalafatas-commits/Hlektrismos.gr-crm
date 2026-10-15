/* Pure helpers for writing a lead from the CRM (no Supabase import — unit-tested with plain Node).
   Root cause of «the lead was not created»: public.leads has first_name / client_name / client_contact NOT NULL
   (migration 20260908180001), but the CRM sent first_name = null always and client_contact = null when neither phone
   nor email was given, so PostgreSQL rejected the insert and the screen showed a generic message. */

export interface LeadNameParts { full: string; first: string; last: string }

/** «Γιάννης Παπαδόπουλος» → first «Γιάννης», last «Παπαδόπουλος». Never null: the columns are NOT NULL. */
export function splitLeadName(fullName: string | null | undefined, first?: string | null, last?: string | null): LeadNameParts {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  const full = (fullName ?? '').trim().replace(/\s+/g, ' ') || [f, l].filter(Boolean).join(' ');
  if (f) return { full: full || f, first: f, last: l };
  const parts = full.split(' ').filter(Boolean);
  return { full, first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

export interface LeadRowInput {
  full_name?: string | null; first_name?: string | null; last_name?: string | null;
  phone?: string | null; email?: string | null;
}

/** The identity columns of a new lead row. A name-only «quick lead» is valid (contact may be added later). */
export function leadIdentityColumns(input: LeadRowInput): Record<string, string | null> {
  const n = splitLeadName(input.full_name, input.first_name, input.last_name);
  const full = n.full || 'Νέο lead';
  const phone = (input.phone ?? '').trim() || null;
  const email = (input.email ?? '').trim() || null;
  return {
    full_name: full,
    first_name: n.first || full,
    last_name: n.last,
    client_name: full,
    client_contact: email ?? phone ?? '',
    phone,
    email,
  };
}

/** Columns to change when an existing lead's name is edited. Untouched fields are never sent (no accidental nulls). */
export function leadNamePatch(fullName: string): Record<string, string> {
  const n = splitLeadName(fullName);
  return { full_name: n.full, first_name: n.first || n.full, last_name: n.last, client_name: n.full };
}

export interface DbError { code?: string; message?: string; details?: string | null; hint?: string | null }

/** Greek, specific, and free of personal data (PostgreSQL `details` can contain the whole row — never shown or logged). */
export function leadWriteErrorText(e: DbError | null | undefined): string {
  if (!e) return 'Η αποθήκευση απέτυχε. Δοκιμάστε ξανά.';
  const msg = e.message ?? '';
  if (/Failed to fetch|NetworkError|network|fetch failed/i.test(msg)) return 'Δεν υπάρχει σύνδεση με τον server. Ελέγξτε το δίκτυο και δοκιμάστε ξανά.';
  if (e.code === 'PREVIEW_READ_ONLY' || /μόνο ανάγνωση/.test(msg)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση — η ενέργεια δεν εκτελέστηκε.';
  if (e.code === '42501' || /row-level security|permission denied|not allowed/i.test(msg)) return 'Δεν έχετε δικαίωμα να αποθηκεύσετε αυτό το lead. Ζητήστε από τον διαχειριστή να ελέγξει τον ρόλο σας.';
  if (e.code === '23502') {
    const col = /column "([a-z_]+)"/.exec(msg)?.[1];
    const what: Record<string, string> = { full_name: 'το όνομα', first_name: 'το όνομα', client_name: 'το όνομα', client_contact: 'τα στοιχεία επικοινωνίας' };
    return `Λείπει υποχρεωτικό στοιχείο${col && what[col] ? ` (${what[col]})` : ''}. Συμπληρώστε το και δοκιμάστε ξανά.`;
  }
  if (e.code === '23514') {
    if (/leads_status_check/.test(msg)) return 'Μη έγκυρη κατάσταση lead.';
    if (/leads_source_check/.test(msg)) return 'Μη έγκυρη πηγή lead.';
    return 'Κάποια τιμή δεν είναι αποδεκτή από τη βάση.';
  }
  if (e.code === '23503') return 'Ο υπεύθυνος ή ο πάροχος που επιλέχθηκε δεν υπάρχει πλέον. Επιλέξτε ξανά.';
  if (e.code === '23505') return 'Υπάρχει ήδη ίδια εγγραφή.';
  if (e.code === '22001') return 'Κάποιο πεδίο είναι πολύ μεγάλο.';
  return `Η αποθήκευση απέτυχε${e.code ? ` (κωδικός ${e.code})` : ''}. Δοκιμάστε ξανά.`;
}

/** What may be logged: code, constraint/column name — never the payload or PostgreSQL `details`. */
export function safeDiagnostics(op: string, e: DbError | null | undefined): Record<string, string | null> {
  const msg = e?.message ?? '';
  return {
    op,
    code: e?.code ?? null,
    column: /column "([a-z_]+)"/.exec(msg)?.[1] ?? null,
    constraint: /constraint "([a-z0-9_]+)"/.exec(msg)?.[1] ?? null,
    hint: e?.hint ? String(e.hint).slice(0, 60) : null,
  };
}
