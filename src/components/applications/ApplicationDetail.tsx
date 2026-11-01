/* One application with its whole context: customer or lead, the supply point it concerns, the service, the versioned documents, the visits that led to it and the
   Case. Sales Agent: continue a draft, add a document version, withdraw. Admin / Back Office: move it through its lifecycle (with the reasons the database requires),
   ask for missing documents (which also creates the agent's follow-up), verify the current version of a document. The database decides what is allowed. */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import {
  applicationDocumentUrl, fetchApplication, fetchApplicationDocuments, fetchFieldVisits, requestApplicationDocuments, setApplicationDocumentStatus, setApplicationStatus, uploadApplicationDocument, withdrawApplication,
} from '@/lib/field-api';
import type { ApplicationFull, FieldVisit } from '@/lib/field-api';
import {
  APPLICATION_STATUS_TEXT, REASON_REQUIRED, STATUS_TONE, canEditContent, canWithdraw, checkUpload, checklistFor, checklistSummary, isClosedApplication, nextStatuses,
} from '@/lib/applications';
import type { AppDocument, ApplicationStatus } from '@/lib/applications';
import { USAGE_LABEL } from '@/lib/supply-points';
import { visitStateText, visitSubject } from '@/lib/field-visits';
import { PUBLIC_FORM_ACCEPT } from '@/lib/upload-files';
import { useToast } from '@/lib/toast';
import { Btn, Card, CardHeader, ErrorState, Pill, Spinner, fmtDateTime } from '@/lib/ui';
import { DocumentHistory } from './ApplicationWizard';

const TONE = { neutral: 'gray', info: 'blue', warning: 'amber', success: 'green', danger: 'red' } as const;
export const StatusPill = ({ status }: { status: ApplicationStatus }) => <Pill tone={TONE[STATUS_TONE[status]]}>{APPLICATION_STATUS_TEXT[status]}</Pill>;

