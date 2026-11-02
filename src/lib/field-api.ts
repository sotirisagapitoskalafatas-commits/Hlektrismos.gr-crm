/* Field Visits (standalone) and Energy Applications: the network side. Every read or write of something staged SQL adds (phase7/01, phase7/02) is behind an
   availability probe, so merging this code changes nothing until the owner applies the SQL: My Day, the Map and the customer pages keep their exact behaviour.
   Row-level security, the guard triggers and the storage policies decide what a caller may do; nothing here is a security boundary. No secret, no service key. */
import { supabase } from './supabase';
import { followUpRow, visitInsertRow } from './field-visits';
import type { FollowUpInput, ScheduleInput, VisitLinks } from './field-visits';
import { DEFAULT_SERVICES, draftRow, storagePathFor } from './applications';
import type { AppDocument, ApplicationRow, ApplicationStatus, ServiceType, WizardDraft } from './applications';

const MISSING_CODES = new Set(['42703', '42P01', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);
type Err = { code?: string | null; message?: string | null } | null | undefined;
/** The staged SQL is simply not applied yet (unknown column, relation or function): the feature is «not available», never an error toast. */
export const notInstalled = (e: Err): boolean => !!e && (MISSING_CODES.has(e.code ?? '') || /does not exist|schema cache|Could not find the/i.test(e.message ?? ''));

const probes = new Map<string, { at: number; ok: boolean }>();
async function probe(key: string, run: () => PromiseLike<{ error: Err }>): Promise<boolean> {
  if (!supabase) return false;
  const seen = probes.get(key);
  if (seen && (seen.ok || Date.now() - seen.at < 120_000)) return seen.ok;     // «yes» for the session, «no» for two minutes (so it appears soon after the SQL is applied)
  let ok = true;
  try { const { error } = await run(); ok = !notInstalled(error); } catch { ok = false; }
  probes.set(key, { at: Date.now(), ok });
  return ok;
}
export const resetProbes = () => probes.clear();
/** phase7/01 applied: visits can exist without a Case. */
export const visitsExtendedAvailable = () => probe('visits', () => supabase!.from('case_visits').select('lead_id, prospect, status_reason').limit(0));
/** phase7/02 applied: the Application entity exists. */
export const applicationsAvailable = () => probe('applications', () => supabase!.from('energy_applications').select('id').limit(0));

/** A readable Greek message for a database refusal (the guards raise plain English; the screen never shows the raw text). */
export function fieldErrorText(e: Err): string {
  const m = e?.message ?? '';
  if (notInstalled(e)) return 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.';
  if (/not yours|not your|42501|permission denied|row-level security/i.test(`${e?.code ?? ''} ${m}`)) return 'Δεν έχετε δικαίωμα σε αυτή την εγγραφή.';
  if (/reason is required|a reason/i.test(m)) return 'Γράψτε τον λόγο.';
  if (/cannot be re-pointed/i.test(m)) return 'Η σύνδεση της επίσκεψης δεν αλλάζει.';
  if (/not allowed|is closed|only a/i.test(m)) return 'Η ενέργεια δεν επιτρέπεται σε αυτή την κατάσταση.';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(m)) return 'Δεν υπάρχει σύνδεση με τον server. Δοκιμάστε ξανά.';
  return 'Η ενέργεια δεν ολοκληρώθηκε. Δοκιμάστε ξανά.';
}
const fail = (e: Err) => ({ ok: false as const, error: fieldErrorText(e) });
const NOT_AVAILABLE = { ok: false as const, error: 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.' };

/* ───────────────────────── visits ───────────────────────── */
export interface FieldVisit extends VisitLinks {
  id: string; user_id: string | null; purpose: string; status: 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  scheduled_at: string | null; started_at: string | null; ended_at: string | null; result: string; notes: string; status_reason?: string | null;
  outcome_key?: string | null; outcome_reason?: string | null; rescheduled_from_id?: string | null; created_at: string;
  location: { label?: string; lat?: number; lng?: number } | null;
  lead?: { id: string; full_name: string | null; client_name: string | null; phone: string | null } | null;
  customer?: { id: string; full_name: string; phone: string | null } | null;
}
const VISIT_SELECT = '*, lead:leads(id, full_name, client_name, phone), customer:customers(id, full_name, phone)';

/** Visits for the signed-in agent (or all, for Back Office). Null = the extended columns are not installed: the caller uses its existing loader. */
export async function fetchFieldVisits(opts: { userId?: string; customerId?: string; leadId?: string; applicationId?: string } = {}): Promise<FieldVisit[] | null> {
  if (!supabase || !(await visitsExtendedAvailable())) return null;
  let q = supabase.from('case_visits').select(VISIT_SELECT).order('scheduled_at', { ascending: false, nullsFirst: false });
  if (opts.userId) q = q.eq('user_id', opts.userId);
  if (opts.customerId) q = q.eq('customer_id', opts.customerId);
  if (opts.leadId) q = q.eq('lead_id', opts.leadId);
  if (opts.applicationId) q = q.eq('application_id', opts.applicationId);
  const { data, error } = await q;
  if (error) return null;
  return (data ?? []) as unknown as FieldVisit[];
}

export interface FieldVisitAssignee {
  id: string;
  full_name: string;
  is_active: boolean;
}

/** Admin-only directory for the shared office login. staff_list enforces the same permission on the database. */
export async function fetchFieldVisitAssignees(): Promise<FieldVisitAssignee[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('staff_list');
  if (error) return [];
  return ((data ?? []) as Array<{ id: string; full_name: string | null; role: string; is_active: boolean }>)
    .filter((row) => row.role === 'sales_agent')
    .map((row) => ({ id: row.id, full_name: row.full_name?.trim() || 'Sales Agent', is_active: row.is_active }));
}

/** Only the Admin SQL operation can change the assigned Sales Agent; the database validates the target and audits the change. */
export async function assignFieldVisit(visitId: string, agentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { data, error } = await supabase.rpc('assign_field_visit', { p_visit: visitId, p_agent: agentId });
  if (error) return fail(error);
  return data === true ? { ok: true } : { ok: false, error: 'Η επίσκεψη δεν βρέθηκε ή δεν μπορεί πλέον να ανατεθεί.' };
}

export async function createFieldVisit(input: ScheduleInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!supabase || !(await visitsExtendedAvailable())) return NOT_AVAILABLE;
  const { data, error } = await supabase.from('case_visits').insert(visitInsertRow(input)).select('id').single();
  return error || !data ? fail(error) : { ok: true, id: (data as { id: string }).id };
}
export async function rescheduleFieldVisit(id: string, newAt: string, reason: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { data, error } = await supabase.rpc('reschedule_field_visit', { p_visit: id, p_new_at: new Date(newAt).toISOString(), p_reason: reason.trim() });
  return error || !data ? fail(error) : { ok: true, id: String(data) };
}
export async function cancelFieldVisit(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { data, error } = await supabase.rpc('cancel_field_visit', { p_visit: id, p_reason: reason.trim() });
  return error ? fail(error) : data ? { ok: true } : { ok: false, error: 'Η επίσκεψη δεν μπορεί να ακυρωθεί σε αυτή την κατάσταση.' };
}
export async function markVisitNoShow(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { data, error } = await supabase.rpc('mark_visit_no_show', { p_visit: id, p_reason: reason.trim() });
  return error ? fail(error) : data ? { ok: true } : { ok: false, error: 'Η επίσκεψη δεν μπορεί να σημειωθεί ως «δεν εμφανίστηκε».' };
}
/** The recorded outcome of a visit (structured, next to the existing free-text result). */
export async function saveVisitOutcome(id: string, outcomeKey: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase || !(await visitsExtendedAvailable())) return { ok: true };       // the existing check-out note already carries the outcome text
  const { error } = await supabase.from('case_visits').update({ outcome_key: outcomeKey, outcome_reason: reason?.trim() || null }).eq('id', id);
  return error ? fail(error) : { ok: true };
}
/** Links a prospect visit to the Lead the agent just created (null -> owned is the only change the guard allows). */
export async function linkVisitToLead(visitId: string, leadId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { error } = await supabase.from('case_visits').update({ lead_id: leadId }).eq('id', visitId);
  return error ? fail(error) : { ok: true };
}
/** A visit that led to an application points at it (the guard checks the agent owns both). Best effort: the application is valid without the link. */
export async function linkVisitToApplication(visitId: string, applicationId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { error } = await supabase.from('case_visits').update({ application_id: applicationId }).eq('id', visitId);
  return error ? fail(error) : { ok: true };
}
export async function createVisitFollowUp(visit: VisitLinks & { id: string }, input: FollowUpInput, kind?: 'manager'): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { error } = await supabase.from('follow_ups').insert(followUpRow(visit, input, kind));
  return error ? fail(error) : { ok: true };
}

