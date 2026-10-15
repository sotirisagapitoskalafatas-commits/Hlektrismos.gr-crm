/* Lead + documents (phase 2, item A). Files are uploaded AFTER the lead exists, under leads/<id>/ in the private
   bucket; a failed file never removes the lead. When documents are attached the lead is routed to the default
   Back Office assignee (a setting that points to a user — staged phase4/12). */

import { supabase } from './supabase';
import { uploadDocument } from './storage';
import type { UploadedFile } from './storage';
import { prepareForUpload } from './upload-files';
import { leadFiles } from './lead-files';
import type { Lead } from './api';

export interface Assignee { id: string; full_name: string }

const missingFn = (m: string) => /Could not find the function|PGRST202|schema cache/i.test(m);

/** undefined = the setting is not available yet (migration not applied); null = not set. */
export async function fetchDefaultBackofficeAssignee(): Promise<Assignee | null | undefined> {
  const { data, error } = await supabase.rpc('default_backoffice_assignee');
  if (error) return missingFn(error.message) ? undefined : null;
  return (data ?? null) as Assignee | null;
}

export async function setDefaultBackofficeAssignee(userId: string | null): Promise<string | null> {
  const { error } = await supabase.rpc('set_default_backoffice_assignee', { p_user: userId });
  if (!error) return null;
  if (missingFn(error.message)) return 'Η ρύθμιση ενεργοποιείται μετά την εφαρμογή της migration phase4/12.';
  if (/not allowed|42501/i.test(error.message)) return 'Μόνο ο διαχειριστής αλλάζει αυτή τη ρύθμιση.';
  if (/active Back Office/i.test(error.message)) return 'Επιλέξτε ενεργό χρήστη Back Office.';
  return 'Η αποθήκευση απέτυχε.';
}

/** Assign the lead to the default Back Office assignee. assignee null = none set; error = could not route. */
export async function routeLeadToBackoffice(leadId: string): Promise<{ assignee: Assignee | null; error: string | null }> {
  const { data, error } = await supabase.rpc('route_lead_to_backoffice', { p_lead: leadId });
  if (error) return { assignee: null, error: missingFn(error.message) ? 'Η ανάθεση στο Back Office ενεργοποιείται μετά την εφαρμογή της migration phase4/12.' : 'Η ανάθεση στο Back Office απέτυχε.' };
  return { assignee: (data ?? null) as Assignee | null, error: null };
}

/** Upload files for an existing lead and append them to leads.attached_files. Returns what was saved and what failed. */
export async function attachLeadFiles(lead: Pick<Lead, 'id' | 'attached_files'>, files: File[]): Promise<{ saved: UploadedFile[]; failed: string[] }> {
  const saved: UploadedFile[] = [];
  const failed: string[] = [];
  for (const f of files) {
    try {
      const ready = await prepareForUpload(f);
      const { data, error } = await uploadDocument(ready, lead.id);
      if (data) saved.push(data); else failed.push(`«${f.name}»${error ? ` (${error})` : ''}`);
    } catch { failed.push(`«${f.name}»`); }
  }
  if (saved.length) {
    const all = [...leadFiles(lead.attached_files), ...saved];
    const { error } = await supabase.from('leads').update({ attached_files: all }).eq('id', lead.id);
    if (error) return { saved: [], failed: [...failed, ...saved.map(s => `«${s.name}» (δεν συνδέθηκε με το lead)`)] };
  }
  return { saved, failed };
}

/** Back Office queue: new leads with documents assigned to this user (or to anyone, for admin/manager). */
export async function fetchBackofficeLeads(userId: string | null): Promise<Lead[]> {
  let q = supabase.from('leads').select('*, assigned_to:assigned_to_user_id(full_name), created_by:created_by_user_id(full_name)')
    .eq('status', 'new').not('attached_files', 'is', null).order('created_at', { ascending: false }).limit(50);
  if (userId) q = q.eq('assigned_to_user_id', userId);
  const { data, error } = await q;
  if (error) return [];
  return ((data ?? []) as Lead[]).filter(l => !l.deleted_at && leadFiles(l.attached_files).length > 0);
}
