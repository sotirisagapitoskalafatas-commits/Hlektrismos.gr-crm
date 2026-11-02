/* Shared Trash helpers for leads, customers and cases. Mutations are authorized by database RPCs. */
import { supabase } from './supabase';
import type { Role } from './roles';

export type TrashType = 'lead' | 'customer' | 'case';

export interface TrashRow {
  entity_type: TrashType;
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  deleted_at: string;
  deleted_by_name: string | null;
  deleted_reason: string | null;
  references_json: Record<string, number>;
}

export const canTrash = (role: Role | null | undefined) => role === 'admin';
export const canPurge = (role: Role | null | undefined) => role === 'admin';

/** Rows in the trash are not included in normal lists. */
export const notTrashed = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter(r => !r.deleted_at);

const TABLE_TEXT: Record<string, string> = {
  cases: 'cases',
  consent_records: 'καταγραφές συγκατάθεσης',
  follow_ups: 'follow-ups',
  offers: 'προσφορές',
  case_documents: 'έγγραφα',
  customer_contacts: 'επαφές',
  leads: 'leads',
  converted_leads: 'leads που έχουν μετατραπεί',
  energy_applications: 'αιτήσεις παρόχου',
  rescheduled_visits: 'επαναπρογραμματισμένες επισκέψεις',
  other_case_signatures: 'υπογραφές άλλων cases',
};

export function describeReferences(refs: Record<string, number> | null | undefined): string {
  return Object.entries(refs ?? {}).filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${TABLE_TEXT[t] ?? t}`).join(', ');
}

/** Maps database refusals to clear Greek messages. */
export function trashError(message: string | undefined, fallback: string): string {
  const m = message ?? '';
  const refs = /referenced by (\{.*\})/.exec(m);
  if (refs) {
    try { return `Δεν επιτρέπεται οριστική διαγραφή: συνδέεται με ${describeReferences(JSON.parse(refs[1]))}. Τα συνδεδεμένα δεδομένα διατηρούνται.`; }
    catch { /* fall through */ }
  }
  const open = /has (\d+) open case/.exec(m);
  if (open) return `Ο πελάτης έχει ${open[1]} ανοιχτά cases. Κλείστε ή ολοκληρώστε τα πρώτα.`;
  if (/already in trash|not found/i.test(m)) return 'Η εγγραφή δεν βρέθηκε ή είναι ήδη στον κάδο.';
  if (/not in trash|move the record to the trash first/i.test(m)) return 'Η εγγραφή δεν βρίσκεται στον κάδο.';
  if (/only an administrator/i.test(m)) return 'Μόνο ο διαχειριστής μπορεί να εκτελέσει αυτή την ενέργεια.';
  if (/not allowed|42501|permission/i.test(m)) return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.';
  if (/PREVIEW_READ_ONLY|μόνο ανάγνωση/.test(m)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση.';
  if (/Could not find the function|PGRST202|schema cache/i.test(m)) return 'Ο κάδος δεν είναι ακόμη διαθέσιμος.';
  return fallback;
}

export async function trashRecord(type: TrashType, id: string, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc('trash_record', { p_type: type, p_id: id, p_reason: reason.trim() || null });
  return error ? trashError(error.message, 'Η μεταφορά στον κάδο απέτυχε.') : null;
}

/** All selected cases are trashed atomically by one database function. */
export async function trashCases(ids: string[], reason: string): Promise<{ count: number | null; error: string | null }> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { count: 0, error: null };
  if (unique.length > 250) return { count: null, error: 'Μπορείτε να επιλέξετε έως 250 cases κάθε φορά.' };
  const { data, error } = await supabase.rpc('trash_cases_bulk', {
    p_case_ids: unique,
    p_reason: reason.trim() || null,
  });
  if (error) return { count: null, error: trashError(error.message, 'Η μαζική μεταφορά στον κάδο απέτυχε.') };
  return { count: Number(data ?? unique.length), error: null };
}

export async function restoreRecord(type: TrashType, id: string): Promise<string | null> {
  const { error } = await supabase.rpc('restore_record', { p_type: type, p_id: id });
  return error ? trashError(error.message, 'Η επαναφορά απέτυχε.') : null;
}

/** Permanently delete a trashed item, then remove only the exact storage objects returned by the database. */
export async function purgeRecord(type: TrashType, id: string): Promise<{ error: string | null; filesLeft: number }> {
  const { data, error } = await supabase.rpc('purge_record', { p_type: type, p_id: id });
  if (error) return { error: trashError(error.message, 'Η οριστική διαγραφή απέτυχε.'), filesLeft: 0 };

  const rawFiles = (data as { files?: unknown } | null)?.files;
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) return { error: null, filesLeft: 0 };

  const groups = new Map<string, string[]>();
  for (const raw of rawFiles) {
    // Older lead purge returns paths only; those files always belong to hlektrismos_docs.
    const file = typeof raw === 'string'
      ? { bucket: 'hlektrismos_docs', path: raw }
      : raw && typeof raw === 'object'
        ? raw as { bucket?: unknown; path?: unknown }
        : null;
    if (!file || typeof file.bucket !== 'string' || typeof file.path !== 'string') continue;
    if (!['hlektrismos_docs', 'client_documents'].includes(file.bucket) || !file.path) continue;
    const paths = groups.get(file.bucket) ?? [];
    paths.push(file.path);
    groups.set(file.bucket, paths);
  }

  let filesLeft = 0;
  for (const [bucket, paths] of groups) {
    const { data: removed, error: rmErr } = await supabase.storage.from(bucket).remove([...new Set(paths)]);
    filesLeft += rmErr ? paths.length : Math.max(0, paths.length - (removed?.length ?? 0));
  }
  return { error: null, filesLeft };
}

export async function listTrash(): Promise<{ rows: TrashRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('trash_list');
  if (error) return { rows: [], error: trashError(error.message, 'Ο κάδος δεν φορτώθηκε.') };
  return { rows: (data ?? []) as TrashRow[], error: null };
}
