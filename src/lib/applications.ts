/* The energy-service Application (staged phase7/02) as the screens see it. PURE: no network, no storage; the wizard state machine, the status rules,
   the document checklist and the version grouping live here so they can be tested without a browser.
   An Application is NOT a Lead, a Customer or a Case. A Case is created only when a draft is submitted. The checklist is the existing indicative one
   (documents.ts) and only ever WARNS: missing documents never block a draft, a submit or any stage move. No provider, tariff or price is invented. */
import { buildChecklist, docLabel } from './documents';
import type { ChecklistItem } from './documents';
import { classifyUpload } from './upload-files';
import type { Role } from './roles';

export type ApplicationStatus = 'draft' | 'submitted' | 'in_review' | 'needs_documents' | 'processing' | 'approved' | 'rejected' | 'withdrawn' | 'completed';
export const APPLICATION_STATUS_TEXT: Record<ApplicationStatus, string> = {
  draft: 'Πρόχειρο', submitted: 'Υποβλήθηκε', in_review: 'Σε έλεγχο', needs_documents: 'Αναμονή εγγράφων', processing: 'Σε επεξεργασία',
  approved: 'Εγκρίθηκε', rejected: 'Απορρίφθηκε', withdrawn: 'Αποσύρθηκε', completed: 'Ολοκληρώθηκε',
};
export const APPLICATION_STATUSES = Object.keys(APPLICATION_STATUS_TEXT) as ApplicationStatus[];
export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';
export const STATUS_TONE: Record<ApplicationStatus, StatusTone> = {
  draft: 'neutral', submitted: 'info', in_review: 'info', needs_documents: 'warning', processing: 'info', approved: 'success', rejected: 'danger', withdrawn: 'neutral', completed: 'success',
};
export const isClosedApplication = (s: string) => s === 'rejected' || s === 'withdrawn' || s === 'completed';

/** The Back Office transitions the database allows (a mirror of the guard trigger; the database has the last word). */
const BO_NEXT: Record<ApplicationStatus, ApplicationStatus[]> = {
  draft: ['withdrawn'], submitted: ['in_review', 'needs_documents', 'rejected', 'withdrawn'], in_review: ['processing', 'needs_documents', 'rejected', 'withdrawn'],
  processing: ['approved', 'needs_documents', 'rejected', 'withdrawn'], needs_documents: ['submitted', 'in_review', 'rejected', 'withdrawn'], approved: ['completed', 'withdrawn'],
  rejected: [], withdrawn: [], completed: [],
};
export const REASON_REQUIRED: ApplicationStatus[] = ['needs_documents', 'rejected', 'withdrawn'];
export const nextStatuses = (role: Role | null | undefined, s: ApplicationStatus): ApplicationStatus[] => (role === 'admin' ? BO_NEXT[s] ?? [] : []);
/** A Sales Agent edits the content while it is a draft or waiting for documents; Back Office may correct it until it is closed. */
export const canEditContent = (role: Role | null | undefined, s: ApplicationStatus): boolean =>
  !isClosedApplication(s) && (role === 'admin' || s === 'draft' || s === 'needs_documents');
export const canWithdraw = (s: ApplicationStatus) => !isClosedApplication(s);

/* ───────── services (configurable table; this is the fallback when the table is not installed yet) ───────── */
export interface ServiceType { code: string; label: string; active: boolean }
export const DEFAULT_SERVICES: ServiceType[] = [
  { code: 'energy', label: 'Ρεύμα', active: true }, { code: 'gas', label: 'Φυσικό αέριο', active: true }, { code: 'solar', label: 'Φωτοβολταϊκά', active: true },
  { code: 'ev', label: 'Ηλεκτροκίνηση', active: true }, { code: 'insurance', label: 'Ασφάλιση', active: true }, { code: 'web', label: 'Web', active: true },
];
/** Which free fields a service shows. Provider / program / tariff are free text filled ONLY when known; «Άγνωστο» is a valid answer. */
export const SERVICE_FIELDS: Record<string, ('provider' | 'program' | 'tariff')[]> = { energy: ['provider', 'program', 'tariff'], gas: ['provider', 'program', 'tariff'] };
export const fieldsFor = (code: string | null | undefined) => SERVICE_FIELDS[code ?? ''] ?? [];

