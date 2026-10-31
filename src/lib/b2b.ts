/* B2B pipeline — browser side (staged migration phase3/08 + scrape-b2b).
   Discover → Screen → Review → Distribute. Search results are prospects in a review queue, never leads and never
   permission to contact. Every write is authorized by the database / edge function. */

import { supabase } from './supabase';
import type { Role } from './roles';
import { planQueries, validateSearch, CATEGORY_QUERIES, LIMITS } from '../../supabase/functions/_shared/b2b-search';
import type { SearchParams } from '../../supabase/functions/_shared/b2b-search';

export { planQueries, validateSearch, CATEGORY_QUERIES, LIMITS };
export type { SearchParams };

export type ProspectStatus = 'new' | 'approved' | 'excluded' | 'duplicate' | 'assigned';
export interface Prospect {
  id: string; company_name: string; phone: string | null; website: string | null; domain: string | null; address: string | null;
  city: string | null; region: string | null; category: string | null; source_query: string | null; rating: number | null; reviews: number | null;
  quality: string[]; status: ProspectStatus; duplicate_of: { type: 'lead' | 'customer' | 'prospect'; id: string; reason: 'phone' | 'name' } | null;
  review_reason: string | null; reviewed_at: string | null; assigned_to: string | null; assigned_at: string | null; lead_id: string | null;
  phone_screening: 'not_checked' | 'clear' | 'opted_out'; collected_at: string;
}
export interface SearchJob {
  id: string; created_by: string | null; status: 'running' | 'done' | 'failed' | 'cancelled'; params: SearchParams;
  queries_planned: number; queries_done: number; results_found: number; results_new: number; results_duplicate: number;
  error: string | null; created_at: string; finished_at: string | null;
}
export interface SearchProfile { id: string; name: string; params: SearchParams; created_by: string | null; created_at: string }

export const canSearch = (r: Role | null | undefined) => r === 'admin' || r === 'sales_agent';
export const canReview = (r: Role | null | undefined) => r === 'admin';

export const QUALITY_TEXT: Record<string, string> = { no_phone: 'χωρίς τηλέφωνο', no_website: 'χωρίς ιστοσελίδα', no_address: 'χωρίς διεύθυνση' };
export const DUP_TEXT = (d: NonNullable<Prospect['duplicate_of']>) =>
  `Υπάρχει ήδη ως ${d.type === 'lead' ? 'lead' : d.type === 'customer' ? 'πελάτης' : 'prospect'} (${d.reason === 'phone' ? 'ίδιο τηλέφωνο' : 'ίδια επωνυμία'})`;

const friendly = (m: string | undefined, fallback: string) => {
  const s = m ?? '';
  if (/relation .*b2b_|does not exist|schema cache|PGRST20[25]|Could not find/i.test(s)) return 'Η ροή B2B δεν είναι ακόμη διαθέσιμη.';
  if (/a reason is required/i.test(s)) return 'Χρειάζεται αιτιολογία.';
  if (/choose at least one active sales agent/i.test(s)) return 'Επιλέξτε τουλάχιστον έναν ενεργό πωλητή.';
  if (/manual mode takes exactly one agent/i.test(s)) return 'Η χειροκίνητη ανάθεση γίνεται σε έναν πωλητή.';
  if (/not allowed|42501|permission/i.test(s)) return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.';
  if (/PREVIEW_READ_ONLY|μόνο ανάγνωση/.test(s)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση.';
  return fallback;
};

/** null = the pipeline tables are not available yet. */
export async function listProspects(statuses: ProspectStatus[]): Promise<{ rows: Prospect[]; error: string | null }> {
  const { data, error } = await supabase.from('b2b_prospects').select('*').in('status', statuses).order('collected_at', { ascending: false }).limit(500);
  return error ? { rows: [], error: friendly(error.message, 'Η λίστα δεν φορτώθηκε.') } : { rows: (data ?? []) as Prospect[], error: null };
}

export async function listJobs(): Promise<{ rows: SearchJob[]; error: string | null }> {
  const { data, error } = await supabase.from('b2b_search_jobs').select('*').order('created_at', { ascending: false }).limit(50);
  return error ? { rows: [], error: friendly(error.message, 'Το ιστορικό δεν φορτώθηκε.') } : { rows: (data ?? []) as SearchJob[], error: null };
}

export async function queriesToday(): Promise<number | null> {
  const { data, error } = await supabase.rpc('b2b_queries_today');
  return error ? null : Number(data ?? 0);
}

export async function listProfiles(): Promise<SearchProfile[]> {
  const { data, error } = await supabase.from('b2b_search_profiles').select('*').order('created_at', { ascending: false });
  return error ? [] : (data ?? []) as SearchProfile[];
}
export async function saveProfile(name: string, params: SearchParams, uid: string): Promise<string | null> {
  const { error } = await supabase.from('b2b_search_profiles').insert({ name: name.trim(), params, created_by: uid });
  return error ? friendly(error.message, 'Η αποθήκευση απέτυχε.') : null;
}
export async function deleteProfile(id: string): Promise<string | null> {
  const { error } = await supabase.from('b2b_search_profiles').delete().eq('id', id);
  return error ? friendly(error.message, 'Η διαγραφή απέτυχε.') : null;
}

export interface SearchOutcome { success: boolean; job_id?: string; planned?: number; ran?: number; truncated?: number; found?: number; new?: number; duplicates?: number; errors?: string[]; used_today?: number; daily_limit?: number; error?: string }

export async function runSearch(params: SearchParams): Promise<SearchOutcome> {
  const { data, error } = await supabase.functions.invoke('scrape-b2b', { body: params });
  if (!error) return data as SearchOutcome;
  let msg: string | undefined;
  try { const ctx = (error as { context?: Response }).context; if (ctx?.json) { const j = await ctx.json(); msg = j?.error; } } catch { /* ignore */ }
  return { success: false, error: msg ?? friendly(error.message, 'Η αναζήτηση απέτυχε.') };
}

export async function reviewProspects(ids: string[], action: 'approve' | 'exclude' | 'duplicate' | 'reopen', reason?: string): Promise<{ changed: number; error: string | null }> {
  const { data, error } = await supabase.rpc('b2b_review', { p_ids: ids, p_action: action, p_reason: reason?.trim() || null });
  return error ? { changed: 0, error: friendly(error.message, 'Η ενέργεια απέτυχε.') } : { changed: Number(data ?? 0), error: null };
}

export type DistributeMode = 'manual' | 'round_robin' | 'workload';
export async function distributeProspects(ids: string[], mode: DistributeMode, agents: string[]): Promise<{ assigned: { prospect: string; lead: string; agent: string }[]; error: string | null }> {
  const { data, error } = await supabase.rpc('b2b_distribute', { p_ids: ids, p_mode: mode, p_agents: agents });
  return error ? { assigned: [], error: friendly(error.message, 'Η ανάθεση απέτυχε.') } : { assigned: (data ?? []) as { prospect: string; lead: string; agent: string }[], error: null };
}