export interface ProspectMatch { kind: 'lead' | 'customer' | 'supply_point'; id: string; label: string | null; detail: string | null; owned_by_other: boolean }
/** Duplicate signal. For records of another agent only kind + id + owned_by_other come back: no name, no phone. Never a block and never a merge. */
export async function prospectMatches(name: string, phone?: string, address?: string): Promise<ProspectMatch[] | null> {
  if (!supabase || !(await visitsExtendedAvailable())) return null;
  const { data, error } = await supabase.rpc('field_prospect_matches', { p_name: name, p_phone: phone || null, p_address: address || null });
  return error ? null : ((data ?? []) as ProspectMatch[]);
}
export async function requestLeadOwnership(leadId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { error } = await supabase.rpc('request_lead_ownership', { p_lead: leadId, p_reason: reason.trim() });
  return error ? fail(error) : { ok: true };
}
export interface OwnershipRequest { id: string; entity_id: string; requested_by: string; reason: string; status: 'pending' | 'approved' | 'rejected'; created_at: string }
export async function fetchOwnershipRequests(): Promise<OwnershipRequest[]> {
  if (!supabase || !(await visitsExtendedAvailable())) return [];
  const { data, error } = await supabase.from('ownership_requests').select('id, entity_id, requested_by, reason, status, created_at').eq('status', 'pending').order('created_at');
  return error ? [] : ((data ?? []) as OwnershipRequest[]);
}
export async function decideOwnershipRequest(id: string, approve: boolean, note?: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { data, error } = await supabase.rpc('decide_ownership_request', { p_id: id, p_approve: approve, p_note: note?.trim() || null });
  return error ? fail(error) : data ? { ok: true } : { ok: false, error: 'Το αίτημα έχει ήδη αποφασιστεί.' };
}