/* ───────── the five-step wizard (state is kept in one object; moving between steps never loses it) ───────── */
export const STEPS = [
  { n: 1, label: 'Πελάτης' }, { n: 2, label: 'Παροχή' }, { n: 3, label: 'Υπηρεσία' }, { n: 4, label: 'Έγγραφα' }, { n: 5, label: 'Επιβεβαίωση' },
] as const;
export interface WizardDraft {
  id: string | null;
  customerId: string | null; customerName: string | null;
  leadId: string | null; leadName: string | null;
  supplyPointId: string | null; supplyLabel: string | null; supplyUsage: 'residential' | 'commercial' | null;
  serviceType: string | null; provider: string; program: string; tariff: string; notes: string;
  step: number; dirty: boolean;
}
export const emptyWizard = (): WizardDraft => ({ id: null, customerId: null, customerName: null, leadId: null, leadName: null, supplyPointId: null, supplyLabel: null, supplyUsage: null, serviceType: null, provider: '', program: '', tariff: '', notes: '', step: 1, dirty: false });

export type WizardAction =
  | { t: 'origin'; customer?: { id: string; name: string } | null; lead?: { id: string; name: string } | null }
  | { t: 'supply'; id: string | null; label: string | null; usage: 'residential' | 'commercial' | null }
  | { t: 'service'; code: string | null }
  | { t: 'field'; field: 'provider' | 'program' | 'tariff' | 'notes'; value: string }
  | { t: 'go'; step: number }
  | { t: 'saved'; id: string }
  | { t: 'load'; draft: WizardDraft };

export function wizardReducer(s: WizardDraft, a: WizardAction): WizardDraft {
  switch (a.t) {
    case 'origin': {
      // A different customer / lead invalidates the supply point chosen for the previous one.
      const changed = (a.customer?.id ?? null) !== s.customerId || (a.lead?.id ?? null) !== s.leadId;
      return { ...s, customerId: a.customer?.id ?? null, customerName: a.customer?.name ?? null, leadId: a.lead?.id ?? null, leadName: a.lead?.name ?? null,
        ...(changed ? { supplyPointId: null, supplyLabel: null, supplyUsage: null } : {}), dirty: true };
    }
    case 'supply': return { ...s, supplyPointId: a.id, supplyLabel: a.label, supplyUsage: a.usage, dirty: true };
    case 'service': return { ...s, serviceType: a.code, ...(fieldsFor(a.code).length ? {} : { provider: '', program: '', tariff: '' }), dirty: true };
    case 'field': return { ...s, [a.field]: a.value, dirty: true };
    case 'go': return { ...s, step: Math.max(1, Math.min(5, a.step)) };
    case 'saved': return { ...s, id: a.id, dirty: false };
    case 'load': return { ...a.draft, dirty: false };
  }
}

export type StepErrors = Partial<Record<'origin' | 'supply' | 'service', string>>;
/** What a step still needs. Only 1-3 can be incomplete; documents (4) and confirmation (5) never block. */
export function stepErrors(step: number, d: WizardDraft): StepErrors {
  const e: StepErrors = {};
  if (step >= 1 && !d.customerId && !d.leadId) e.origin = 'Επιλέξτε πελάτη ή lead.';
  if (step >= 2 && !d.supplyPointId) e.supply = 'Επιλέξτε ή προσθέστε την παροχή της αίτησης.';
  if (step >= 3 && !d.serviceType) e.service = 'Επιλέξτε την υπηρεσία.';
  return e;
}
/** What stops a SUBMIT. Documents are deliberately absent: they are a warning, not a blocker. */
export const submitBlockers = (d: WizardDraft): string[] => Object.values(stepErrors(3, d));
export const canSubmit = (d: WizardDraft) => submitBlockers(d).length === 0 && !!d.id;
/** A draft can be saved as soon as it has an origin (the database requires one). */
export const canSaveDraft = (d: WizardDraft) => !!d.customerId || !!d.leadId;

/** The columns the wizard writes. Provider / program / tariff only when the service shows them and the agent filled them. */
export function draftRow(d: WizardDraft): Record<string, unknown> {
  const f = fieldsFor(d.serviceType);
  const text = (v: string, k: 'provider' | 'program' | 'tariff') => (f.includes(k) && v.trim() ? v.trim() : null);
  return {
    supply_point_id: d.supplyPointId, service_type_code: d.serviceType, wizard_step: d.step, notes: d.notes.trim(),
    provider_name: text(d.provider, 'provider'), program_name: text(d.program, 'program'), tariff_name: text(d.tariff, 'tariff'),
  };
}
export interface ApplicationRow {
  id: string; application_no: string; status: ApplicationStatus; status_reason: string | null; customer_id: string | null; lead_id: string | null; supply_point_id: string | null;
  service_type_code: string | null; provider_name: string | null; program_name: string | null; tariff_name: string | null; notes: string; wizard_step: number;
  assigned_to_user_id: string | null; primary_case_id: string | null; submitted_at: string | null; created_at: string; updated_at: string;
}
export function draftFromRow(r: ApplicationRow, names: { customerName?: string | null; leadName?: string | null; supplyLabel?: string | null; usage?: 'residential' | 'commercial' | null } = {}): WizardDraft {
  return { id: r.id, customerId: r.customer_id, customerName: names.customerName ?? null, leadId: r.lead_id, leadName: names.leadName ?? null,
    supplyPointId: r.supply_point_id, supplyLabel: names.supplyLabel ?? null, supplyUsage: names.usage ?? null, serviceType: r.service_type_code,
    provider: r.provider_name ?? '', program: r.program_name ?? '', tariff: r.tariff_name ?? '', notes: r.notes ?? '', step: r.wizard_step || 1, dirty: false };
}

