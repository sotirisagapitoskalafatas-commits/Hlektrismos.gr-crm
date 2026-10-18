/* Staff administration — browser side. Every call is authorized on the server:
   edits/(de)activation → SQL functions staff_update / staff_set_active (matrix public.staff_admin_can),
   create / permanent delete → edge function admin-users (Auth Admin API, same matrix).
   The matrix below is the SAME module the edge function uses; the UI uses it only to decide what to offer. */

import { supabase } from './supabase';
import { manageableRoles, canManage, isStaffRole, STAFF_ROLES } from '../../supabase/functions/_shared/staff-admin';
import type { Role } from './roles';

export { manageableRoles, canManage, isStaffRole, STAFF_ROLES };

export interface StaffMember {
  id: string; full_name: string; email: string | null; phone: string | null; role: Role; is_active: boolean;
  created_at: string | null; last_sign_in_at: string | null; can_manage: boolean;
}

/** What each role is for — shown when choosing a role. */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Πλήρης διαχείριση: χρήστες, ρόλοι, ρυθμίσεις, ενσωματώσεις, ασφάλεια και audit.',
  manager: 'Ομάδα, pipeline, φόρτος εργασίας, αναθέσεις και αναφορές. Διαχειρίζεται Inside Sales, Field Sales, Back Office.',
  inside_sales: 'Νέα leads, πρώτη επικοινωνία, κλήσεις, προσφορές και follow-ups.',
  field_sales: 'Επισκέψεις, ραντεβού, υπογραφές και follow-ups πεδίου.',
  back_office: 'Αιτήσεις, έλεγχος εγγράφων, καταχώρηση στον πάροχο, ενεργοποιήσεις.',
};

export type StaffSource = 'server' | 'fallback';

/** Directory from the server (with e-mail / last sign-in / can_manage). Falls back to the plain profiles read
 *  (read-only) when the staged SQL is not applied yet — the UI then says so instead of pretending. */
export async function listStaff(): Promise<{ rows: StaffMember[]; source: StaffSource; error: string | null }> {
  const { data, error } = await supabase.rpc('staff_list');
  if (!error && Array.isArray(data)) return { rows: data as StaffMember[], source: 'server', error: null };
  const fb = await supabase.from('profiles').select('id, full_name, role, phone, created_at, is_active').order('created_at', { ascending: true });
  if (fb.error) return { rows: [], source: 'fallback', error: 'Δεν ήταν δυνατή η φόρτωση των χρηστών.' };
  const rows = (fb.data ?? []).map(p => ({
    id: p.id, full_name: p.full_name, email: null, phone: p.phone ?? null, role: p.role as Role, is_active: p.is_active !== false,
    created_at: p.created_at ?? null, last_sign_in_at: null, can_manage: false,
  }));
  return { rows, source: 'fallback', error: null };
}

const friendly = (msg: string | undefined, fallback: string) => {
  const m = msg ?? '';
  if (/last active administrator/i.test(m)) return 'Ο τελευταίος ενεργός διαχειριστής δεν μπορεί να αλλάξει ρόλο ή να απενεργοποιηθεί.';
  if (/own role|own status/i.test(m)) return 'Δεν μπορείτε να αλλάξετε τον δικό σας ρόλο ή την κατάστασή σας.';
  if (/not allowed/i.test(m) || /permission|42501/i.test(m)) return 'Η δημιουργία και η διαχείριση λογαριασμών γίνεται μόνο από διαχειριστή.';
  if (/PREVIEW_READ_ONLY|μόνο ανάγνωση/.test(m)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση.';
  if (/Could not find the function|PGRST202/i.test(m)) return 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.';
  return fallback;
};

export async function updateStaff(id: string, input: { full_name: string; phone: string; role: Role }): Promise<string | null> {
  const { error } = await supabase.rpc('staff_update', { p_id: id, p_full_name: input.full_name, p_phone: input.phone, p_role: input.role });
  return error ? friendly(error.message, 'Η αποθήκευση απέτυχε.') : null;
}

export async function setStaffActive(id: string, active: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('staff_set_active', { p_id: id, p_active: active });
  return error ? friendly(error.message, 'Η αλλαγή κατάστασης απέτυχε.') : null;
}

export async function staffReferenceCount(id: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('staff_reference_count', { p_id: id });
  return error || typeof data !== 'number' ? null : data;
}

async function invoke(body: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (!error) return { data: (data ?? {}) as Record<string, unknown>, error: null };
  let msg: string | undefined;
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') { const j = await ctx.json(); msg = j?.error ?? j?.message; }
  } catch { /* ignore */ }
  if (!msg && /Failed to send|404|not found/i.test(error.message)) msg = 'Η function admin-users δεν έχει αναπτυχθεί ακόμη.';
  return { data: null, error: msg ?? friendly(error.message, 'Η ενέργεια απέτυχε.') };
}

export async function createStaff(input: { email: string; full_name: string; phone: string; role: Role; mode: 'invite' | 'password'; password?: string }) {
  return invoke({ action: 'create', ...input });
}

/** Sends the user a password-reset e-mail (the user chooses the new password; the administrator never sees it). Admin only, audited. */
export async function resetStaffPassword(id: string) {
  return invoke({ action: 'reset', user_id: id });
}

export async function deleteStaff(id: string) {
  return invoke({ action: 'delete', user_id: id });
}

export interface StaffAuditRow { id: string; actor_id: string | null; action: string; target_id: string | null; target_email: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; note: string | null; created_at: string }

export async function fetchStaffAudit(limit = 100): Promise<StaffAuditRow[] | null> {
  const { data, error } = await supabase.from('staff_admin_audit').select('*').order('created_at', { ascending: false }).limit(limit);
  return error ? null : (data ?? []) as StaffAuditRow[];
}

/** A strong temporary password (shown once to the administrator). */
export function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  return `${body.slice(0, 6)}-${body.slice(6, 11)}-${body.slice(11)}7`;
}
