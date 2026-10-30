/* «Κάδος» for leads and customers (staged SQL phase2/06). Every action is authorized by the database:
   trash / restore → admin, manager · permanent delete → admin, only from the trash, only without references.
   The browser only filters trashed rows out of normal lists (the database already hides them from other roles). */

import { supabase } from './supabase';
import type { Role } from './roles';

export type TrashType = 'lead' | 'customer';

export interface TrashRow {
  entity_type: TrashType; id: string; name: string | null; phone: string | null; email: string | null;
  deleted_at: string; deleted_by_name: string | null; deleted_reason: string | null; references_json: Record<string, number>;
}

export const canTrash = (role: Role | null | undefined) => role === 'admin';
export const canPurge = (role: Role | null | undefined) => role === 'admin';

/** Rows in the trash are never part of normal lists (also when the column does not exist yet). */
export const notTrashed = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter(r => !r.deleted_at);

const TABLE_TEXT: Record<string, string> = {
  cases: 'cases', consent_records: 'καταγραφές συγκατάθεσης', follow_ups: 'follow-ups', offers: 'προσφορές',
  case_documents: 'έγγραφα', customer_contacts: 'επαφές', leads: 'leads',
};

/** «cases: 2, consent_records: 1» → «2 cases, 1 καταγραφή συγκατάθεσης» */
export function describeReferences(refs: Record<string, number> | null | undefined): string {
  return Object.entries(refs ?? {}).filter(([, n]) => n > 0).map(([t, n]) => `${n} ${TABLE_TEXT[t] ?? t}`).join(', ');
}

/** Maps database refusals to clear Greek messages (pure, unit-tested). */
export function trashError(message: string | undefined, fallback: string): string {
  const m = message ?? '';
  const refs = /referenced by (\{.*\})/.exec(m);
  if (refs) {
    try { return `Δεν επιτρέπεται οριστική διαγραφή: συνδέεται με ${describeReferences(JSON.parse(refs[1]))}. Το ιστορικό του CRM διατηρείται.`; } catch { /* fall through */ }
  }
  const open = /has (\d+) open case/.exec(m);
  if (open) return `Ο πελάτης έχει ${open[1]} ανοιχτά cases. Κλείστε ή ολοκληρώστε τα πρώτα.`;
  if (/already in trash|not found/i.test(m)) return 'Η εγγραφή δεν βρέθηκε ή είναι ήδη στον κάδο.';
  if (/not in trash|move the record to the trash first/i.test(m)) return 'Η εγγραφή δεν βρίσκεται στον κάδο.';
  if (/only an administrator/i.test(m)) return 'Μόνο ο διαχειριστής μπορεί να διαγράψει οριστικά.';
  if (/not allowed|42501|permission/i.test(m)) return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.';
  if (/PREVIEW_READ_ONLY|μόνο ανάγνωση/.test(m)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση.';
  if (/Could not find the function|PGRST202|schema cache/i.test(m)) return 'Ο κάδος δεν είναι ακόμη διαθέσιμος.';
  return fallback;
}

export async function trashRecord(type: TrashType, id: string, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc('trash_record', { p_type: type, p_id: id, p_reason: reason.trim() || null });
  return error ? trashError(error.message, 'Η μεταφορά στον κάδο απέτυχε.') : null;
}

export async function restoreRecord(type: TrashType, id: string): Promise<string | null> {
  const { error } = await supabase.rpc('restore_record', { p_type: type, p_id: id });
  return error ? trashError(error.message, 'Η επαναφορά απέτυχε.') : null;
}

/** Permanent delete; then removes the lead's website attachments from Storage and reports what happened. */
export async function purgeRecord(type: TrashType, id: string): Promise<{ error: string | null; filesLeft: number }> {
  const { data, error } = await supabase.rpc('purge_record', { p_type: type, p_id: id });
  if (error) return { error: trashError(error.message, 'Η οριστική διαγραφή απέτυχε.'), filesLeft: 0 };
  const files = Array.isArray((data as { files?: unknown })?.files) ? ((data as { files: string[] }).files) : [];
  if (files.length === 0) return { error: null, filesLeft: 0 };
  const { data: removed, error: rmErr } = await supabase.storage.from('hlektrismos_docs').remove(files);
  return { error: null, filesLeft: rmErr ? files.length : Math.max(0, files.length - (removed?.length ?? 0)) };
}

export async function listTrash(): Promise<{ rows: TrashRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('trash_list');
  if (error) return { rows: [], error: trashError(error.message, 'Ο κάδος δεν φορτώθηκε.') };
  return { rows: (data ?? []) as TrashRow[], error: null };
}
