/* «Αιτήσεις»: the energy-service applications. Sales Agent: their own drafts and submissions (row-level security shows nothing else). Admin / Back Office: the inbox.
   Sub-routes live in the URL (#/dashboard?view=applications&f.app=<id> or &f.new=1&f.lead=…&f.customer=…&f.visit=…), so a link can be shared and Back works.
   Until the staged SQL (phase7/02) is applied the page is one neutral sentence, never an error. */
import { useEffect, useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { applicationsAvailable, listApplications } from '@/lib/field-api';
import type { ApplicationFull } from '@/lib/field-api';
import { APPLICATION_STATUS_TEXT, NOT_AVAILABLE_TEXT, draftFromRow, emptyWizard, isClosedApplication } from '@/lib/applications';
import type { ApplicationStatus, WizardDraft } from '@/lib/applications';
import { USAGE_LABEL } from '@/lib/supply-points';
import { Btn, Card, EmptyState, ErrorState, Spinner, fmtDate } from '@/lib/ui';
import ApplicationWizard from './ApplicationWizard';
import ApplicationDetail, { StatusPill } from './ApplicationDetail';

const FILTERS: { id: string; label: string; match: (s: ApplicationStatus) => boolean }[] = [
  { id: 'open', label: 'Ανοιχτές', match: (s) => !isClosedApplication(s) },
  { id: 'draft', label: 'Πρόχειρα', match: (s) => s === 'draft' },
  { id: 'inbox', label: 'Προς διεκπεραίωση', match: (s) => s === 'submitted' || s === 'in_review' || s === 'processing' },
  { id: 'docs', label: 'Αναμονή εγγράφων', match: (s) => s === 'needs_documents' },
  { id: 'closed', label: 'Κλειστές', match: isClosedApplication },
  { id: 'all', label: 'Όλες', match: () => true },
];

export default function ApplicationsPage() {
  const { role } = useAuth();
  const { view, go } = useNav();
  const f = view.filters ?? {};
  const [available, setAvailable] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ApplicationFull[] | null>(null);
  const [filter, setFilter] = useState(role === 'admin' ? 'inbox' : 'open');
  const [editing, setEditing] = useState<WizardDraft | null>(null);

  const load = async () => { const ok = await applicationsAvailable(); setAvailable(ok); setRows(ok ? await listApplications() : null); };
  useEffect(() => { void load(); }, [f.app, f.new]);

  const shown = useMemo(() => (rows ?? []).filter((r) => (FILTERS.find((x) => x.id === filter) ?? FILTERS[0]).match(r.status)), [rows, filter]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((x) => [x.id, (rows ?? []).filter((r) => x.match(r.status)).length])), [rows]);

  if (available === null) return <div className="flex justify-center py-24"><Spinner /></div>;
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <div><h1 className="text-2xl font-semibold">Αιτήσεις</h1><p className="text-sm text-ink/60">Αιτήσεις ενεργειακής υπηρεσίας. Δεν είναι Leads ούτε Cases: το Case δημιουργείται με την υποβολή.</p></div>
      {available && !f.new && !f.app && !editing && <Btn onClick={() => go('applications', { new: '1' })}>Νέα αίτηση</Btn>}
    </div>
  );
  if (!available) return <div>{header}<Card><p className="text-sm text-ink/70" role="status">{NOT_AVAILABLE_TEXT}</p></Card></div>;

  if (editing) return <div>{header}<ApplicationWizard initial={editing} onClose={() => { setEditing(null); void load(); }} onDone={(id) => { setEditing(null); go('applications', { app: id }); }} /></div>;
  if (f.new) {
    const init: WizardDraft = { ...emptyWizard(), ...(f.customer ? { customerId: f.customer } : {}), ...(f.lead && !f.customer ? { leadId: f.lead } : {}) };
    return <div>{header}<ApplicationWizard initial={init} visitId={f.visit ?? null} onClose={() => go('applications')} onDone={(id) => go('applications', { app: id })} /></div>;
  }
  if (f.app) {
    return <div>{header}<ApplicationDetail id={f.app} onBack={() => go('applications')}
      onEdit={(a) => setEditing(draftFromRow(a, { customerName: a.customer?.full_name, leadName: a.lead?.full_name ?? a.lead?.client_name, supplyLabel: a.supply ? `${USAGE_LABEL[a.supply.usage]} · ${a.supply.property_address}` : null, usage: a.supply?.usage }))} /></div>;
  }

  return (
    <div>
      {header}
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Φίλτρο αιτήσεων">{FILTERS.map((x) => (
        <button key={x.id} type="button" onClick={() => setFilter(x.id)} aria-pressed={filter === x.id}
          className={`rounded-full px-3 py-1.5 text-[13px] border min-h-[36px] ${filter === x.id ? 'bg-ink text-white border-ink' : 'border-line text-ink/70'}`}>{x.label} ({counts[x.id] ?? 0})</button>))}</div>
      {rows === null ? <ErrorState onRetry={() => void load()} />
        : shown.length === 0 ? <EmptyState icon={ClipboardList} title="Δεν υπάρχουν αιτήσεις εδώ" hint={role === 'admin' ? 'Οι νέες υποβολές των πωλητών εμφανίζονται στο «Προς διεκπεραίωση».' : 'Ξεκινήστε με «Νέα αίτηση».'} />
        : (
          <ul className="space-y-2">{shown.map((a) => (
            <li key={a.id}><button type="button" onClick={() => go('applications', { app: a.id })} className="w-full text-left rounded-2xl border border-line bg-white px-4 py-3 min-h-[56px] hover:bg-ink/[0.02]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{a.customer?.full_name ?? a.lead?.full_name ?? a.lead?.client_name ?? '—'} <span className="text-ink/40 text-xs ml-1">{a.application_no}</span></span>
                <StatusPill status={a.status} /></div>
              <div className="text-xs text-ink/55 mt-0.5">{a.supply ? `${USAGE_LABEL[a.supply.usage]} · ${a.supply.property_address}` : 'Χωρίς παροχή ακόμη'} · {a.service_type_code ?? 'χωρίς υπηρεσία'} · {a.submitted_at ? `υποβλήθηκε ${fmtDate(a.submitted_at)}` : `ενημερώθηκε ${fmtDate(a.updated_at)}`}{a.status_reason && a.status === 'needs_documents' ? ` · ${APPLICATION_STATUS_TEXT[a.status]}: ${a.status_reason}` : ''}</div>
            </button></li>))}</ul>
        )}
    </div>
  );
}