export default function ApplicationDetail({ id, onEdit, onBack }: { id: string; onEdit: (a: ApplicationFull) => void; onBack: () => void }) {
  const { role } = useAuth();
  const { openCase } = useNav();
  const { toast } = useToast();
  const [app, setApp] = useState<ApplicationFull | null | undefined>(undefined);
  const [docs, setDocs] = useState<AppDocument[]>([]);
  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<{ kind: 'status' | 'withdraw' | 'docs'; status?: ApplicationStatus } | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    const a = await fetchApplication(id); setApp(a);
    if (a) { setDocs(await fetchApplicationDocuments(id)); setVisits((await fetchFieldVisits({ applicationId: id })) ?? []); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (app === undefined) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!app) return <ErrorState title="Η αίτηση δεν βρέθηκε" hint="Μπορεί να μην έχετε πρόσβαση ή να μην είναι ακόμη διαθέσιμη η λειτουργία." onRetry={() => void load()} />;

  const isAdmin = role === 'admin';
  const status = app.status;
  const closed = isClosedApplication(status);
  const items = checklistFor(app.service_type_code, app.supply?.usage ?? null, docs);
  const sum = checklistSummary(items);
  const who = app.customer?.full_name ?? app.lead?.full_name ?? app.lead?.client_name ?? '—';

  const run = async (op: Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(true); const r = await op; setBusy(false);
    if (!r.ok) { toast(r.error ?? 'Η ενέργεια δεν ολοκληρώθηκε.', 'bad'); return false; }
    toast(ok, 'ok'); setAsk(null); setReason(''); await load(); return true;
  };
  const confirm = () => {
    if (!ask) return;
    if (ask.kind === 'docs') return void run(requestApplicationDocuments(app.id, reason), 'Στάλθηκε αίτημα εγγράφων. Ο πωλητής βλέπει εκκρεμότητα.');
    if (ask.kind === 'withdraw') return void run(withdrawApplication(app.id, reason), 'Η αίτηση αποσύρθηκε.');
    if (ask.status) return void run(setApplicationStatus(app.id, ask.status, reason), `Κατάσταση: ${APPLICATION_STATUS_TEXT[ask.status]}`);
  };
  const needsReason = ask?.kind === 'docs' || ask?.kind === 'withdraw' || (ask?.status ? REASON_REQUIRED.includes(ask.status) : false);
  const open = async (path: string) => { const u = await applicationDocumentUrl(path); if (u) window.open(u, '_blank', 'noopener'); else toast('Το αρχείο δεν είναι διαθέσιμο.', 'warn'); };
  const addVersion = async (docType: string, file: File | undefined, supplyId: string | null) => {
    if (!file) return;
    const v = checkUpload(file); if (!v.ok) { toast(v.error ?? 'Μη αποδεκτό αρχείο.', 'warn'); return; }
    const next = Math.max(0, ...docs.filter((x) => x.doc_type === docType && x.supply_point_id === supplyId).map((x) => x.version)) + 1;
    await run(uploadApplicationDocument(app.id, file, docType, next, supplyId).then((r) => (r.ok ? { ok: true } : { ok: false, error: r.error })), next > 1 ? `Νέα έκδοση v${next}. Η προηγούμενη διατηρείται.` : 'Το έγγραφο αποθηκεύτηκε.');
  };
  const current = docs.filter((d) => d.is_current);

  return (
    <div className="space-y-4" data-testid="application-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="text-sm underline" onClick={onBack}>← Όλες οι αιτήσεις</button>
        <div className="flex flex-wrap gap-2">
          {!closed && canEditContent(role, status) && <Btn variant="outline" onClick={() => onEdit(app)}>{status === 'draft' ? 'Συνέχεια πρόχειρου' : 'Επεξεργασία'}</Btn>}
          {app.primary_case_id && <Btn variant="outline" onClick={() => openCase(app.primary_case_id!)}>Άνοιγμα Case{app.case?.case_no ? ` ${app.case.case_no}` : ''}</Btn>}
          {!closed && canWithdraw(status) && <Btn variant="outline" onClick={() => setAsk({ kind: 'withdraw' })}>Απόσυρση</Btn>}
        </div>
      </div>

      <Card>
        <CardHeader micro={app.application_no} title={who} action={<StatusPill status={status} />} className="mb-3" />
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div><dt className="micro text-ink/40">{app.customer ? 'Πελάτης' : 'Lead'}</dt><dd>{who}{(app.customer?.phone ?? app.lead?.phone) ? ` · ${app.customer?.phone ?? app.lead?.phone}` : ''}</dd></div>
          <div><dt className="micro text-ink/40">Παροχή</dt><dd>{app.supply ? `${USAGE_LABEL[app.supply.usage]} · ${app.supply.property_address}${app.supply.supply_number ? ` · ${app.supply.supply_number}` : ''}` : '—'}</dd></div>
          <div><dt className="micro text-ink/40">Υπηρεσία</dt><dd>{app.service_type_code ?? '—'}{app.provider_name ? ` · ${app.provider_name}` : ''}{app.program_name ? ` · ${app.program_name}` : ''}{app.tariff_name ? ` · ${app.tariff_name}` : ''}</dd></div>
          <div><dt className="micro text-ink/40">Υποβλήθηκε</dt><dd>{app.submitted_at ? fmtDateTime(app.submitted_at) : 'Όχι ακόμη'}</dd></div>
        </dl>
        {app.status_reason && ['needs_documents', 'rejected', 'withdrawn'].includes(status) && <p className="mt-3 text-sm rounded-xl border border-line p-3" role="note"><strong>{APPLICATION_STATUS_TEXT[status]}:</strong> {app.status_reason}</p>}
        {status === 'draft' && <p className="mt-3 text-sm text-ink/60">Πρόχειρο: δεν έχει δημιουργηθεί Case. Θα δημιουργηθεί με την υποβολή.</p>}
      </Card>

      {isAdmin && !closed && (nextStatuses(role, status).length > 0 || ['submitted', 'in_review', 'processing'].includes(status)) && (
        <Card><CardHeader micro="Back Office" title="Διεκπεραίωση αίτησης" className="mb-3" />
          <div className="flex flex-wrap gap-2">
            {nextStatuses(role, status).filter((s) => s !== 'withdrawn' && s !== 'needs_documents').map((s) => <Btn key={s} variant={s === 'rejected' ? 'outline' : 'primary'} disabled={busy} onClick={() => (REASON_REQUIRED.includes(s) ? setAsk({ kind: 'status', status: s }) : void run(setApplicationStatus(app.id, s), `Κατάσταση: ${APPLICATION_STATUS_TEXT[s]}`))}>{APPLICATION_STATUS_TEXT[s]}</Btn>)}
            {['submitted', 'in_review', 'processing'].includes(status) && <Btn variant="outline" disabled={busy} onClick={() => setAsk({ kind: 'docs' })}>Ζητήστε έγγραφα</Btn>}
          </div>
        </Card>
      )}

      {ask && (
        <Card><div role="group" aria-label="Επιβεβαίωση ενέργειας" className="space-y-2">
          <p className="text-sm font-medium">{ask.kind === 'docs' ? 'Ποια έγγραφα λείπουν;' : ask.kind === 'withdraw' ? 'Γιατί αποσύρεται η αίτηση;' : `Λόγος για «${APPLICATION_STATUS_TEXT[ask.status!]}»`}</p>
          <textarea className="field min-h-[72px]" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Λόγος" />
          <div className="flex gap-2"><Btn disabled={busy || (needsReason && reason.trim().length < 3)} onClick={confirm}>Επιβεβαίωση</Btn><Btn variant="outline" onClick={() => { setAsk(null); setReason(''); }}>Άκυρο</Btn></div>
        </div></Card>
      )}

      <Card>
        <CardHeader micro="Έγγραφα" title={`${sum.done}/${sum.total} απαιτούμενα`} className="mb-3" />
        {sum.missing.length > 0 && <p className="text-sm text-warn-600 mb-2" role="note">Λείπουν: {sum.missing.join(', ')}. Η λίστα είναι ενδεικτική· τα ακριβή δικαιολογητικά διαφέρουν ανά πάροχο.</p>}
        <DocumentHistory docs={docs} onOpen={(p) => void open(p)} />
        {!closed && (
          <div className="mt-3 flex flex-wrap gap-2">{current.map((d) => (
            <label key={d.id} className="cursor-pointer text-[13px] underline">Νέα έκδοση: {d.file_name || d.doc_type}
              <input type="file" className="sr-only" accept={PUBLIC_FORM_ACCEPT} disabled={busy} onChange={(e) => { void addVersion(d.doc_type, e.target.files?.[0], d.supply_point_id); e.target.value = ''; }} /></label>))}</div>
        )}
        {isAdmin && current.length > 0 && (
          <div className="mt-3 text-sm"><span className="micro text-ink/40 block mb-1">Έλεγχος τρέχουσας έκδοσης</span>
            <ul className="space-y-1">{current.map((d) => <li key={d.id} className="flex items-center gap-2"><span>{d.file_name || d.doc_type}</span><Pill tone={d.status === 'verified' ? 'green' : d.status === 'rejected' ? 'red' : 'gray'}>{{ received: 'Παραλήφθηκε', verified: 'Ελέγχθηκε', rejected: 'Απορρίφθηκε' }[d.status]}</Pill>
              {d.status !== 'verified' && <Btn variant="outline" disabled={busy} onClick={() => void run(setApplicationDocumentStatus(d.id, 'verified'), 'Το έγγραφο ελέγχθηκε.')}>Έλεγχος ✓</Btn>}
              {d.status !== 'rejected' && <Btn variant="outline" disabled={busy} onClick={() => void run(setApplicationDocumentStatus(d.id, 'rejected'), 'Το έγγραφο απορρίφθηκε.')}>Απόρριψη</Btn>}</li>)}</ul></div>
        )}
      </Card>

      {visits.length > 0 && (
        <Card><CardHeader micro="Επισκέψεις" title="Οι επισκέψεις που οδήγησαν εδώ" className="mb-3" />
          <ul className="space-y-1 text-sm">{visits.map((v) => <li key={v.id}>{visitSubject(v, { customerName: v.customer?.full_name, leadName: v.lead?.full_name ?? v.lead?.client_name }).label} · {v.scheduled_at ? fmtDateTime(v.scheduled_at) : '—'} · {visitStateText(v)}</li>)}</ul></Card>
      )}
    </div>
  );
}