/* ───────── documents: indicative checklist + versions ───────── */
export interface AppDocument {
  id: string; application_id: string; supply_point_id: string | null; doc_type: string; version: number; is_current: boolean; supersedes_id: string | null;
  superseded_at: string | null; storage_path: string; file_name: string; mime_type: string; size: number; status: 'received' | 'verified' | 'rejected'; created_at: string;
}
/** Document types are the existing ones (documents.ts keys); the usage of the supply decides the business set. */
export function checklistFor(serviceType: string | null, usage: 'residential' | 'commercial' | null, docs: Pick<AppDocument, 'doc_type' | 'status' | 'is_current'>[]): ChecklistItem[] {
  return buildChecklist({ service_type: serviceType, property_type: usage === 'commercial' ? 'Κατάστημα' : usage === 'residential' ? 'Διαμέρισμα' : null, case_type: null },
    docs.filter((d) => d.is_current).map((d) => ({ category: d.doc_type, status: d.status })));
}
export const missingDocuments = (items: ChecklistItem[]) => items.filter((i) => i.status === 'missing' || i.status === 'rejected');
export function checklistSummary(items: ChecklistItem[]): { done: number; total: number; missing: string[] } {
  const required = items.filter((i) => i.required);
  return { done: required.filter((i) => i.status === 'received' || i.status === 'verified').length, total: required.length, missing: missingDocuments(required).map((i) => i.label) };
}

export interface DocHistory { key: string; docType: string; label: string; supplyPointId: string | null; current: AppDocument | null; history: AppDocument[] }
/** One entry per (type, supply point): the current version first, then the superseded ones newest first. Documents of two supplies never share an entry. */
export function groupDocuments(docs: AppDocument[]): DocHistory[] {
  const m = new Map<string, DocHistory>();
  for (const d of docs) {
    const key = `${d.supply_point_id ?? '-'}|${d.doc_type}`;
    const e = m.get(key) ?? { key, docType: d.doc_type, label: docLabel(d.doc_type), supplyPointId: d.supply_point_id, current: null, history: [] };
    if (d.is_current) e.current = d; else e.history.push(d);
    m.set(key, e);
  }
  return [...m.values()].map((e) => ({ ...e, history: e.history.sort((a, b) => b.version - a.version) })).sort((a, b) => a.label.localeCompare(b.label, 'el'));
}
export const versionLabel = (d: Pick<AppDocument, 'version' | 'is_current' | 'superseded_at'>) => `v${d.version} · ${d.is_current ? 'τρέχουσα' : 'αντικαταστάθηκε'}`;

/** applications/<application>/<uuid>-v<n>-<safe name>: the shape the storage policy and the database CHECK require. A version never reuses a path. */
export function storagePathFor(applicationId: string, version: number, fileName: string, nonce: string): string {
  const safe = fileName.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'file';
  return `applications/${applicationId}/${nonce}-v${version}-${safe}`;
}
export interface UploadVerdict { ok: boolean; error?: string; contentType: string }
export function checkUpload(file: { name: string; type: string; size: number }): UploadVerdict {
  const c = classifyUpload(file, ['pdf', 'image']);
  return c.ok ? { ok: true, contentType: c.contentType } : { ok: false, error: c.error ?? 'Μη αποδεκτό αρχείο.', contentType: c.contentType };
}

export const submitErrorText = (message: string | null | undefined): string => {
  const m = message ?? '';
  if (/Επιλέξτε/.test(m)) return m.replace(/^.*?(Επιλέξτε[^"]*).*$/s, '$1');
  if (/only a draft/i.test(m)) return 'Η αίτηση έχει ήδη υποβληθεί.';
  if (/not yours|42501/i.test(m)) return 'Δεν έχετε δικαίωμα σε αυτή την αίτηση.';
  return 'Η υποβολή δεν ολοκληρώθηκε. Δοκιμάστε ξανά.';
};
export const NOT_AVAILABLE_TEXT = 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.';
