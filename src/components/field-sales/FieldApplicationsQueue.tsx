/* «Αιτήσεις & επισκέψεις» in Διεκπεραίωση: what Admin / Back Office has to look at that is not (yet) a stage of a Case: applications awaiting review or documents,
   requests by agents to take over another agent's lead, and the team's visits that need attention (overdue, no-show). The Case queue above is unchanged.
   The shared office login can not identify the individual employee: decisions are recorded as the shared account and the screen never claims otherwise.
   Renders nothing until the staged SQL (phase7) is applied. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNav } from '@/lib/nav';
import { applicationsAvailable, decideOwnershipRequest, fetchFieldVisits, fetchOwnershipRequests, listApplications, visitsExtendedAvailable } from '@/lib/field-api';
import type { ApplicationFull, FieldVisit, OwnershipRequest } from '@/lib/field-api';
import { visitStateText, visitSubject } from '@/lib/field-visits';
import { useStaff } from '@/lib/useStaff';
import { useToast } from '@/lib/toast';
import { Btn, Pill, fmtDate, fmtDateTime } from '@/lib/ui';
import { StatusPill } from '@/components/applications/ApplicationDetail';

export default function FieldApplicationsQueue() {
  const { go } = useNav();
  const { toast } = useToast();
  const staff = useStaff();
  const [apps, setApps] = useState<ApplicationFull[] | null>(null);
  const [visits, setVisits] = useState<FieldVisit[] | null>(null);
  const [requests, setRequests] = useState<OwnershipRequest[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, v] = await Promise.all([applicationsAvailable(), visitsExtendedAvailable()]);
    setApps(a ? await listApplications({ status: ['submitted', 'in_review', 'needs_documents', 'processing'] }) : null);
    setVisits(v ? await fetchFieldVisits() : null);
    setRequests(v ? await fetchOwnershipRequests() : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const agent = (id: string | null) => staff.find((s) => s.id === id)?.full_name ?? '—';
  const attention = useMemo(() => {
    const t = Date.now(); const startOfToday = new Date(t); startOfToday.setHours(0, 0, 0, 0);
    return (visits ?? []).filter((v) => (v.status === 'planned' && v.scheduled_at && new Date(v.scheduled_at).getTime() < startOfToday.getTime())
      || (v.status === 'no_show' && Date.now() - new Date(v.created_at).getTime() < 14 * 24 * 3600_000)).slice(0, 20);
  }, [visits]);

  const decide = async (r: OwnershipRequest, approve: boolean) => {
    setBusy(r.id); const res = await decideOwnershipRequest(r.id, approve, note[r.id]); setBusy(null);
    if (!res.ok) { toast(res.error ?? 'Η απόφαση δεν αποθηκεύτηκε.', 'bad'); return; }
    toast(approve ? 'Εγκρίθηκε: το lead ανατέθηκε στον πωλητή.' : 'Απορρίφθηκε.', 'ok'); void load();
  };

  if (apps === null && visits === null) return null;
  const waiting = (apps ?? []).filter((a) => a.status === 'needs_documents');
  const inbox = (apps ?? []).filter((a) => a.status !== 'needs_documents');
  return (
    <section className="atx-panel mt-5" style={{ padding: 14 }} aria-label="Αιτήσεις και επισκέψεις" data-testid="field-queue">
      <h2 className="text-base font-semibold">Αιτήσεις & επισκέψεις</h2>
      <p className="text-xs text-ink/55 mb-3">Ό,τι δεν είναι ακόμη στάδιο Case: νέες αιτήσεις, εκκρεμή έγγραφα, αιτήματα ανάθεσης και επισκέψεις που θέλουν προσοχή.</p>

      {apps !== null && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold mb-1">Αιτήσεις προς διεκπεραίωση ({inbox.length})</h3>
          {inbox.length === 0 ? <p className="text-sm text-ink/60">Καμία νέα αίτηση.</p> : (
            <ul className="space-y-1.5">{inbox.map((a) => (
              <li key={a.id}><button type="button" className="w-full text-left rounded-xl border border-line px-3 py-2 min-h-[44px] flex flex-wrap items-center justify-between gap-2" onClick={() => go('applications', { app: a.id })}>
                <span><strong>{a.customer?.full_name ?? a.lead?.full_name ?? a.lead?.client_name ?? '—'}</strong> <span className="text-xs text-ink/50">{a.application_no} · {agent(a.assigned_to_user_id)}{a.submitted_at ? ` · ${fmtDate(a.submitted_at)}` : ''}</span></span>
                <StatusPill status={a.status} /></button></li>))}</ul>
          )}
          {waiting.length > 0 && (
            <div className="mt-3"><h3 className="text-sm font-semibold mb-1">Αναμονή εγγράφων ({waiting.length})</h3>
              <ul className="space-y-1.5">{waiting.map((a) => (
                <li key={a.id} className="text-sm"><button type="button" className="underline" onClick={() => go('applications', { app: a.id })}>{a.application_no}</button> · {a.customer?.full_name ?? a.lead?.full_name ?? '—'} <span className="text-warn-600">· {a.status_reason}</span></li>))}</ul></div>
          )}
        </div>
      )}

      {requests.length > 0 && (
        <div className="mb-4"><h3 className="text-sm font-semibold mb-1">Αιτήματα ανάθεσης lead ({requests.length})</h3>
          <ul className="space-y-2">{requests.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-3 text-sm space-y-1.5">
              <div><strong>{agent(r.requested_by)}</strong> ζητά ανάθεση lead · {fmtDateTime(r.created_at)}</div>
              <div className="text-ink/70">Λόγος: {r.reason}</div>
              <input className="field" placeholder="Σημείωση απόφασης (προαιρετικά)" value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} aria-label="Σημείωση απόφασης" />
              <div className="flex gap-2"><Btn disabled={busy === r.id} onClick={() => void decide(r, true)}>Έγκριση</Btn><Btn variant="outline" disabled={busy === r.id} onClick={() => void decide(r, false)}>Απόρριψη</Btn></div>
              <p className="text-xs text-ink/50">Η απόφαση καταγράφεται στον κοινό λογαριασμό Admin / Back Office.</p>
            </li>))}</ul></div>
      )}

      {visits !== null && (
        <div><h3 className="text-sm font-semibold mb-1">Επισκέψεις που θέλουν προσοχή ({attention.length})</h3>
          {attention.length === 0 ? <p className="text-sm text-ink/60">Καμία εκπρόθεσμη επίσκεψη ή «δεν εμφανίστηκε».</p> : (
            <ul className="space-y-1">{attention.map((v) => (
              <li key={v.id} className="text-sm flex flex-wrap items-center gap-2">
                <Pill tone={v.status === 'no_show' ? 'red' : 'amber'}>{v.status === 'no_show' ? 'Δεν εμφανίστηκε' : 'Εκπρόθεσμη'}</Pill>
                <span>{visitSubject(v, { customerName: v.customer?.full_name, leadName: v.lead?.full_name ?? v.lead?.client_name }).label}</span>
                <span className="text-ink/50 text-xs">{agent(v.user_id)} · {v.scheduled_at ? fmtDateTime(v.scheduled_at) : '—'} · {visitStateText(v)}{v.status_reason ? ` · ${v.status_reason}` : ''}</span>
              </li>))}</ul>
          )}
        </div>
      )}
    </section>
  );
}