/* ───────────────────────── applications ───────────────────────── */
export const APPLICATION_SELECT = '*, customer:customers(id, full_name, phone), lead:leads(id, full_name, client_name, phone), supply:customer_supply_points(id, usage, property_address, supply_number), case:cases!energy_applications_primary_case_id_fkey(id, case_no, current_stage)';
export interface ApplicationFull extends ApplicationRow {
  customer?: { id: string; full_name: string; phone: string | null } | null;
  lead?: { id: string; full_name: string | null; client_name: string | null; phone: string | null } | null;
  supply?: { id: string; usage: 'residential' | 'commercial'; property_address: string; supply_number: string | null } | null;
  case?: { id: string; case_no: string | null; current_stage: string } | null;
}

export async function fetchServiceTypes(): Promise<ServiceType[]> {
  if (!supabase || !(await applicationsAvailable())) return DEFAULT_SERVICES;
  const { data, error } = await supabase.from('application_service_types').select('code, label, active').order('sort');
  return error || !data?.length ? DEFAULT_SERVICES : (data as ServiceType[]).filter((s) => s.active);
}
export async function listApplications(opts: { customerId?: string; leadId?: string; status?: ApplicationStatus[]; limit?: number } = {}): Promise<ApplicationFull[] | null> {
  if (!supabase || !(await applicationsAvailable())) return null;
  let q = supabase.from('energy_applications').select(APPLICATION_SELECT).order('updated_at', { ascending: false }).limit(opts.limit ?? 200);
  if (opts.customerId) q = q.eq('customer_id', opts.customerId);
  if (opts.leadId) q = q.eq('lead_id', opts.leadId);
  if (opts.status?.length) q = q.in('status', opts.status);
  const { data, error } = await q;
  return error ? null : ((data ?? []) as unknown as ApplicationFull[]);
}
export async function fetchApplication(id: string): Promise<ApplicationFull | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('energy_applications').select(APPLICATION_SELECT).eq('id', id).maybeSingle();
  return error ? null : ((data ?? null) as unknown as ApplicationFull | null);
}
/** Creates the draft the first time, updates it afterwards. A draft needs an origin (customer or lead) and nothing else. */
export async function saveApplicationDraft(d: WizardDraft): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!supabase || !(await applicationsAvailable())) return NOT_AVAILABLE;
  if (!d.id) {
    const { data, error } = await supabase.from('energy_applications').insert({ customer_id: d.customerId, lead_id: d.customerId ? null : d.leadId, ...draftRow(d) }).select('id').single();
    return error || !data ? fail(error) : { ok: true, id: (data as { id: string }).id };
  }
  const { error } = await supabase.from('energy_applications').update(draftRow(d)).eq('id', d.id);
  return error ? fail(error) : { ok: true, id: d.id };
}
export async function submitApplication(id: string): Promise<{ ok: true; caseId: string | null; applicationNo: string } | { ok: false; error: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { data, error } = await supabase.rpc('submit_energy_application', { p_id: id });
  if (error) return { ok: false, error: /Επιλέξτε/.test(error.message ?? '') ? (error.message ?? '').replace(/^.*?(Επιλέξτε[^"]*).*$/s, '$1') : fieldErrorText(error) };
  const r = (data ?? {}) as { case_id?: string; application_no?: string };
  return { ok: true, caseId: r.case_id ?? null, applicationNo: r.application_no ?? '' };
}
export async function withdrawApplication(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { data, error } = await supabase.rpc('withdraw_energy_application', { p_id: id, p_reason: reason.trim() });
  return error ? fail(error) : data ? { ok: true } : { ok: false, error: 'Η αίτηση είναι ήδη κλειστή.' };
}
/** Back Office moves the application through its lifecycle; the guard trigger checks the transition and the reason. */
export async function setApplicationStatus(id: string, status: ApplicationStatus, reason?: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { error } = await supabase.from('energy_applications').update({ status, status_reason: reason?.trim() || null }).eq('id', id);
  return error ? fail(error) : { ok: true };
}
export async function requestApplicationDocuments(id: string, note: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { data, error } = await supabase.rpc('request_application_documents', { p_id: id, p_note: note.trim() });
  return error ? fail(error) : data ? { ok: true } : { ok: false, error: 'Η αίτηση δεν είναι σε κατάσταση που επιτρέπει αίτημα εγγράφων.' };
}

export async function fetchApplicationDocuments(applicationId: string): Promise<AppDocument[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('application_documents').select('*').eq('application_id', applicationId).order('created_at', { ascending: false });
  return error ? [] : ((data ?? []) as AppDocument[]);
}
/** Uploads the file to the PRIVATE bucket under applications/<application>/…, then registers the new version. The previous file is never touched or overwritten. */
export async function uploadApplicationDocument(applicationId: string, file: File, docType: string, nextVersion: number, supplyPointId?: string | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const path = storagePathFor(applicationId, nextVersion, file.name, crypto.randomUUID());
  const up = await supabase.storage.from('client_documents').upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (up.error) return { ok: false, error: 'Το αρχείο δεν ανέβηκε. Δοκιμάστε ξανά.' };
  const { data, error } = await supabase.rpc('add_application_document', {
    p_application: applicationId, p_doc_type: docType, p_storage_path: path, p_file_name: file.name, p_mime: file.type || '', p_size: file.size, p_supply: supplyPointId ?? null,
  });
  return error || !data ? fail(error) : { ok: true, id: String(data) };
}
export async function applicationDocumentUrl(path: string): Promise<string | null> {
  if (!supabase || !path) return null;
  const { data } = await supabase.storage.from('client_documents').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
export async function setApplicationDocumentStatus(id: string, status: 'received' | 'verified' | 'rejected'): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return NOT_AVAILABLE;
  const { error } = await supabase.rpc('set_application_document_status', { p_id: id, p_status: status, p_note: null });
  return error ? fail(error) : { ok: true };
}
